// Lógica compartilhada de importação de vídeo por link: detecta a plataforma, escolhe o ator
// certo da Apify, inicia/consulta o download de forma assíncrona (pra não travar em timeout de
// função serverless) e processa o resultado (frames + transcrição) uma vez pronto.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import { ProxyAgent } from "undici";

const execFileAsync = promisify(execFile);
const MAX_FRAMES = 8;

// A URL de mídia que a Apify devolve (googlevideo.com) só aceita ser baixada pelo mesmo IP
// (proxy residencial) que a obteve — baixar direto do nosso servidor dá 403. Esse dispatcher
// reusa o mesmo proxy residencial da Apify pra baixar o arquivo de fato. Usa a "proxy password"
// (Console da Apify → Proxy), que é diferente do token de API usado no resto do código.
export function getApifyProxyDispatcher(proxyPassword) {
  return new ProxyAgent(`http://groups-RESIDENTIAL:${proxyPassword}@proxy.apify.com:8000`);
}

export function detectPlatform(url) {
  const host = new URL(url).hostname.replace(/^www\./, "");
  if (host.includes("instagram.com")) return "instagram";
  if (host.includes("tiktok.com")) return "tiktok";
  if (host.includes("youtube.com") || host.includes("youtu.be")) return "youtube";
  return null;
}

// Proxy residencial da Apify (IP que parece vir de uma casa de verdade, não de datacenter) —
// o bloqueio "LOGIN_REQUIRED" do YouTube que vimos nos logs é por reputação do IP do servidor,
// não mais por formato de pedido errado. Cobra por GB trafegado, à parte do preço do ator.
const RESIDENTIAL_PROXY = { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] };

export function getActorConfig(platform, url) {
  if (platform === "instagram")
    return { actorId: "onyx_quarry~instagram-reel-download", input: { url, proxyConfiguration: RESIDENTIAL_PROXY } };
  if (platform === "tiktok")
    return {
      actorId: "qbitlabs~all-in-one-video-downloader-youtube-tiktok-instagram-x-etc",
      input: { url, quality: "480p", audioOnly: false, proxyConfiguration: RESIDENTIAL_PROXY },
    };
  // YouTube só cai aqui como fallback, quando o vídeo não tem legenda automática —
  // baixa só o áudio (mais leve/rápido que o vídeo inteiro) pra transcrever via Groq.
  if (platform === "youtube")
    return { actorId: "utils~youtube-link", input: { url, audioQuality: "high", proxyConfiguration: RESIDENTIAL_PROXY } };
  return null;
}

// Caminho rápido pro YouTube: pega a legenda automática que o próprio YouTube já gera
// (endpoint público, não é o mesmo caminho bloqueado do streaming de vídeo) + a descrição.
// Só funciona quando o vídeo tem legenda — senão volta transcript vazio e quem chamou decide
// se cai pro fallback de baixar o áudio de verdade (getActorConfig acima).
export async function fetchYouTubeCaptions(url) {
  const pageRes = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
  });
  if (!pageRes.ok) {
    const err = new Error("Não consegui acessar essa página do YouTube.");
    err.status = 502;
    throw err;
  }
  const html = await pageRes.text();

  const titleMatch = html.match(/"title":"((?:[^"\\]|\\.)*)"/);
  const title = titleMatch ? JSON.parse(`"${titleMatch[1]}"`) : "";

  const descMatch = html.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/);
  const description = descMatch ? JSON.parse(`"${descMatch[1]}"`) : "";

  let transcript = "";
  const captionsMatch = html.match(/"captionTracks":(\[.*?\])/);
  if (captionsMatch) {
    try {
      const tracks = JSON.parse(captionsMatch[1]);
      const track = tracks.find((t) => (t.languageCode || "").startsWith("pt")) || tracks[0];
      if (track && track.baseUrl) {
        const capRes = await fetch(track.baseUrl + "&fmt=json3");
        if (capRes.ok) {
          const capData = await capRes.json();
          transcript = (capData.events || [])
            .flatMap((e) => (e.segs || []).map((s) => s.utf8 || ""))
            .join("")
            .replace(/\n+/g, " ")
            .trim();
        }
      }
    } catch (e) {
      // segue sem transcrição, usa só a descrição
    }
  }

  if (!title && !description && !transcript) {
    const err = new Error("Não consegui ler nada útil desse vídeo do YouTube.");
    err.status = 502;
    throw err;
  }
  return { title, description, transcript };
}

// Fala direto com a API interna que o app Android do YouTube usa (não é a mesma via da versão
// web, que é a que leva ao bloqueio "confirme que não é um robô"). Sem login, sem cookie, sem
// ferramenta terceira — é o mesmo truque usado por leitores de vídeo que conseguem ser rápidos
// mesmo sem autenticação nenhuma. A chave abaixo é pública, embutida no próprio app Android.
// Valores tirados direto do código-fonte do yt-dlp (INNERTUBE_CLIENTS['android']) — o YouTube
// invalida versão antiga com frequência, então esses precisam ser atualizados de tempos em
// tempos (mesma manutenção que qualquer ferramenta desse tipo precisa).
const YT_INNERTUBE_KEY = "AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w";
const YT_ANDROID_USER_AGENT = "com.google.android.youtube/21.26.364 (Linux; U; Android 11) gzip";
const YT_ANDROID_CLIENT = {
  clientName: "ANDROID",
  clientVersion: "21.26.364",
  androidSdkVersion: 30,
  userAgent: YT_ANDROID_USER_AGENT,
  osName: "Android",
  osVersion: "11",
  hl: "pt",
  gl: "BR",
};

function extractYouTubeVideoId(url) {
  const u = new URL(url);
  if (u.hostname.includes("youtu.be")) return u.pathname.split("/").filter(Boolean)[0];
  const parts = u.pathname.split("/").filter(Boolean);
  const shortsIdx = parts.indexOf("shorts");
  if (shortsIdx !== -1 && parts[shortsIdx + 1]) return parts[shortsIdx + 1];
  if (u.searchParams.get("v")) return u.searchParams.get("v");
  return parts[parts.length - 1];
}

export async function fetchYouTubeAudioDirect(url) {
  const videoId = extractYouTubeVideoId(url);
  const res = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${YT_INNERTUBE_KEY}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "User-Agent": YT_ANDROID_USER_AGENT,
      "X-YouTube-Client-Name": "3",
      "X-YouTube-Client-Version": YT_ANDROID_CLIENT.clientVersion,
    },
    body: JSON.stringify({ videoId, context: { client: YT_ANDROID_CLIENT } }),
  });
  const rawText = await res.text();
  console.error("[yt-innertube] status:", res.status, "preview:", rawText.slice(0, 500));
  if (!res.ok) {
    const err = new Error("Falha ao consultar o YouTube.");
    err.details = rawText.slice(0, 1000);
    err.status = 502;
    throw err;
  }
  const data = JSON.parse(rawText);
  const playability = data.playabilityStatus?.status;
  if (playability && playability !== "OK") {
    const err = new Error(`YouTube recusou o vídeo (${playability}).`);
    err.status = 400;
    err.details = data.playabilityStatus?.reason || "";
    throw err;
  }
  const formats = data.streamingData?.adaptiveFormats || [];
  const audioFormat = formats
    .filter((f) => (f.mimeType || "").startsWith("audio/") && f.url)
    .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
  if (!audioFormat) {
    const err = new Error("Não encontrei uma faixa de áudio baixável nesse vídeo.");
    err.status = 400;
    throw err;
  }
  return { audioUrl: audioFormat.url, title: data.videoDetails?.title || "" };
}

export function extractResultFromItem(platform, item) {
  if (!item) return null;
  if (platform === "instagram") {
    if (!item.videoUrl) return null;
    return { mediaUrl: item.videoUrl, ext: "mp4", duration: null, title: "", audioOnly: false };
  }
  if (platform === "tiktok") {
    if (!item.success || !item.downloadUrl) return null;
    return { mediaUrl: item.downloadUrl, ext: item.ext || "mp4", duration: item.duration, title: item.title || "", audioOnly: false };
  }
  if (platform === "youtube") {
    const mediaUrl = item.downloadUrl || (Array.isArray(item.streams) ? item.streams[0] : null);
    if (!mediaUrl) return null;
    return { mediaUrl, ext: "mp4", duration: item.duration || null, title: item.title || "", audioOnly: false, needsProxy: true };
  }
  return null;
}

export async function startApifyRun(token, actorId, input) {
  const res = await fetch(`https://api.apify.com/v2/acts/${actorId}/runs?token=${token}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const rawText = await res.text();
  if (!res.ok) {
    const err = new Error("Falha ao iniciar o download do vídeo (Apify).");
    err.details = rawText.slice(0, 1000);
    err.status = 502;
    throw err;
  }
  const data = JSON.parse(rawText);
  return data.data.id;
}

export async function getApifyRunStatus(token, runId) {
  const res = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${token}`);
  const data = await res.json();
  return data.data;
}

export async function getApifyDatasetItems(token, datasetId) {
  const res = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}`);
  const items = await res.json();
  return Array.isArray(items) ? items : [];
}

async function fetchToFile(url, filePath, dispatcher, headers) {
  const opts = {};
  if (headers) opts.headers = headers;
  if (dispatcher) opts.dispatcher = dispatcher;
  const res = await fetch(url, opts);
  if (!res.ok) {
    const err = new Error("Falha ao baixar o arquivo de mídia.");
    err.status = 502;
    err.details = `HTTP ${res.status}`;
    throw err;
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(filePath, buffer);
}

async function extractAudio(videoPath, audioPath) {
  try {
    await execFileAsync(ffmpegPath, ["-i", videoPath, "-vn", "-acodec", "libmp3lame", "-y", audioPath]);
    return true;
  } catch (e) {
    return false;
  }
}

async function extractFrames(videoPath, workDir, durationSec) {
  const fps = Math.max(0.15, Math.min(1, MAX_FRAMES / Math.max(durationSec || 25, 1)));
  const pattern = path.join(workDir, "frame-%02d.jpg");
  try {
    await execFileAsync(ffmpegPath, [
      "-i", videoPath,
      "-vf", `fps=${fps},scale=480:-1`,
      "-frames:v", String(MAX_FRAMES),
      "-y", pattern,
    ]);
  } catch (e) {
    return [];
  }
  const files = (await fs.readdir(workDir)).filter((f) => f.startsWith("frame-")).sort();
  const frames = [];
  for (const f of files) {
    const data = await fs.readFile(path.join(workDir, f));
    frames.push(data.toString("base64"));
  }
  return frames;
}

export async function transcribeWithGroq(groqKey, audioPath) {
  const audioBuffer = await fs.readFile(audioPath);
  console.error("[groq] tamanho do áudio (bytes):", audioBuffer.length);
  const form = new FormData();
  form.append("file", new Blob([audioBuffer], { type: "audio/mpeg" }), "audio.mp3");
  form.append("model", "whisper-large-v3-turbo");
  form.append("response_format", "json");

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${groqKey}` },
    body: form,
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error("[groq] falhou, status:", res.status, "resposta:", errText.slice(0, 1000));
    return "";
  }
  const data = await res.json();
  console.error("[groq] transcrição (preview):", (data.text || "").slice(0, 500));
  return data.text || "";
}

export const YT_DOWNLOAD_HEADERS = {
  "User-Agent": YT_ANDROID_USER_AGENT,
  Referer: "https://www.youtube.com/",
  Origin: "https://www.youtube.com",
};

export async function processVideoUrl(mediaUrl, workDir, ext, groqKey, durationHint, dispatcher, headers) {
  const videoPath = path.join(workDir, `video.${ext}`);
  await fetchToFile(mediaUrl, videoPath, dispatcher, headers);
  const audioPath = path.join(workDir, "audio.mp3");
  const hasAudio = await extractAudio(videoPath, audioPath);
  const transcript = hasAudio ? await transcribeWithGroq(groqKey, audioPath) : "";
  const frames = await extractFrames(videoPath, workDir, durationHint);
  return { transcript, frames };
}

export async function processAudioOnlyUrl(mediaUrl, workDir, groqKey, dispatcher, headers) {
  const audioPath = path.join(workDir, "audio.mp3");
  await fetchToFile(mediaUrl, audioPath, dispatcher, headers);
  const transcript = await transcribeWithGroq(groqKey, audioPath);
  return { transcript, frames: [] };
}

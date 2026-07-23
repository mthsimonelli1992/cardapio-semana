// Lógica compartilhada de importação de vídeo por link: detecta a plataforma, escolhe o ator
// certo da Apify, inicia/consulta o download de forma assíncrona (pra não travar em timeout de
// função serverless) e processa o resultado (frames + transcrição) uma vez pronto.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";

const execFileAsync = promisify(execFile);
const MAX_FRAMES = 8;

export function detectPlatform(url) {
  const host = new URL(url).hostname.replace(/^www\./, "");
  if (host.includes("instagram.com")) return "instagram";
  if (host.includes("tiktok.com")) return "tiktok";
  if (host.includes("youtube.com") || host.includes("youtu.be")) return "youtube";
  return null;
}

export function getActorConfig(platform, url) {
  if (platform === "instagram") return { actorId: "onyx_quarry~instagram-reel-download", input: { url } };
  if (platform === "tiktok")
    return {
      actorId: "qbitlabs~all-in-one-video-downloader-youtube-tiktok-instagram-x-etc",
      input: { url, quality: "480p", audioOnly: false },
    };
  return null;
}

// YouTube não passa pela Apify: baixar o vídeo de verdade esbarra no bloqueio de bot deles.
// Em vez disso, pega a legenda automática que o próprio YouTube já gera (endpoint público,
// rápido, não é o mesmo caminho bloqueado do streaming de vídeo) + a descrição do vídeo.
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

async function fetchToFile(url, filePath) {
  const res = await fetch(url);
  if (!res.ok) {
    const err = new Error("Falha ao baixar o arquivo de mídia.");
    err.status = 502;
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
  const form = new FormData();
  form.append("file", new Blob([audioBuffer], { type: "audio/mpeg" }), "audio.mp3");
  form.append("model", "whisper-large-v3-turbo");
  form.append("response_format", "json");

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${groqKey}` },
    body: form,
  });
  if (!res.ok) return "";
  const data = await res.json();
  return data.text || "";
}

export async function processVideoUrl(mediaUrl, workDir, ext, groqKey, durationHint) {
  const videoPath = path.join(workDir, `video.${ext}`);
  await fetchToFile(mediaUrl, videoPath);
  const audioPath = path.join(workDir, "audio.mp3");
  const hasAudio = await extractAudio(videoPath, audioPath);
  const transcript = hasAudio ? await transcribeWithGroq(groqKey, audioPath) : "";
  const frames = await extractFrames(videoPath, workDir, durationHint);
  return { transcript, frames };
}

export async function processAudioOnlyUrl(mediaUrl, workDir, groqKey) {
  const audioPath = path.join(workDir, "audio.mp3");
  await fetchToFile(mediaUrl, audioPath);
  const transcript = await transcribeWithGroq(groqKey, audioPath);
  return { transcript, frames: [] };
}

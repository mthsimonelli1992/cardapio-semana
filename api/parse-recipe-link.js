// Função serverless (Vercel) que recebe um link de vídeo (YouTube, TikTok OU Instagram) e monta
// a receita a partir do conteúdo real do vídeo: baixa o arquivo (Apify — um ator especializado
// por plataforma, já que o "baixador genérico" apanha muito de bot-detection do Instagram/YouTube),
// separa frames + áudio (ffmpeg), transcreve o áudio (Groq/Whisper) e manda pra IA estruturar.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import { callClaudeForRecipes } from "../lib/recipeTool.js";

const execFileAsync = promisify(execFile);
const MAX_FRAMES = 8;

function detectPlatform(url) {
  const host = new URL(url).hostname.replace(/^www\./, "");
  if (host.includes("instagram.com")) return "instagram";
  if (host.includes("tiktok.com")) return "tiktok";
  if (host.includes("youtube.com") || host.includes("youtu.be")) return "youtube";
  return null;
}

async function runApifyActor(token, actorId, input) {
  const res = await fetch(`https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${token}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const rawText = await res.text();
  console.error(`[apify:${actorId}] status:`, res.status, "resposta:", rawText.slice(0, 2000));
  if (!res.ok) {
    const err = new Error("Falha ao consultar a Apify.");
    err.details = rawText.slice(0, 1000);
    err.status = 502;
    throw err;
  }
  try {
    const items = JSON.parse(rawText);
    return Array.isArray(items) ? items : [];
  } catch (e) {
    const err = new Error("A Apify respondeu num formato inesperado.");
    err.details = rawText.slice(0, 1000);
    err.status = 502;
    throw err;
  }
}

function fail(message, item, items) {
  const err = new Error(message);
  err.status = 400;
  err.details = JSON.stringify(item || items).slice(0, 500);
  throw err;
}

async function fetchInstagram(token, url) {
  const items = await runApifyActor(token, "onyx_quarry~instagram-reel-download", { url });
  const item = items[0];
  if (!item || !item.videoUrl) fail("Não consegui baixar esse reel — confira se é público.", item, items);
  return { videoUrl: item.videoUrl, title: "", ext: "mp4", duration: null };
}

async function fetchTikTok(token, url) {
  const items = await runApifyActor(token, "qbitlabs~all-in-one-video-downloader-youtube-tiktok-instagram-x-etc", {
    url,
    quality: "480p",
    audioOnly: false,
  });
  const item = items[0];
  if (!item || !item.success || !item.downloadUrl) fail("Não consegui baixar esse vídeo do TikTok.", item, items);
  return { videoUrl: item.downloadUrl, title: item.title || "", ext: item.ext || "mp4", duration: item.duration };
}

async function fetchYouTubeAudio(token, url) {
  const items = await runApifyActor(token, "utils~youtube-link", { url, audioQuality: "high" });
  const item = items[0];
  if (!item || !item.downloadUrl) fail("Não consegui baixar esse vídeo do YouTube.", item, items);
  return { audioUrl: item.downloadUrl, title: item.title || "" };
}

async function fetchToFile(url, filePath) {
  const res = await fetch(url);
  if (!res.ok) {
    const err = new Error("Falha ao baixar o arquivo.");
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
    return false; // vídeo sem áudio, ou faixa não reconhecida — segue só com os frames
  }
}

async function extractFrames(videoPath, workDir, durationSec) {
  const fps = Math.max(0.15, Math.min(1, MAX_FRAMES / Math.max(durationSec || 25, 1)));
  const pattern = path.join(workDir, "frame-%02d.jpg");
  await execFileAsync(ffmpegPath, [
    "-i", videoPath,
    "-vf", `fps=${fps},scale=480:-1`,
    "-frames:v", String(MAX_FRAMES),
    "-y", pattern,
  ]);
  const files = (await fs.readdir(workDir)).filter((f) => f.startsWith("frame-")).sort();
  const frames = [];
  for (const f of files) {
    const data = await fs.readFile(path.join(workDir, f));
    frames.push(data.toString("base64"));
  }
  return frames;
}

async function transcribeWithGroq(groqKey, audioPath) {
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
  if (!res.ok) return ""; // segue sem transcrição se falhar, ainda pode ter frames
  const data = await res.json();
  return data.text || "";
}

async function processVideoUrl(videoUrl, workDir, ext, groqKey, durationHint) {
  const videoPath = path.join(workDir, `video.${ext}`);
  await fetchToFile(videoUrl, videoPath);
  const audioPath = path.join(workDir, "audio.mp3");
  const hasAudio = await extractAudio(videoPath, audioPath);
  const transcript = hasAudio ? await transcribeWithGroq(groqKey, audioPath) : "";
  const frames = await extractFrames(videoPath, workDir, durationHint);
  return { transcript, frames };
}

async function processAudioOnlyUrl(audioUrl, workDir, groqKey) {
  const audioPath = path.join(workDir, "audio.mp3");
  await fetchToFile(audioUrl, audioPath);
  const transcript = await transcribeWithGroq(groqKey, audioPath);
  return { transcript, frames: [] };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método não permitido." });
    return;
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const apifyToken = process.env.APIFY_API_TOKEN;
  const groqKey = process.env.GROQ_API_KEY;
  if (!anthropicKey || !apifyToken || !groqKey) {
    res.status(500).json({ error: "Faltam variáveis de ambiente no servidor (ANTHROPIC_API_KEY, APIFY_API_TOKEN ou GROQ_API_KEY)." });
    return;
  }

  const { url } = req.body || {};
  if (!url) {
    res.status(400).json({ error: "Cole um link de vídeo." });
    return;
  }

  let platform;
  try {
    platform = detectPlatform(url);
  } catch (e) {
    res.status(400).json({ error: "Link inválido." });
    return;
  }
  if (!platform) {
    res.status(400).json({ error: "Link não reconhecido. Aceito por enquanto: YouTube, TikTok e Instagram." });
    return;
  }

  let workDir;
  try {
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), "recipe-"));
    let title = "";
    let transcript = "";
    let frames = [];

    if (platform === "instagram") {
      const r = await fetchInstagram(apifyToken, url);
      title = r.title;
      ({ transcript, frames } = await processVideoUrl(r.videoUrl, workDir, r.ext, groqKey, r.duration));
    } else if (platform === "tiktok") {
      const r = await fetchTikTok(apifyToken, url);
      title = r.title;
      ({ transcript, frames } = await processVideoUrl(r.videoUrl, workDir, r.ext, groqKey, r.duration));
    } else if (platform === "youtube") {
      const r = await fetchYouTubeAudio(apifyToken, url);
      title = r.title;
      ({ transcript, frames } = await processAudioOnlyUrl(r.audioUrl, workDir, groqKey));
    }

    const content = [
      {
        type: "text",
        text:
          `Isto é de um vídeo de receita culinária${title ? ` (título: "${title}")` : ""}. ` +
          "Você tem a transcrição do áudio (o que foi falado) e, se disponível, alguns frames do vídeo em " +
          "ordem (o que aparece escrito/mostrado na tela). Combine as fontes disponíveis pra montar a(s) " +
          "receita(s) completa(s). Se faltar alguma quantidade explícita, estime com bom senso.\n\n" +
          (transcript ? `Transcrição do áudio:\n${transcript.slice(0, 6000)}` : "Sem áudio/transcrição disponível — use só os frames, se houver."),
      },
      ...frames.map((data) => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data } })),
    ];

    const recipes = await callClaudeForRecipes(anthropicKey, content);
    res.status(200).json({ recipes });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || "Erro ao processar o vídeo.", details: e.details || String(e) });
  } finally {
    if (workDir) fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

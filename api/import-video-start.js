// YouTube: 3 tentativas em ordem, da mais rápida/barata pra mais pesada —
//   1) legenda automática (rápido, sem baixar nada)
//   2) API interna do app Android do YouTube pra pegar o áudio direto (rápido, sem login,
//      sem passar pelo bloqueio de bot da versão web)
//   3) fallback via Apify (mais lento, usado só se as duas primeiras falharem)
// Instagram/TikTok sempre vão direto pro download assíncrono via Apify, e o front-end consulta
// o andamento em /api/import-video-status.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  detectPlatform,
  getActorConfig,
  startApifyRun,
  fetchYouTubeCaptions,
  fetchYouTubeAudioDirect,
  processAudioOnlyUrl,
} from "../lib/videoImport.js";
import { callClaudeForRecipes } from "../lib/recipeTool.js";

async function finishWithClaude(res, anthropicKey, title, transcript, description) {
  try {
    const content = [
      {
        type: "text",
        text:
          `Extraia a(s) receita(s) culinária(s) do conteúdo abaixo, de um vídeo do YouTube` +
          `${title ? ` (título: "${title}")` : ""}. Use a transcrição (o que foi falado)` +
          (description ? " e a descrição " : " ") +
          "como fontes. Se faltar alguma quantidade explícita, estime com bom senso. Se não houver " +
          "receita reconhecível, retorne uma lista vazia.\n\n" +
          `Transcrição:\n${transcript.slice(0, 8000)}\n\n` +
          (description ? `Descrição:\n${description.slice(0, 3000)}` : ""),
      },
    ];
    const recipes = await callClaudeForRecipes(anthropicKey, content);
    res.status(200).json({ status: "done", recipes });
  } catch (e) {
    res.status(200).json({ status: "error", error: e.message || "Erro ao processar o vídeo.", details: e.details });
  }
}

async function startApifyFallback(res, apifyToken, platform, url) {
  if (!apifyToken) {
    res.status(500).json({ error: "Falta APIFY_API_TOKEN no servidor." });
    return;
  }
  const config = getActorConfig(platform, url);
  try {
    const runId = await startApifyRun(apifyToken, config.actorId, config.input);
    res.status(200).json({ status: "started", runId, platform });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || "Erro ao iniciar o download.", details: e.details });
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método não permitido." });
    return;
  }

  const apifyToken = process.env.APIFY_API_TOKEN;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

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

  if (platform === "youtube") {
    if (!anthropicKey) {
      res.status(500).json({ error: "Falta ANTHROPIC_API_KEY no servidor." });
      return;
    }

    // 1) Legenda automática
    let captionsResult = null;
    try {
      captionsResult = await fetchYouTubeCaptions(url);
    } catch (e) {
      captionsResult = null;
    }
    if (captionsResult && captionsResult.transcript) {
      await finishWithClaude(res, anthropicKey, captionsResult.title, captionsResult.transcript, captionsResult.description);
      return;
    }

    // 2) Áudio direto via API interna do app Android (sem login, sem Apify)
    if (groqKey) {
      let workDir;
      try {
        const { audioUrl, title } = await fetchYouTubeAudioDirect(url);
        workDir = await fs.mkdtemp(path.join(os.tmpdir(), "recipe-"));
        const { transcript } = await processAudioOnlyUrl(audioUrl, workDir, groqKey);
        if (transcript) {
          await finishWithClaude(res, anthropicKey, title, transcript, captionsResult ? captionsResult.description : "");
          return;
        }
      } catch (e) {
        console.error("[yt-direct] falhou, caindo pro fallback via Apify:", e.message, e.details || "");
      } finally {
        if (workDir) fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
      }
    }

    // 3) Fallback: Apify (assíncrono)
    await startApifyFallback(res, apifyToken, platform, url);
    return;
  }

  await startApifyFallback(res, apifyToken, platform, url);
}

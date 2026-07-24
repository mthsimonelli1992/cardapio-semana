// Ponto de entrada da importação por link. Ordem de tentativa por plataforma:
//   YouTube: 1) legenda automática (rápido) → 2) áudio via API interna do Android (rápido,
//            sem login) → 3) fallback via Apify (assíncrono, mais lento)
//   Instagram/TikTok: direto pro download assíncrono via Apify — o front-end consulta o
//            andamento em /api/import-video-status.
//   Qualquer outro link (site de receita, resultado do Google, etc.): lê a página direto
//            (rápido, sem Apify) — tenta dado estruturado (Schema.org Recipe) antes de cair
//            pro texto visível da página.
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
import { fetchGenericRecipePage } from "../lib/webRecipe.js";
import { callClaudeForRecipes } from "../lib/recipeTool.js";

async function finishWithClaude(res, anthropicKey, promptText, platform, coverImage) {
  try {
    const recipes = await callClaudeForRecipes(anthropicKey, [{ type: "text", text: promptText }]);
    res.status(200).json({ status: "done", recipes, platform, coverImage: coverImage || null });
  } catch (e) {
    res.status(200).json({ status: "error", error: e.message || "Erro ao processar.", details: e.details });
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
    res.status(400).json({ error: "Cole um link." });
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
    res.status(400).json({ error: "Não consegui reconhecer esse link." });
    return;
  }

  if (!anthropicKey) {
    res.status(500).json({ error: "Falta ANTHROPIC_API_KEY no servidor." });
    return;
  }

  if (platform === "web") {
    try {
      const { text, image } = await fetchGenericRecipePage(url);
      const promptText =
        "Extraia a(s) receita(s) culinária(s) do conteúdo abaixo, retirado de uma página de site. " +
        "Se faltar alguma quantidade explícita, estime com bom senso. Se não houver receita reconhecível, " +
        "retorne uma lista vazia.\n\n---\n\n" +
        text.slice(0, 15000);
      await finishWithClaude(res, anthropicKey, promptText, "web", image);
    } catch (e) {
      res.status(200).json({ status: "error", error: e.message || "Erro ao ler a página.", details: e.details });
    }
    return;
  }

  if (platform === "youtube") {
    // 1) Legenda automática
    let captionsResult = null;
    try {
      captionsResult = await fetchYouTubeCaptions(url);
    } catch (e) {
      captionsResult = null;
    }
    if (captionsResult && captionsResult.transcript) {
      const promptText =
        `Extraia a(s) receita(s) culinária(s) do conteúdo abaixo, de um vídeo do YouTube` +
        `${captionsResult.title ? ` (título: "${captionsResult.title}")` : ""}. Use a transcrição (o que foi falado)` +
        (captionsResult.description ? " e a descrição " : " ") +
        "como fontes. Se faltar alguma quantidade explícita, estime com bom senso. Se não houver " +
        "receita reconhecível, retorne uma lista vazia.\n\n" +
        `Transcrição:\n${captionsResult.transcript.slice(0, 8000)}\n\n` +
        (captionsResult.description ? `Descrição:\n${captionsResult.description.slice(0, 3000)}` : "");
      await finishWithClaude(res, anthropicKey, promptText, "youtube", null);
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
          const promptText =
            `Extraia a(s) receita(s) culinária(s) do conteúdo abaixo, de um vídeo do YouTube` +
            `${title ? ` (título: "${title}")` : ""}. Use a transcrição (o que foi falado) como fonte. Se ` +
            "faltar alguma quantidade explícita, estime com bom senso. Se não houver receita reconhecível, " +
            `retorne uma lista vazia.\n\nTranscrição:\n${transcript.slice(0, 8000)}`;
          await finishWithClaude(res, anthropicKey, promptText, "youtube", null);
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

// YouTube: tenta primeiro a legenda automática do YouTube (rápido, sem baixar vídeo). Se o
// vídeo não tiver legenda, cai pro fallback de baixar o áudio via Apify + transcrever (mais
// lento, mas funciona mesmo sem legenda pronta). Instagram/TikTok sempre vão direto pro
// download assíncrono via Apify, e o front-end consulta o andamento em /api/import-video-status.
import { detectPlatform, getActorConfig, startApifyRun, fetchYouTubeCaptions } from "../lib/videoImport.js";
import { callClaudeForRecipes } from "../lib/recipeTool.js";

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
    let captionsResult = null;
    try {
      captionsResult = await fetchYouTubeCaptions(url);
    } catch (e) {
      captionsResult = null; // segue pro fallback
    }

    if (captionsResult && captionsResult.transcript) {
      try {
        const { title, description, transcript } = captionsResult;
        const content = [
          {
            type: "text",
            text:
              `Extraia a(s) receita(s) culinária(s) do conteúdo abaixo, de um vídeo do YouTube` +
              `${title ? ` (título: "${title}")` : ""}. Use a transcrição (o que foi falado) e a descrição ` +
              "como fontes. Se faltar alguma quantidade explícita, estime com bom senso. Se não houver " +
              "receita reconhecível, retorne uma lista vazia.\n\n" +
              `Transcrição:\n${transcript.slice(0, 8000)}\n\n` +
              (description ? `Descrição:\n${description.slice(0, 3000)}` : ""),
          },
        ];
        const recipes = await callClaudeForRecipes(anthropicKey, content);
        res.status(200).json({ status: "done", recipes });
        return;
      } catch (e) {
        res.status(200).json({ status: "error", error: e.message || "Erro ao processar o vídeo.", details: e.details });
        return;
      }
    }

    // Sem legenda disponível — cai pro fallback de baixar o áudio de verdade via Apify.
    await startApifyFallback(res, apifyToken, platform, url);
    return;
  }

  await startApifyFallback(res, apifyToken, platform, url);
}

// YouTube: resolve na hora (legenda automática do YouTube, sem baixar vídeo — rápido e não
// esbarra no bloqueio de bot). Instagram/TikTok: inicia o download assíncrono na Apify e
// devolve um runId pro front-end ir consultando em /api/import-video-status.
import { detectPlatform, getActorConfig, startApifyRun, fetchYouTubeCaptions } from "../lib/videoImport.js";
import { callClaudeForRecipes } from "../lib/recipeTool.js";

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
    try {
      const { title, description, transcript } = await fetchYouTubeCaptions(url);
      const content = [
        {
          type: "text",
          text:
            `Extraia a(s) receita(s) culinária(s) do conteúdo abaixo, de um vídeo do YouTube` +
            `${title ? ` (título: "${title}")` : ""}. Use a transcrição (o que foi falado) e a descrição ` +
            "como fontes. Se faltar alguma quantidade explícita, estime com bom senso. Se não houver " +
            "receita reconhecível, retorne uma lista vazia.\n\n" +
            (transcript ? `Transcrição:\n${transcript.slice(0, 8000)}\n\n` : "") +
            (description ? `Descrição:\n${description.slice(0, 3000)}` : ""),
        },
      ];
      const recipes = await callClaudeForRecipes(anthropicKey, content);
      res.status(200).json({ status: "done", recipes });
    } catch (e) {
      res.status(200).json({ status: "error", error: e.message || "Erro ao processar o vídeo.", details: e.details });
    }
    return;
  }

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

// Reobtém a capa de uma receita já salva (Instagram/TikTok), sem repetir a extração da receita
// em si — só baixa o vídeo de novo pra tirar uma capa de verdade. Mesmo padrão assíncrono
// start+poll das outras importações, pra não travar em timeout de função serverless.
import { detectPlatform, getActorConfig, startApifyRun } from "../lib/videoImport.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método não permitido." });
    return;
  }

  const apifyToken = process.env.APIFY_API_TOKEN;
  if (!apifyToken) {
    res.status(500).json({ error: "Falta APIFY_API_TOKEN no servidor." });
    return;
  }

  const { url } = req.body || {};
  if (!url) {
    res.status(400).json({ error: "Falta o link de origem da receita." });
    return;
  }

  let platform;
  try {
    platform = detectPlatform(url);
  } catch (e) {
    res.status(400).json({ error: "Link inválido." });
    return;
  }
  if (platform !== "instagram" && platform !== "tiktok") {
    res.status(400).json({ error: "Atualização de capa só é suportada para Instagram e TikTok." });
    return;
  }

  const config = getActorConfig(platform, url);
  try {
    const runId = await startApifyRun(apifyToken, config.actorId, config.input);
    res.status(200).json({ status: "started", runId, platform });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || "Erro ao iniciar a busca da capa.", details: e.details });
  }
}

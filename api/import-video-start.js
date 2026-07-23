// Inicia o download do vídeo na Apify de forma assíncrona (não espera terminar) e devolve na
// hora um runId pro front-end ir consultando — assim nenhuma busca de vídeo lenta trava a
// função esperando e estoura o limite de tempo da Vercel.
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

  const config = getActorConfig(platform, url);
  try {
    const runId = await startApifyRun(apifyToken, config.actorId, config.input);
    res.status(200).json({ runId, platform });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || "Erro ao iniciar o download.", details: e.details });
  }
}

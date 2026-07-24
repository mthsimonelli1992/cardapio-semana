import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  getApifyRunStatus,
  getApifyDatasetItems,
  extractResultFromItem,
  fetchVideoCoverFrame,
  fetchTikTokThumbnail,
} from "../lib/videoImport.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Método não permitido." });
    return;
  }

  const apifyToken = process.env.APIFY_API_TOKEN;
  if (!apifyToken) {
    res.status(500).json({ status: "error", error: "Falta APIFY_API_TOKEN no servidor." });
    return;
  }

  const { runId, platform } = req.query;
  if (!runId || !platform) {
    res.status(400).json({ status: "error", error: "Faltam parâmetros." });
    return;
  }

  try {
    const run = await getApifyRunStatus(apifyToken, runId);
    if (run.status === "RUNNING" || run.status === "READY") {
      res.status(200).json({ status: "running" });
      return;
    }
    if (run.status !== "SUCCEEDED") {
      res.status(200).json({ status: "error", error: `A busca da capa falhou (${run.status}).` });
      return;
    }

    const items = await getApifyDatasetItems(apifyToken, run.defaultDatasetId);
    const extracted = extractResultFromItem(platform, items[0], apifyToken);
    if (!extracted) {
      res.status(200).json({ status: "error", error: "Não consegui baixar esse vídeo de novo." });
      return;
    }

    if (platform === "tiktok" && !extracted.coverImage && items[0].sourceUrl) {
      extracted.coverImage = await fetchTikTokThumbnail(items[0].sourceUrl);
    }

    if (!extracted.coverImage) {
      let workDir;
      try {
        workDir = await fs.mkdtemp(path.join(os.tmpdir(), "cover-"));
        const frameB64 = await fetchVideoCoverFrame(extracted.mediaUrl, workDir, extracted.ext);
        extracted.coverImage = `data:image/jpeg;base64,${frameB64}`;
      } finally {
        if (workDir) fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
      }
    }

    res.status(200).json({ status: "done", coverImage: extracted.coverImage || null });
  } catch (e) {
    res.status(200).json({ status: "error", error: e.message || "Erro ao atualizar a capa.", details: e.details });
  }
}

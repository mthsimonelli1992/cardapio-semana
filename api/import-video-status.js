// Consultado repetidamente pelo front-end. Enquanto a Apify ainda está baixando o vídeo,
// devolve status "running" na hora. Quando termina, essa mesma chamada faz o processamento
// (frames + transcrição + IA) e devolve as receitas — essa parte é rápida (segundos), então
// cabe tranquilo dentro do tempo de uma função só.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  getApifyRunStatus,
  getApifyDatasetItems,
  extractResultFromItem,
  processVideoUrl,
  processAudioOnlyUrl,
  getApifyProxyDispatcher,
} from "../lib/videoImport.js";
import { callClaudeForRecipes } from "../lib/recipeTool.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Método não permitido." });
    return;
  }

  const apifyToken = process.env.APIFY_API_TOKEN;
  const groqKey = process.env.GROQ_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!apifyToken || !groqKey || !anthropicKey) {
    res.status(500).json({ status: "error", error: "Faltam variáveis de ambiente no servidor." });
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
      res.status(200).json({ status: "error", error: `A busca do vídeo falhou (${run.status}).` });
      return;
    }

    const items = await getApifyDatasetItems(apifyToken, run.defaultDatasetId);
    console.error("[apify] item recebido:", JSON.stringify(items[0]).slice(0, 1000));
    const extracted = extractResultFromItem(platform, items[0]);
    if (!extracted) {
      res.status(200).json({
        status: "error",
        error: "Não consegui baixar esse vídeo — confira se é público e o link está certo.",
      });
      return;
    }

    let workDir;
    try {
      workDir = await fs.mkdtemp(path.join(os.tmpdir(), "recipe-"));
      const dispatcher = extracted.needsProxy ? getApifyProxyDispatcher(apifyToken) : undefined;
      const { transcript, frames } = extracted.audioOnly
        ? await processAudioOnlyUrl(extracted.mediaUrl, workDir, groqKey, dispatcher)
        : await processVideoUrl(extracted.mediaUrl, workDir, extracted.ext, groqKey, extracted.duration, dispatcher);
      console.error("[import] transcript.length:", transcript.length, "frames:", frames.length);

      const content = [
        {
          type: "text",
          text:
            `Isto é de um vídeo de receita culinária${extracted.title ? ` (título: "${extracted.title}")` : ""}. ` +
            "Você tem a transcrição do áudio (o que foi falado) e, se disponível, alguns frames do vídeo em " +
            "ordem (o que aparece escrito/mostrado na tela). Combine as fontes disponíveis pra montar a(s) " +
            "receita(s) completa(s). Se faltar alguma quantidade explícita, estime com bom senso.\n\n" +
            (transcript ? `Transcrição do áudio:\n${transcript.slice(0, 6000)}` : "Sem áudio/transcrição disponível — use só os frames, se houver."),
        },
        ...frames.map((data) => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data } })),
      ];

      const recipes = await callClaudeForRecipes(anthropicKey, content);
      res.status(200).json({ status: "done", recipes });
    } finally {
      if (workDir) fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  } catch (e) {
    res.status(200).json({ status: "error", error: e.message || "Erro ao processar o vídeo.", details: e.details });
  }
}

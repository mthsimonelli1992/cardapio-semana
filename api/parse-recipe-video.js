// Função serverless (Vercel) que recebe frames extraídos de um vídeo de receita (no navegador,
// via canvas) + opcionalmente a legenda do post, e usa a IA (com visão) pra ler o que está
// escrito na tela (ingredientes, modo de preparo) e estruturar em receita(s).
import { callClaudeForRecipes } from "../lib/recipeTool.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método não permitido." });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "ANTHROPIC_API_KEY não configurada no servidor." });
    return;
  }

  const { frames, caption } = req.body || {};
  if (!Array.isArray(frames) || frames.length === 0) {
    res.status(400).json({ error: "Nenhum frame de vídeo recebido." });
    return;
  }

  const content = [
    {
      type: "text",
      text:
        "Estes são frames extraídos de um vídeo de receita culinária de rede social, em ordem. " +
        "Leia qualquer texto que aparece na tela (lista de ingredientes, quantidades, modo de preparo) " +
        "e monte a(s) receita(s) completas a partir disso. " +
        (caption && caption.trim()
          ? `Legenda do vídeo (contexto adicional, pode ter mais detalhes): "${caption.trim().slice(0, 3000)}"`
          : "Não há legenda disponível — use só o que aparece nos frames."),
    },
    ...frames.slice(0, 8).map((data) => ({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data },
    })),
  ];

  try {
    const recipes = await callClaudeForRecipes(apiKey, content);
    const coverImage = frames[0] ? `data:image/jpeg;base64,${frames[0]}` : null;
    res.status(200).json({ recipes, platform: "video", coverImage });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, details: e.details || String(e) });
  }
}

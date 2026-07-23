// Função serverless (Vercel) que recebe um texto bruto (legenda de rede social, transcrição
// de vídeo, ou trecho extraído de um PDF/documento) e usa a IA da Anthropic pra estruturar
// em uma ou mais receitas no mesmo formato que o app usa. A chave de API só existe aqui no
// servidor — nunca é exposta pro navegador.
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

  const { text } = req.body || {};
  if (!text || typeof text !== "string" || text.trim().length < 20) {
    res.status(400).json({ error: "Texto muito curto ou ausente — cole a receita completa." });
    return;
  }

  try {
    const recipes = await callClaudeForRecipes(apiKey, [
      {
        type: "text",
        text:
          "Extraia todas as receitas culinárias do texto abaixo (pode ser legenda de rede social, " +
          "transcrição de vídeo, ou trecho de um documento com uma ou várias receitas). Para cada " +
          "receita, identifique nome, categoria, quantas porções rende e a lista de ingredientes com " +
          "quantidade numérica e unidade em português. Se não houver nenhuma receita reconhecível, " +
          "retorne uma lista vazia.\n\n---\n\n" +
          text.slice(0, 15000),
      },
    ]);
    res.status(200).json({ recipes });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, details: e.details || String(e) });
  }
}

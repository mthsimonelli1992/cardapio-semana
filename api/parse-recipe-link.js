// Função serverless (Vercel) que recebe um link de vídeo (YouTube ou TikTok) e extrai
// título/legenda/descrição usando só endpoints públicos dessas plataformas (sem chave de API
// nem serviço pago), depois manda pra IA estruturar em receita(s).
// Instagram não entra aqui: a Meta bloqueia esse tipo de acesso sem app aprovado por eles.
import { callClaudeForRecipes } from "../lib/recipeTool.js";

async function fetchYouTubeText(url) {
  let title = "";
  try {
    const oembedRes = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
    if (oembedRes.ok) {
      const oembed = await oembedRes.json();
      title = oembed.title || "";
    }
  } catch (e) {
    /* segue sem título */
  }

  let description = "";
  try {
    const pageRes = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    const html = await pageRes.text();
    const match = html.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/);
    if (match) description = JSON.parse(`"${match[1]}"`);
  } catch (e) {
    /* segue só com o título */
  }

  if (!title && !description) {
    const err = new Error("Não consegui acessar esse vídeo do YouTube.");
    err.status = 502;
    throw err;
  }
  return `Título do vídeo: ${title}\n\nDescrição:\n${description}`;
}

async function fetchTikTokText(url) {
  const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`);
  if (!res.ok) {
    const err = new Error("Não consegui acessar esse vídeo do TikTok — confira se o link está certo e o vídeo é público.");
    err.status = 502;
    throw err;
  }
  const data = await res.json();
  return `Legenda/título do vídeo (TikTok): ${data.title || ""}`;
}

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

  const { url } = req.body || {};
  if (!url) {
    res.status(400).json({ error: "Cole um link de vídeo." });
    return;
  }

  let host;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch (e) {
    res.status(400).json({ error: "Link inválido." });
    return;
  }

  try {
    let text;
    if (host.includes("youtube.com") || host.includes("youtu.be")) {
      text = await fetchYouTubeText(url);
    } else if (host.includes("tiktok.com")) {
      text = await fetchTikTokText(url);
    } else if (host.includes("instagram.com")) {
      res.status(400).json({
        error:
          'Instagram não permite buscar o vídeo só pelo link (bloqueio da própria Meta). Salva o vídeo no aparelho e usa o campo "Enviar vídeo" aqui embaixo.',
      });
      return;
    } else {
      res.status(400).json({ error: "Link não reconhecido. Por enquanto aceito links de YouTube e TikTok." });
      return;
    }

    const recipes = await callClaudeForRecipes(apiKey, [
      {
        type: "text",
        text:
          "Extraia a(s) receita(s) culinária(s) do conteúdo abaixo, retirado do título/legenda/descrição de um " +
          "vídeo de rede social. Se faltar alguma quantidade explícita, estime com bom senso. Se não houver " +
          "receita reconhecível, retorne uma lista vazia.\n\n---\n\n" +
          text.slice(0, 8000),
      },
    ]);
    res.status(200).json({ recipes });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || "Erro ao processar o link.", details: e.details || String(e) });
  }
}

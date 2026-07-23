// Função serverless (Vercel) que recebe um texto bruto (legenda de rede social, transcrição
// de vídeo, ou trecho extraído de um PDF/documento) e usa a IA da Anthropic pra estruturar
// em uma ou mais receitas no mesmo formato que o app usa. A chave de API só existe aqui no
// servidor — nunca é exposta pro navegador.

const RECIPE_TOOL = {
  name: "salvar_receitas",
  description: "Salva a lista de receitas culinárias identificadas no texto fornecido.",
  input_schema: {
    type: "object",
    properties: {
      receitas: {
        type: "array",
        items: {
          type: "object",
          properties: {
            nome: { type: "string", description: "Nome do prato" },
            categoria: {
              type: "string",
              enum: ["café da manhã", "prato principal", "acompanhamento"],
            },
            rende_porcoes: {
              type: "integer",
              description: "Quantas porções a receita rende. Estime com bom senso se não estiver explícito.",
            },
            ingredientes: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  nome: { type: "string" },
                  quantidade: { type: "number" },
                  unidade: {
                    type: "string",
                    description: "Unidade em português: g, ml, unidade, xícara, colher de sopa, dente, kg, l, etc.",
                  },
                },
                required: ["nome", "quantidade", "unidade"],
              },
            },
          },
          required: ["nome", "categoria", "rende_porcoes", "ingredientes"],
        },
      },
    },
    required: ["receitas"],
  },
};

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
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        tools: [RECIPE_TOOL],
        tool_choice: { type: "tool", name: "salvar_receitas" },
        messages: [
          {
            role: "user",
            content:
              "Extraia todas as receitas culinárias do texto abaixo (pode ser legenda de rede social, " +
              "transcrição de vídeo, ou trecho de um documento com uma ou várias receitas). Para cada " +
              "receita, identifique nome, categoria, quantas porções rende e a lista de ingredientes com " +
              "quantidade numérica e unidade em português. Se não houver nenhuma receita reconhecível, " +
              "retorne uma lista vazia.\n\n---\n\n" +
              text.slice(0, 15000),
          },
        ],
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      res.status(502).json({ error: "Falha ao consultar a IA.", details });
      return;
    }

    const data = await response.json();
    const toolUse = (data.content || []).find((block) => block.type === "tool_use");
    if (!toolUse) {
      res.status(502).json({ error: "A IA não retornou receitas estruturadas." });
      return;
    }

    res.status(200).json({ recipes: toolUse.input.receitas || [] });
  } catch (e) {
    res.status(500).json({ error: "Erro inesperado ao processar.", details: String(e) });
  }
}

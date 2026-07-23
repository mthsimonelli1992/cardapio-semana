// Definição compartilhada da "ferramenta" que força a IA a devolver receitas em JSON
// estruturado, usada tanto pela importação por texto/PDF quanto pela importação por vídeo.
export const RECIPE_TOOL = {
  name: "salvar_receitas",
  description: "Salva a lista de receitas culinárias identificadas no conteúdo fornecido.",
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

export async function callClaudeForRecipes(apiKey, content) {
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
      messages: [{ role: "user", content }],
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    const err = new Error("Falha ao consultar a IA.");
    err.details = details;
    err.status = 502;
    throw err;
  }

  const data = await response.json();
  const toolUse = (data.content || []).find((block) => block.type === "tool_use");
  if (!toolUse) {
    const err = new Error("A IA não retornou receitas estruturadas.");
    err.status = 502;
    throw err;
  }
  return toolUse.input.receitas || [];
}

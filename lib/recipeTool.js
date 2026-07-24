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
              enum: ["prato principal", "acompanhamento", "sobremesa"],
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
            modo_preparo: {
              type: "array",
              description: "Passo a passo do preparo, um item por passo, em português, na ordem certa. Se não houver instrução explícita, monte um passo a passo razoável a partir dos ingredientes e do que for dito/mostrado.",
              items: { type: "string" },
            },
          },
          required: ["nome", "categoria", "rende_porcoes", "ingredientes", "modo_preparo"],
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
      max_tokens: 8192,
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

// Usado quando a plataforma não devolve uma thumbnail própria (Instagram nunca devolve, por
// exemplo): entre os frames já extraídos do vídeo, pede pra IA escolher o que melhor mostra o
// prato pronto — evita pegar o primeiro frame "no chute", que em vídeos de rede social costuma
// mostrar o rosto de quem está falando na abertura, não a comida.
const COVER_FRAME_TOOL = {
  name: "escolher_capa",
  description:
    "Escolhe, entre os frames numerados fornecidos (na ordem em que aparecem no vídeo), o índice do que melhor mostra o prato de comida pronto/finalizado — evite frames que mostrem só rosto de pessoa, mãos, texto na tela, embalagem ou tela em branco/transição.",
  input_schema: {
    type: "object",
    properties: {
      frame_index: { type: "integer", description: "Índice (0-based) do frame escolhido." },
    },
    required: ["frame_index"],
  },
};

export async function pickCoverFrame(apiKey, framesBase64) {
  if (!framesBase64 || framesBase64.length <= 1) return 0;
  const content = [
    { type: "text", text: "Frames de um vídeo de receita culinária, em ordem. Escolha o frame que melhor mostra o prato pronto." },
    ...framesBase64.flatMap((data, i) => [
      { type: "text", text: `Frame ${i}:` },
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data } },
    ]),
  ];
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        tools: [COVER_FRAME_TOOL],
        tool_choice: { type: "tool", name: "escolher_capa" },
        messages: [{ role: "user", content }],
      }),
    });
    if (!response.ok) return 0;
    const data = await response.json();
    const toolUse = (data.content || []).find((block) => block.type === "tool_use");
    const idx = toolUse?.input?.frame_index;
    return typeof idx === "number" && idx >= 0 && idx < framesBase64.length ? idx : 0;
  } catch (e) {
    return 0;
  }
}

// Importação de receita a partir de um site qualquer (blog de receita, Google, etc.) — sem
// precisar de vídeo. A maioria dos sites de receita usa um formato padronizado (Schema.org
// Recipe, em JSON-LD) que já vem com ingredientes/modo de preparo/imagem prontos; quando não
// tem isso, cai pra extrair o texto visível da página e deixar a IA organizar.
function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function findRecipeJsonLd(html) {
  const blocks = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const block of blocks) {
    const jsonText = block.replace(/^[\s\S]*?>/, "").replace(/<\/script>[\s\S]*$/, "");
    try {
      let parsed = JSON.parse(jsonText);
      const items = Array.isArray(parsed) ? parsed : parsed["@graph"] || [parsed];
      const recipe = items.find((item) => {
        const type = item["@type"];
        return type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"));
      });
      if (recipe) return recipe;
    } catch (e) {
      // bloco de JSON-LD mal formado, tenta o próximo
    }
  }
  return null;
}

function extractOgImage(html) {
  const match = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  return match ? match[1] : null;
}

export async function fetchGenericRecipePage(url) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" } });
  if (!res.ok) {
    const err = new Error("Não consegui acessar essa página.");
    err.status = 502;
    throw err;
  }
  const html = await res.text();
  const image = extractOgImage(html);
  const jsonLd = findRecipeJsonLd(html);

  if (jsonLd) {
    const name = jsonLd.name || "";
    const ingredients = jsonLd.recipeIngredient || jsonLd.ingredients || [];
    let instructions = jsonLd.recipeInstructions || [];
    if (Array.isArray(instructions)) {
      instructions = instructions.map((step) => (typeof step === "string" ? step : step.text || "")).filter(Boolean);
    } else if (typeof instructions === "string") {
      instructions = [instructions];
    }
    const jsonLdImage = Array.isArray(jsonLd.image) ? jsonLd.image[0] : jsonLd.image?.url || jsonLd.image;
    const text =
      `Título: ${name}\n\nIngredientes:\n${ingredients.join("\n")}\n\nModo de preparo:\n${instructions.join("\n")}`;
    return { text, image: jsonLdImage || image };
  }

  // Sem dado estruturado — cai pro texto visível da página (mais impreciso, a IA que se vira).
  const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
  const title = titleMatch ? titleMatch[1] : "";
  const text = `Título da página: ${title}\n\n${stripHtml(html).slice(0, 12000)}`;
  return { text, image };
}

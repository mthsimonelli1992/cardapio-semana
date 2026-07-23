// Base de receitas inicial — é só um ponto de partida, edite/apague/adicione livremente pela aba "Receitas".
// Cada receita tem uma porção-base (baseServings) e ingredientes proporcionais a ela.
// O app escala tudo automaticamente conforme o número de pessoas informado no planejamento.

const SEED_RECIPES = [
  {
    id: "arroz-branco",
    name: "Arroz branco",
    category: "acompanhamento",
    baseServings: 4,
    ingredients: [
      { name: "Arroz", qty: 2, unit: "xícara" },
      { name: "Óleo", qty: 1, unit: "colher de sopa" },
      { name: "Alho", qty: 1, unit: "dente" },
    ],
  },
  {
    id: "feijao-carioca",
    name: "Feijão carioca",
    category: "acompanhamento",
    baseServings: 4,
    ingredients: [
      { name: "Feijão carioca", qty: 300, unit: "g" },
      { name: "Alho", qty: 2, unit: "dente" },
      { name: "Cebola", qty: 0.5, unit: "unidade" },
    ],
  },
  {
    id: "frango-grelhado",
    name: "Frango grelhado",
    category: "prato principal",
    baseServings: 4,
    ingredients: [
      { name: "Peito de frango", qty: 600, unit: "g" },
      { name: "Alho", qty: 2, unit: "dente" },
      { name: "Limão", qty: 1, unit: "unidade" },
    ],
  },
  {
    id: "frango-parmegiana",
    name: "Frango à parmegiana",
    category: "prato principal",
    baseServings: 4,
    ingredients: [
      { name: "Peito de frango", qty: 600, unit: "g" },
      { name: "Molho de tomate", qty: 400, unit: "g" },
      { name: "Queijo mussarela", qty: 200, unit: "g" },
      { name: "Farinha de rosca", qty: 150, unit: "g" },
      { name: "Ovo", qty: 2, unit: "unidade" },
    ],
  },
  {
    id: "strogonoff-frango",
    name: "Strogonoff de frango",
    category: "prato principal",
    baseServings: 4,
    ingredients: [
      { name: "Peito de frango", qty: 600, unit: "g" },
      { name: "Creme de leite", qty: 200, unit: "g" },
      { name: "Molho de tomate", qty: 100, unit: "g" },
      { name: "Champignon", qty: 100, unit: "g" },
      { name: "Cebola", qty: 1, unit: "unidade" },
    ],
  },
  {
    id: "carne-moida",
    name: "Carne moída com batata",
    category: "prato principal",
    baseServings: 4,
    ingredients: [
      { name: "Carne moída", qty: 500, unit: "g" },
      { name: "Batata", qty: 4, unit: "unidade" },
      { name: "Cebola", qty: 1, unit: "unidade" },
      { name: "Tomate", qty: 2, unit: "unidade" },
    ],
  },
  {
    id: "bife-acebolado",
    name: "Bife acebolado",
    category: "prato principal",
    baseServings: 4,
    ingredients: [
      { name: "Bife (patinho ou coxão mole)", qty: 600, unit: "g" },
      { name: "Cebola", qty: 2, unit: "unidade" },
      { name: "Alho", qty: 2, unit: "dente" },
    ],
  },
  {
    id: "peixe-assado",
    name: "Peixe assado",
    category: "prato principal",
    baseServings: 4,
    ingredients: [
      { name: "Filé de peixe", qty: 600, unit: "g" },
      { name: "Limão", qty: 1, unit: "unidade" },
      { name: "Azeite", qty: 2, unit: "colher de sopa" },
    ],
  },
  {
    id: "macarrao-bolonhesa",
    name: "Macarrão à bolonhesa",
    category: "prato principal",
    baseServings: 4,
    ingredients: [
      { name: "Macarrão", qty: 500, unit: "g" },
      { name: "Carne moída", qty: 400, unit: "g" },
      { name: "Molho de tomate", qty: 400, unit: "g" },
      { name: "Cebola", qty: 1, unit: "unidade" },
    ],
  },
  {
    id: "lasanha",
    name: "Lasanha",
    category: "prato principal",
    baseServings: 6,
    ingredients: [
      { name: "Massa de lasanha", qty: 250, unit: "g" },
      { name: "Carne moída", qty: 500, unit: "g" },
      { name: "Molho de tomate", qty: 400, unit: "g" },
      { name: "Queijo mussarela", qty: 300, unit: "g" },
      { name: "Presunto", qty: 150, unit: "g" },
    ],
  },
  {
    id: "omelete",
    name: "Omelete",
    category: "prato principal",
    baseServings: 2,
    ingredients: [
      { name: "Ovo", qty: 4, unit: "unidade" },
      { name: "Queijo mussarela", qty: 50, unit: "g" },
      { name: "Tomate", qty: 1, unit: "unidade" },
    ],
  },
  {
    id: "macarrao-alho-oleo",
    name: "Macarrão alho e óleo com frango desfiado",
    category: "prato principal",
    baseServings: 4,
    ingredients: [
      { name: "Macarrão", qty: 500, unit: "g" },
      { name: "Peito de frango", qty: 400, unit: "g" },
      { name: "Alho", qty: 4, unit: "dente" },
      { name: "Azeite", qty: 3, unit: "colher de sopa" },
    ],
  },
  {
    id: "risoto-simples",
    name: "Risoto simples",
    category: "prato principal",
    baseServings: 4,
    ingredients: [
      { name: "Arroz arbório", qty: 2, unit: "xícara" },
      { name: "Caldo de legumes", qty: 1, unit: "l" },
      { name: "Queijo parmesão", qty: 80, unit: "g" },
      { name: "Cebola", qty: 1, unit: "unidade" },
    ],
  },
  {
    id: "salada-crua",
    name: "Salada crua variada",
    category: "acompanhamento",
    baseServings: 4,
    ingredients: [
      { name: "Alface", qty: 1, unit: "pé" },
      { name: "Tomate", qty: 2, unit: "unidade" },
      { name: "Pepino", qty: 1, unit: "unidade" },
    ],
  },
  {
    id: "legumes-refogados",
    name: "Legumes refogados",
    category: "acompanhamento",
    baseServings: 4,
    ingredients: [
      { name: "Cenoura", qty: 2, unit: "unidade" },
      { name: "Abobrinha", qty: 2, unit: "unidade" },
      { name: "Alho", qty: 1, unit: "dente" },
    ],
  },
  {
    id: "tapioca",
    name: "Tapioca",
    category: "café da manhã",
    baseServings: 1,
    ingredients: [
      { name: "Goma de tapioca", qty: 60, unit: "g" },
      { name: "Queijo coalho", qty: 30, unit: "g" },
    ],
  },
  {
    id: "pao-com-ovo",
    name: "Pão com ovo",
    category: "café da manhã",
    baseServings: 1,
    ingredients: [
      { name: "Pão francês", qty: 1, unit: "unidade" },
      { name: "Ovo", qty: 1, unit: "unidade" },
    ],
  },
];

// Referência de porção padrão por faixa etária/perfil, usada quando a pessoa não tem
// dieta própria cadastrada. Fator multiplica a porção-base da receita (1.0 = adulto padrão).
const PORTION_PROFILES = {
  crianca_pequena: { label: "Criança (2–6 anos)", factor: 0.45 },
  crianca: { label: "Criança (7–12 anos)", factor: 0.65 },
  adolescente: { label: "Adolescente (13–17 anos)", factor: 0.95 },
  mulher_adulta: { label: "Mulher adulta", factor: 1.0 },
  homem_adulto: { label: "Homem adulto", factor: 1.15 },
  idoso: { label: "Idoso (65+)", factor: 0.85 },
};

// Ajuste fino por nível de atividade, multiplica em cima do fator de perfil acima.
const ACTIVITY_LEVELS = {
  sedentario: { label: "Pouco ativo", factor: 0.9 },
  moderado: { label: "Ativo normal", factor: 1.0 },
  ativo: { label: "Muito ativo / treina pesado", factor: 1.15 },
};

// Converte a quantidade "de receita" (que vem em g, xícara, colher de sopa, dente, unidade...)
// em algo que dá pra efetivamente pedir/pegar no mercado brasileiro. Chave = "nome||unidade",
// igual à chave usada pra somar os ingredientes da semana.
// - mode "package": vem em embalagem fechada de tamanho fixo (perPackage = quantas unidades de
//   receita cabem numa embalagem; arredonda pra cima o nº de embalagens).
// - mode "unit": vendido solto (hortifruti), arredonda pra cima o nº de unidades.
// - mode "unit-dozen": como "unit", mas sugere dúzias quando a quantidade é grande (ovos).
// - mode "butcher": carne/peixe fresco, pesado no açougue/peixaria — arredonda pros 50g mais
//   próximos e sugere pedir por peso, não por embalagem.
const MARKET_PACKAGES = {
  "arroz||xícara": { mode: "package", perPackage: 5.5, label: "pacote de 1kg" },
  "arroz arbório||xícara": { mode: "package", perPackage: 2.5, label: "pacote de 500g" },
  "óleo||colher de sopa": { mode: "package", perPackage: 69, label: "garrafa de 900ml" },
  "azeite||colher de sopa": { mode: "package", perPackage: 38, label: "garrafa de 500ml" },
  "alho||dente": { mode: "package", perPackage: 8, label: "cabeça de alho" },
  "feijão carioca||g": { mode: "package", perPackage: 1000, label: "pacote de 1kg" },
  "feijão||g": { mode: "package", perPackage: 1000, label: "pacote de 1kg" },
  "molho de tomate||g": { mode: "package", perPackage: 340, label: "sachê de molho de tomate (340g)" },
  "queijo mussarela||g": { mode: "package", perPackage: 200, label: "pacote de queijo fatiado (200g)" },
  "farinha de rosca||g": { mode: "package", perPackage: 500, label: "pacote de farinha de rosca (500g)" },
  "creme de leite||g": { mode: "package", perPackage: 200, label: "caixinha de creme de leite (200g)" },
  "champignon||g": { mode: "package", perPackage: 200, label: "lata de champignon (200g)" },
  "macarrão||g": { mode: "package", perPackage: 500, label: "pacote de macarrão (500g)" },
  "massa de lasanha||g": { mode: "package", perPackage: 500, label: "pacote de massa de lasanha (500g)" },
  "presunto||g": { mode: "package", perPackage: 200, label: "pacote de presunto fatiado (200g)" },
  "goma de tapioca||g": { mode: "package", perPackage: 500, label: "pacote de goma de tapioca (500g)" },
  "queijo coalho||g": { mode: "package", perPackage: 250, label: "peça de queijo coalho (~250g)" },
  "queijo parmesão||g": { mode: "package", perPackage: 100, label: "pacote de queijo ralado (100g)" },
  "caldo de legumes||l": { mode: "package", perPackage: 1, label: "caixa de tabletes de caldo (rende ~1L)" },
  "farinha de trigo||g": { mode: "package", perPackage: 1000, label: "pacote de farinha de trigo (1kg)" },
  "açúcar||g": { mode: "package", perPackage: 1000, label: "pacote de açúcar (1kg)" },
  "sal||g": { mode: "package", perPackage: 1000, label: "pacote de sal (1kg)" },
  "leite||l": { mode: "package", perPackage: 1, label: "caixinha de leite (1L)" },

  "peito de frango||g": { mode: "butcher", label: "açougue" },
  "carne moída||g": { mode: "butcher", label: "açougue" },
  "bife (patinho ou coxão mole)||g": { mode: "butcher", label: "açougue" },
  "filé de peixe||g": { mode: "butcher", label: "peixaria" },

  "cebola||unidade": { mode: "unit", label: "cebola" },
  "tomate||unidade": { mode: "unit", label: "tomate" },
  "batata||unidade": { mode: "unit", label: "batata" },
  "limão||unidade": { mode: "unit", label: "limão" },
  "pão francês||unidade": { mode: "unit", label: "pão francês" },
  "abobrinha||unidade": { mode: "unit", label: "abobrinha" },
  "cenoura||unidade": { mode: "unit", label: "cenoura" },
  "pepino||unidade": { mode: "unit", label: "pepino" },
  "alface||pé": { mode: "unit", label: "pé de alface" },
  "ovo||unidade": { mode: "unit-dozen", label: "ovo" },
};

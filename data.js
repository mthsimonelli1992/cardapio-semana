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
    instructions: [
      "Lave o arroz em água corrente até a água sair mais clara.",
      "Aqueça o óleo numa panela e refogue o alho picado até dourar levemente.",
      "Junte o arroz e refogue por 1-2 minutos, mexendo sempre.",
      "Adicione água quente (o dobro do volume de arroz) e sal a gosto.",
      "Deixe ferver, abaixe o fogo, tampe e cozinhe por 15-18 minutos até secar.",
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
    instructions: [
      "Deixe o feijão de molho por pelo menos 4 horas (ou de um dia pro outro).",
      "Escorra e cozinhe na panela de pressão com água cobrindo por 2 dedos, por cerca de 20-25 minutos após pegar pressão.",
      "Numa frigideira, refogue o alho e a cebola picados no óleo até dourar.",
      "Misture o refogado no feijão já cozido, tempere com sal e deixe ferver por mais 5-10 minutos.",
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
    instructions: [
      "Corte o peito de frango em filés e tempere com alho amassado, suco de limão, sal e pimenta.",
      "Deixe marinar por pelo menos 15 minutos.",
      "Aqueça uma grelha ou frigideira antiaderente em fogo médio-alto.",
      "Grelhe os filés por 5-6 minutos de cada lado, até dourar e cozinhar por dentro.",
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
    instructions: [
      "Corte o peito de frango em bifes finos e tempere com sal e pimenta.",
      "Passe cada bife no ovo batido e depois na farinha de rosca, cobrindo bem.",
      "Frite em óleo quente até dourar dos dois lados, ou asse a 200°C até dourar.",
      "Numa assadeira, coloque uma camada de molho de tomate, os bifes empanados, mais molho por cima e cubra com a mussarela.",
      "Leve ao forno pré-aquecido a 200°C por 15-20 minutos, até o queijo derreter e gratinar.",
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
    instructions: [
      "Corte o frango em cubos e tempere com sal e pimenta.",
      "Refogue a cebola picada no óleo até ficar transparente, junte o frango e doure por todos os lados.",
      "Acrescente o champignon fatiado e o molho de tomate, mexendo bem.",
      "Cozinhe em fogo médio por 8-10 minutos, até o frango cozinhar por completo.",
      "Desligue o fogo, misture o creme de leite e sirva na sequência (sem ferver depois de adicionar o creme).",
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
    instructions: [
      "Descasque as batatas e corte em cubos médios.",
      "Refogue a cebola picada no óleo até dourar, junte a carne moída e tempere com sal e pimenta.",
      "Cozinhe mexendo até a carne perder a cor rosada e soltar a gordura.",
      "Adicione o tomate picado e as batatas, misture bem.",
      "Junte um pouco de água, tampe e cozinhe em fogo médio-baixo por 20-25 minutos, até as batatas ficarem macias.",
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
    instructions: [
      "Tempere os bifes com sal, pimenta e alho amassado.",
      "Aqueça a frigideira bem quente com um fio de óleo e sele os bifes rapidamente dos dois lados.",
      "Retire os bifes e reserve.",
      "Na mesma frigideira, refogue as cebolas fatiadas até ficarem douradas e macias.",
      "Volte os bifes pra frigideira, misture com a cebola e cozinhe por mais 1-2 minutos.",
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
    instructions: [
      "Tempere os filés com sal, pimenta, suco de limão e azeite. Deixe marinar 10 minutos.",
      "Coloque os filés numa assadeira untada.",
      "Leve ao forno pré-aquecido a 200°C por 15-20 minutos, até o peixe ficar opaco e se soltar facilmente com o garfo.",
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
    instructions: [
      "Cozinhe o macarrão em água fervente com sal, conforme instrução da embalagem, até ficar al dente.",
      "Numa panela, refogue a cebola picada no óleo até dourar.",
      "Junte a carne moída e cozinhe até perder a cor rosada, temperando com sal e pimenta.",
      "Adicione o molho de tomate e deixe cozinhar em fogo médio-baixo por 10-15 minutos.",
      "Escorra o macarrão e sirva com o molho bolonhesa por cima.",
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
    instructions: [
      "Refogue a carne moída temperada até dourar, junte o molho de tomate e cozinhe por 10 minutos.",
      "Se a massa não for pré-cozida, cozinhe rapidamente conforme a embalagem.",
      "Numa assadeira, monte camadas alternando massa, molho com carne, presunto e mussarela, repetindo até acabar os ingredientes.",
      "Finalize com uma camada generosa de mussarela por cima.",
      "Cubra com papel-alumínio e asse a 200°C por 25 minutos; retire o papel e deixe gratinar por mais 10-15 minutos.",
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
    instructions: [
      "Bata os ovos numa tigela com sal e pimenta.",
      "Pique o tomate e o queijo em cubos pequenos e misture aos ovos batidos.",
      "Aqueça uma frigideira antiaderente com um fio de óleo em fogo médio.",
      "Despeje a mistura e cozinhe sem mexer até a base firmar, depois dobre ao meio e cozinhe mais 1-2 minutos.",
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
    instructions: [
      "Cozinhe o peito de frango em água com sal até ficar macio, depois desfie.",
      "Cozinhe o macarrão em água fervente com sal até ficar al dente e escorra, reservando um pouco da água do cozimento.",
      "Numa frigideira grande, aqueça o azeite e doure o alho fatiado sem queimar.",
      "Junte o frango desfiado e refogue por 2 minutos.",
      "Adicione o macarrão escorrido, misture bem e ajuste com um pouco da água reservada se ficar seco.",
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
    instructions: [
      "Aqueça o caldo de legumes numa panela à parte e mantenha em fogo baixo.",
      "Refogue a cebola picada no azeite até ficar transparente.",
      "Junte o arroz arbório e refogue por 1-2 minutos, até ficar translúcido nas bordas.",
      "Adicione o caldo quente aos poucos, uma concha por vez, mexendo sempre e só acrescentando mais quando o líquido anterior secar.",
      "Repita até o arroz ficar cremoso e al dente (cerca de 18-20 minutos). Desligue o fogo e misture o parmesão ralado.",
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
    instructions: [
      "Lave bem todas as folhas e legumes.",
      "Rasgue ou corte a alface em pedaços, e fatie o tomate e o pepino.",
      "Misture tudo numa saladeira e tempere com sal, azeite e vinagre (ou limão) na hora de servir.",
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
    instructions: [
      "Corte a cenoura e a abobrinha em rodelas ou cubos pequenos.",
      "Aqueça um fio de óleo numa frigideira e refogue o alho picado até perfumar.",
      "Junte a cenoura primeiro e refogue por 3-4 minutos.",
      "Adicione a abobrinha, tempere com sal e cozinhe por mais 5-6 minutos, até os legumes ficarem macios mas com textura.",
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
    instructions: [
      "Peneire a goma de tapioca numa frigideira antiaderente já quente, formando um disco fino e uniforme.",
      "Deixe firmar em fogo médio por cerca de 1-2 minutos, até soltar da frigideira.",
      "Vire, adicione o queijo coalho fatiado ou ralado sobre metade do disco.",
      "Dobre ao meio e deixe mais 1 minuto até o queijo amolecer.",
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
    instructions: [
      "Frite o ovo numa frigideira com um fio de óleo, no ponto que preferir.",
      "Corte o pão francês ao meio e, se quiser, esquente/toste levemente.",
      "Coloque o ovo dentro do pão, tempere com sal a gosto e sirva.",
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

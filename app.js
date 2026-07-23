// ===== Estado =====
const DAYS = [
  { key: "seg", label: "Segunda" },
  { key: "ter", label: "Terça" },
  { key: "qua", label: "Quarta" },
  { key: "qui", label: "Quinta" },
  { key: "sex", label: "Sexta" },
  { key: "sab", label: "Sábado" },
  { key: "dom", label: "Domingo" },
];

function emptyMeal() {
  return { emCasa: false, recipeIds: [], peopleIds: [], extra: { adultos: 0, criancas: 0 } };
}

function defaultWeek() {
  const days = {};
  DAYS.forEach((d) => {
    days[d.key] = { almoco: emptyMeal(), jantar: emptyMeal() };
  });
  return days;
}

// Migra estado salvo de versões antigas: meal.pessoas era um número solto (agora peopleIds
// + extra, pra escalar por perfil de pessoa), meal.recipeId era um prato único (agora
// recipeIds, uma lista) e meal.extra era um número solto de convidados (agora separado
// em adultos/crianças, já que cada um pesa diferente na porção).
function migrateWeek(week) {
  Object.values(week).forEach((day) => {
    ["almoco", "jantar"].forEach((meal) => {
      const m = day[meal];
      if (m.peopleIds === undefined) m.peopleIds = [];
      if (typeof m.extra !== "object" || m.extra === null) {
        const legacyCount = typeof m.extra === "number" ? m.extra : m.pessoas !== undefined ? m.pessoas : 0;
        m.extra = { adultos: legacyCount, criancas: 0 };
      }
      if (m.recipeIds === undefined) m.recipeIds = m.recipeId ? [m.recipeId] : [];
    });
  });
  return week;
}

// Preenche o que falta num estado carregado (ou cria um do zero), sempre no mesmo formato —
// usado tanto pra um usuário novo quanto pra dado antigo salvo antes de alguma dessas features.
function normalizeState(parsed) {
  const s = parsed ? { ...parsed } : {};
  if (!s.recipes) s.recipes = structuredClone(SEED_RECIPES);
  if (!s.week) s.week = defaultWeek();
  if (!s.people) s.people = [];
  s.people.forEach((p) => {
    if (!p.activityLevel) p.activityLevel = "moderado";
  });
  if (!s.checklist) s.checklist = {};
  if (s.generatedAt === undefined) s.generatedAt = null;
  s.week = migrateWeek(s.week);
  return s;
}

let state = null;
let sb = null;
let currentUserId = null;

async function loadStateFromDB(userId) {
  const { data, error } = await sb.from("app_state").select("data").eq("user_id", userId).maybeSingle();
  if (error) console.error("Falha ao carregar estado do banco:", error);
  return normalizeState(data ? data.data : null);
}

async function saveState() {
  if (!currentUserId) return;
  const { error } = await sb
    .from("app_state")
    .upsert({ user_id: currentUserId, data: state, updated_at: new Date().toISOString() });
  if (error) console.error("Falha ao salvar estado:", error);
}

// ===== Navegação por abas =====
function switchView(name) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
  document.getElementById("view-" + name).classList.add("active");
  document.querySelector('.tab-btn[data-view="' + name + '"]').classList.add("active");
  if (name === "pessoas") renderPeople();
  if (name === "receitas") renderRecipes();
  if (name === "lista") renderShoppingList();
}

// ===== Planner semanal =====
function recipeOptionsHtml(selectedId, category, placeholder) {
  const opts = state.recipes
    .filter((r) => category === "todas" || r.category === category)
    .map((r) => `<option value="${r.id}" ${r.id === selectedId ? "selected" : ""}>${r.name}</option>`)
    .join("");
  return `<option value="">${placeholder || "— escolher receita —"}</option>${opts}`;
}

function renderPlanner() {
  const container = document.getElementById("planner-days");
  container.innerHTML = DAYS.map((d) => {
    const day = state.week[d.key];
    const activeCount = ["almoco", "jantar"].filter((m) => day[m].emCasa).length;
    const pillText = activeCount === 0 ? "sem refeições em casa" : `${activeCount} refeição(ões) em casa`;
    const dishIcons = ["almoco", "jantar"]
      .flatMap((meal) => (day[meal].emCasa ? day[meal].recipeIds : []))
      .map((rid) => {
        const recipe = state.recipes.find((r) => r.id === rid);
        const cat = recipe ? CATEGORY_INFO[recipe.category] : null;
        return cat ? cat.icon : recipe ? "🍲" : null;
      })
      .filter(Boolean)
      .join(" ");
    return `
      <details class="day-card ${activeCount > 0 ? "has-meals" : ""}" ${activeCount > 0 ? "open" : ""}>
        <summary>
          <div>
            <span class="day-name">${d.label}</span>
            ${dishIcons ? `<div class="day-dish-preview">${dishIcons}</div>` : ""}
          </div>
          <span class="day-summary-pill ${activeCount > 0 ? "has-meals" : ""}">${pillText}</span>
        </summary>
        <div class="day-body">
          ${["almoco", "jantar"].map((meal) => mealRowHtml(d.key, meal, day[meal])).join("")}
        </div>
      </details>
    `;
  }).join("");
  renderHeaderStats();
}

function renderHeaderStats() {
  const el = document.getElementById("header-stats");
  if (!el) return;
  let count = 0;
  DAYS.forEach((d) => {
    ["almoco", "jantar"].forEach((meal) => {
      const m = state.week[d.key][meal];
      if (m.emCasa && m.recipeIds.length) count++;
    });
  });
  el.textContent =
    count === 0
      ? "🍳 Nenhuma refeição planejada ainda"
      : `🍳 ${count} refeiç${count > 1 ? "ões" : "ão"} planejada${count > 1 ? "s" : ""} essa semana`;
}

function mealRowHtml(dayKey, meal, data) {
  const label = meal === "almoco" ? "☀️ Almoço" : "🌙 Jantar";

  const dishRows = data.recipeIds
    .map(
      (rid, idx) => `
      <div class="dish-row">
        <select onchange="updateMealDish('${dayKey}','${meal}',${idx}, this.value)">
          ${recipeOptionsHtml(rid, "todas")}
        </select>
        <button type="button" class="btn-danger-ghost" onclick="removeMealDish('${dayKey}','${meal}',${idx})">✕</button>
      </div>
    `
    )
    .join("");
  const addDishRow = `
    <div class="dish-row">
      <select onchange="addMealDish('${dayKey}','${meal}', this.value)">
        ${recipeOptionsHtml("", "todas", "+ adicionar prato")}
      </select>
    </div>
  `;

  const chips = state.people
    .map(
      (p) => `
      <button type="button" class="person-chip ${data.peopleIds.includes(p.id) ? "selected" : ""}"
        onclick="togglePersonInMeal('${dayKey}','${meal}','${p.id}')">${p.name}</button>
    `
    )
    .join("");
  const total = computeMealFactor(data);
  return `
    <div class="meal-row">
      <div class="meal-row-top">
        <span class="meal-label">${label}</span>
        <label class="switch">
          <input type="checkbox" ${data.emCasa ? "checked" : ""}
            onchange="updateMeal('${dayKey}','${meal}','emCasa', this.checked)" />
          <span class="track"></span><span class="thumb"></span>
        </label>
      </div>
      <div class="meal-fields ${data.emCasa ? "" : "hidden"}">
        <span class="field-label">Pratos</span>
        ${dishRows}
        ${addDishRow}
        <span class="field-label">Quem come</span>
        <div class="people-picker">
          ${chips || '<span class="no-people-hint">Cadastre pessoas na aba Pessoas pra escalar por perfil</span>'}
        </div>
        <span class="field-label">Convidados extras</span>
        <div class="extra-guests">
          <span class="extra-guest-stepper">
            <button type="button" class="stepper-btn" onclick="adjustMealExtra('${dayKey}','${meal}','adultos',-1)">−</button>
            ${data.extra.adultos || 0} adulto(s)
            <button type="button" class="stepper-btn" onclick="adjustMealExtra('${dayKey}','${meal}','adultos',1)">+</button>
          </span>
          <span class="extra-guest-stepper">
            <button type="button" class="stepper-btn" onclick="adjustMealExtra('${dayKey}','${meal}','criancas',-1)">−</button>
            ${data.extra.criancas || 0} criança(s)
            <button type="button" class="stepper-btn" onclick="adjustMealExtra('${dayKey}','${meal}','criancas',1)">+</button>
          </span>
        </div>
        <div class="meal-total-hint">Cada prato é feito pra ${formatQty(total)} porção(ões)-padrão</div>
      </div>
    </div>
  `;
}

function updateMeal(dayKey, meal, field, value) {
  const m = state.week[dayKey][meal];
  m[field] = value;
  // Desligar "em casa" zera as escolhas — religar depois começa do zero, não com o que sobrou de antes.
  if (field === "emCasa" && value === false) {
    m.recipeIds = [];
    m.peopleIds = [];
    m.extra = { adultos: 0, criancas: 0 };
  }
  saveState();
  renderPlanner();
}

function adjustMealExtra(dayKey, meal, key, delta) {
  const m = state.week[dayKey][meal];
  m.extra[key] = Math.max(0, (m.extra[key] || 0) + delta);
  saveState();
  renderPlanner();
}

function addMealDish(dayKey, meal, recipeId) {
  if (!recipeId) return;
  state.week[dayKey][meal].recipeIds.push(recipeId);
  saveState();
  renderPlanner();
}
function updateMealDish(dayKey, meal, idx, recipeId) {
  const arr = state.week[dayKey][meal].recipeIds;
  if (!recipeId) arr.splice(idx, 1);
  else arr[idx] = recipeId;
  saveState();
  renderPlanner();
}
function removeMealDish(dayKey, meal, idx) {
  state.week[dayKey][meal].recipeIds.splice(idx, 1);
  saveState();
  renderPlanner();
}

function togglePersonInMeal(dayKey, meal, personId) {
  const arr = state.week[dayKey][meal].peopleIds;
  const idx = arr.indexOf(personId);
  if (idx === -1) arr.push(personId);
  else arr.splice(idx, 1);
  saveState();
  renderPlanner();
}

// ===== Pessoas e fatores de porção =====
function getPersonFactor(person) {
  if (person.profile === "personalizado") return person.customFactor || 1;
  const profile = PORTION_PROFILES[person.profile];
  const baseFactor = profile ? profile.factor : 1;
  const activity = ACTIVITY_LEVELS[person.activityLevel];
  return baseFactor * (activity ? activity.factor : 1);
}

// Soma os fatores de porção de quem come a refeição: pessoas cadastradas + convidados
// avulsos (adultos a fator 1.0, crianças no fator padrão de criança).
function computeMealFactor(meal) {
  const peopleFactor = (meal.peopleIds || [])
    .map((id) => state.people.find((p) => p.id === id))
    .filter(Boolean)
    .reduce((sum, p) => sum + getPersonFactor(p), 0);
  const extra = meal.extra || { adultos: 0, criancas: 0 };
  const childFactor = PORTION_PROFILES.crianca ? PORTION_PROFILES.crianca.factor : 0.65;
  return peopleFactor + (extra.adultos || 0) * 1.0 + (extra.criancas || 0) * childFactor;
}

const PROFILE_GROUP_COLOR = {
  crianca_pequena: "var(--mustard)",
  crianca: "var(--mustard)",
  adolescente: "var(--mustard)",
  mulher_adulta: "var(--green)",
  homem_adulto: "var(--green)",
  idoso: "var(--plum)",
  personalizado: "var(--ink-soft)",
};

function renderPeople() {
  const container = document.getElementById("people-list");
  if (state.people.length === 0) {
    container.innerHTML = `<div class="empty-state"><span class="glyph">👪</span>Nenhuma pessoa cadastrada ainda. Cadastre pra escalar as receitas por perfil de porção.</div>`;
    return;
  }
  container.innerHTML = state.people
    .map((p) => {
      const factor = getPersonFactor(p);
      const profileLabel =
        p.profile === "personalizado"
          ? `Personalizado · fator ${formatQty(factor)}`
          : `${PORTION_PROFILES[p.profile].label} · ${ACTIVITY_LEVELS[p.activityLevel] ? ACTIVITY_LEVELS[p.activityLevel].label : "Ativo normal"}`;
      const initial = p.name.trim().charAt(0).toUpperCase() || "?";
      const avatarColor = PROFILE_GROUP_COLOR[p.profile] || "var(--ink-soft)";
      return `
    <div class="recipe-card person-card" style="--accent:${avatarColor}">
      <div class="person-avatar" style="background:${avatarColor}">${initial}</div>
      <div class="recipe-card-top" style="flex:1">
        <div>
          <div class="recipe-name">${p.name}</div>
          <div class="person-meta">${profileLabel}</div>
        </div>
        <button class="btn-danger-ghost" onclick="deletePerson('${p.id}')">remover</button>
      </div>
    </div>
  `;
    })
    .join("");
}

function deletePerson(id) {
  if (!confirm("Remover esta pessoa?")) return;
  state.people = state.people.filter((p) => p.id !== id);
  saveState();
  renderPeople();
  renderPlanner();
}

// Pra crianças até 12 anos o nível de atividade não faz diferença perceptível na porção,
// então esconde o campo (fica só nos adolescentes pra cima, onde já varia mais o apetite).
function updateProfileFieldsVisibility() {
  const profile = document.getElementById("np-profile").value;
  const isCustom = profile === "personalizado";
  const isYoungChild = profile === "crianca_pequena" || profile === "crianca";
  document.getElementById("np-factor-wrap").classList.toggle("hidden", !isCustom);
  document.getElementById("np-activity-wrap").classList.toggle("hidden", isCustom || isYoungChild);
}

function openNewPersonModal() {
  document.getElementById("np-name").value = "";
  document.getElementById("np-profile").value = "mulher_adulta";
  document.getElementById("np-activity").value = "moderado";
  document.getElementById("np-factor").value = 1;
  updateProfileFieldsVisibility();
  document.getElementById("modal-new-person").classList.remove("hidden");
}
function closeNewPersonModal() {
  document.getElementById("modal-new-person").classList.add("hidden");
}
function saveNewPerson() {
  const name = document.getElementById("np-name").value.trim();
  const profile = document.getElementById("np-profile").value;
  const activityLevel = document.getElementById("np-activity").value;
  const customFactor = Math.max(0.1, parseFloat(document.getElementById("np-factor").value) || 1);
  if (!name) {
    alert("Dá um nome pra pessoa.");
    return;
  }
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Date.now();
  state.people.push({
    id,
    name,
    profile,
    activityLevel,
    customFactor: profile === "personalizado" ? customFactor : undefined,
  });
  saveState();
  closeNewPersonModal();
  renderPeople();
  renderPlanner();
}

// ===== Gestão de receitas =====
const CATEGORY_INFO = {
  "café da manhã": { icon: "🍳", color: "var(--mustard)" },
  "prato principal": { icon: "🍽️", color: "var(--green)" },
  acompanhamento: { icon: "🥗", color: "var(--plum)" },
};

function renderRecipes() {
  const container = document.getElementById("recipes-list");
  if (state.recipes.length === 0) {
    container.innerHTML = `<div class="empty-state"><span class="glyph">🍳</span>Nenhuma receita cadastrada ainda.</div>`;
    return;
  }
  container.innerHTML = state.recipes
    .map((r) => {
      const cat = CATEGORY_INFO[r.category] || { icon: "🍲", color: "var(--ink-soft)" };
      return `
    <div class="recipe-card" style="--accent:${cat.color}">
      <div class="recipe-card-top">
        <div class="recipe-thumb" style="background:${cat.color}">${cat.icon}</div>
        <div style="flex:1">
          <div class="recipe-name">${r.name}</div>
          <div class="person-meta">${r.category} · rende ${r.baseServings} porç.</div>
        </div>
        <div class="recipe-card-actions">
          <button class="btn-ghost" onclick="openEditRecipeModal('${r.id}')">editar</button>
          <button class="btn-danger-ghost" onclick="deleteRecipe('${r.id}')">remover</button>
        </div>
      </div>
      <ul class="recipe-ing-list">
        ${r.ingredients.map((i) => `<li>${i.qty} ${i.unit} — ${i.name}</li>`).join("")}
      </ul>
    </div>
  `;
    })
    .join("");
}

function deleteRecipe(id) {
  if (!confirm("Remover esta receita da base?")) return;
  state.recipes = state.recipes.filter((r) => r.id !== id);
  saveState();
  renderRecipes();
  renderPlanner();
}

let newRecipeIngredients = [];
let editingRecipeId = null;

function openNewRecipeModal() {
  editingRecipeId = null;
  document.getElementById("recipe-modal-title").textContent = "Nova receita";
  newRecipeIngredients = [{ name: "", qty: "", unit: "g" }];
  document.getElementById("nr-name").value = "";
  document.getElementById("nr-category").value = "prato principal";
  document.getElementById("nr-servings").value = 4;
  renderNewRecipeIngredients();
  document.getElementById("modal-new-recipe").classList.remove("hidden");
}

function openEditRecipeModal(id) {
  const recipe = state.recipes.find((r) => r.id === id);
  if (!recipe) return;
  editingRecipeId = id;
  document.getElementById("recipe-modal-title").textContent = "Editar receita";
  newRecipeIngredients = recipe.ingredients.map((i) => ({ ...i }));
  document.getElementById("nr-name").value = recipe.name;
  document.getElementById("nr-category").value = recipe.category;
  document.getElementById("nr-servings").value = recipe.baseServings;
  renderNewRecipeIngredients();
  document.getElementById("modal-new-recipe").classList.remove("hidden");
}
function closeNewRecipeModal() {
  document.getElementById("modal-new-recipe").classList.add("hidden");
}
function renderNewRecipeIngredients() {
  const wrap = document.getElementById("nr-ingredients");
  wrap.innerHTML = newRecipeIngredients
    .map(
      (ing, idx) => `
    <div class="ing-row">
      <input type="text" placeholder="Ingrediente" value="${ing.name}" oninput="newRecipeIngredients[${idx}].name=this.value" />
      <input type="number" placeholder="Qtd" value="${ing.qty}" oninput="newRecipeIngredients[${idx}].qty=this.value" />
      <input type="text" placeholder="Unidade" value="${ing.unit}" oninput="newRecipeIngredients[${idx}].unit=this.value" />
      <button class="btn-danger-ghost" onclick="removeIngRow(${idx})">✕</button>
    </div>
  `
    )
    .join("");
}
function addIngRow() {
  newRecipeIngredients.push({ name: "", qty: "", unit: "g" });
  renderNewRecipeIngredients();
}
function removeIngRow(idx) {
  newRecipeIngredients.splice(idx, 1);
  renderNewRecipeIngredients();
}
function saveNewRecipe() {
  const name = document.getElementById("nr-name").value.trim();
  const category = document.getElementById("nr-category").value;
  const baseServings = Math.max(1, parseInt(document.getElementById("nr-servings").value) || 1);
  const ingredients = newRecipeIngredients
    .filter((i) => i.name.trim() && i.qty)
    .map((i) => ({ name: i.name.trim(), qty: parseFloat(i.qty), unit: i.unit.trim() || "un" }));
  if (!name || ingredients.length === 0) {
    alert("Dá um nome pra receita e pelo menos um ingrediente com quantidade.");
    return;
  }
  if (editingRecipeId) {
    const recipe = state.recipes.find((r) => r.id === editingRecipeId);
    Object.assign(recipe, { name, category, baseServings, ingredients });
  } else {
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Date.now();
    state.recipes.push({ id, name, category, baseServings, ingredients });
  }
  saveState();
  closeNewRecipeModal();
  renderRecipes();
  renderPlanner();
}

// ===== Importar receita com IA =====
let pendingVideoFrames = null;

function openImportModal() {
  document.getElementById("import-text").value = "";
  document.getElementById("import-pdf-input").value = "";
  document.getElementById("import-video-input").value = "";
  document.getElementById("import-status").classList.add("hidden");
  document.getElementById("import-review").innerHTML = "";
  pendingVideoFrames = null;
  document.getElementById("modal-import-recipe").classList.remove("hidden");
}
function closeImportModal() {
  document.getElementById("modal-import-recipe").classList.add("hidden");
}

function setImportStatus(text) {
  const el = document.getElementById("import-status");
  el.textContent = text;
  el.classList.remove("hidden");
}

async function handleImportPdf(event) {
  const file = event.target.files[0];
  if (!file) return;
  setImportStatus("Lendo PDF...");
  try {
    const buffer = await file.arrayBuffer();
    pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((it) => it.str).join(" ") + "\n";
    }
    document.getElementById("import-text").value = text.trim();
    setImportStatus(`PDF lido (${pdf.numPages} página${pdf.numPages > 1 ? "s" : ""}). Confira o texto e clique em "Extrair receitas".`);
  } catch (e) {
    setImportStatus("Não consegui ler esse PDF. Tenta colar o texto manualmente.");
  }
}

// Captura alguns quadros do vídeo direto no navegador (canvas), sem precisar subir o vídeo
// inteiro pro servidor — só as imagens já reduzidas, que é o que a IA precisa pra ler a tela.
function extractVideoFrames(file, maxFrames) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = URL.createObjectURL(file);

    function seekTo(time) {
      return new Promise((res) => {
        video.onseeked = () => res();
        video.currentTime = time;
      });
    }

    video.onloadedmetadata = async () => {
      try {
        const duration = video.duration || 1;
        const scale = Math.min(1, 480 / video.videoWidth);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        const ctx = canvas.getContext("2d");
        const frames = [];
        const step = duration / (maxFrames + 1);
        for (let i = 1; i <= maxFrames; i++) {
          await seekTo(step * i);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          frames.push(canvas.toDataURL("image/jpeg", 0.6).split(",")[1]);
        }
        URL.revokeObjectURL(video.src);
        resolve(frames);
      } catch (e) {
        reject(e);
      }
    };
    video.onerror = () => reject(new Error("Não consegui ler esse vídeo."));
  });
}

async function handleImportVideo(event) {
  const file = event.target.files[0];
  if (!file) return;
  setImportStatus("Capturando quadros do vídeo...");
  try {
    pendingVideoFrames = await extractVideoFrames(file, 6);
    setImportStatus(
      `${pendingVideoFrames.length} quadros capturados. Se quiser, cole a legenda do vídeo no campo de texto (ajuda a IA) e clique em "Extrair receitas".`
    );
  } catch (e) {
    pendingVideoFrames = null;
    setImportStatus("Não consegui processar esse vídeo. Tenta outro arquivo.");
  }
}

let pendingImportRecipes = [];

async function extractRecipesWithAI() {
  const text = document.getElementById("import-text").value.trim();
  const usingVideo = pendingVideoFrames && pendingVideoFrames.length > 0;
  if (!usingVideo && text.length < 20) {
    alert("Cole o texto da receita, ou envie um vídeo/PDF primeiro.");
    return;
  }
  const btn = document.getElementById("import-extract-btn");
  document.getElementById("import-review").innerHTML = "";
  setImportStatus("Consultando a IA...");
  btn.disabled = true;
  try {
    const url = usingVideo ? "/api/parse-recipe-video" : "/api/parse-recipe";
    const body = usingVideo ? { frames: pendingVideoFrames, caption: text } : { text };
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erro ao processar.");
    if (!data.recipes || data.recipes.length === 0) {
      setImportStatus("Não encontrei nenhuma receita reconhecível nesse conteúdo.");
      return;
    }
    setImportStatus(`${data.recipes.length} receita(s) encontrada(s). Confira antes de salvar:`);
    renderImportReview(data.recipes);
  } catch (e) {
    if (e instanceof TypeError) {
      setImportStatus('Não consegui falar com o servidor de IA — isso só funciona na versão publicada (Vercel), não abrindo o arquivo local direto.');
    } else {
      setImportStatus("Erro: " + e.message);
    }
  } finally {
    btn.disabled = false;
  }
}

function renderImportReview(recipes) {
  pendingImportRecipes = recipes;
  document.getElementById("import-review").innerHTML = recipes
    .map(
      (r, idx) => `
    <div class="recipe-card import-review-card" id="import-card-${idx}">
      <div class="recipe-card-top">
        <div>
          <div class="recipe-name">${r.nome}</div>
          <div class="person-meta">${r.categoria} · rende ${r.rende_porcoes} porç.</div>
        </div>
      </div>
      <ul class="recipe-ing-list">
        ${(r.ingredientes || []).map((i) => `<li>${i.quantidade} ${i.unidade} — ${i.nome}</li>`).join("")}
      </ul>
      <div class="action-row">
        <button class="btn btn-secondary" onclick="discardImportedRecipe(${idx})">Descartar</button>
        <button class="btn btn-primary" onclick="acceptImportedRecipe(${idx})">Adicionar ao banco</button>
      </div>
    </div>
  `
    )
    .join("");
}

function acceptImportedRecipe(idx) {
  const r = pendingImportRecipes[idx];
  if (!r) return;
  const id = r.nome.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Date.now();
  state.recipes.push({
    id,
    name: r.nome,
    category: r.categoria,
    baseServings: Math.max(1, parseInt(r.rende_porcoes) || 4),
    ingredients: (r.ingredientes || []).map((i) => ({
      name: i.nome,
      qty: Number(i.quantidade) || 1,
      unit: i.unidade || "un",
    })),
  });
  saveState();
  renderRecipes();
  renderPlanner();
  document.getElementById(`import-card-${idx}`)?.remove();
}

function discardImportedRecipe(idx) {
  document.getElementById(`import-card-${idx}`)?.remove();
}

// ===== Lista de compras =====
function computeAggregatedIngredients() {
  const totals = {}; // key: "nome||unidade" -> { name, unit, qty }
  DAYS.forEach((d) => {
    ["almoco", "jantar"].forEach((meal) => {
      const m = state.week[d.key][meal];
      if (!m.emCasa || !m.recipeIds.length) return;
      const factor = computeMealFactor(m);
      m.recipeIds.forEach((recipeId) => {
        const recipe = state.recipes.find((r) => r.id === recipeId);
        if (!recipe) return;
        const scale = factor / recipe.baseServings;
        recipe.ingredients.forEach((ing) => {
          const key = ing.name.toLowerCase() + "||" + ing.unit;
          if (!totals[key]) totals[key] = { name: ing.name, unit: ing.unit, qty: 0 };
          totals[key].qty += ing.qty * scale;
        });
      });
    });
  });
  return Object.values(totals).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

function formatQty(qty) {
  const rounded = Math.round(qty * 100) / 100;
  return rounded % 1 === 0 ? rounded.toString() : rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

// Traduz a quantidade "de receita" (ex: 2.95 xícara) pro que dá pra pedir/comprar de fato
// (ex: "1x pacote de 1kg"). Sem referência de embalagem, mantém a quantidade crua como fallback.
function getMarketPurchaseText(item) {
  const ref = MARKET_PACKAGES[item.name.toLowerCase() + "||" + item.unit];
  if (!ref) return `${formatQty(item.qty)} ${item.unit}`;

  if (ref.mode === "butcher") {
    const rounded = Math.max(50, Math.ceil(item.qty / 50) * 50);
    const display = rounded >= 1000 ? `${formatQty(rounded / 1000)} kg` : `${rounded} g`;
    return `~${display} (peça no ${ref.label})`;
  }
  if (ref.mode === "unit" || ref.mode === "unit-dozen") {
    const count = Math.max(1, Math.ceil(item.qty));
    let text = `${count} ${ref.label}${count > 1 ? "s" : ""}`;
    if (ref.mode === "unit-dozen" && count > 6) {
      const dozens = Math.ceil(count / 12);
      text += ` (~${dozens} dúzia${dozens > 1 ? "s" : ""})`;
    }
    return text;
  }
  const packages = Math.max(1, Math.ceil(item.qty / ref.perPackage));
  return `${packages}x ${ref.label}`;
}

function generateChecklist() {
  const items = computeAggregatedIngredients();
  if (items.length === 0) {
    alert("Nenhuma refeição em casa foi marcada na aba Semana ainda.");
    return;
  }
  // reinicia o checklist mantendo os itens que já existiam desmarcados/marcados quando fizer sentido
  const newChecklist = {};
  items.forEach((item) => {
    const key = item.name.toLowerCase() + "||" + item.unit;
    newChecklist[key] = state.checklist[key] || false;
  });
  state.checklist = newChecklist;
  state.generatedAt = new Date().toISOString();
  saveState();
  renderShoppingList();
}

function toggleChecklistItem(key) {
  state.checklist[key] = !state.checklist[key];
  saveState();
  renderShoppingList();
}

function renderShoppingList() {
  const container = document.getElementById("lista-content");
  const items = computeAggregatedIngredients();

  if (items.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="glyph">🧺</span>
        Marque as refeições da semana na aba <strong>Semana</strong> e volte aqui pra gerar a lista.
      </div>`;
    return;
  }

  if (!state.generatedAt) {
    container.innerHTML = `
      <div class="banner">Sua semana está planejada. Gere a checklist pra marcar o que já tem em casa.</div>
      <button class="btn btn-primary btn-block" onclick="generateChecklist()">Gerar checklist da semana</button>
    `;
    return;
  }

  const haveKeys = items.filter((i) => state.checklist[i.name.toLowerCase() + "||" + i.unit]);
  const needKeys = items.filter((i) => !state.checklist[i.name.toLowerCase() + "||" + i.unit]);
  const progressPct = Math.round((haveKeys.length / items.length) * 100);

  const renderGroup = (list, checked) =>
    list
      .map((item) => {
        const key = item.name.toLowerCase() + "||" + item.unit;
        return `
        <label class="check-item ${checked ? "checked" : ""}">
          <input type="checkbox" ${checked ? "checked" : ""} onchange="toggleChecklistItem('${key}')" />
          <span class="item-name">${item.name}</span>
          <span class="item-qty">${getMarketPurchaseText(item)}</span>
        </label>
      `;
      })
      .join("");

  container.innerHTML = `
    <div class="banner ${needKeys.length === 0 ? "done" : ""}">
      ${needKeys.length === 0 ? "Tudo marcado — nada pra comprar!" : `Faltam ${needKeys.length} ite${needKeys.length > 1 ? "ns" : "m"} pra comprar`}
    </div>
    <div class="progress-track"><div class="progress-fill" style="width:${progressPct}%"></div></div>
    <div class="list-section-title">Falta comprar</div>
    ${needKeys.length ? renderGroup(needKeys, false) : '<div style="color:var(--ink-soft);font-size:0.85rem;padding:6px 4px;">Nada por aqui.</div>'}
    <div class="list-section-title">Já tenho em casa</div>
    ${haveKeys.length ? renderGroup(haveKeys, true) : '<div style="color:var(--ink-soft);font-size:0.85rem;padding:6px 4px;">Ainda nada marcado.</div>'}
    <div class="action-row">
      <button class="btn btn-secondary" onclick="generateChecklist()">Recalcular da Semana</button>
      <button class="btn btn-primary" onclick="shareList()">Compartilhar lista</button>
    </div>
    <div class="action-row">
      <button class="btn btn-secondary btn-block" onclick="exportListPdf()">📄 Baixar PDF com checklist</button>
    </div>
  `;
}

// Monta o cardápio dia a dia com os ingredientes já escalados de cada prato,
// pra ir junto da lista de compras — assim quem recebe sabe o que cozinhar, não só o que comprar.
function buildWeekMenuText() {
  const dayBlocks = DAYS.map((d) => {
    const day = state.week[d.key];
    const mealBlocks = ["almoco", "jantar"]
      .filter((meal) => day[meal].emCasa && day[meal].recipeIds.length)
      .map((meal) => {
        const m = day[meal];
        const mealLabel = meal === "almoco" ? "Almoço" : "Jantar";
        const factor = computeMealFactor(m);
        const dishLines = m.recipeIds
          .map((rid) => {
            const recipe = state.recipes.find((r) => r.id === rid);
            if (!recipe) return null;
            const scale = factor / recipe.baseServings;
            const ingLine = recipe.ingredients.map((ing) => `${formatQty(ing.qty * scale)} ${ing.unit} ${ing.name}`).join(", ");
            return `    ${recipe.name} — ${ingLine}`;
          })
          .filter(Boolean)
          .join("\n");
        return `  ${mealLabel}:\n${dishLines}`;
      });
    return mealBlocks.length ? `${d.label}:\n${mealBlocks.join("\n")}` : null;
  }).filter(Boolean);
  return dayBlocks.length ? "🍽️ Cardápio da semana:\n\n" + dayBlocks.join("\n\n") : "";
}

async function shareList() {
  const items = computeAggregatedIngredients().filter(
    (i) => !state.checklist[i.name.toLowerCase() + "||" + i.unit]
  );
  const shoppingText =
    "🛒 Lista de compras da semana:\n" + items.map((i) => `- ${i.name}: ${getMarketPurchaseText(i)}`).join("\n");
  const menuText = buildWeekMenuText();
  const text = menuText ? `${shoppingText}\n\n${menuText}` : shoppingText;
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return;
    } catch (e) {
      /* usuário cancelou, cai no fallback */
    }
  }
  await navigator.clipboard.writeText(text);
  alert("Lista copiada! Cole onde quiser.");
}

// Gera um PDF com checkbox de verdade (campo de formulário, não só um desenho) em cada item,
// pra dar pra marcar no próprio leitor de PDF enquanto compra no mercado.
async function exportListPdf() {
  if (typeof PDFLib === "undefined") {
    alert("Não consegui carregar o gerador de PDF. Verifique sua conexão e tente de novo.");
    return;
  }
  const items = computeAggregatedIngredients().filter(
    (i) => !state.checklist[i.name.toLowerCase() + "||" + i.unit]
  );
  if (items.length === 0) {
    alert("Não tem nada pra comprar — a lista já está toda marcada.");
    return;
  }

  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const GREEN = rgb(0.243, 0.361, 0.243);
  const GREEN_DEEP = rgb(0.161, 0.251, 0.161);
  const INK = rgb(0.165, 0.165, 0.133);
  const INK_SOFT = rgb(0.42, 0.416, 0.361);
  const PAPER = rgb(0.949, 0.937, 0.894);
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 50;

  const pdfDoc = await PDFDocument.create();
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const form = pdfDoc.getForm();

  function newPage() {
    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    page.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: PAPER });
    return page;
  }
  function drawHeader(page, title, subtitle) {
    page.drawRectangle({ x: 0, y: pageHeight - 90, width: pageWidth, height: 90, color: GREEN });
    page.drawText(title, { x: margin, y: pageHeight - 55, size: 22, font: fontBold, color: rgb(1, 1, 1) });
    page.drawText(subtitle, { x: margin, y: pageHeight - 74, size: 10, font, color: rgb(1, 1, 1) });
    return pageHeight - 120;
  }

  // ---- Lista de compras com checkbox clicável ----
  let page = newPage();
  let y = drawHeader(page, "Lista de Compras", `Semana gerada em ${new Date().toLocaleDateString("pt-BR")}`);
  let checkboxIdx = 0;

  items.forEach((item) => {
    if (y < margin + 30) {
      page = newPage();
      y = pageHeight - margin;
    }
    const cb = form.createCheckBox(`item_${checkboxIdx++}`);
    cb.addToPage(page, { x: margin, y: y - 10, width: 14, height: 14, borderColor: GREEN_DEEP, borderWidth: 1 });
    page.drawText(item.name, { x: margin + 22, y: y - 8, size: 12, font: fontBold, color: INK });
    page.drawText(getMarketPurchaseText(item), { x: margin + 22, y: y - 23, size: 9.5, font, color: INK_SOFT });
    y -= 38;
  });

  // ---- Cardápio da semana (informativo, sem checkbox) ----
  const menuDays = DAYS.map((d) => {
    const day = state.week[d.key];
    const meals = ["almoco", "jantar"]
      .filter((meal) => day[meal].emCasa && day[meal].recipeIds.length)
      .map((meal) => {
        const dishNames = day[meal].recipeIds
          .map((rid) => state.recipes.find((r) => r.id === rid))
          .filter(Boolean)
          .map((r) => r.name);
        return { mealLabel: meal === "almoco" ? "Almoço" : "Jantar", dishNames };
      });
    return meals.length ? { label: d.label, meals } : null;
  }).filter(Boolean);

  if (menuDays.length) {
    page = newPage();
    y = drawHeader(page, "Cardápio da Semana", "O que vai ser cozinhado em cada dia");
    menuDays.forEach((day) => {
      if (y < margin + 60) {
        page = newPage();
        y = pageHeight - margin;
      }
      page.drawText(day.label, { x: margin, y, size: 13, font: fontBold, color: GREEN_DEEP });
      y -= 18;
      day.meals.forEach((meal) => {
        page.drawText(`${meal.mealLabel}: ${meal.dishNames.join(", ")}`, { x: margin + 10, y, size: 10.5, font, color: INK });
        y -= 16;
      });
      y -= 8;
    });
  }

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `lista-de-compras-${new Date().toISOString().slice(0, 10)}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ===== Autenticação =====
function showAuthScreen() {
  currentUserId = null;
  state = null;
  document.getElementById("app").classList.add("hidden");
  document.getElementById("auth-screen").classList.remove("hidden");
}

async function enterApp(user) {
  currentUserId = user.id;
  document.getElementById("auth-screen").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  state = await loadStateFromDB(currentUserId);
  renderPlanner();
  renderPeople();
  renderRecipes();
  renderShoppingList();
}

function showAuthError(msg) {
  const el = document.getElementById("auth-error");
  el.textContent = msg;
  el.classList.remove("hidden");
}

async function handleSignUp() {
  const email = document.getElementById("auth-email").value.trim();
  const password = document.getElementById("auth-password").value;
  if (!email || password.length < 6) {
    showAuthError("Preencha e-mail e uma senha com pelo menos 6 caracteres.");
    return;
  }
  const { error } = await sb.auth.signUp({ email, password });
  if (error) {
    showAuthError(error.message);
    return;
  }
  showAuthError("Conta criada! Se pedir confirmação por e-mail, confirme por lá e depois clique em Entrar.");
}

async function handleSignIn() {
  const email = document.getElementById("auth-email").value.trim();
  const password = document.getElementById("auth-password").value;
  if (!email || !password) {
    showAuthError("Preencha e-mail e senha.");
    return;
  }
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) showAuthError(error.message);
}

async function handleSignOut() {
  await sb.auth.signOut();
}

async function initAuthFlow() {
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (session) await enterApp(session.user);
  else showAuthScreen();

  sb.auth.onAuthStateChange((event, newSession) => {
    if (event === "SIGNED_IN" && newSession) enterApp(newSession.user);
    else if (event === "SIGNED_OUT") showAuthScreen();
  });
}

// ===== Inicialização =====
window.addEventListener("DOMContentLoaded", () => {
  sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  initAuthFlow();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW falhou:", e));
  }
});

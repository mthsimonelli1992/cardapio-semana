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
  if (!s.recipes) {
    s.recipes = structuredClone(SEED_RECIPES);
  } else {
    // Café da manhã saiu do banco inicial — remove as receitas seed antigas dessa categoria
    // que já tinham sido salvas em contas criadas antes dessa mudança.
    s.recipes = s.recipes.filter((r) => r.category !== "café da manhã");

    // Contas criadas antes da gente adicionar "modo de preparo" ao banco inicial salvaram as
    // receitas seed sem essa informação — completa usando o texto atual do SEED_RECIPES pra
    // quem ainda não tem instructions, sem mexer em nome/ingredientes que o usuário já editou.
    const seedById = new Map(SEED_RECIPES.map((r) => [r.id, r]));
    s.recipes.forEach((r) => {
      const seed = seedById.get(r.id);
      if (seed && (!r.instructions || r.instructions.length === 0)) {
        r.instructions = structuredClone(seed.instructions);
      }
    });

    // Preenche com receitas novas do banco inicial que ainda não estão salvas (ex: usuário já
    // tinha conta antes de expandirmos o SEED_RECIPES) — nunca sobrescreve o que já existe.
    const existingIds = new Set(s.recipes.map((r) => r.id));
    SEED_RECIPES.forEach((r) => {
      if (!existingIds.has(r.id)) s.recipes.push(structuredClone(r));
    });
  }
  if (!s.week) s.week = defaultWeek();
  if (!s.people) s.people = [];
  s.people.forEach((p) => {
    if (!p.activityLevel) p.activityLevel = "moderado";
  });
  if (!s.checklist) s.checklist = {};
  if (s.generatedAt === undefined) s.generatedAt = null;
  if (!s.listHistory) s.listHistory = [];
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

// ===== Modais (abrir/fechar) =====
// Trava o scroll do fundo enquanto um modal está aberto (sem isso, arrastar o dedo na tela por
// trás do modal rola o conteúdo de baixo, o que parece "quebrado" no celular). Também dá pra
// fechar clicando fora do modal (no fundo escurecido) ou arrastando a folha pra baixo.
let openModalCount = 0;
let bodyScrollY = 0;

function showModal(id) {
  document.getElementById(id).classList.remove("hidden");
  if (openModalCount === 0) {
    bodyScrollY = window.scrollY;
    document.body.style.position = "fixed";
    document.body.style.top = `-${bodyScrollY}px`;
    document.body.style.width = "100%";
  }
  openModalCount++;
}

function hideModal(id) {
  document.getElementById(id).classList.add("hidden");
  openModalCount = Math.max(0, openModalCount - 1);
  if (openModalCount === 0) {
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.width = "";
    window.scrollTo(0, bodyScrollY);
  }
}

// Clicar no fundo escurecido (fora da folha) fecha o modal.
document.addEventListener("click", (e) => {
  if (e.target.classList && e.target.classList.contains("modal-backdrop") && !e.target.classList.contains("hidden")) {
    hideModal(e.target.id);
  }
});

// Arrastar a folha pra baixo (a partir do topo, onde fica a "alcinha") fecha o modal.
function initSwipeToDismiss() {
  document.querySelectorAll(".modal-sheet").forEach((sheet) => {
    let startY = 0;
    let dragY = 0;
    let dragging = false;

    sheet.addEventListener("pointerdown", (e) => {
      const rect = sheet.getBoundingClientRect();
      if (e.clientY - rect.top > 44) return; // só inicia arrastando perto do topo
      dragging = true;
      startY = e.clientY;
      sheet.style.transition = "none";
      sheet.setPointerCapture(e.pointerId);
    });
    sheet.addEventListener(
      "pointermove",
      (e) => {
        if (!dragging) return;
        e.preventDefault();
        dragY = Math.max(0, e.clientY - startY);
        sheet.style.transform = `translateY(${dragY}px)`;
      },
      { passive: false }
    );
    function endDrag() {
      if (!dragging) return;
      dragging = false;
      sheet.style.transition = "";
      sheet.style.transform = "";
      if (dragY > 90) {
        const backdrop = sheet.closest(".modal-backdrop");
        if (backdrop) hideModal(backdrop.id);
      }
      dragY = 0;
    }
    sheet.addEventListener("pointerup", endDrag);
    sheet.addEventListener("pointercancel", endDrag);
  });
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

// Datas reais da semana atual (segunda a domingo), só pra exibição — o estado continua
// indexado por dia da semana genérico (seg/ter/...), não por data específica.
function getWeekDates() {
  const now = new Date();
  const dayNum = now.getDay() || 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayNum - 1));
  return DAYS.map((d, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    return date;
  });
}

function renderPlanner() {
  const container = document.getElementById("planner-days");
  const weekDates = getWeekDates();
  const todayStr = new Date().toDateString();
  container.innerHTML = DAYS.map((d, i) => {
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
    const isToday = weekDates[i].toDateString() === todayStr;
    return `
      <details class="day-card ${activeCount > 0 ? "has-meals" : ""}" ${activeCount > 0 ? "open" : ""}>
        <summary>
          <div class="day-heading">
            <div class="day-num ${isToday ? "today" : ""}">${weekDates[i].getDate()}</div>
            <div>
              <span class="day-name">${d.label}</span>
              ${dishIcons ? `<div class="day-dish-preview">${dishIcons}</div>` : ""}
            </div>
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
  const statsEl = document.getElementById("people-stats");
  if (statsEl) {
    statsEl.textContent =
      state.people.length === 0
        ? ""
        : `👪 ${state.people.length} pessoa${state.people.length > 1 ? "s" : ""} cadastrada${state.people.length > 1 ? "s" : ""}`;
  }
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
  showModal("modal-new-person");
}
function closeNewPersonModal() {
  hideModal("modal-new-person");
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
  "prato principal": { icon: "🍽️", color: "var(--green)" },
  acompanhamento: { icon: "🥗", color: "var(--plum)" },
  sobremesa: { icon: "🍰", color: "var(--terracotta)" },
};

let recipeFilterCategory = "todas";

function setRecipeFilter(cat) {
  recipeFilterCategory = cat;
  renderRecipes();
}

let recipeFilterSource = "todos";

function setRecipeSourceFilter(source) {
  recipeFilterSource = source;
  renderRecipes();
}

function renderRecipeFilters() {
  const filterContainer = document.getElementById("recipe-filters");
  const sourceContainer = document.getElementById("recipe-source-filters");
  if (!filterContainer) return;
  if (state.recipes.length === 0) {
    filterContainer.innerHTML = "";
    if (sourceContainer) sourceContainer.innerHTML = "";
    return;
  }
  const cats = ["todas", ...Object.keys(CATEGORY_INFO)];
  filterContainer.innerHTML = cats
    .map((cat) => {
      const label = cat === "todas" ? "Todas" : cat.charAt(0).toUpperCase() + cat.slice(1);
      return `<button type="button" class="filter-pill ${cat === recipeFilterCategory ? "active" : ""}" onclick="setRecipeFilter('${cat}')">${label}</button>`;
    })
    .join("");

  if (sourceContainer) {
    const sources = ["youtube", "tiktok", "instagram", "web"];
    sourceContainer.innerHTML =
      `<button type="button" class="filter-pill ${recipeFilterSource === "todos" ? "active" : ""}" onclick="setRecipeSourceFilter('todos')">Todas as fontes</button>` +
      sources
        .map(
          (s) =>
            `<button type="button" class="source-filter-btn ${recipeFilterSource === s ? "active" : ""}" onclick="setRecipeSourceFilter('${s}')" title="${BRAND_ICONS[s] ? BRAND_ICONS[s].label : "Site"}">${brandIconHtml(s, 24)}</button>`
        )
        .join("");
  }
}

function renderRecipes() {
  renderRecipeFilters();
  const container = document.getElementById("recipes-list");
  if (state.recipes.length === 0) {
    container.innerHTML = `<div class="empty-state"><span class="glyph">🍳</span>Nenhuma receita cadastrada ainda.</div>`;
    return;
  }
  let filtered = recipeFilterCategory === "todas" ? state.recipes : state.recipes.filter((r) => r.category === recipeFilterCategory);
  if (recipeFilterSource !== "todos") {
    filtered = filtered.filter((r) => r.sourcePlatform === recipeFilterSource);
  }
  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-state"><span class="glyph">🍲</span>Nenhuma receita encontrada com esses filtros.</div>`;
    return;
  }
  container.innerHTML = filtered
    .map((r) => {
      const cat = CATEGORY_INFO[r.category] || { icon: "🍲", color: "var(--ink-soft)" };
      const sourceTag = r.sourcePlatform && BRAND_ICONS[r.sourcePlatform] ? brandIconHtml(r.sourcePlatform, 16) : "";
      return `
    <div class="recipe-card recipe-card-compact" style="--accent:${cat.color}" onclick="openRecipeDetail('${r.id}')">
      <div class="recipe-thumb" style="background:${cat.color}">${cat.icon}</div>
      <div style="flex:1">
        <div class="recipe-name">${r.name} ${sourceTag}</div>
        <div class="recipe-category-tag">${r.category}</div>
      </div>
      <span class="recipe-card-chevron">›</span>
    </div>
  `;
    })
    .join("");
}

// Ícones oficiais das marcas (Simple Icons, path SVG puro) — pra não depender de emoji genérico.
const BRAND_ICONS = {
  instagram: {
    bg: "linear-gradient(45deg, #F9CE34, #EE2A7B 45%, #6228D7)",
    label: "Instagram",
    path: "M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077",
  },
  tiktok: {
    bg: "#000000",
    label: "TikTok",
    path: "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z",
  },
  youtube: {
    bg: "#FF0000",
    label: "YouTube",
    path: "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z",
  },
};

function brandIconHtml(platform, size) {
  const icon = BRAND_ICONS[platform];
  if (!icon) return `<span class="platform-icon" style="background:var(--ink-soft);width:${size}px;height:${size}px;font-size:${size * 0.55}px">🌐</span>`;
  return `<span class="platform-icon" style="background:${icon.bg};width:${size}px;height:${size}px"><svg viewBox="0 0 24 24" width="${size * 0.55}" height="${size * 0.55}" fill="white"><path d="${icon.path}"/></svg></span>`;
}

const SOURCE_ICON = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  web: "🌐 Site",
  video: "🎬 Vídeo enviado",
};

function openRecipeDetail(id) {
  const recipe = state.recipes.find((r) => r.id === id);
  if (!recipe) return;
  const cat = CATEGORY_INFO[recipe.category] || { icon: "🍲", color: "var(--ink-soft)" };
  const coverInner = recipe.coverImage
    ? `<div class="recipe-detail-cover" style="background-image:url('${recipe.coverImage}')"></div>`
    : `<div class="recipe-detail-cover recipe-detail-cover-illustration" style="background:${cat.color}"><span>${cat.icon}</span></div>`;
  const canRefreshCover = recipe.sourceUrl && (recipe.sourcePlatform === "instagram" || recipe.sourcePlatform === "tiktok");
  const refreshCoverBtn = canRefreshCover
    ? `<button type="button" id="cover-refresh-btn" class="modal-x recipe-cover-refresh" title="Atualizar capa" onclick="refreshRecipeCover('${id}')">🔄</button>`
    : "";
  const cover = `<div class="recipe-detail-cover-wrap">${coverInner}<button type="button" class="modal-x recipe-detail-close" onclick="closeRecipeDetail()">✕</button>${refreshCoverBtn}</div>`;
  const isBrand = recipe.sourcePlatform && BRAND_ICONS[recipe.sourcePlatform];
  const sourceBadge =
    recipe.sourceUrl && recipe.sourcePlatform
      ? `<a href="${recipe.sourceUrl}" target="_blank" rel="noopener" class="source-badge">${
          isBrand ? brandIconHtml(recipe.sourcePlatform, 18) : ""
        }${SOURCE_ICON[recipe.sourcePlatform] || "🔗 Fonte"}</a>`
      : "";
  const instructionsHtml =
    recipe.instructions && recipe.instructions.length
      ? `<span class="field-label">Modo de preparo</span><ol class="recipe-steps-list">${recipe.instructions.map((s) => `<li>${s}</li>`).join("")}</ol>`
      : "";
  document.getElementById("recipe-detail-content").innerHTML = `
    ${cover}
    <div class="recipe-detail-body">
      ${sourceBadge}
      <span class="recipe-detail-category" style="color:${cat.color}">${cat.icon} ${recipe.category}</span>
      <h2 class="recipe-detail-name">${recipe.name}</h2>
      <div class="person-meta">Rende ${recipe.baseServings} porç.</div>
      <span class="field-label">Ingredientes</span>
      <ul class="recipe-ing-list">${recipe.ingredients.map((i) => `<li>${i.qty} ${i.unit} — ${i.name}</li>`).join("")}</ul>
      ${instructionsHtml}
      <div class="action-row">
        <button class="btn btn-secondary" onclick="closeRecipeDetail(); openEditRecipeModal('${id}')">editar</button>
        <button class="btn btn-danger-ghost" onclick="deleteRecipe('${id}')">remover</button>
      </div>
      <button class="btn btn-secondary btn-block" style="margin-top:10px" onclick="closeRecipeDetail()">Fechar</button>
    </div>
  `;
  showModal("modal-recipe-detail");
}

function closeRecipeDetail() {
  hideModal("modal-recipe-detail");
}

async function refreshRecipeCover(id) {
  const recipe = state.recipes.find((r) => r.id === id);
  if (!recipe || !recipe.sourceUrl) return;
  const btn = document.getElementById("cover-refresh-btn");
  if (btn) {
    btn.disabled = true;
    btn.classList.add("spinning");
  }
  try {
    const startRes = await fetch("/api/refresh-cover-start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: recipe.sourceUrl }),
    });
    const startData = await startRes.json();
    if (!startRes.ok) throw new Error(startData.error || "Erro ao buscar a capa.");

    const { runId, platform } = startData;
    const maxAttempts = 30; // ~2.5 minutos
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await sleep(5000);
      const checkRes = await fetch(`/api/refresh-cover-status?runId=${encodeURIComponent(runId)}&platform=${encodeURIComponent(platform)}`);
      const data = await checkRes.json();
      if (data.status === "running") continue;
      if (data.status === "error") throw new Error(data.error);
      if (data.status === "done") {
        if (!data.coverImage) throw new Error("Não encontrei uma capa dessa vez.");
        recipe.coverImage = data.coverImage;
        await saveState();
        openRecipeDetail(id);
        renderRecipes();
        return;
      }
    }
    throw new Error("Demorou demais pra buscar a capa.");
  } catch (e) {
    console.error("[refreshRecipeCover]", e.message);
    if (btn) {
      btn.classList.remove("spinning");
      btn.classList.add("cover-refresh-error");
      setTimeout(() => btn.classList.remove("cover-refresh-error"), 1500);
      btn.disabled = false;
    }
  }
}

function deleteRecipe(id) {
  if (!confirm("Remover esta receita da base?")) return;
  state.recipes = state.recipes.filter((r) => r.id !== id);
  saveState();
  closeRecipeDetail();
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
  document.getElementById("nr-instructions").value = "";
  renderNewRecipeIngredients();
  showModal("modal-new-recipe");
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
  document.getElementById("nr-instructions").value = (recipe.instructions || []).join("\n");
  renderNewRecipeIngredients();
  showModal("modal-new-recipe");
}
function closeNewRecipeModal() {
  hideModal("modal-new-recipe");
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
  const instructions = document
    .getElementById("nr-instructions")
    .value.split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!name || ingredients.length === 0) {
    alert("Dá um nome pra receita e pelo menos um ingrediente com quantidade.");
    return;
  }
  if (editingRecipeId) {
    const recipe = state.recipes.find((r) => r.id === editingRecipeId);
    Object.assign(recipe, { name, category, baseServings, ingredients, instructions });
  } else {
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Date.now();
    state.recipes.push({ id, name, category, baseServings, ingredients, instructions });
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
  document.getElementById("import-text").classList.add("hidden");
  document.getElementById("import-link-input").value = "";
  document.getElementById("import-pdf-input").value = "";
  document.getElementById("import-video-input").value = "";
  document.getElementById("import-image-input").value = "";
  document.getElementById("import-status").classList.add("hidden");
  document.getElementById("import-review").innerHTML = "";
  pendingVideoFrames = null;
  pendingImportSource = null;
  showModal("modal-import-recipe");
}
function toggleImportTextArea() {
  const el = document.getElementById("import-text");
  el.classList.toggle("hidden");
  if (!el.classList.contains("hidden")) el.focus();
}
function closeImportModal() {
  hideModal("modal-import-recipe");
}

function setImportStatus(text) {
  const el = document.getElementById("import-status");
  el.textContent = text;
  el.classList.remove("hidden");
}

let importProgressTimer = null;
let importProgressPct = 0;

function showImportProgress() {
  document.getElementById("import-status").classList.add("hidden");
  const track = document.getElementById("import-progress");
  const fill = track.querySelector(".progress-fill");
  clearInterval(importProgressTimer);
  importProgressPct = 6;
  fill.style.width = importProgressPct + "%";
  track.classList.remove("hidden");
  importProgressTimer = setInterval(() => {
    importProgressPct += (92 - importProgressPct) * 0.05;
    fill.style.width = importProgressPct + "%";
  }, 400);
}
function hideImportProgress() {
  clearInterval(importProgressTimer);
  importProgressTimer = null;
  const track = document.getElementById("import-progress");
  const fill = track.querySelector(".progress-fill");
  fill.style.width = "100%";
  setTimeout(() => {
    track.classList.add("hidden");
    fill.style.width = "0%";
  }, 200);
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
    document.getElementById("import-text").classList.remove("hidden");
    setImportStatus(`PDF lido (${pdf.numPages} página${pdf.numPages > 1 ? "s" : ""}). Confira o texto e clique em "Importar".`);
  } catch (e) {
    setImportStatus("Não consegui ler esse PDF. Tenta colar o texto manualmente.");
  }
}

// Reaproveita o mesmo caminho de "frames de vídeo" pra uma imagem única (foto de receita,
// print, etc.) — pro back-end tanto faz vir de vídeo quanto de uma imagem só.
async function handleImportImage(event) {
  const file = event.target.files[0];
  if (!file) return;
  setImportStatus("Lendo imagem...");
  try {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    pendingVideoFrames = [dataUrl.split(",")[1]];
    setImportStatus('Imagem carregada. Clique em "Importar".');
  } catch (e) {
    pendingVideoFrames = null;
    setImportStatus("Não consegui ler essa imagem.");
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Botão único do modal: decide o caminho certo (link vs. o que já foi selecionado/colado).
function handleImportSubmit() {
  const url = document.getElementById("import-link-input").value.trim();
  if (url) {
    handleImportLink();
    return;
  }
  extractRecipesWithAI();
}

async function handleImportLink() {
  const url = document.getElementById("import-link-input").value.trim();
  if (!url) {
    alert("Cole um link de vídeo, site de receita, ou use um dos ícones abaixo.");
    return;
  }
  document.getElementById("import-review").innerHTML = "";
  showImportProgress();
  try {
    const startRes = await fetch("/api/import-video-start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const startData = await startRes.json();
    if (!startRes.ok) {
      const err = new Error(startData.error || "Erro ao iniciar o download.");
      err.details = startData.details;
      throw err;
    }

    // YouTube resolve na hora (legenda automática, sem baixar vídeo) — sem polling.
    if (startData.status === "error") {
      setImportStatus(`Erro: ${startData.error}${startData.details ? " (detalhe: " + String(startData.details).slice(0, 300) + ")" : ""}`);
      return;
    }
    if (startData.status === "done") {
      if (!startData.recipes || startData.recipes.length === 0) {
        setImportStatus("Não encontrei nenhuma receita reconhecível nesse vídeo.");
        return;
      }
      setImportStatus(`${startData.recipes.length} receita(s) encontrada(s). Confira antes de salvar:`);
      renderImportReview(startData.recipes, { sourceUrl: url, sourcePlatform: startData.platform, coverImage: startData.coverImage });
      return;
    }

    const { runId, platform } = startData;
    // Instagram/TikTok: fica checando de tempos em tempos até a Apify terminar de baixar,
    // sem limite fixo de tempo curto.
    const maxAttempts = 45; // ~4 minutos no total
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await sleep(5000);
      const checkRes = await fetch(`/api/import-video-status?runId=${encodeURIComponent(runId)}&platform=${encodeURIComponent(platform)}`);
      const data = await checkRes.json();

      if (data.status === "running") continue;

      if (data.status === "error") {
        setImportStatus(`Erro: ${data.error}${data.details ? " (detalhe: " + String(data.details).slice(0, 300) + ")" : ""}`);
        return;
      }

      if (data.status === "done") {
        if (!data.recipes || data.recipes.length === 0) {
          setImportStatus("Não encontrei nenhuma receita reconhecível nesse vídeo.");
          return;
        }
        setImportStatus(`${data.recipes.length} receita(s) encontrada(s). Confira antes de salvar:`);
        renderImportReview(data.recipes, { sourceUrl: url, sourcePlatform: data.platform, coverImage: data.coverImage });
        return;
      }
    }
    setImportStatus("Demorou demais pra processar esse vídeo. Tenta de novo ou usa o upload de arquivo.");
  } catch (e) {
    if (e instanceof TypeError) {
      setImportStatus('Não consegui falar com o servidor — isso só funciona na versão publicada (Vercel).');
    } else if (e.details) {
      setImportStatus(`Erro: ${e.message} (detalhe: ${String(e.details).slice(0, 300)})`);
    } else {
      setImportStatus("Erro: " + e.message);
    }
  } finally {
    hideImportProgress();
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
    setImportStatus(`${pendingVideoFrames.length} quadros capturados. Clique em "Importar" quando quiser.`);
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
    alert("Cole um link, o texto da receita, ou envie uma imagem/PDF/vídeo primeiro.");
    return;
  }
  const btn = document.getElementById("import-extract-btn");
  document.getElementById("import-review").innerHTML = "";
  showImportProgress();
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
    renderImportReview(data.recipes, { sourceUrl: null, sourcePlatform: data.platform || null, coverImage: data.coverImage || null });
  } catch (e) {
    if (e instanceof TypeError) {
      setImportStatus('Não consegui falar com o servidor de IA — isso só funciona na versão publicada (Vercel), não abrindo o arquivo local direto.');
    } else {
      setImportStatus("Erro: " + e.message);
    }
  } finally {
    btn.disabled = false;
    hideImportProgress();
  }
}

let pendingImportSource = null;

function renderImportReview(recipes, source) {
  pendingImportRecipes = recipes;
  pendingImportSource = source || null;
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
      ${
        r.modo_preparo && r.modo_preparo.length
          ? `<ol class="recipe-steps-list">${r.modo_preparo.map((s) => `<li>${s}</li>`).join("")}</ol>`
          : ""
      }
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
    instructions: r.modo_preparo || [],
    sourceUrl: pendingImportSource?.sourceUrl || null,
    sourcePlatform: pendingImportSource?.sourcePlatform || null,
    coverImage: pendingImportSource?.coverImage || null,
  });
  saveState();
  renderRecipes();
  renderPlanner();
  document.getElementById(`import-card-${idx}`)?.remove();
  closeImportModalIfDone();
}

function discardImportedRecipe(idx) {
  document.getElementById(`import-card-${idx}`)?.remove();
  closeImportModalIfDone();
}

// Fecha o modal de importação sozinho quando não sobrar nenhuma receita pra revisar
// (o caso comum é uma receita só — não faz sentido deixar a tela aberta depois de aceitar/descartar).
function closeImportModalIfDone() {
  const remaining = document.getElementById("import-review").querySelectorAll(".import-review-card");
  if (remaining.length === 0 && pendingImportRecipes.length > 0) {
    closeImportModal();
  }
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

// Identifica a semana ISO atual (ano + nº da semana), pra cada "gerar lista" dentro da mesma
// semana atualizar o mesmo registro do histórico em vez de empilhar duplicata.
function getISOWeekKey(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

function saveListSnapshot(items) {
  if (!state.listHistory) state.listHistory = [];
  const weekKey = getISOWeekKey(new Date());
  const snapshot = {
    weekKey,
    generatedAt: state.generatedAt,
    items: items.map((i) => ({ name: i.name, unit: i.unit, qty: i.qty })),
    menuText: buildWeekMenuText(),
  };
  const idx = state.listHistory.findIndex((h) => h.weekKey === weekKey);
  if (idx >= 0) state.listHistory[idx] = snapshot;
  else state.listHistory.unshift(snapshot);
  state.listHistory = state.listHistory.slice(0, 20);
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
  saveListSnapshot(items);
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
      <button class="btn btn-secondary" onclick="generateChecklist()">🔄 Recalcular da Semana</button>
      <button class="btn btn-primary" onclick="shareList()">📤 Compartilhar lista</button>
    </div>
    <div class="action-row">
      <button class="btn btn-secondary btn-block" onclick="exportListPdf()">📄 Baixar PDF com checklist</button>
    </div>
    <div class="action-row">
      <button class="btn btn-secondary btn-block" onclick="openHistoryModal()">🕘 Histórico de listas</button>
    </div>
  `;
}

function openHistoryModal() {
  renderHistoryModal();
  showModal("modal-list-history");
}
function closeHistoryModal() {
  hideModal("modal-list-history");
}

function renderHistoryModal() {
  const container = document.getElementById("history-content");
  const history = state.listHistory || [];
  if (history.length === 0) {
    container.innerHTML = `<div class="empty-state"><span class="glyph">🕘</span>Nenhuma lista gerada ainda. Gere a lista da semana pra ela começar a ficar guardada aqui.</div>`;
    return;
  }
  container.innerHTML = history
    .map((h, idx) => {
      const date = h.generatedAt ? new Date(h.generatedAt).toLocaleDateString("pt-BR") : "?";
      return `
    <div class="recipe-card">
      <div class="recipe-card-top">
        <div>
          <div class="recipe-name">Semana ${h.weekKey} · ${date}</div>
          <div class="person-meta">${h.items.length} ite${h.items.length > 1 ? "ns" : "m"}</div>
        </div>
        <button class="btn-ghost" onclick="copyHistoryEntry(${idx})">copiar</button>
      </div>
      <ul class="recipe-ing-list">
        ${h.items.map((i) => `<li>${i.name} — ${getMarketPurchaseText(i)}</li>`).join("")}
      </ul>
    </div>
  `;
    })
    .join("");
}

async function copyHistoryEntry(idx) {
  const h = (state.listHistory || [])[idx];
  if (!h) return;
  const text =
    "🛒 Lista de compras:\n" +
    h.items.map((i) => `- ${i.name}: ${getMarketPurchaseText(i)}`).join("\n") +
    (h.menuText ? `\n\n${h.menuText}` : "");
  await navigator.clipboard.writeText(text);
  alert("Copiado! Cole onde quiser.");
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
  saveState();
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

  const platformsEl = document.getElementById("import-platforms");
  if (platformsEl) {
    platformsEl.innerHTML =
      brandIconHtml("youtube", 30) + brandIconHtml("tiktok", 30) + brandIconHtml("instagram", 30) + brandIconHtml("web", 30);
  }
  initSwipeToDismiss();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW falhou:", e));
  }
});

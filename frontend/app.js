const championTitles = {
  Annie: "A Criança Sombria",
  Ahri: "A Raposa de Nove Caudas",
  Garen: "O Poder de Demacia",
};

const roleNames = {
  mid: "Meio",
  top: "Topo",
  jungle: "Selva",
  adc: "Atirador",
  support: "Suporte",
};

const byId = (id) => document.getElementById(id);
const championList = byId("champions");
const search = byId("champion-search");
const enemyList = byId("enemy-champions");
const enemySearch = byId("enemy-search");
const guide = byId("guide");
const art = byId("champion-art");
const loading = byId("loading");
const catalog = new Map();
let champions = [];
let dragonVersion = "";
let gear = null;
let winrates = null;
let buildProfiles = {};
let selected = "";
let selectedId = "";
let draft = {};
let draftKey = "";
let savedMatchup = null;
let selectedEnemy = null;
// Inimigo escolhido à mão na coluna Inimigos; o poll do draft nunca o apaga.
let manualEnemy = null;
// Campeão escolhido à mão na lista da esquerda enquanto há um campeão no draft: {id, sig}. Vale até o
// draft ao vivo mudar (sig diferente) ou o usuário clicar no próprio campeão do draft.
let manualChampion = null;
// Rota escolhida nos botões do hero: {champion, role, sig}. Vale só para aquele campeão.
let laneChoice = null;
// Fração das partidas de cada campeão em cada rota no OP.GG (id em minúsculas → {rota: 0..1}).
let championRates = {};
const opggCounters = { own: null, enemy: null, selected: null, ownFlex: null, aram: null, build: null, matchupBuild: null };
// Página de runas aberta em cada consulta, pela chave da requisição ao OP.GG.
const runeTabs = new Map();
// Rolagem horizontal do carrossel de runas em cada consulta (mesma chave de runeTabs).
const runeScroll = new Map();
let runePanelCount = 0;
// Rotas de cada campeão no OP.GG (id em minúsculas → rotas, da principal para a menos jogada).
let championPositions = {};
// Rota escolhida no filtro de cada lista; "" mostra todas.
const roleFilters = { own: "", enemy: "" };
// Campeão e rota que definiram o filtro automático dos inimigos; muda só ao escolher outro campeão.
let enemyRoleKey = null;
// Verdadeiro enquanto enemyRoleKey vier da abertura da página, sem escolha do usuário.
let enemyRoleFromOpening = false;
// Aba aberta em "Maior taxa de vitória" ("general" ou "matchup") e o par campeão|inimigo que já
// abriu a aba de confronto sozinho (abre uma vez por par; depois vale a escolha do usuário).
let winrateTab = "general";
let matchupAutoKey = null;
// Filtro de confronto da coluna Inimigos: "all", "good" (taxa > 50%) ou "bad" (taxa < 50%).
let enemyTone = "all";

try {
  const savedTone = sessionStorage.getItem("rift-enemy-tone");
  if (savedTone === "good" || savedTone === "bad") enemyTone = savedTone;
} catch {
  // Sem armazenamento, o filtro vale só enquanto a página estiver aberta.
}

try {
  const saved = JSON.parse(sessionStorage.getItem("rift-winrate-tab"));
  if (saved?.tab === "general" || saved?.tab === "matchup") winrateTab = saved.tab;
  if (typeof saved?.auto === "string") matchupAutoKey = saved.auto;
} catch {
  // Sem armazenamento, a aba vale só enquanto a página estiver aberta.
}

function saveWinrateTab() {
  try {
    sessionStorage.setItem("rift-winrate-tab", JSON.stringify({ tab: winrateTab, auto: matchupAutoKey }));
  } catch {
    // Armazenamento indisponível.
  }
}

try {
  savedMatchup = JSON.parse(sessionStorage.getItem("rift-matchup"));
  selectedEnemy = savedMatchup?.enemy ?? null;
} catch {
  // O painel também funciona em sessões sem armazenamento.
}
try {
  manualEnemy = sessionStorage.getItem("rift-enemy") || null;
} catch {
  // Sem armazenamento, a escolha manual vale só enquanto a página estiver aberta.
}
try {
  const saved = JSON.parse(sessionStorage.getItem("rift-champion"));
  if (typeof saved?.id === "string" && typeof saved.sig === "string") manualChampion = { id: saved.id, sig: saved.sig };
} catch {
  // Sem armazenamento, a escolha manual vale só enquanto a página estiver aberta.
}
try {
  const saved = JSON.parse(sessionStorage.getItem("rift-lane"));
  if (typeof saved?.champion === "string" && Object.hasOwn(roleNames, saved.role ?? "") && typeof saved.sig === "string") {
    laneChoice = { champion: saved.champion, role: saved.role, sig: saved.sig };
  }
} catch {
  // Sem armazenamento, a rota escolhida vale só enquanto a página estiver aberta.
}

const draftStatusTexts = {
  offline: "Abra o League of Legends para acompanhar o draft.",
  waiting: "Cliente conectado. Aguardando a seleção de campeões.",
  certificate: "Revise o certificado da Riot indicado em RIOT_CA_FILE.",
  unavailable: "Cliente indisponível. Tentando reconectar…",
  active: "Draft detectado. Aguardando sua escolha de campeão.",
};

function setManualEnemy(id) {
  manualEnemy = id || null;
  try {
    if (manualEnemy) sessionStorage.setItem("rift-enemy", manualEnemy);
    else sessionStorage.removeItem("rift-enemy");
  } catch {
    // Armazenamento indisponível.
  }
}

function storeJson(key, value) {
  try {
    if (value) sessionStorage.setItem(key, JSON.stringify(value));
    else sessionStorage.removeItem(key);
  } catch {
    // Armazenamento indisponível.
  }
}

function setManualChampion(value) {
  manualChampion = value;
  storeJson("rift-champion", value);
}

function setLaneChoice(value) {
  laneChoice = value;
  storeJson("rift-lane", value);
}

// Assinatura do campeão do draft: muda com novo pick, confirmação ou troca de rota.
function draftSig(snapshot) {
  return snapshot.champion ? `${snapshot.champion.id}|${snapshot.role ?? ""}|${Boolean(snapshot.confirmed)}` : "";
}

// O draft manda no painel enquanto tem campeão e o usuário não escolheu outro à mão.
function draftOwns() {
  return draft.status === "active" && Boolean(draft.champion) && !manualChampion;
}

// Rota exibida: a escolhida nos botões do hero ou, no draft, a do draft; "" = rota padrão do OP.GG.
function activeRole() {
  if (draftOwns()) {
    const chosen = laneChoice?.champion === draft.champion.id && laneChoice.sig === draftSig(draft) ? laneChoice.role : "";
    return chosen || draft.role || "";
  }
  return laneChoice?.champion === selectedId ? laneChoice.role : "";
}

function draftPhase() {
  return draft.archived ? "último confronto" : draft.in_game ? "em partida" : draft.confirmed ? "escolha confirmada" : "pré-seleção";
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function icon(label, src) {
  const frame = element("span", "icon-frame", label);
  frame.setAttribute("aria-hidden", "true");
  if (src) {
    const image = element("img", "");
    image.alt = "";
    image.loading = "lazy";
    image.addEventListener("error", () => image.remove(), { once: true });
    image.src = src;
    frame.append(image);
  }
  return frame;
}

function roleName(role) {
  return roleNames[role] ?? role;
}

function searchKey(value) {
  return value.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[^a-z0-9]/g, "");
}

function buildUrl(championId, role, enemyId) {
  const slug = encodeURIComponent(championId.toLowerCase());
  const url = new URL(`https://op.gg/pt/lol/champions/${slug}/build${role ? `/${role}` : ""}`);
  if (enemyId) url.searchParams.set("target_champion", enemyId.toLowerCase());
  return url.href;
}

function portraitUrl(id) {
  const filename = `${encodeURIComponent(id)}.png`;
  return Object.hasOwn(championTitles, id)
    ? `/assets/${filename}`
    : `https://ddragon.leagueoflegends.com/cdn/${dragonVersion}/img/champion/${filename}`;
}

// Rotas do campeão: as do OP.GG e, sem elas, as das builds do catálogo local.
function rolesOf({ id, name }) {
  const positions = championPositions[id.toLowerCase()];
  if (positions?.length) return positions;
  return [...new Set((catalog.get(name) ?? []).map((build) => build.role))];
}

function championRoles(champion) {
  return rolesOf(champion).map(roleName).join(" · ");
}

// Linha de campeão usada nas listas lateral esquerda e direita.
function championButton({ id, name }, { pressed, detail, rate, title }) {
  const button = element("button", "champion-button");
  button.type = "button";
  button.dataset.champion = id;
  button.setAttribute("aria-pressed", String(pressed));
  if (title) button.title = title;
  const info = element("span", "");
  info.append(element("strong", "", name));
  if (detail) info.append(element("small", "", detail));
  if (rate) {
    const badge = element("small", "matchup-rate", rate.text);
    if (rate.tone !== undefined) badge.dataset.tone = rate.tone;
    info.append(badge);
  }
  const chevron = element("span", "chevron", "›");
  chevron.setAttribute("aria-hidden", "true");
  button.append(icon(name[0], portraitUrl(id)), info, chevron);
  return button;
}

function renderChampionPicker({ list, input, count, empty, emptyText, role, accept, order, isPressed, onPick, rateText, title }) {
  const query = searchKey(input.value);
  const focused = list.contains(document.activeElement) ? document.activeElement.dataset.champion : null;
  const buttons = [];
  const visible = champions.filter((champion) => {
    const { id, name } = champion;
    if (!searchKey(name).includes(query) && !searchKey(id).includes(query)) return false;
    if (role && !rolesOf(champion).includes(role)) return false;
    return !accept || accept(champion);
  });
  if (order) visible.sort(order);
  for (const champion of visible) {
    const pressed = isPressed(champion);
    const button = championButton(champion, {
      pressed,
      detail: championRoles(champion),
      rate: rateText?.(champion),
      title: title?.(champion, pressed),
    });
    button.addEventListener("click", () => onPick(champion, button));
    buttons.push(button);
  }
  list.replaceChildren(...buttons);
  buttons.find((button) => button.dataset.champion === focused)?.focus();
  if (count) count.textContent = buttons.length;
  empty.textContent = emptyText ?? "Nenhum campeão encontrado.";
  empty.hidden = buttons.length > 0;
}

function renderOwnPicker() {
  renderChampionPicker({
    list: championList,
    input: search,
    count: byId("champion-count"),
    empty: byId("search-empty"),
    role: roleFilters.own,
    isPressed: ({ name }) => name === selected,
    rateText: ({ id }) => {
      const matchupRate = opggCounters.enemy?.data?.matchups[id.toLowerCase()];
      const ownRate = draftOwns() && id === draft.champion.id && opggCounters.enemy && opggRate(opggCounters.enemy.champion);
      if (!ownRate && !matchupRate) return null;
      return { text: `${matchupPercent.format(ownRate?.rate ?? 1 - matchupRate.rate)} vs. ${opggCounters.enemy.name}` };
    },
    onPick: ({ id, name }, button) => {
      // Com campeão no draft, clicar em outro campeão é uma escolha manual; clicar no do draft volta a ele.
      if (draft.status === "active" && draft.champion) {
        if (id === draft.champion.id) {
          setManualChampion(null);
        } else if (manualChampion?.id !== id) {
          setManualChampion({ id, sig: draftSig(draft) });
          readOpggCounters("enemy", null);
        }
      }
      if (selected === name) {
        // Clicar no campeão inicial também é uma escolha: aplica o filtro dos inimigos.
        if (enemyRoleFromOpening) enemyRoleKey = null;
      } else {
        championList.querySelector('[aria-pressed="true"]')?.setAttribute("aria-pressed", "false");
        button.setAttribute("aria-pressed", "true");
        selectChampion(name, id);
      }
      refresh();
      // Fora do draft, as taxas "vs. inimigo" do draft saem da lista (no draft, renderMatchup já a refaz).
      if (!draftOwns()) renderOwnPicker();
    },
  });
}

// Taxa do seu campeão contra um inimigo, exibida na coluna Inimigos.
function enemyRateText(id) {
  const rate = opggRate(id);
  if (!rate) return null;
  const own = opggCounters.own?.name;
  return { text: `${matchupPercent.format(rate.rate)}${own ? ` p/ ${own}` : ""}`, tone: rateTone(rate.rate) };
}

function renderRoleFilter(side) {
  for (const button of byId(`${side}-role-filter`).querySelectorAll("[data-role]")) {
    button.setAttribute("aria-pressed", String(button.dataset.role === roleFilters[side]));
  }
}

// Rota padrão do campeão escolhido: a do draft, a escolhida no painel ou a principal no OP.GG.
function ownDefaultRole() {
  if (!selectedId) return "";
  const main = rolesOf({ id: selectedId, name: selected })[0];
  const counters = [opggCounters.own, opggCounters.selected].find((request) => request?.champion === selectedId);
  return activeRole() || main || counters?.data?.role || "";
}

function ownRoleKey() {
  return `${selectedId}|${activeRole()}`;
}

// Ao escolher outro campeão (ou rota no draft), os inimigos passam a ser filtrados pela rota dele.
function syncEnemyRoleFilter() {
  const key = ownRoleKey();
  if (key === enemyRoleKey) return;
  const role = ownDefaultRole();
  if (!Object.hasOwn(roleNames, role)) return;
  enemyRoleKey = key;
  enemyRoleFromOpening = false;
  roleFilters.enemy = role;
  renderRoleFilter("enemy");
}

function renderEnemyTone() {
  for (const button of byId("enemy-tone-filter").querySelectorAll("[data-tone]")) {
    button.setAttribute("aria-pressed", String(button.dataset.tone === enemyTone));
  }
}

// Mensagem da lista vazia nos modos "Bom contra" e "Ruim contra".
function enemyToneEmptyText() {
  if (enemyTone === "all") return undefined;
  const own = opggCounters.own;
  if (own?.data?.matchups && Object.keys(own.data.matchups).length) return undefined;
  if (!own || own.status === "loading") return "Carregando confrontos…";
  return "Sem dados de confronto para seu campeão.";
}

function renderEnemyPicker() {
  syncEnemyRoleFilter();
  renderEnemyTone();
  const tone = enemyTone;
  const rates = new Map();
  const rateOf = (id) => {
    if (!rates.has(id)) rates.set(id, opggRate(id)?.rate);
    return rates.get(id);
  };
  renderChampionPicker({
    list: enemyList,
    input: enemySearch,
    empty: byId("enemy-search-empty"),
    emptyText: enemyToneEmptyText(),
    role: roleFilters.enemy,
    accept: tone === "all" ? null : ({ id }) => {
      const rate = rateOf(id);
      return Number.isFinite(rate) && (tone === "good" ? rate > 0.5 : rate < 0.5);
    },
    order: tone === "all" ? null : (a, b) => (tone === "good" ? rateOf(b.id) - rateOf(a.id) : rateOf(a.id) - rateOf(b.id)),
    isPressed: ({ id }) => id === manualEnemy,
    rateText: ({ id }) => enemyRateText(id),
    title: ({ name }, pressed) => (pressed ? `Clique de novo para limpar a escolha de ${name}` : `Escolher ${name} como adversário`),
    onPick: ({ id }) => {
      setManualEnemy(manualEnemy === id ? null : id);
      refresh();
    },
  });
}

function renderChampionList() {
  renderOwnPicker();
  renderEnemyPicker();
}

function renderDraftEnemies(enemy) {
  const enemies = draft.enemies ?? [];
  const list = byId("draft-enemies");
  const focused = list.contains(document.activeElement) ? document.activeElement.dataset.champion : null;
  const buttons = enemies.map((row) => {
    const rate = enemyRateText(row.id);
    const loading = opggCounters.own?.status === "loading"
      || (opggCounters.enemy?.champion === row.id && opggCounters.enemy.status === "loading");
    const raw = opggRate(row.id);
    const title = raw
      ? [raw.games > 0 && `${raw.games.toLocaleString("pt-BR")} partidas`, `patch ${raw.patch}`].filter(Boolean).join(" · ")
      : loading ? "Consultando OP.GG…" : "Sem dados de confronto no OP.GG";
    const button = championButton(row, {
      pressed: row.id === enemy?.id,
      detail: row.role ? roleName(row.role) : "",
      rate: rate ?? (draftOwns() ? { text: loading ? "Consultando OP.GG…" : "Sem dados de confronto", tone: "muted" } : null),
      title,
    });
    button.addEventListener("click", () => {
      setManualEnemy(null);
      selectedEnemy = row.id;
      refresh();
      byId("draft-enemies").querySelector('[aria-pressed="true"]')?.focus();
    });
    return button;
  });
  list.replaceChildren(...buttons);
  buttons.find((button) => button.dataset.champion === focused)?.focus();
  byId("draft-enemy-count").textContent = enemies.length || "";
}

function renderEnemyColumn(enemy) {
  renderDraftEnemies(enemy);
  renderEnemyPicker();
}

function currentEnemy() {
  const enemies = draft.enemies ?? [];
  if (manualEnemy) {
    return enemies.find((row) => row.id === manualEnemy) ?? champions.find(({ id }) => id === manualEnemy) ?? null;
  }
  // Com campeão escolhido à mão, a rota do draft não indica o adversário dele.
  if (manualChampion) return enemies.find((row) => row.id === selectedEnemy) ?? null;
  const inferred = enemies.filter((row) => draft.role && row.role === draft.role);
  return enemies.find((row) => row.id === selectedEnemy) ?? (inferred.length === 1 ? inferred[0] : null);
}

// Sem campeão no draft: painel livre, com o inimigo escolhido na coluna Inimigos.
// Sem campeão no draft (ou com outro campeão escolhido à mão): painel livre, com o inimigo escolhido
// na coluna Inimigos.
function renderOverview() {
  const enemy = currentEnemy();
  const opponent = enemy ? ` Adversário: ${enemy.name}${manualEnemy ? " (escolha manual)" : ""}.` : "";
  if (manualChampion && draft.status === "active" && draft.champion) {
    const name = draft.champion.name;
    byId("draft-status").textContent = `Exibindo ${selected} (escolha manual). Draft: ${name} · ${draftPhase()}`
      + ` — clique em ${name} para voltar.${opponent}`;
  } else if (draft.status) {
    byId("draft-status").textContent = `${draftStatusTexts[draft.status] ?? draftStatusTexts.unavailable}${opponent}`;
  }
  // Primeiro as consultas do campeão atual, depois as taxas da coluna Inimigos.
  renderWinrates(enemy, activeRole());
  renderEnemyColumn(enemy);
}

function refresh() {
  byId("draft-controls").hidden = !draftOwns();
  if (draftOwns()) renderMatchup();
  else renderOverview();
  renderLanes();
}

// Botões de rota do hero: um por rota do campeão no OP.GG, com a fração das partidas nela.
function renderLanes() {
  const box = byId("champion-roles");
  if (!selectedId) {
    box.replaceChildren();
    return;
  }
  const focused = box.contains(document.activeElement) ? document.activeElement.dataset.role : null;
  const roles = rolesOf({ id: selectedId, name: selected }).filter((role) => Object.hasOwn(roleNames, role));
  const fromDraft = draftOwns() ? draft.role : "";
  if (Object.hasOwn(roleNames, fromDraft ?? "") && !roles.includes(fromDraft)) roles.push(fromDraft);
  const rates = championRates[selectedId.toLowerCase()] ?? {};
  const counters = [opggCounters.own, opggCounters.selected].find((request) => request?.champion === selectedId);
  const active = activeRole() || counters?.data?.role || roles[0];
  const buttons = roles.map((role) => {
    const button = element("button", "");
    button.type = "button";
    button.dataset.role = role;
    button.setAttribute("aria-pressed", String(role === active));
    const rate = rates[role];
    button.title = role === fromDraft ? "Rota do draft" : `Ver build e runas de ${selected} no ${roleName(role)}`;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", `#role-${role}`);
    svg.append(use);
    button.append(svg, element("span", "lane-name", roleName(role)),
      element("span", "lane-rate", Number.isFinite(rate) ? lanePercent.format(rate) : "—"));
    button.addEventListener("click", () => {
      setLaneChoice({ champion: selectedId, role, sig: draftOwns() ? draftSig(draft) : "" });
      refresh();
    });
    return button;
  });
  box.replaceChildren(...buttons);
  buttons.find((button) => button.dataset.role === focused)?.focus();
}

function readOpgg(slot, champion, endpoint, params = {}) {
  if (!champion) {
    opggCounters[slot] = null;
    return;
  }
  const query = new URLSearchParams({ champion: champion.id, ...params });
  const key = `${endpoint}?${query}`;
  const current = opggCounters[slot];
  if (current?.key === key && (!current.expires || current.expires > Date.now())) return;

  const request = { key, champion: champion.id, name: champion.name, status: "loading" };
  opggCounters[slot] = request;
  (async () => {
    try {
      const response = await fetch(`/api/opgg/${endpoint}?${query}`);
      if (response.ok) {
        request.data = await response.json();
        request.status = "ready";
      } else {
        request.status = response.status === 404 ? "no-data" : "unavailable";
      }
    } catch {
      request.status = "unavailable";
    }
    request.expires = Date.now() + (request.status === "unavailable" ? 30000 : 600000);
    if (opggCounters[slot] !== request) return;
    refresh();
  })();
}

function readOpggCounters(slot, champion, role, queue = "ranked") {
  readOpgg(slot, champion, "counters", queue === "ranked" ? { role } : { role, queue });
}

function opggStatusText(request) {
  if (!request || request.status === "loading") return "Consultando OP.GG…";
  if (request.status === "unavailable") return "Consulta ao OP.GG indisponível";
  return "Sem dados no OP.GG";
}

function opggGeneralRate(data) {
  if (!Number.isFinite(data?.general?.rate)) return null;
  return { ...data.general, source: data.source, patch: data.patch, scope: `${roleName(data.role)} · ${data.scope}`, url: data.url };
}

function rateTone(rate) {
  if (!Number.isFinite(rate) || rate === 0.5) return "";
  return rate > 0.5 ? "win" : "loss";
}

function championRateBadge(node, request) {
  const general = request?.data?.general;
  if (request?.status === "ready" && Number.isFinite(general?.rate)) {
    const { role, patch } = request.data;
    const details = [roleName(role), patch && `patch ${patch}`].filter(Boolean).join(" · ");
    node.textContent = `Taxa de vitória ${matchupPercent.format(general.rate)}${details ? ` · ${details}` : ""}`;
    node.dataset.tone = rateTone(general.rate);
  } else if (!request || request.status === "loading") {
    node.textContent = "Consultando OP.GG…";
    node.dataset.tone = "muted";
  } else {
    node.textContent = "Taxa de vitória indisponível no OP.GG";
    node.dataset.tone = "muted";
  }
}

function renderSelectedRate() {
  if (!selectedId) return;
  let request = opggCounters.own;
  if (request?.champion === selectedId) {
    readOpggCounters("selected", null);
  } else {
    const champion = champions.find(({ id }) => id === selectedId) ?? { id: selectedId, name: selected };
    readOpggCounters("selected", champion, "");
    request = opggCounters.selected;
  }
  championRateBadge(byId("champion-rate"), request);
}

function opggRate(enemyId, queue = "ranked") {
  let data = (queue === "flex" ? opggCounters.ownFlex : opggCounters.own)?.data;
  let target = enemyId.toLowerCase();
  let entry = data?.matchups[target];
  if (!entry && queue === "ranked" && draftOwns() && opggCounters.enemy?.champion === enemyId) {
    data = opggCounters.enemy.data;
    target = selectedId.toLowerCase();
    const reverse = data?.matchups[target];
    if (reverse) entry = { ...reverse, rate: 1 - reverse.rate };
  }
  if (!entry) return null;
  const url = new URL(data.url);
  url.searchParams.set("target_champion", target);
  return { ...entry, source: data.source, patch: data.patch, scope: `${roleName(data.role)} · ${data.scope}`, url: url.href };
}

function renderMatchup() {
  const enemies = draft.enemies ?? [];
  const enemy = currentEnemy();
  const role = activeRole();
  readOpggCounters("own", draft.champion, role);
  const statsRole = role || opggCounters.own?.data?.role;
  readOpggCounters("enemy", statsRole ? enemy : null, statsRole);
  championRateBadge(byId("draft-rate"), opggCounters.own);
  renderOwnPicker();
  renderEnemyColumn(enemy);

  const link = byId("draft-link");
  link.href = buildUrl(draft.champion.id, role, enemy?.id);
  link.textContent = enemy ? `Builds e runas vs. ${enemy.name} ↗` : "Builds e runas gerais no OP.GG ↗";

  const own = `${draft.champion.name}${role ? ` · ${roleName(role)}` : ""} · ${draftPhase()}`;
  const matchup = enemy ? `Confronto com ${enemy.name}${manualEnemy ? " (escolha manual)" : ""}.`
    : !enemies.length ? "Aguardando escolhas inimigas reveladas." : "Selecione seu adversário de rota.";
  byId("draft-status").textContent = `${own}. ${matchup}`;
  renderWinrates(enemy, statsRole);
  const { archived, ...snapshot } = draft;
  savedMatchup = { snapshot, enemy: selectedEnemy };
  try {
    sessionStorage.setItem("rift-matchup", JSON.stringify(savedMatchup));
  } catch {
    // O último confronto permanece disponível enquanto a aba estiver aberta.
  }
}

const shards = {
  5001: "Vida crescente", 5002: "Armadura", 5003: "Resistência mágica",
  5005: "Velocidade de ataque", 5007: "Aceleração de habilidade", 5008: "Força adaptativa",
  5010: "Velocidade de movimento", 5011: "Vida", 5013: "Tenacidade e resistência a lentidão",
};
const percent = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });
const matchupPercent = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 2 });
const lanePercent = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 0 });

function optionStats(option, className = "rune-stat") {
  const line = element("p", className);
  const win = element("strong", "", `${matchupPercent.format(option.win_rate)} vitória`);
  win.dataset.tone = rateTone(option.win_rate);
  line.append(win, ` · ${percent.format(option.pick_rate)} escolha · ${option.games.toLocaleString("pt-BR")} partidas`);
  if (option.low_sample) line.append(element("span", "rune-warning", " · amostra pequena"));
  return line;
}

function gearRow(title, entries, category, option) {
  const group = element("div", "gear-group");
  group.append(element("h4", "", title));
  if (option) group.append(optionStats(option));
  if (!entries.length) {
    group.append(element("p", "empty", "Indisponível."));
    return group;
  }
  const list = element("ul", "items gear-items");
  for (const entry of entries) {
    const { name, image } = gearAsset(entry, category);
    const item = element("li", "");
    item.append(icon(name[0], image), element("span", "", name));
    list.append(item);
  }
  group.append(list);
  return group;
}

function gearAsset(entry, category) {
  const id = entry?.id ?? entry;
  const asset = gear?.[category]?.[id];
  const name = asset?.name ?? entry?.name ?? (category === "shards" ? shards[id] : null)
    ?? (typeof entry === "string" ? entry : `ID ${id}`);
  let image;
  if (category === "shards" && shards[id]) {
    image = `/assets/shard-${id}.png`;
  } else if (asset) {
    const base = "https://ddragon.leagueoflegends.com/cdn";
    image = category === "runes" ? `${base}/img/${asset.icon}`
      : `${base}/${gear.version}/img/${category === "items" ? "item" : "spell"}/${asset.icon}`;
  }
  return { name, image };
}

function sameIds(first, second) {
  return Array.isArray(first) && Array.isArray(second) && first.length === second.length
    && first.every((id, index) => id === second[index]);
}

// Nome de um combo ("Lâmina de Doran + Poção de Vida ×2"): repetições seguidas viram "×N".
function comboName(names) {
  const parts = [];
  for (const name of names) {
    const last = parts.at(-1);
    if (last?.name === name) last.count += 1;
    else parts.push({ name, count: 1 });
  }
  return parts.map(({ name, count }) => (count > 1 ? `${name} ×${count}` : name)).join(" + ");
}

// Lista de opções (itens, combos de itens ou feitiços), cada uma com vitória, escolha (se houver) e partidas.
// Opções com mais de um id (iniciais, builds principais, feitiços) mostram todos os ícones.
function gearOptions(title, options, chosen = null, category = "items") {
  const group = element("div", "gear-group gear-options-group");
  group.append(element("h4", "", title));
  if (!options?.length) {
    group.append(element("p", "empty", "Indisponível."));
    return group;
  }
  const list = element("ul", "gear-options");
  for (const option of options) {
    const assets = option.ids.map((id) => gearAsset(id, category));
    const name = comboName(assets.map((asset) => asset.name));
    const isChosen = Boolean(chosen && sameIds(option.ids, chosen.ids));
    const item = element("li", [isChosen && "is-chosen", assets.length > 1 && "is-combo"].filter(Boolean).join(" "));
    const text = element("div", "gear-option-text");
    const label = element("span", "gear-option-name", name);
    if (isChosen) label.append(element("span", "rune-best", "Na build"));
    const stats = element("span", "gear-option-stats");
    const win = element("strong", "", `${matchupPercent.format(option.win_rate)} vitória`);
    win.dataset.tone = rateTone(option.win_rate);
    const pick = Number.isFinite(option.pick_rate) ? ` · ${percent.format(option.pick_rate)} esc.` : "";
    stats.append(win, `${pick} · ${option.games.toLocaleString("pt-BR")} part.`);
    if (option.low_sample) stats.append(element("span", "rune-warning", " · amostra pequena"));
    text.append(label, stats);
    if (assets.length > 1) {
      const icons = element("span", "combo-icons");
      icons.append(...assets.map((asset) => icon(asset.name[0], asset.image)));
      item.append(icons, text);
    } else {
      item.append(icon(name[0], assets[0]?.image), text);
    }
    list.append(item);
  }
  group.append(list);
  return group;
}

// Ordem de habilidades: prioridade de evolução (Q › W › E) e os 15 primeiros níveis, com o R destacado.
function skillOrder(title, skills) {
  const group = element("div", "gear-group skill-group");
  group.append(element("h4", "", title));
  if (!skills) {
    group.append(element("p", "empty", "Indisponível."));
    return group;
  }
  const priority = element("ol", "skill-priority");
  priority.setAttribute("aria-label", `Prioridade: ${skills.priority.join(", ")}`);
  skills.priority.forEach((key, index) => {
    const file = skills.icons?.[key];
    const valid = typeof file === "string" && /^[A-Za-z0-9_]{1,64}\.png$/.test(file) && gear?.version;
    const step = element("li", "");
    const frame = icon("", valid ? `https://ddragon.leagueoflegends.com/cdn/${gear.version}/img/spell/${file}` : "");
    frame.append(element("span", "skill-key", key));
    step.append(frame);
    if (index < skills.priority.length - 1) {
      const arrow = element("span", "skill-arrow", "›");
      arrow.setAttribute("aria-hidden", "true");
      step.append(arrow);
    }
    priority.append(step);
  });
  const levels = element("ol", "skill-levels");
  levels.setAttribute("aria-label", "Habilidade em cada nível");
  skills.order.forEach((key, index) => {
    const level = element("li", "");
    level.dataset.skill = key;
    level.append(element("span", "visually-hidden", `Nv ${index + 1}: `), key);
    levels.append(level);
  });
  group.append(priority, levels, optionStats(skills));
  return group;
}

// Conjunto fechado de campos: o caminho do ícone sai só deste mapa, nunca do texto da API.
const jungleCamps = {
  BLUE: { name: "Azul", icon: "/assets/jungle/blue.png" },
  RED: { name: "Vermelho", icon: "/assets/jungle/red.png" },
  GROMP: { name: "Grompe", icon: "/assets/jungle/gromp.png" },
  WOLVES: { name: "Lobos", icon: "/assets/jungle/wolves.png" },
  RAPTORS: { name: "Aves", icon: "/assets/jungle/raptors.png" },
  KRUG: { name: "Krugs", icon: "/assets/jungle/krug.png" },
};

// Um passo da rota: ícone do campo com "›" antes; sem ícone (ou se ele falhar), o selo de texto.
function jungleStop(camp, index) {
  const known = Object.hasOwn(jungleCamps, camp) ? jungleCamps[camp] : null;
  const name = known?.name ?? camp;
  const stop = element("li", "jungle-stop");
  if (known) stop.dataset.camp = camp.toLowerCase();
  stop.title = name;
  if (index > 0) {
    const separator = element("span", "jungle-sep", "›");
    separator.setAttribute("aria-hidden", "true");
    stop.append(separator);
  }
  const label = element("span", "jungle-camp-label", `${index + 1}. ${name}`);
  if (known) {
    const frame = icon("", known.icon);
    const image = frame.querySelector("img");
    image.alt = "";
    image.addEventListener("error", () => {
      frame.remove();
      stop.classList.remove("has-icon");
    }, { once: true });
    stop.classList.add("has-icon");
    stop.append(frame);
  }
  stop.append(label);
  return stop;
}

// Rota da selva mais jogada em cada lado do mapa (dados do último mês, todos os patches).
function jungleRoutes(title, jungle) {
  const group = element("div", "gear-group jungle-group");
  group.append(element("h4", "", title));
  if (!jungle) {
    group.append(element("p", "empty", "Indisponível."));
    return group;
  }
  const list = element("ul", "jungle-sides");
  for (const [side, label] of [["blue", "Lado azul"], ["red", "Lado vermelho"]]) {
    const entry = jungle[side];
    const line = element("li", "jungle-side");
    const name = element("span", "side-label", label);
    name.dataset.side = side;
    line.append(name);
    if (!entry) {
      line.append(element("span", "empty", "Indisponível."));
    } else {
      const route = element("ol", "jungle-route");
      route.setAttribute("aria-label", `Rota do ${label.toLowerCase()}`);
      entry.route.forEach((camp, index) => route.append(jungleStop(camp, index)));
      line.append(route, element("span", "jungle-games", `${entry.games.toLocaleString("pt-BR")} partidas`));
    }
    list.append(line);
  }
  group.append(list, element("p", "opgg-note", "Último mês, todos os patches."));
  return group;
}

// T-013: maior vitória no topo; empate → mais partidas. Amostra pequena vai depois da amostra
// suficiente (cada grupo por vitória). Ordena uma cópia, sem mexer na resposta.
function byWinRate(entries) {
  const rate = (entry) => (Number.isFinite(entry.win_rate) ? entry.win_rate : -1);
  return [...entries].sort((a, b) => Number(Boolean(a.low_sample)) - Number(Boolean(b.low_sample))
    || rate(b) - rate(a) || (b.games ?? 0) - (a.games ?? 0));
}

// Bloco extra da aba Geral (página /build do OP.GG): cada parte que faltar mostra "Indisponível.".
function buildExtras(data) {
  const { extras, options, build, role } = data;
  const section = element("section", "build-extras");
  if (role === "jungle") section.append(jungleRoutes("Rotas da selva", extras.jungle));
  // T-013: os feitiços subiram para junto dos itens iniciais (opggBuildPanel).
  section.append(skillOrder("Ordem de habilidades", extras.skills),
    gearOptions("Builds principais", options?.core ?? (build.core ? [build.core] : []), build.core));
  const depth = element("div", "depth-grid");
  for (const [key, label] of [["4", "Quarto item"], ["5", "Quinto item"], ["6", "Sexto item"]]) {
    const entries = extras.depth?.[key]?.map((entry) => ({ ...entry, ids: [entry.id] })) ?? [];
    depth.append(gearOptions(label, byWinRate(entries)));
  }
  section.append(depth);
  return section;
}

function winrateMetric(label, entry, empty = "Sem amostra") {
  const metric = element("div", "winrate-metric");
  metric.append(element("dt", "", label));
  const value = element("dd", "");
  if (Number.isFinite(entry?.rate) || entry?.games > 0) {
    value.append(
      element("strong", "winrate-value", (entry.source === "OP.GG" ? matchupPercent : percent).format(entry.rate ?? entry.wins / entry.games)),
    );
    if (entry.games > 0) {
      value.append(element("span", "winrate-sample", entry.wins === undefined
        ? `${entry.games.toLocaleString("pt-BR")} partidas`
        : `${entry.wins} vitórias em ${entry.games} partidas`));
    }
    if (entry.source) {
      const source = element("a", "winrate-sample", `${entry.source} · patch ${entry.patch} · ${entry.scope}`);
      source.href = entry.url;
      source.target = "_blank";
      source.rel = "noopener noreferrer";
      value.append(source);
    }
  } else {
    value.append(element("span", "winrate-sample", empty));
  }
  metric.append(value);
  return metric;
}

function runeInfo(id) {
  if (shards[id]) return { name: shards[id], src: `/assets/shard-${id}.png` };
  const asset = gear?.runes?.[id];
  return {
    name: asset?.name ?? `Runa ${id}`,
    src: asset ? `https://ddragon.leagueoflegends.com/cdn/img/${asset.icon}` : "",
  };
}

function runeIcon(id, className = "rune-icon") {
  const { name, src } = runeInfo(id);
  const frame = icon(name[0], src);
  frame.classList.add(className);
  frame.title = name;
  return frame;
}

function runeCell(cell, selected) {
  const { name } = runeInfo(cell.id);
  const node = element("div", `rune-cell${selected ? " is-selected" : ""}`);
  node.title = name;
  const win = element("strong", "", matchupPercent.format(cell.win_rate));
  win.dataset.tone = cell.games > 0 ? rateTone(cell.win_rate) : "";
  node.append(
    runeIcon(cell.id),
    element("span", "visually-hidden", `${name}${selected ? " (escolhida)" : ""}: vitória`),
    win,
    element("span", "", `${percent.format(cell.pick_rate)} esc.`),
    element("span", "", `${cell.games.toLocaleString("pt-BR")} part.`),
  );
  return node;
}

function runeTree(title, styleId, rows, isSelected) {
  const column = element("div", "rune-tree");
  const heading = element("h5", "rune-tree-title");
  if (styleId) heading.append(runeIcon(styleId, "rune-style"));
  heading.append(title);
  column.append(heading);
  rows.forEach((row, index) => {
    const line = element("div", "rune-row");
    line.append(...row.map((cell) => runeCell(cell, isSelected(cell, index))));
    column.append(line);
  });
  return column;
}

function runeGrid(runes, page) {
  const chosen = new Set(page.perks.slice(0, 6));
  const shardIds = page.perks.slice(6);
  const trees = runes.trees[page.primary] && runes.trees[page.secondary];
  if (!trees) return [element("p", "empty", "Árvores de runas indisponíveis.")];
  const primary = runeTree(runeInfo(page.primary).name, page.primary, runes.trees[page.primary].primary,
    (cell) => chosen.has(cell.id));
  const side = element("div", "rune-side");
  side.append(
    runeTree(runeInfo(page.secondary).name, page.secondary, runes.trees[page.secondary].secondary,
      (cell) => chosen.has(cell.id)),
    // O mesmo fragmento (ex.: 5008) pode aparecer em linhas diferentes; o destaque é por linha.
    runeTree("Fragmentos", null, runes.shards, (cell, index) => cell.id === shardIds[index]),
  );
  const variant = element("p", "rune-variant", "Combinação destacada: ");
  variant.append(...optionStats(page.variant).childNodes);
  const grid = element("div", "rune-grid");
  grid.append(primary, side);
  return [variant, grid];
}

function runePanel(request) {
  const { runes } = request.data;
  const panel = element("section", "rune-panel");
  const prefix = `rune-panel-${++runePanelCount}`;
  const head = element("div", "rune-head");
  head.append(element("h4", "", "Runas"));
  const tabs = element("div", "rune-tabs");
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", "Páginas de runas");
  const body = element("div", "rune-body");
  body.id = `${prefix}-body`;
  body.setAttribute("role", "tabpanel");
  let current = runeTabs.get(request.key) ?? runes.selected;
  if (!runes.pages[current]) current = 0;

  const buttons = runes.pages.map((page, index) => {
    const tab = element("button", "rune-tab");
    tab.type = "button";
    tab.id = `${prefix}-tab-${index}`;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", body.id);
    tab.dataset.runeTab = `${request.key}#${index}`;
    const names = [page.keystone, page.primary, page.secondary].map((id) => runeInfo(id).name);
    const icons = element("span", "rune-tab-icons");
    icons.append(runeIcon(page.keystone, "rune-keystone"), runeIcon(page.primary, "rune-style"),
      runeIcon(page.secondary, "rune-style"));
    const label = element("span", "rune-tab-label", `${names[0]} · ${names[1]} + ${names[2]}`);
    const win = element("strong", "", `${matchupPercent.format(page.win_rate)} vitória`);
    win.dataset.tone = rateTone(page.win_rate);
    const stats = element("span", "rune-tab-stats");
    stats.append(win, element("span", "",
      `${percent.format(page.pick_rate)} escolha · ${page.games.toLocaleString("pt-BR")} partidas`));
    tab.append(icons, label, stats);
    if (index === runes.selected) tab.append(element("span", "rune-best", "Maior vitória"));
    tab.addEventListener("click", () => {
      select(index);
      revealTab(tabs, tab);
    });
    tab.addEventListener("focus", () => revealTab(tabs, tab));
    tab.addEventListener("keydown", (event) => {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
      const target = event.key === "Home" ? 0 : event.key === "End" ? runes.pages.length - 1
        : step ? (index + step + runes.pages.length) % runes.pages.length : null;
      if (target === null) return;
      event.preventDefault();
      select(target);
      buttons[target].focus();
    });
    return tab;
  });

  function select(index) {
    current = index;
    runeTabs.set(request.key, index);
    buttons.forEach((tab, position) => {
      tab.setAttribute("aria-selected", String(position === index));
      tab.tabIndex = position === index ? 0 : -1;
    });
    body.setAttribute("aria-labelledby", buttons[index].id);
    body.replaceChildren(...runeGrid(runes, runes.pages[index]));
  }

  tabs.append(...buttons);
  panel.append(runeCarousel(head, tabs, buttons, request.key, () => buttons[current]), body);
  select(current);
  return panel;
}

// Carrossel das páginas de runas: uma linha com rolagem horizontal e setas ‹ ›. A posição fica
// guardada por consulta para o poll de 2s não devolver o carrossel ao início.
function runeCarousel(head, tabs, buttons, key, selectedTab) {
  const nav = element("div", "rune-nav");
  const arrows = [["‹", "Opções anteriores", -1], ["›", "Próximas opções", 1]].map(([glyph, label, direction]) => {
    const arrow = element("button", "rune-arrow", glyph);
    arrow.type = "button";
    arrow.setAttribute("aria-label", label);
    arrow.title = label;
    arrow.addEventListener("click", () => {
      const step = (buttons[0]?.offsetWidth ?? tabs.clientWidth) + 6;
      tabs.scrollBy({ left: direction * Math.max(step, 1), behavior: scrollBehavior() });
    });
    return arrow;
  });
  nav.append(...arrows);
  head.append(nav);

  function update() {
    const max = tabs.scrollWidth - tabs.clientWidth;
    nav.hidden = max <= 1;
    arrows[0].disabled = tabs.scrollLeft <= 1;
    arrows[1].disabled = tabs.scrollLeft >= max - 1;
  }
  tabs.addEventListener("scroll", () => {
    runeScroll.set(key, tabs.scrollLeft);
    update();
  }, { passive: true });
  tabs.addEventListener("rune-reveal", update);
  // Quando o carrossel ganha largura (entra no DOM ou a aba dele aparece), antes da pintura, volta
  // à posição salva ou mostra a página selecionada (a de maior vitória ao abrir).
  let placed = false;
  function place() {
    if (!placed && tabs.isConnected && tabs.clientWidth) {
      placed = true;
      if (runeScroll.has(key)) tabs.scrollLeft = runeScroll.get(key);
      else revealTab(tabs, selectedTab(), "auto");
    }
    update();
  }
  if (typeof ResizeObserver === "function") {
    const observer = new ResizeObserver(() => {
      // Removido do DOM depois de posicionado = painel substituído por um novo render.
      if (!tabs.isConnected) {
        if (placed) observer.disconnect();
      } else place();
    });
    observer.observe(tabs);
  }
  requestAnimationFrame(place);
  const carousel = element("div", "rune-carousel");
  carousel.append(head, tabs);
  return carousel;
}

function scrollBehavior() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

// Rola só o carrossel (sem mexer na rolagem vertical da página) até a aba ficar inteira à vista.
function revealTab(tabs, tab, behavior = scrollBehavior()) {
  if (!tab || !tabs.isConnected) return;
  const left = tab.offsetLeft;
  const right = left + tab.offsetWidth;
  // Alinha pelo início do cartão (mesmo ponto do scroll-snap; alinhar pela direita faria o snap
  // obrigatório puxar de volta para o cartão anterior).
  const hidden = left < tabs.scrollLeft || right > tabs.scrollLeft + tabs.clientWidth;
  if (hidden) tabs.scrollTo({ left: Math.max(0, left - 3), behavior });
  tabs.dispatchEvent(new Event("rune-reveal"));
}

// Itens à esquerda e runas à direita; abaixo de ~820px de cartão vira uma coluna (itens acima).
function buildSplit(runes, items) {
  const split = element("div", "build-split");
  const runeColumn = element("div", "build-runes");
  runeColumn.append(...runes);
  const itemColumn = element("div", "build-items");
  itemColumn.append(...items);
  split.append(itemColumn, runeColumn);
  return split;
}

function coreRow(title, ids, option, best = true) {
  const row = gearRow(title, ids, "items", option);
  row.classList.add("gear-core");
  // O selo só vale para dados do OP.GG; a referência local não tem taxa de vitória.
  if (best && ids.length) row.querySelector("h4").append(element("span", "rune-best", "Maior vitória"));
  return row;
}

function opggBuildPanel(card, request) {
  const { build, patch, options } = request.data;
  const boots = options?.boots ?? (build.boots ? [build.boots] : []);
  const starting = options?.starting ?? (build.starting ? [build.starting] : []);
  // Feitiços ao lado dos itens iniciais; só a build geral (com extras) traz feitiços.
  const top = [gearOptions("Itens iniciais", starting, build.starting)];
  if (request.data.extras) top.push(gearOptions("Feitiços de invocador", request.data.extras.spells ?? [], null, "spells"));
  card.append(buildSplit([runePanel(request)], [
    element("p", "build-rate", `Build de maior taxa de vitória · patch ${patch}`),
    buildTop(top),
    coreRow("Itens principais", build.core?.ids ?? [], build.core),
    gearOptions("Botas", boots, build.boots),
    gearOptions("Itens situacionais", options?.situational ?? []),
  ]));
  // Só a build geral (sem adversário) traz os extras da página /build.
  if (request.data.extras) card.append(buildExtras(request.data));
}

// T-013: primeira linha da coluna de itens (itens iniciais + feitiços), lado a lado quando cabe.
function buildTop(groups) {
  const top = element("div", "build-top");
  top.append(...groups);
  return top;
}

// T-013: enquanto o OP.GG responde, um esqueleto no lugar de runas e itens (nada de referência).
const SKELETON_CYCLE_MS = 1400;
function opggBuildLoading() {
  const box = element("div", "build-loading");
  box.setAttribute("role", "status");
  box.setAttribute("aria-live", "polite");
  box.setAttribute("aria-busy", "true");
  // O poll refaz o painel a cada 2s; o atraso negativo mantém o brilho contínuo entre renders.
  box.style.setProperty("--skeleton-delay", `-${Math.round(performance.now() % SKELETON_CYCLE_MS)}ms`);
  const label = element("p", "build-loading-label");
  label.append(element("span", "build-loading-dot"), "Carregando build e runas do OP.GG…");
  const bar = (className) => element("span", `skeleton ${className}`);
  const items = element("div", "skeleton-stack");
  items.append(bar("skeleton-line is-short"));
  const top = element("div", "build-top");
  for (let index = 0; index < 2; index += 1) {
    const group = element("div", "skeleton-stack");
    group.append(bar("skeleton-line is-title"), bar("skeleton-block"), bar("skeleton-block"));
    top.append(group);
  }
  items.append(top, bar("skeleton-block is-core"), bar("skeleton-line is-title"), bar("skeleton-block"));
  const runes = element("div", "skeleton-stack");
  runes.append(bar("skeleton-line is-title"), bar("skeleton-block is-tab"));
  const circles = element("div", "skeleton-runes");
  for (let index = 0; index < 12; index += 1) circles.append(bar("skeleton-circle"));
  runes.append(circles);
  const split = buildSplit([runes], [items]);
  split.setAttribute("aria-hidden", "true");
  box.append(label, split);
  return box;
}

function opggBuildNote(request) {
  if (!request) return null;
  if (request.status === "no-data") return "Build e runas não publicadas no OP.GG. Exibindo a referência.";
  return "Build e runas do OP.GG indisponíveis no momento. Exibindo a referência.";
}

function winratePanel(title, result, noData, url, rates, opgg = null) {
  const card = element("article", "build-card");
  // O título visível é o da aba; o h3 fica para leitores de tela.
  card.append(element("h3", "visually-hidden", title));
  const ready = opgg?.status === "ready" && opgg.data?.build && opgg.data?.runes;
  if (url || ready) {
    const link = element("a", "draft-link catalog-link", "Itens e runas no OP.GG ↗");
    link.href = ready ? opgg.data.url : url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    card.append(link);
  }
  const metrics = element("dl", "winrate-metrics");
  metrics.append(...rates.map(([label, entry, empty]) => winrateMetric(label, entry, empty)));
  card.append(metrics);
  if (ready) {
    opggBuildPanel(card, opgg);
    return card;
  }
  if (opgg?.status === "loading") {
    card.append(opggBuildLoading());
    return card;
  }
  const note = opggBuildNote(opgg);
  if (note) {
    card.append(element("p", "opgg-note", note));
  }
  if (!result?.build && !result?.runes) {
    card.append(element("p", "empty", noData));
    return card;
  }
  const { build, runes } = result;
  if (result.reference) {
    card.append(element("p", "", "Build de referência do catálogo, sem taxas de itens e runas."));
    if (result.note) card.append(element("p", "", result.note));
  }
  const items = [];
  if (build) {
    const itemLabel = build.ids.length === 6 ? "Build de seis itens" : `Build parcial · ${build.ids.length} itens`;
    items.push(element("p", "build-rate", itemLabel));
    const top = [];
    if (build.starting?.length) top.push(gearRow("Itens iniciais", build.starting, "items"));
    if (build.spells?.length) top.push(gearRow("Feitiços de invocador", build.spells, "spells"));
    if (top.length) items.push(buildTop(top));
    items.push(coreRow("Inventário final", build.ids, undefined, false));
    if (build.purchase_order?.length) items.push(gearRow("Ordem de compra registrada", build.purchase_order, "items"));
    if (build.skills?.length) {
      const skills = element("ol", "skill-order");
      build.skills.forEach((skill) => skills.append(element("li", "", skill)));
      items.push(element("h4", "skill-title", "Ordem das habilidades"), skills);
    } else if (!result.reference && !build.starting && !build.purchase_order) {
      items.push(element("p", "empty", "Importe a linha do tempo para ver itens iniciais, ordem de compra e habilidades."));
    }
    items.push(element("p", "opgg-note", "Situacionais e opções de botas exigem dados do OP.GG."));
  } else {
    items.push(element("p", "empty", "Itens: amostra insuficiente."));
  }
  const runeColumn = [];
  if (runes) {
    runeColumn.push(gearRow("Runas", runes.ids, "runes"));
    if (runes.shards?.some(Boolean)) {
      runeColumn.push(gearRow("Fragmentos", runes.shards.filter(Boolean), "shards"));
    }
  } else {
    runeColumn.push(element("p", "empty", "Runas: amostra insuficiente."));
  }
  card.append(buildSplit(runeColumn, items));
  return card;
}

// Abas "Campeão · Geral" e "Campeão vs inimigo": trocam só o hidden, sem refazer o painel.
function winrateTabs(panels, active) {
  const wrapper = element("div", "winrate-tabbed");
  const tablist = element("div", "winrate-tabs");
  tablist.setAttribute("role", "tablist");
  tablist.setAttribute("aria-label", "Recorte da build");
  const hint = element("p", "winrate-tab-hint", "Selecione um adversário na coluna Inimigos.");
  hint.id = "winrate-tab-hint";
  const buttons = panels.map(({ key, label, disabled }) => {
    const tab = element("button", "winrate-tab", label);
    tab.type = "button";
    tab.id = `winrate-tab-${key}`;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", `winrate-panel-${key}`);
    tab.dataset.winrateTab = key;
    if (disabled) {
      tab.setAttribute("aria-disabled", "true");
      tab.setAttribute("aria-describedby", hint.id);
      tab.title = hint.textContent;
    }
    return tab;
  });
  const bodies = panels.map(({ key, card }) => {
    card.id = `winrate-panel-${key}`;
    card.setAttribute("role", "tabpanel");
    card.setAttribute("aria-labelledby", `winrate-tab-${key}`);
    return card;
  });
  const enabled = panels.map((panel, index) => (panel.disabled ? null : index)).filter((index) => index !== null);

  function select(index, save) {
    buttons.forEach((tab, position) => {
      tab.setAttribute("aria-selected", String(position === index));
      tab.tabIndex = position === index ? 0 : -1;
      bodies[position].hidden = position !== index;
    });
    if (save) {
      winrateTab = panels[index].key;
      saveWinrateTab();
    }
  }

  buttons.forEach((tab, index) => {
    tab.addEventListener("click", () => {
      if (!panels[index].disabled) select(index, true);
    });
    tab.addEventListener("keydown", (event) => {
      const at = enabled.indexOf(index);
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
      const next = event.key === "Home" ? enabled[0] : event.key === "End" ? enabled[enabled.length - 1]
        : step && at >= 0 ? enabled[(at + step + enabled.length) % enabled.length] : null;
      if (next === null || next === undefined) return;
      event.preventDefault();
      select(next, true);
      buttons[next].focus();
    });
  });

  tablist.append(...buttons);
  const bar = element("div", "winrate-tabs-bar");
  bar.append(tablist);
  if (panels.some(({ disabled }) => disabled)) bar.append(hint);
  wrapper.append(bar, ...bodies);
  const current = panels.findIndex(({ key, disabled }) => key === active && !disabled);
  select(current >= 0 ? current : enabled[0] ?? 0, false);
  return wrapper;
}

function referenceByClass(champion, role) {
  if (!champion?.tags?.length) return null;
  const primary = champion.tags[0];
  const tank = champion.tags.includes("Tank");
  const magicAssassin = primary === "Assassin"
    && (champion.tags.includes("Mage") || ["Akali", "Fizz"].includes(champion.id));
  const profile = role === "support" && tank ? "supportTank"
    : magicAssassin || ["Diana", "Mordekaiser", "Gwen"].includes(champion.id) ? "mage"
    : champion.id === "Senna" ? "marksman"
    : primary === "Support" ? "enchanter"
    : primary.toLowerCase();
  const preset = buildProfiles[profile];
  if (!preset) return null;

  let items = preset.items;
  let starting = [1055, 2003];
  if (role === "support") {
    starting = [3865, 2003, 2003];
    if (!["supportTank", "enchanter"].includes(profile)) items = [3876, ...items.slice(0, 5)];
  } else if (role === "jungle") {
    starting = [1102];
  } else if (profile === "mage" || profile === "enchanter") {
    starting = [1056, 2003, 2003];
  } else if (tank) {
    starting = [1054, 2003];
  }
  return {
    build: { ids: items, starting, spells: [4, { jungle: 11, top: 12, adc: 7 }[role] ?? 14] },
    runes: { ids: preset.runes, shards: preset.shards },
    note: "Sugestão automática pela classe e rota do campeão.",
  };
}

function renderWinrates(enemy, role) {
  const champion = draftOwns()
    ? champions.find(({ id }) => id === draft.champion.id) ?? draft.champion
    : champions.find(({ name }) => name === selected);
  if (!draftOwns()) readOpggCounters("own", champion, activeRole());
  renderSelectedRate();
  const opgg = opggCounters.own?.data;
  const flexRole = role || opgg?.role || (opggCounters.own?.status === "loading" ? null : "");
  const roleStats = winrates?.champions?.[champion?.key] ?? {};
  const references = (catalog.get(champion?.name) ?? []).filter((entry) => entry.reference);
  const chosenRole = role || opgg?.role || Object.keys(roleStats).sort((a, b) =>
    (roleStats[b]["0"]?.games ?? 0) - (roleStats[a]["0"]?.games ?? 0),
  )[0] || references[0]?.role || (champion?.tags?.includes("Support") ? "support" : null);
  const stats = roleStats[chosenRole];
  const general = stats?.["0"];
  const localEntry = references.find((entry) => entry.role === chosenRole);
  const reference = localEntry?.reference ?? referenceByClass(champion, chosenRole);
  const generalResult = general?.build || general?.runes ? general
    : reference && { ...reference, reference: true };
  const target = enemy && champions.find(({ id }) => id === enemy.id);
  const matchup = stats?.[target?.key];
  const published = (catalog.get(champion?.name) ?? []).find(
    (entry) => entry.role === chosenRole && entry.champion_rates,
  )?.champion_rates;
  function championRecord(result, entry) {
    if (result?.record) return result.record;
    if (!entry) return null;
    const { source, url, patch, scope } = published;
    return { ...entry, source, url, patch, scope };
  }
  const matchupReference = localEntry?.matchup_references?.[enemy?.id];
  const matchupResult = matchup?.build || matchup?.runes ? matchup
    : matchupReference && {
      reference: true,
      note: matchupReference.note,
      build: { ...reference.build, ids: matchupReference.item_ids },
      runes: reference.runes,
    };
  byId("winrates-summary").textContent = winrates
    ? `Amostra da Riot · patch ${winrates.patch}${chosenRole ? ` · ${roleName(chosenRole)}` : ""} · mínimo de ${winrates.minimum} partidas por opção`
    : "Taxas de itens e runas dependem da amostra de partidas importada da Riot.";
  const noData = winrates ? "Amostra de itens e runas insuficiente para este recorte." : "Importe partidas da Riot para calcular as taxas de itens e runas.";
  // A Flex segue a rota do Solo/Duo; sem rota definida, espera o OP.GG indicar a principal.
  readOpggCounters("ownFlex", flexRole === null ? null : champion, flexRole ?? "", "flex");
  readOpgg("aram", champion, "aram");
  // Build e runas do OP.GG só existem por rota; sem rota, fica a referência local.
  const buildRole = Object.hasOwn(roleNames, chosenRole ?? "") ? chosenRole : null;
  const buildTarget = enemy && enemy.id.toLowerCase() !== champion?.id.toLowerCase() ? enemy.id.toLowerCase() : null;
  readOpgg("build", buildRole ? champion : null, "build", { role: buildRole });
  readOpgg("matchupBuild", buildRole && buildTarget ? champion : null, "build", { role: buildRole, target: buildTarget });
  const ownStatus = opggStatusText(opggCounters.own);
  const flexStatus = flexRole === null ? ownStatus : opggStatusText(opggCounters.ownFlex);
  const generalRate = opggGeneralRate(opgg) ?? championRecord(general, published?.general);
  const aram = opggCounters.aram?.data;
  const enemyStatus = (status) => (enemy ? status : "Selecione o adversário.");
  const focused = document.activeElement?.dataset ?? {};
  const focusedTab = focused.runeTab ? ["runeTab", focused.runeTab]
    : focused.winrateTab ? ["winrateTab", focused.winrateTab] : null;
  // Com inimigo, a aba de confronto abre sozinha uma vez por par campeão|inimigo.
  const pairKey = champion && enemy ? `${champion.id}|${enemy.id}` : null;
  if (pairKey && pairKey !== matchupAutoKey) {
    winrateTab = "matchup";
    matchupAutoKey = pairKey;
    saveWinrateTab();
  }
  const championName = champion?.name ?? "Campeão";
  byId("winrates-cards").replaceChildren(winrateTabs([
    {
      key: "general",
      label: `${championName} · Geral`,
      card: winratePanel(champion ? `${champion.name} · Geral` : "Geral", generalResult, noData,
        champion && buildUrl(champion.id, chosenRole), [
          ["Taxa de vitória · Solo/Duo", generalRate, ownStatus],
          ["Taxa de vitória · Flex", opggGeneralRate(opggCounters.ownFlex?.data), flexStatus],
          ["Taxa de vitória · ARAM", Number.isFinite(aram?.rate) ? aram : null, opggStatusText(opggCounters.aram)],
        ], opggCounters.build),
    },
    {
      key: "matchup",
      label: `${championName} vs ${enemy ? enemy.name : "inimigo"}`,
      disabled: !pairKey,
      card: winratePanel(champion && enemy ? `${champion.name} contra ${enemy.name}` : "Contra o adversário",
        matchupResult, enemy ? noData : "Selecione um adversário na coluna Inimigos.",
        champion && enemy && buildUrl(champion.id, chosenRole, enemy.id), [
          ["Confronto · Solo/Duo", enemy ? opggRate(enemy.id) : null, enemyStatus(ownStatus)],
          ["Confronto · Flex", enemy ? opggRate(enemy.id, "flex") : null, enemyStatus(flexStatus)],
        ], opggCounters.matchupBuild),
    },
  ], pairKey ? winrateTab : "general"));
  if (focusedTab) {
    const [attribute, value] = focusedTab;
    [...byId("winrates-cards").querySelectorAll(`[data-${attribute === "runeTab" ? "rune-tab" : "winrate-tab"}]`)]
      .find((tab) => tab.dataset[attribute] === value)?.focus();
  }
}

function renderDraft(snapshot) {
  if (snapshot.status !== "active" && savedMatchup?.snapshot?.champion) {
    snapshot = { ...savedMatchup.snapshot, archived: true };
  }
  if (snapshot.status !== "active" || !snapshot.champion) {
    selectedEnemy = null;
    if (snapshot.status === "active" && savedMatchup) {
      savedMatchup = null;
      try { sessionStorage.removeItem("rift-matchup"); } catch { /* Armazenamento indisponível. */ }
    }
  } else if (!snapshot.enemies?.some((row) => row.id === selectedEnemy)) {
    selectedEnemy = null;
  }
  if (snapshot.in_game && !snapshot.role && savedMatchup?.snapshot.champion?.id === snapshot.champion?.id) {
    snapshot = { ...snapshot, role: savedMatchup.snapshot.role };
  }
  // Só o draft ao vivo devolve o painel ao campeão do draft; o arquivado e o F5 mantêm as escolhas.
  if (snapshot.status === "active" && !snapshot.archived) {
    const sig = draftSig(snapshot);
    if (manualChampion && manualChampion.sig !== sig) setManualChampion(null);
    if (laneChoice?.sig && laneChoice.sig !== sig) setLaneChoice(null);
  }
  if (manualChampion && !champions.some(({ id }) => id === manualChampion.id)) setManualChampion(null);
  const championChanged = draft.champion?.id !== snapshot.champion?.id;
  const roleChanged = draft.role !== snapshot.role;
  const pickConfirmed = snapshot.confirmed && !draft.confirmed;
  draft = snapshot;
  byId("draft-controls").hidden = !draftOwns();
  if (draftOwns()) {
    if (championChanged || roleChanged || pickConfirmed || selectedId !== draft.champion.id) {
      selectChampion(draft.champion.name, draft.champion.id);
    }
    renderMatchup();
  } else {
    opggCounters.enemy = null;
    const manual = manualChampion && champions.find(({ id }) => id === manualChampion.id);
    if (manual && selectedId !== manual.id) selectChampion(manual.name, manual.id);
    renderOwnPicker();
    renderOverview();
  }
  renderLanes();
}

async function pollDraft() {
  let snapshot;
  try {
    const response = await fetch("/api/draft", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    snapshot = await response.json();
  } catch {
    snapshot = { status: "unavailable" };
  }
  const nextKey = JSON.stringify(snapshot);
  if (draftKey !== nextKey) {
    draftKey = nextKey;
    renderDraft(snapshot);
  } else if (Object.values(opggCounters).some((request) => request?.expires <= Date.now())) {
    refresh();
  }
  setTimeout(pollDraft, 2000);
}

function selectChampion(champion, championId = champion) {
  selected = champion;
  selectedId = championId;
  byId("champion-name").textContent = champion;
  byId("champion-title").textContent = championTitles[championId] ?? "";
  art.hidden = false;
  art.dataset.fallback = `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${encodeURIComponent(championId)}_0.jpg`;
  const localArt = Object.hasOwn(championTitles, championId) || championId === "Riven";
  art.src = localArt ? `/assets/${encodeURIComponent(championId)}-splash.jpg` : art.dataset.fallback;
  renderLanes();
}

async function loadCatalog() {
  try {
    const [rosterResponse, buildsResponse, profilesResponse] = await Promise.all([
      fetch("/api/champions", { cache: "no-store" }),
      fetch("/api/builds", { cache: "no-store" }),
      fetch("/assets/build-profiles.json", { cache: "no-store" }),
    ]);
    if (!rosterResponse.ok || !buildsResponse.ok) throw new Error("Catálogo indisponível.");
    const [roster, builds] = await Promise.all([rosterResponse.json(), buildsResponse.json()]);
    if (profilesResponse.ok) buildProfiles = await profilesResponse.json();
    dragonVersion = roster.version;
    champions = Object.values(roster.data).sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
    for (const build of builds) {
      if (!catalog.has(build.champion)) catalog.set(build.champion, []);
      catalog.get(build.champion).push(build);
    }
    if (!champions.length) {
      loading.textContent = "O catálogo ainda não tem campeões cadastrados.";
      return;
    }
    const firstChampion = champions.find(({ name }) => catalog.has(name)) ?? champions[0];
    selectChampion(firstChampion.name, firstChampion.id);
    // O campeão inicial não foi escolhido pelo usuário: a lista de inimigos abre sem filtro.
    enemyRoleKey = ownRoleKey();
    enemyRoleFromOpening = true;
    renderOwnPicker();
    renderOverview();
    byId("catalog").hidden = false;
    loading.hidden = true;
  } catch {
    loading.textContent = "Não foi possível carregar o catálogo. Recarregue a página para tentar novamente.";
  }
}

async function loadWinrates() {
  const results = await Promise.allSettled(
    ["/api/gear", "/api/winrates"].map(async (path) => {
      const response = await fetch(path, { cache: "no-store" });
      return response.ok ? response.json() : null;
    }),
  );
  gear = results[0].value ?? null;
  winrates = results[1].value ?? null;
  refresh();
}

async function loadPositions() {
  try {
    const response = await fetch("/api/opgg/positions", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    if (!data?.positions || typeof data.positions !== "object") return;
    championPositions = data.positions;
    championRates = data.rates && typeof data.rates === "object" ? data.rates : {};
  } catch {
    // Sem as rotas do OP.GG, as listas usam as rotas do catálogo local.
    return;
  }
  renderOwnPicker();
  refresh();
}

art.addEventListener("error", () => {
  const fallback = art.dataset.fallback;
  if (fallback && art.src !== fallback) art.src = fallback;
  else art.hidden = true;
});
search.addEventListener("input", renderOwnPicker);
enemySearch.addEventListener("input", renderEnemyPicker);
for (const side of ["own", "enemy"]) {
  byId(`${side}-role-filter`).addEventListener("click", (event) => {
    const button = event.target.closest("[data-role]");
    if (!button) return;
    roleFilters[side] = roleFilters[side] === button.dataset.role ? "" : button.dataset.role;
    // A escolha manual vale até o usuário escolher outro campeão.
    if (side === "enemy") {
      enemyRoleKey = ownRoleKey();
      enemyRoleFromOpening = false;
    }
    renderRoleFilter(side);
    if (side === "own") renderOwnPicker();
    else renderEnemyPicker();
  });
}
byId("enemy-tone-filter").addEventListener("click", (event) => {
  const button = event.target.closest("[data-tone]");
  if (!button || button.dataset.tone === enemyTone) return;
  enemyTone = button.dataset.tone;
  try {
    sessionStorage.setItem("rift-enemy-tone", enemyTone);
  } catch {
    // Armazenamento indisponível.
  }
  renderEnemyPicker();
});
byId("open-guide").addEventListener("click", () => guide.showModal());
loadCatalog().then(() => {
  pollDraft();
  loadWinrates();
  loadPositions();
});

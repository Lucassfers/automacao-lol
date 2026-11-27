// Coluna Inimigos: inimigos revelados no draft, lista para escolha manual e filtros de rota e de confronto.
import { roleNames } from "../core/constants.js";
import { byId, dom } from "../core/dom.js";
import { matchupPercent, rateTone, roleName } from "../core/format.js";
import { refresh } from "../core/refresh.js";
import { draftOwns, opggRate, ownDefaultRole, ownRoleKey } from "../core/selectors.js";
import { state } from "../core/state.js";
import { saveEnemyTone, setManualEnemy } from "../core/storage.js";
import { championButton, renderChampionPicker } from "./champion-picker.js";
import { renderRoleFilter } from "./role-filter.js";

// Taxa do seu campeão contra um inimigo, exibida na coluna Inimigos.
export function enemyRateText(id) {
  const rate = opggRate(id);
  if (!rate) return null;
  const own = state.opggCounters.own?.name;
  return { text: `${matchupPercent.format(rate.rate)}${own ? ` p/ ${own}` : ""}`, tone: rateTone(rate.rate) };
}

// Ao escolher outro campeão (ou rota no draft), os inimigos passam a ser filtrados pela rota dele.
export function syncEnemyRoleFilter() {
  const key = ownRoleKey();
  if (key === state.enemyRoleKey) return;
  const role = ownDefaultRole();
  if (!Object.hasOwn(roleNames, role)) return;
  state.enemyRoleKey = key;
  state.enemyRoleFromOpening = false;
  state.roleFilters.enemy = role;
  renderRoleFilter("enemy");
}

export function renderEnemyTone() {
  for (const button of byId("enemy-tone-filter").querySelectorAll("[data-tone]")) {
    button.setAttribute("aria-pressed", String(button.dataset.tone === state.enemyTone));
  }
}

// Mensagem da lista vazia nos modos "Bom contra" e "Ruim contra".
export function enemyToneEmptyText() {
  if (state.enemyTone === "all") return undefined;
  const own = state.opggCounters.own;
  if (own?.data?.matchups && Object.keys(own.data.matchups).length) return undefined;
  if (!own || own.status === "loading") return "Carregando confrontos…";
  return "Sem dados de confronto para seu campeão.";
}

export function renderEnemyPicker() {
  syncEnemyRoleFilter();
  renderEnemyTone();
  const tone = state.enemyTone;
  const rates = new Map();
  const rateOf = (id) => {
    if (!rates.has(id)) rates.set(id, opggRate(id)?.rate);
    return rates.get(id);
  };
  renderChampionPicker({
    list: dom.enemyList,
    input: dom.enemySearch,
    empty: byId("enemy-search-empty"),
    emptyText: enemyToneEmptyText(),
    role: state.roleFilters.enemy,
    accept: tone === "all" ? null : ({ id }) => {
      const rate = rateOf(id);
      return Number.isFinite(rate) && (tone === "good" ? rate > 0.5 : rate < 0.5);
    },
    order: tone === "all" ? null : (a, b) => (tone === "good" ? rateOf(b.id) - rateOf(a.id) : rateOf(a.id) - rateOf(b.id)),
    isPressed: ({ id }) => id === state.manualEnemy,
    rateText: ({ id }) => enemyRateText(id),
    title: ({ name }, pressed) => (pressed ? `Clique de novo para limpar a escolha de ${name}` : `Escolher ${name} como adversário`),
    onPick: ({ id }) => {
      setManualEnemy(state.manualEnemy === id ? null : id);
      refresh();
    },
  });
}

export function renderDraftEnemies(enemy) {
  const enemies = state.draft.enemies ?? [];
  const list = byId("draft-enemies");
  const focused = list.contains(document.activeElement) ? document.activeElement.dataset.champion : null;
  const buttons = enemies.map((row) => {
    const rate = enemyRateText(row.id);
    const loading = state.opggCounters.own?.status === "loading"
      || (state.opggCounters.enemy?.champion === row.id && state.opggCounters.enemy.status === "loading");
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
      state.selectedEnemy = row.id;
      refresh();
      byId("draft-enemies").querySelector('[aria-pressed="true"]')?.focus();
    });
    return button;
  });
  list.replaceChildren(...buttons);
  buttons.find((button) => button.dataset.champion === focused)?.focus();
  byId("draft-enemy-count").textContent = enemies.length || "";
}

export function renderEnemyColumn(enemy) {
  renderDraftEnemies(enemy);
  renderEnemyPicker();
}

export function bindEnemySearch() {
  dom.enemySearch.addEventListener("input", renderEnemyPicker);
}

export function bindToneFilter() {
  byId("enemy-tone-filter").addEventListener("click", (event) => {
    const button = event.target.closest("[data-tone]");
    if (!button || button.dataset.tone === state.enemyTone) return;
    state.enemyTone = button.dataset.tone;
    saveEnemyTone(state.enemyTone);
    renderEnemyPicker();
  });
}

// Orquestração do render: decide entre painel do draft (renderMatchup) e painel livre (renderOverview) e aplica cada snapshot do draft.
import { draftStatusTexts } from "../core/constants.js";
import { byId } from "../core/dom.js";
import { roleName } from "../core/format.js";
import { activeRole, currentEnemy, draftOwns, draftPhase, draftSig } from "../core/selectors.js";
import { state } from "../core/state.js";
import { clearMatchup, saveMatchup, setLaneChoice, setManualChampion } from "../core/storage.js";
import { buildUrl } from "../core/urls.js";
import { readOpggCounters } from "../services/opgg.js";
import { renderEnemyColumn } from "../components/enemy-column.js";
import { renderLanes, selectChampion } from "../components/hero.js";
import { renderOwnPicker } from "../components/own-picker.js";
import { championRateBadge } from "../components/rate-badge.js";
import { renderWinrates } from "../components/winrates.js";

// Sem campeão no draft: painel livre, com o inimigo escolhido na coluna Inimigos.
// Sem campeão no draft (ou com outro campeão escolhido à mão): painel livre, com o inimigo escolhido
// na coluna Inimigos.
export function renderOverview() {
  const enemy = currentEnemy();
  const opponent = enemy ? ` Adversário: ${enemy.name}${state.manualEnemy ? " (escolha manual)" : ""}.` : "";
  if (state.manualChampion && state.draft.status === "active" && state.draft.champion) {
    const name = state.draft.champion.name;
    byId("draft-status").textContent = `Exibindo ${state.selected} (escolha manual). Draft: ${name} · ${draftPhase()}`
      + ` — clique em ${name} para voltar.${opponent}`;
  } else if (state.draft.status) {
    byId("draft-status").textContent = `${draftStatusTexts[state.draft.status] ?? draftStatusTexts.unavailable}${opponent}`;
  }
  // Primeiro as consultas do campeão atual, depois as taxas da coluna Inimigos.
  renderWinrates(enemy, activeRole());
  renderEnemyColumn(enemy);
}

export function refresh() {
  byId("draft-controls").hidden = !draftOwns();
  if (draftOwns()) renderMatchup();
  else renderOverview();
  renderLanes();
}

export function renderMatchup() {
  const enemies = state.draft.enemies ?? [];
  const enemy = currentEnemy();
  const role = activeRole();
  readOpggCounters("own", state.draft.champion, role);
  const statsRole = role || state.opggCounters.own?.data?.role;
  readOpggCounters("enemy", statsRole ? enemy : null, statsRole);
  championRateBadge(byId("draft-rate"), state.opggCounters.own);
  renderOwnPicker();
  renderEnemyColumn(enemy);

  const link = byId("draft-link");
  link.href = buildUrl(state.draft.champion.id, role, enemy?.id);
  link.textContent = enemy ? `Builds e runas vs. ${enemy.name} ↗` : "Builds e runas gerais no OP.GG ↗";

  const own = `${state.draft.champion.name}${role ? ` · ${roleName(role)}` : ""} · ${draftPhase()}`;
  const matchup = enemy ? `Confronto com ${enemy.name}${state.manualEnemy ? " (escolha manual)" : ""}.`
    : !enemies.length ? "Aguardando escolhas inimigas reveladas." : "Selecione seu adversário de rota.";
  byId("draft-status").textContent = `${own}. ${matchup}`;
  renderWinrates(enemy, statsRole);
  const { archived, ...snapshot } = state.draft;
  state.savedMatchup = { snapshot, enemy: state.selectedEnemy };
  saveMatchup(state.savedMatchup);
}

export function renderDraft(snapshot) {
  if (snapshot.status !== "active" && state.savedMatchup?.snapshot?.champion) {
    snapshot = { ...state.savedMatchup.snapshot, archived: true };
  }
  if (snapshot.status !== "active" || !snapshot.champion) {
    state.selectedEnemy = null;
    if (snapshot.status === "active" && state.savedMatchup) {
      state.savedMatchup = null;
      clearMatchup();
    }
  } else if (!snapshot.enemies?.some((row) => row.id === state.selectedEnemy)) {
    state.selectedEnemy = null;
  }
  if (snapshot.in_game && !snapshot.role && state.savedMatchup?.snapshot.champion?.id === snapshot.champion?.id) {
    snapshot = { ...snapshot, role: state.savedMatchup.snapshot.role };
  }
  // Só o draft ao vivo devolve o painel ao campeão do draft; o arquivado e o F5 mantêm as escolhas.
  if (snapshot.status === "active" && !snapshot.archived) {
    const sig = draftSig(snapshot);
    if (state.manualChampion && state.manualChampion.sig !== sig) setManualChampion(null);
    if (state.laneChoice?.sig && state.laneChoice.sig !== sig) setLaneChoice(null);
  }
  if (state.manualChampion && !state.champions.some(({ id }) => id === state.manualChampion.id)) setManualChampion(null);
  const championChanged = state.draft.champion?.id !== snapshot.champion?.id;
  const roleChanged = state.draft.role !== snapshot.role;
  const pickConfirmed = snapshot.confirmed && !state.draft.confirmed;
  state.draft = snapshot;
  byId("draft-controls").hidden = !draftOwns();
  if (draftOwns()) {
    if (championChanged || roleChanged || pickConfirmed || state.selectedId !== state.draft.champion.id) {
      selectChampion(state.draft.champion.name, state.draft.champion.id);
    }
    renderMatchup();
  } else {
    state.opggCounters.enemy = null;
    const manual = state.manualChampion && state.champions.find(({ id }) => id === state.manualChampion.id);
    if (manual && state.selectedId !== manual.id) selectChampion(manual.name, manual.id);
    renderOwnPicker();
    renderOverview();
  }
  renderLanes();
}

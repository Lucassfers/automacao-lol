// Seletores derivados do estado: dono do painel (draft ou escolha manual), rota ativa, inimigo atual e taxas do OP.GG.
import { roleName } from "./format.js";
import { state } from "./state.js";

// Assinatura do campeão do draft: muda com novo pick, confirmação ou troca de rota.
export function draftSig(snapshot) {
  return snapshot.champion ? `${snapshot.champion.id}|${snapshot.role ?? ""}|${Boolean(snapshot.confirmed)}` : "";
}

// O draft manda no painel enquanto tem campeão e o usuário não escolheu outro à mão.
export function draftOwns() {
  return state.draft.status === "active" && Boolean(state.draft.champion) && !state.manualChampion;
}

// Rota exibida: a escolhida nos botões do hero ou, no draft, a do draft; "" = rota padrão do OP.GG.
export function activeRole() {
  if (draftOwns()) {
    const chosen = state.laneChoice?.champion === state.draft.champion.id && state.laneChoice.sig === draftSig(state.draft) ? state.laneChoice.role : "";
    return chosen || state.draft.role || "";
  }
  return state.laneChoice?.champion === state.selectedId ? state.laneChoice.role : "";
}

export function draftPhase() {
  return state.draft.archived ? "último confronto" : state.draft.in_game ? "em partida" : state.draft.confirmed ? "escolha confirmada" : "pré-seleção";
}

// Rotas do campeão: as do OP.GG e, sem elas, as das builds do catálogo local.
export function rolesOf({ id, name }) {
  const positions = state.championPositions[id.toLowerCase()];
  if (positions?.length) return positions;
  return [...new Set((state.catalog.get(name) ?? []).map((build) => build.role))];
}

export function championRoles(champion) {
  return rolesOf(champion).map(roleName).join(" · ");
}

// Rota padrão do campeão escolhido: a do draft, a escolhida no painel ou a principal no OP.GG.
export function ownDefaultRole() {
  if (!state.selectedId) return "";
  const main = rolesOf({ id: state.selectedId, name: state.selected })[0];
  const counters = [state.opggCounters.own, state.opggCounters.selected].find((request) => request?.champion === state.selectedId);
  return activeRole() || main || counters?.data?.role || "";
}

export function ownRoleKey() {
  return `${state.selectedId}|${activeRole()}`;
}

export function currentEnemy() {
  const enemies = state.draft.enemies ?? [];
  if (state.manualEnemy) {
    return enemies.find((row) => row.id === state.manualEnemy) ?? state.champions.find(({ id }) => id === state.manualEnemy) ?? null;
  }
  // Com campeão escolhido à mão, a rota do draft não indica o adversário dele.
  if (state.manualChampion) return enemies.find((row) => row.id === state.selectedEnemy) ?? null;
  const inferred = enemies.filter((row) => state.draft.role && row.role === state.draft.role);
  return enemies.find((row) => row.id === state.selectedEnemy) ?? (inferred.length === 1 ? inferred[0] : null);
}

export function opggStatusText(request) {
  if (!request || request.status === "loading") return "Consultando OP.GG…";
  if (request.status === "unavailable") return "Consulta ao OP.GG indisponível";
  return "Sem dados no OP.GG";
}

export function opggGeneralRate(data) {
  if (!Number.isFinite(data?.general?.rate)) return null;
  return { ...data.general, source: data.source, patch: data.patch, scope: `${roleName(data.role)} · ${data.scope}`, url: data.url };
}

export function opggRate(enemyId, queue = "ranked") {
  let data = (queue === "flex" ? state.opggCounters.ownFlex : state.opggCounters.own)?.data;
  let target = enemyId.toLowerCase();
  let entry = data?.matchups[target];
  if (!entry && queue === "ranked" && draftOwns() && state.opggCounters.enemy?.champion === enemyId) {
    data = state.opggCounters.enemy.data;
    target = state.selectedId.toLowerCase();
    const reverse = data?.matchups[target];
    if (reverse) entry = { ...reverse, rate: 1 - reverse.rate };
  }
  if (!entry) return null;
  const url = new URL(data.url);
  url.searchParams.set("target_champion", target);
  return { ...entry, source: data.source, patch: data.patch, scope: `${roleName(data.role)} · ${data.scope}`, url: url.href };
}

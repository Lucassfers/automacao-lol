// Persistência no sessionStorage: restaura as escolhas ao abrir a página e grava cada mudança.
import { roleNames } from "./constants.js";
import { state } from "./state.js";

// Lê as seis chaves rift-* na mesma ordem do carregamento original.
export function restoreSession() {
  try {
    const savedTone = sessionStorage.getItem("rift-enemy-tone");
    if (savedTone === "good" || savedTone === "bad") state.enemyTone = savedTone;
  } catch {
    // Sem armazenamento, o filtro vale só enquanto a página estiver aberta.
  }

  try {
    const saved = JSON.parse(sessionStorage.getItem("rift-winrate-tab"));
    if (saved?.tab === "general" || saved?.tab === "matchup") state.winrateTab = saved.tab;
    if (typeof saved?.auto === "string") state.matchupAutoKey = saved.auto;
  } catch {
    // Sem armazenamento, a aba vale só enquanto a página estiver aberta.
  }

  try {
    state.savedMatchup = JSON.parse(sessionStorage.getItem("rift-matchup"));
    state.selectedEnemy = state.savedMatchup?.enemy ?? null;
  } catch {
    // O painel também funciona em sessões sem armazenamento.
  }
  try {
    state.manualEnemy = parseManualEnemy(sessionStorage.getItem("rift-enemy"));
  } catch {
    // Sem armazenamento, a escolha manual vale só enquanto a página estiver aberta.
  }
  try {
    const saved = JSON.parse(sessionStorage.getItem("rift-champion"));
    if (typeof saved?.id === "string" && typeof saved.sig === "string") state.manualChampion = { id: saved.id, sig: saved.sig };
  } catch {
    // Sem armazenamento, a escolha manual vale só enquanto a página estiver aberta.
  }
  try {
    const saved = JSON.parse(sessionStorage.getItem("rift-lane"));
    if (typeof saved?.champion === "string" && Object.hasOwn(roleNames, saved.role ?? "") && typeof saved.sig === "string") {
      state.laneChoice = { champion: saved.champion, role: saved.role, sig: saved.sig };
    }
  } catch {
    // Sem armazenamento, a rota escolhida vale só enquanto a página estiver aberta.
  }
}

export function saveWinrateTab() {
  try {
    sessionStorage.setItem("rift-winrate-tab", JSON.stringify({ tab: state.winrateTab, auto: state.matchupAutoKey }));
  } catch {
    // Armazenamento indisponível.
  }
}

// Lê o inimigo manual salvo; o formato antigo (só o id) vale como escolha feita fora de draft.
export function parseManualEnemy(raw) {
  if (!raw) return null;
  let saved;
  try {
    saved = JSON.parse(raw);
  } catch {
    return { id: raw, sig: null };
  }
  if (typeof saved === "string") return saved ? { id: saved, sig: null } : null;
  if (typeof saved?.id !== "string" || !saved.id) return null;
  return { id: saved.id, sig: typeof saved.sig === "string" ? saved.sig : null };
}

export function setManualEnemy(value) {
  state.manualEnemy = value?.id ? value : null;
  storeJson("rift-enemy", state.manualEnemy);
}

export function storeJson(key, value) {
  try {
    if (value) sessionStorage.setItem(key, JSON.stringify(value));
    else sessionStorage.removeItem(key);
  } catch {
    // Armazenamento indisponível.
  }
}

export function setManualChampion(value) {
  state.manualChampion = value;
  storeJson("rift-champion", value);
}

export function setLaneChoice(value) {
  state.laneChoice = value;
  storeJson("rift-lane", value);
}

export function saveMatchup(value) {
  try {
    sessionStorage.setItem("rift-matchup", JSON.stringify(value));
  } catch {
    // O último confronto permanece disponível enquanto a aba estiver aberta.
  }
}

export function clearMatchup() {
  try { sessionStorage.removeItem("rift-matchup"); } catch { /* Armazenamento indisponível. */ }
}

export function saveEnemyTone(value) {
  try {
    sessionStorage.setItem("rift-enemy-tone", value);
  } catch {
    // Armazenamento indisponível.
  }
}

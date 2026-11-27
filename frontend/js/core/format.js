// Formatação e funções puras: porcentagens, nomes de rota, chaves de busca, tom das taxas e ordenação.
import { roleNames } from "./constants.js";

export const percent = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });
export const matchupPercent = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 2 });
export const lanePercent = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 0 });

export function roleName(role) {
  return roleNames[role] ?? role;
}

export function searchKey(value) {
  return value.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[^a-z0-9]/g, "");
}

export function rateTone(rate) {
  if (!Number.isFinite(rate) || rate === 0.5) return "";
  return rate > 0.5 ? "win" : "loss";
}

export function sameIds(first, second) {
  return Array.isArray(first) && Array.isArray(second) && first.length === second.length
    && first.every((id, index) => id === second[index]);
}

// Nome de um combo ("Lâmina de Doran + Poção de Vida ×2"): repetições seguidas viram "×N".
export function comboName(names) {
  const parts = [];
  for (const name of names) {
    const last = parts.at(-1);
    if (last?.name === name) last.count += 1;
    else parts.push({ name, count: 1 });
  }
  return parts.map(({ name, count }) => (count > 1 ? `${name} ×${count}` : name)).join(" + ");
}

// T-013: maior vitória no topo; empate → mais partidas. Amostra pequena vai depois da amostra
// suficiente (cada grupo por vitória). Ordena uma cópia, sem mexer na resposta.
export function byWinRate(entries) {
  const rate = (entry) => (Number.isFinite(entry.win_rate) ? entry.win_rate : -1);
  return [...entries].sort((a, b) => Number(Boolean(a.low_sample)) - Number(Boolean(b.low_sample))
    || rate(b) - rate(a) || (b.games ?? 0) - (a.games ?? 0));
}

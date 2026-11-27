// Rotas estimadas dos inimigos sem rota no LCU: atribuição pura pelas taxas ou pela ordem de rotas do OP.GG.

// Peso de um campeão numa rota: a taxa do OP.GG ou, sem taxas, a ordem das rotas dele (decrescente).
export function roleWeight(id, role, positions, rates) {
  const key = id.toLowerCase();
  const championRates = rates?.[key];
  if (championRates && typeof championRates === "object") {
    const rate = championRates[role];
    return Number.isFinite(rate) ? rate : 0;
  }
  const list = positions?.[key] ?? [];
  const index = list.indexOf(role);
  return index < 0 ? 0 : 1 / (index + 1);
}

// Rota de cada inimigo (id → rota). Quem tem rota no LCU fica com ela, que sai das livres; os demais
// recebem rotas distintas pela combinação de maior soma de pesos. Sem peso (sem dados), fica sem rota.
export function assignEnemyRoles(enemies, positions, rates, roles) {
  const result = new Map();
  const taken = new Set();
  for (const row of enemies) {
    if (!row.role) continue;
    result.set(row.id, row.role);
    taken.add(row.role);
  }
  const pending = enemies.filter((row) => !row.role);
  const free = roles.filter((role) => !taken.has(role));
  let best = { score: -1, picks: [] };
  const search = (index, used, score, picks) => {
    if (index === pending.length) {
      if (score > best.score) best = { score, picks: [...picks] };
      return;
    }
    const row = pending[index];
    for (const role of free) {
      if (used.has(role)) continue;
      used.add(role);
      picks.push(role);
      search(index + 1, used, score + roleWeight(row.id, role, positions, rates), picks);
      picks.pop();
      used.delete(role);
    }
    // Mais inimigos sem rota do que rotas livres: alguém fica sem rota.
    if (pending.length - index > free.length - used.size) {
      picks.push(null);
      search(index + 1, used, score, picks);
      picks.pop();
    }
  };
  search(0, new Set(), 0, []);
  best.picks.forEach((role, index) => {
    const row = pending[index];
    if (role && roleWeight(row.id, role, positions, rates) > 0) result.set(row.id, role);
  });
  return result;
}

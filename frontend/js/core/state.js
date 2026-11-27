// Estado compartilhado do painel: um único objeto mutável lido por todos os módulos (sempre como state.x).

export const state = {
  catalog: new Map(),
  champions: [],
  dragonVersion: "",
  gear: null,
  winrates: null,
  buildProfiles: {},
  selected: "",
  selectedId: "",
  draft: {},
  savedMatchup: null,
  selectedEnemy: null,
  // Inimigo escolhido à mão na coluna Inimigos: {id, sig}. sig identifica a seleção de campeões ao vivo
  // no momento do clique (null fora de draft); vale até começar outra seleção.
  manualEnemy: null,
  // Último status conclusivo do /api/draft, para notar o início de uma seleção nova.
  lastDraftStatus: "",
  // Campeão escolhido à mão na lista da esquerda enquanto há um campeão no draft: {id, sig}. Vale até o
  // draft ao vivo mudar (sig diferente) ou o usuário clicar no próprio campeão do draft.
  manualChampion: null,
  // Rota escolhida nos botões do hero: {champion, role, sig}. Vale só para aquele campeão.
  laneChoice: null,
  // Fração das partidas de cada campeão em cada rota no OP.GG (id em minúsculas → {rota: 0..1}).
  championRates: {},
  // Rotas de cada campeão no OP.GG (id em minúsculas → rotas, da principal para a menos jogada).
  championPositions: {},
  // Consultas ao OP.GG por finalidade; o objeto nunca é trocado (readOpgg compara cada slot por identidade).
  opggCounters: { own: null, enemy: null, selected: null, ownFlex: null, aram: null, build: null, matchupBuild: null },
  // Rota escolhida no filtro de cada lista; "" mostra todas.
  roleFilters: { own: "", enemy: "" },
  // Campeão e rota que definiram o filtro automático dos inimigos; muda só ao escolher outro campeão.
  enemyRoleKey: null,
  // Verdadeiro enquanto enemyRoleKey vier da abertura da página, sem escolha do usuário.
  enemyRoleFromOpening: false,
  // Aba aberta em "Maior taxa de vitória" ("general" ou "matchup") e o par campeão|inimigo que já
  // abriu a aba de confronto sozinho (abre uma vez por par; depois vale a escolha do usuário).
  winrateTab: "general",
  matchupAutoKey: null,
  // Filtro de confronto da coluna Inimigos: "all", "good" (taxa > 50%) ou "bad" (taxa < 50%).
  enemyTone: "all",
};

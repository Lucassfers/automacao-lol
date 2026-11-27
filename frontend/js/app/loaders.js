// Carga inicial dos dados: catálogo de campeões e builds, itens e taxas da Riot, e rotas do OP.GG.
import { byId, dom } from "../core/dom.js";
import { refresh } from "../core/refresh.js";
import { ownRoleKey } from "../core/selectors.js";
import { state } from "../core/state.js";
import { fetchBuildProfiles, fetchBuilds, fetchChampions, fetchGear, fetchPositions, fetchWinrates } from "../services/api.js";
import { selectChampion } from "../components/hero.js";
import { renderOwnPicker } from "../components/own-picker.js";
import { renderOverview } from "./controller.js";

export async function loadCatalog() {
  try {
    const [rosterResponse, buildsResponse, profilesResponse] = await Promise.all([
      fetchChampions(),
      fetchBuilds(),
      fetchBuildProfiles(),
    ]);
    if (!rosterResponse.ok || !buildsResponse.ok) throw new Error("Catálogo indisponível.");
    const [roster, builds] = await Promise.all([rosterResponse.json(), buildsResponse.json()]);
    if (profilesResponse.ok) state.buildProfiles = await profilesResponse.json();
    state.dragonVersion = roster.version;
    state.champions = Object.values(roster.data).sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
    for (const build of builds) {
      if (!state.catalog.has(build.champion)) state.catalog.set(build.champion, []);
      state.catalog.get(build.champion).push(build);
    }
    if (!state.champions.length) {
      dom.loading.textContent = "O catálogo ainda não tem campeões cadastrados.";
      return;
    }
    const firstChampion = state.champions.find(({ name }) => state.catalog.has(name)) ?? state.champions[0];
    selectChampion(firstChampion.name, firstChampion.id);
    // O campeão inicial não foi escolhido pelo usuário: a lista de inimigos abre sem filtro.
    state.enemyRoleKey = ownRoleKey();
    state.enemyRoleFromOpening = true;
    renderOwnPicker();
    renderOverview();
    byId("catalog").hidden = false;
    dom.loading.hidden = true;
  } catch {
    dom.loading.textContent = "Não foi possível carregar o catálogo. Recarregue a página para tentar novamente.";
  }
}

export async function loadWinrates() {
  const results = await Promise.allSettled(
    [fetchGear, fetchWinrates].map(async (request) => {
      const response = await request();
      return response.ok ? response.json() : null;
    }),
  );
  state.gear = results[0].value ?? null;
  state.winrates = results[1].value ?? null;
  refresh();
}

export async function loadPositions() {
  try {
    const response = await fetchPositions();
    if (!response.ok) return;
    const data = await response.json();
    if (!data?.positions || typeof data.positions !== "object") return;
    state.championPositions = data.positions;
    state.championRates = data.rates && typeof data.rates === "object" ? data.rates : {};
  } catch {
    // Sem as rotas do OP.GG, as listas usam as rotas do catálogo local.
    return;
  }
  renderOwnPicker();
  refresh();
}

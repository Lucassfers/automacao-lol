// Coluna da esquerda: lista dos seus campeões, com a taxa "vs. inimigo" do draft e a escolha manual.
import { byId, dom } from "../core/dom.js";
import { matchupPercent } from "../core/format.js";
import { refresh } from "../core/refresh.js";
import { draftOwns, draftSig, opggRate } from "../core/selectors.js";
import { state } from "../core/state.js";
import { setManualChampion } from "../core/storage.js";
import { readOpggCounters } from "../services/opgg.js";
import { renderChampionPicker } from "./champion-picker.js";
import { selectChampion } from "./hero.js";

export function renderOwnPicker() {
  renderChampionPicker({
    list: dom.championList,
    input: dom.search,
    count: byId("champion-count"),
    empty: byId("search-empty"),
    role: state.roleFilters.own,
    isPressed: ({ name }) => name === state.selected,
    rateText: ({ id }) => {
      const matchupRate = state.opggCounters.enemy?.data?.matchups[id.toLowerCase()];
      const ownRate = draftOwns() && id === state.draft.champion.id && state.opggCounters.enemy && opggRate(state.opggCounters.enemy.champion);
      if (!ownRate && !matchupRate) return null;
      return { text: `${matchupPercent.format(ownRate?.rate ?? 1 - matchupRate.rate)} vs. ${state.opggCounters.enemy.name}` };
    },
    onPick: ({ id, name }, button) => {
      // Com campeão no draft, clicar em outro campeão é uma escolha manual; clicar no do draft volta a ele.
      if (state.draft.status === "active" && state.draft.champion) {
        if (id === state.draft.champion.id) {
          setManualChampion(null);
        } else if (state.manualChampion?.id !== id) {
          setManualChampion({ id, sig: draftSig(state.draft) });
          readOpggCounters("enemy", null);
        }
      }
      if (state.selected === name) {
        // Clicar no campeão inicial também é uma escolha: aplica o filtro dos inimigos.
        if (state.enemyRoleFromOpening) state.enemyRoleKey = null;
      } else {
        dom.championList.querySelector('[aria-pressed="true"]')?.setAttribute("aria-pressed", "false");
        button.setAttribute("aria-pressed", "true");
        selectChampion(name, id);
      }
      refresh();
      // Fora do draft, as taxas "vs. inimigo" do draft saem da lista (no draft, renderMatchup já a refaz).
      if (!draftOwns()) renderOwnPicker();
    },
  });
}

export function bindOwnSearch() {
  dom.search.addEventListener("input", renderOwnPicker);
}

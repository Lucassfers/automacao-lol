// Filtros de rota das duas listas: estado dos botões e cliques (as listas chegam por parâmetro, sem ciclo de import).
import { byId } from "../core/dom.js";
import { ownRoleKey } from "../core/selectors.js";
import { state } from "../core/state.js";

export function renderRoleFilter(side) {
  for (const button of byId(`${side}-role-filter`).querySelectorAll("[data-role]")) {
    button.setAttribute("aria-pressed", String(button.dataset.role === state.roleFilters[side]));
  }
}

export function bindRoleFilters({ own, enemy }) {
  for (const side of ["own", "enemy"]) {
    byId(`${side}-role-filter`).addEventListener("click", (event) => {
      const button = event.target.closest("[data-role]");
      if (!button) return;
      state.roleFilters[side] = state.roleFilters[side] === button.dataset.role ? "" : button.dataset.role;
      // A escolha manual vale até o usuário escolher outro campeão.
      if (side === "enemy") {
        state.enemyRoleKey = ownRoleKey();
        state.enemyRoleFromOpening = false;
      }
      renderRoleFilter(side);
      if (side === "own") own();
      else enemy();
    });
  }
}

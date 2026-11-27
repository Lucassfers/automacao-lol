// Destaque do campeão escolhido: nome, arte, taxa de vitória e botões de rota.
import { championTitles, roleNames } from "../core/constants.js";
import { byId, dom, element } from "../core/dom.js";
import { lanePercent, roleName } from "../core/format.js";
import { refresh } from "../core/refresh.js";
import { activeRole, draftOwns, draftSig, rolesOf } from "../core/selectors.js";
import { state } from "../core/state.js";
import { setLaneChoice } from "../core/storage.js";
import { readOpggCounters } from "../services/opgg.js";
import { championRateBadge } from "./rate-badge.js";

// Botões de rota do hero: um por rota do campeão no OP.GG, com a fração das partidas nela.
export function renderLanes() {
  const box = byId("champion-roles");
  if (!state.selectedId) {
    box.replaceChildren();
    return;
  }
  const focused = box.contains(document.activeElement) ? document.activeElement.dataset.role : null;
  const roles = rolesOf({ id: state.selectedId, name: state.selected }).filter((role) => Object.hasOwn(roleNames, role));
  const fromDraft = draftOwns() ? state.draft.role : "";
  if (Object.hasOwn(roleNames, fromDraft ?? "") && !roles.includes(fromDraft)) roles.push(fromDraft);
  const rates = state.championRates[state.selectedId.toLowerCase()] ?? {};
  const counters = [state.opggCounters.own, state.opggCounters.selected].find((request) => request?.champion === state.selectedId);
  const active = activeRole() || counters?.data?.role || roles[0];
  const buttons = roles.map((role) => {
    const button = element("button", "");
    button.type = "button";
    button.dataset.role = role;
    button.setAttribute("aria-pressed", String(role === active));
    const rate = rates[role];
    button.title = role === fromDraft ? "Rota do draft" : `Ver build e runas de ${state.selected} no ${roleName(role)}`;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", `#role-${role}`);
    svg.append(use);
    button.append(svg, element("span", "lane-name", roleName(role)),
      element("span", "lane-rate", Number.isFinite(rate) ? lanePercent.format(rate) : "—"));
    button.addEventListener("click", () => {
      setLaneChoice({ champion: state.selectedId, role, sig: draftOwns() ? draftSig(state.draft) : "" });
      refresh();
    });
    return button;
  });
  box.replaceChildren(...buttons);
  buttons.find((button) => button.dataset.role === focused)?.focus();
}

export function renderSelectedRate() {
  if (!state.selectedId) return;
  let request = state.opggCounters.own;
  if (request?.champion === state.selectedId) {
    readOpggCounters("selected", null);
  } else {
    const champion = state.champions.find(({ id }) => id === state.selectedId) ?? { id: state.selectedId, name: state.selected };
    readOpggCounters("selected", champion, "");
    request = state.opggCounters.selected;
  }
  championRateBadge(byId("champion-rate"), request);
}

export function selectChampion(champion, championId = champion) {
  state.selected = champion;
  state.selectedId = championId;
  byId("champion-name").textContent = champion;
  byId("champion-title").textContent = championTitles[championId] ?? "";
  dom.art.hidden = false;
  dom.art.dataset.fallback = `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${encodeURIComponent(championId)}_0.jpg`;
  const localArt = Object.hasOwn(championTitles, championId) || championId === "Riven";
  dom.art.src = localArt ? `/assets/${encodeURIComponent(championId)}-splash.jpg` : dom.art.dataset.fallback;
  renderLanes();
}

export function bindHeroArt() {
  dom.art.addEventListener("error", () => {
    const fallback = dom.art.dataset.fallback;
    if (fallback && dom.art.src !== fallback) dom.art.src = fallback;
    else dom.art.hidden = true;
  });
}

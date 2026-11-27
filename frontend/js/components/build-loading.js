// Esqueleto animado exibido no lugar de runas e itens enquanto o OP.GG responde.
import { element } from "../core/dom.js";
import { buildSplit } from "./gear.js";

// T-013: enquanto o OP.GG responde, um esqueleto no lugar de runas e itens (nada de referência).
export const SKELETON_CYCLE_MS = 1400;
export function opggBuildLoading() {
  const box = element("div", "build-loading");
  box.setAttribute("role", "status");
  box.setAttribute("aria-live", "polite");
  box.setAttribute("aria-busy", "true");
  // O poll refaz o painel a cada 2s; o atraso negativo mantém o brilho contínuo entre renders.
  box.style.setProperty("--skeleton-delay", `-${Math.round(performance.now() % SKELETON_CYCLE_MS)}ms`);
  const label = element("p", "build-loading-label");
  label.append(element("span", "build-loading-dot"), "Carregando build e runas do OP.GG…");
  const bar = (className) => element("span", `skeleton ${className}`);
  const items = element("div", "skeleton-stack");
  items.append(bar("skeleton-line is-short"));
  const top = element("div", "build-top");
  for (let index = 0; index < 2; index += 1) {
    const group = element("div", "skeleton-stack");
    group.append(bar("skeleton-line is-title"), bar("skeleton-block"), bar("skeleton-block"));
    top.append(group);
  }
  items.append(top, bar("skeleton-block is-core"), bar("skeleton-line is-title"), bar("skeleton-block"));
  const runes = element("div", "skeleton-stack");
  runes.append(bar("skeleton-line is-title"), bar("skeleton-block is-tab"));
  const circles = element("div", "skeleton-runes");
  for (let index = 0; index < 12; index += 1) circles.append(bar("skeleton-circle"));
  runes.append(circles);
  const split = buildSplit([runes], [items]);
  split.setAttribute("aria-hidden", "true");
  box.append(label, split);
  return box;
}

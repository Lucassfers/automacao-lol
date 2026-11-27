// Painel de runas do OP.GG: abas das páginas de runas e a grade com as árvores e fragmentos.
import { shards } from "../core/constants.js";
import { element, icon } from "../core/dom.js";
import { matchupPercent, percent, rateTone } from "../core/format.js";
import { state } from "../core/state.js";
import { optionStats } from "./gear.js";
import { revealTab, runeCarousel } from "./rune-carousel.js";

// Página de runas aberta em cada consulta, pela chave da requisição ao OP.GG.
const runeTabs = new Map();
let runePanelCount = 0;

export function runeInfo(id) {
  if (shards[id]) return { name: shards[id], src: `/assets/shard-${id}.png` };
  const asset = state.gear?.runes?.[id];
  return {
    name: asset?.name ?? `Runa ${id}`,
    src: asset ? `https://ddragon.leagueoflegends.com/cdn/img/${asset.icon}` : "",
  };
}

export function runeIcon(id, className = "rune-icon") {
  const { name, src } = runeInfo(id);
  const frame = icon(name[0], src);
  frame.classList.add(className);
  frame.title = name;
  return frame;
}

export function runeCell(cell, selected) {
  const { name } = runeInfo(cell.id);
  const node = element("div", `rune-cell${selected ? " is-selected" : ""}`);
  node.title = name;
  const win = element("strong", "", matchupPercent.format(cell.win_rate));
  win.dataset.tone = cell.games > 0 ? rateTone(cell.win_rate) : "";
  node.append(
    runeIcon(cell.id),
    element("span", "visually-hidden", `${name}${selected ? " (escolhida)" : ""}: vitória`),
    win,
    element("span", "", `${percent.format(cell.pick_rate)} esc.`),
    element("span", "", `${cell.games.toLocaleString("pt-BR")} part.`),
  );
  return node;
}

export function runeTree(title, styleId, rows, isSelected) {
  const column = element("div", "rune-tree");
  const heading = element("h5", "rune-tree-title");
  if (styleId) heading.append(runeIcon(styleId, "rune-style"));
  heading.append(title);
  column.append(heading);
  rows.forEach((row, index) => {
    const line = element("div", "rune-row");
    line.append(...row.map((cell) => runeCell(cell, isSelected(cell, index))));
    column.append(line);
  });
  return column;
}

export function runeGrid(runes, page) {
  const chosen = new Set(page.perks.slice(0, 6));
  const shardIds = page.perks.slice(6);
  const trees = runes.trees[page.primary] && runes.trees[page.secondary];
  if (!trees) return [element("p", "empty", "Árvores de runas indisponíveis.")];
  const primary = runeTree(runeInfo(page.primary).name, page.primary, runes.trees[page.primary].primary,
    (cell) => chosen.has(cell.id));
  const side = element("div", "rune-side");
  side.append(
    runeTree(runeInfo(page.secondary).name, page.secondary, runes.trees[page.secondary].secondary,
      (cell) => chosen.has(cell.id)),
    // O mesmo fragmento (ex.: 5008) pode aparecer em linhas diferentes; o destaque é por linha.
    runeTree("Fragmentos", null, runes.shards, (cell, index) => cell.id === shardIds[index]),
  );
  const variant = element("p", "rune-variant", "Combinação destacada: ");
  variant.append(...optionStats(page.variant).childNodes);
  const grid = element("div", "rune-grid");
  grid.append(primary, side);
  return [variant, grid];
}

export function runePanel(request) {
  const { runes } = request.data;
  const panel = element("section", "rune-panel");
  const prefix = `rune-panel-${++runePanelCount}`;
  const head = element("div", "rune-head");
  head.append(element("h4", "", "Runas"));
  const tabs = element("div", "rune-tabs");
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", "Páginas de runas");
  const body = element("div", "rune-body");
  body.id = `${prefix}-body`;
  body.setAttribute("role", "tabpanel");
  let current = runeTabs.get(request.key) ?? runes.selected;
  if (!runes.pages[current]) current = 0;

  const buttons = runes.pages.map((page, index) => {
    const tab = element("button", "rune-tab");
    tab.type = "button";
    tab.id = `${prefix}-tab-${index}`;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", body.id);
    tab.dataset.runeTab = `${request.key}#${index}`;
    const names = [page.keystone, page.primary, page.secondary].map((id) => runeInfo(id).name);
    const icons = element("span", "rune-tab-icons");
    icons.append(runeIcon(page.keystone, "rune-keystone"), runeIcon(page.primary, "rune-style"),
      runeIcon(page.secondary, "rune-style"));
    const label = element("span", "rune-tab-label", `${names[0]} · ${names[1]} + ${names[2]}`);
    const win = element("strong", "", `${matchupPercent.format(page.win_rate)} vitória`);
    win.dataset.tone = rateTone(page.win_rate);
    const stats = element("span", "rune-tab-stats");
    stats.append(win, element("span", "",
      `${percent.format(page.pick_rate)} escolha · ${page.games.toLocaleString("pt-BR")} partidas`));
    tab.append(icons, label, stats);
    if (index === runes.selected) tab.append(element("span", "rune-best", "Maior vitória"));
    tab.addEventListener("click", () => {
      select(index);
      revealTab(tabs, tab);
    });
    tab.addEventListener("focus", () => revealTab(tabs, tab));
    tab.addEventListener("keydown", (event) => {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
      const target = event.key === "Home" ? 0 : event.key === "End" ? runes.pages.length - 1
        : step ? (index + step + runes.pages.length) % runes.pages.length : null;
      if (target === null) return;
      event.preventDefault();
      select(target);
      buttons[target].focus();
    });
    return tab;
  });

  function select(index) {
    current = index;
    runeTabs.set(request.key, index);
    buttons.forEach((tab, position) => {
      tab.setAttribute("aria-selected", String(position === index));
      tab.tabIndex = position === index ? 0 : -1;
    });
    body.setAttribute("aria-labelledby", buttons[index].id);
    body.replaceChildren(...runeGrid(runes, runes.pages[index]));
  }

  tabs.append(...buttons);
  panel.append(runeCarousel(head, tabs, buttons, request.key, () => buttons[current]), body);
  select(current);
  return panel;
}

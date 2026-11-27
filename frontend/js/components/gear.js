// Blocos de itens e feitiços: linhas de ícones, listas de opções com taxas e o layout itens × runas.
import { shards } from "../core/constants.js";
import { element, icon } from "../core/dom.js";
import { comboName, matchupPercent, percent, rateTone, sameIds } from "../core/format.js";
import { state } from "../core/state.js";

export function optionStats(option, className = "rune-stat") {
  const line = element("p", className);
  const win = element("strong", "", `${matchupPercent.format(option.win_rate)} vitória`);
  win.dataset.tone = rateTone(option.win_rate);
  line.append(win, ` · ${percent.format(option.pick_rate)} escolha · ${option.games.toLocaleString("pt-BR")} partidas`);
  if (option.low_sample) line.append(element("span", "rune-warning", " · amostra pequena"));
  return line;
}

export function gearRow(title, entries, category, option) {
  const group = element("div", "gear-group");
  group.append(element("h4", "", title));
  if (option) group.append(optionStats(option));
  if (!entries.length) {
    group.append(element("p", "empty", "Indisponível."));
    return group;
  }
  const list = element("ul", "items gear-items");
  for (const entry of entries) {
    const { name, image } = gearAsset(entry, category);
    const item = element("li", "");
    item.append(icon(name[0], image), element("span", "", name));
    list.append(item);
  }
  group.append(list);
  return group;
}

export function gearAsset(entry, category) {
  const id = entry?.id ?? entry;
  const asset = state.gear?.[category]?.[id];
  const name = asset?.name ?? entry?.name ?? (category === "shards" ? shards[id] : null)
    ?? (typeof entry === "string" ? entry : `ID ${id}`);
  let image;
  if (category === "shards" && shards[id]) {
    image = `/assets/shard-${id}.png`;
  } else if (asset) {
    const base = "https://ddragon.leagueoflegends.com/cdn";
    image = category === "runes" ? `${base}/img/${asset.icon}`
      : `${base}/${state.gear.version}/img/${category === "items" ? "item" : "spell"}/${asset.icon}`;
  }
  return { name, image };
}

// Lista de opções (itens, combos de itens ou feitiços), cada uma com vitória, escolha (se houver) e partidas.
// Opções com mais de um id (iniciais, builds principais, feitiços) mostram todos os ícones.
export function gearOptions(title, options, chosen = null, category = "items") {
  const group = element("div", "gear-group gear-options-group");
  group.append(element("h4", "", title));
  if (!options?.length) {
    group.append(element("p", "empty", "Indisponível."));
    return group;
  }
  const list = element("ul", "gear-options");
  for (const option of options) {
    const assets = option.ids.map((id) => gearAsset(id, category));
    const name = comboName(assets.map((asset) => asset.name));
    const isChosen = Boolean(chosen && sameIds(option.ids, chosen.ids));
    const item = element("li", [isChosen && "is-chosen", assets.length > 1 && "is-combo"].filter(Boolean).join(" "));
    const text = element("div", "gear-option-text");
    const label = element("span", "gear-option-name", name);
    if (isChosen) label.append(element("span", "rune-best", "Na build"));
    const stats = element("span", "gear-option-stats");
    const win = element("strong", "", `${matchupPercent.format(option.win_rate)} vitória`);
    win.dataset.tone = rateTone(option.win_rate);
    const pick = Number.isFinite(option.pick_rate) ? ` · ${percent.format(option.pick_rate)} esc.` : "";
    stats.append(win, `${pick} · ${option.games.toLocaleString("pt-BR")} part.`);
    if (option.low_sample) stats.append(element("span", "rune-warning", " · amostra pequena"));
    text.append(label, stats);
    if (assets.length > 1) {
      const icons = element("span", "combo-icons");
      icons.append(...assets.map((asset) => icon(asset.name[0], asset.image)));
      item.append(icons, text);
    } else {
      item.append(icon(name[0], assets[0]?.image), text);
    }
    list.append(item);
  }
  group.append(list);
  return group;
}

// Itens à esquerda e runas à direita; abaixo de ~820px de cartão vira uma coluna (itens acima).
export function buildSplit(runes, items) {
  const split = element("div", "build-split");
  const runeColumn = element("div", "build-runes");
  runeColumn.append(...runes);
  const itemColumn = element("div", "build-items");
  itemColumn.append(...items);
  split.append(itemColumn, runeColumn);
  return split;
}

export function coreRow(title, ids, option, best = true) {
  const row = gearRow(title, ids, "items", option);
  row.classList.add("gear-core");
  // O selo só vale para dados do OP.GG; a referência local não tem taxa de vitória.
  if (best && ids.length) row.querySelector("h4").append(element("span", "rune-best", "Maior vitória"));
  return row;
}

// T-013: primeira linha da coluna de itens (itens iniciais + feitiços), lado a lado quando cabe.
export function buildTop(groups) {
  const top = element("div", "build-top");
  top.append(...groups);
  return top;
}

// Cartão de uma aba de "Maior taxa de vitória": métricas, build do OP.GG ou referência local do catálogo.
import { element } from "../core/dom.js";
import { matchupPercent, percent } from "../core/format.js";
import { opggBuildLoading } from "./build-loading.js";
import { buildSplit, buildTop, coreRow, gearRow } from "./gear.js";
import { opggBuildPanel } from "./opgg-build-panel.js";

export function winrateMetric(label, entry, empty = "Sem amostra") {
  const metric = element("div", "winrate-metric");
  metric.append(element("dt", "", label));
  const value = element("dd", "");
  if (Number.isFinite(entry?.rate) || entry?.games > 0) {
    value.append(
      element("strong", "winrate-value", (entry.source === "OP.GG" ? matchupPercent : percent).format(entry.rate ?? entry.wins / entry.games)),
    );
    if (entry.games > 0) {
      value.append(element("span", "winrate-sample", entry.wins === undefined
        ? `${entry.games.toLocaleString("pt-BR")} partidas`
        : `${entry.wins} vitórias em ${entry.games} partidas`));
    }
    if (entry.source) {
      const source = element("a", "winrate-sample", `${entry.source} · patch ${entry.patch} · ${entry.scope}`);
      source.href = entry.url;
      source.target = "_blank";
      source.rel = "noopener noreferrer";
      value.append(source);
    }
  } else {
    value.append(element("span", "winrate-sample", empty));
  }
  metric.append(value);
  return metric;
}

export function opggBuildNote(request) {
  if (!request) return null;
  if (request.status === "no-data") return "Build e runas não publicadas no OP.GG. Exibindo a referência.";
  return "Build e runas do OP.GG indisponíveis no momento. Exibindo a referência.";
}

export function winratePanel(title, result, noData, url, rates, opgg = null) {
  const card = element("article", "build-card");
  // O título visível é o da aba; o h3 fica para leitores de tela.
  card.append(element("h3", "visually-hidden", title));
  const ready = opgg?.status === "ready" && opgg.data?.build && opgg.data?.runes;
  if (url || ready) {
    const link = element("a", "draft-link catalog-link", "Itens e runas no OP.GG ↗");
    link.href = ready ? opgg.data.url : url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    card.append(link);
  }
  const metrics = element("dl", "winrate-metrics");
  metrics.append(...rates.map(([label, entry, empty]) => winrateMetric(label, entry, empty)));
  card.append(metrics);
  if (ready) {
    opggBuildPanel(card, opgg);
    return card;
  }
  if (opgg?.status === "loading") {
    card.append(opggBuildLoading());
    return card;
  }
  const note = opggBuildNote(opgg);
  if (note) {
    card.append(element("p", "opgg-note", note));
  }
  if (!result?.build && !result?.runes) {
    card.append(element("p", "empty", noData));
    return card;
  }
  const { build, runes } = result;
  if (result.reference) {
    card.append(element("p", "", "Build de referência do catálogo, sem taxas de itens e runas."));
    if (result.note) card.append(element("p", "", result.note));
  }
  const items = [];
  if (build) {
    const itemLabel = build.ids.length === 6 ? "Build de seis itens" : `Build parcial · ${build.ids.length} itens`;
    items.push(element("p", "build-rate", itemLabel));
    const top = [];
    if (build.starting?.length) top.push(gearRow("Itens iniciais", build.starting, "items"));
    if (build.spells?.length) top.push(gearRow("Feitiços de invocador", build.spells, "spells"));
    if (top.length) items.push(buildTop(top));
    items.push(coreRow("Inventário final", build.ids, undefined, false));
    if (build.purchase_order?.length) items.push(gearRow("Ordem de compra registrada", build.purchase_order, "items"));
    if (build.skills?.length) {
      const skills = element("ol", "skill-order");
      build.skills.forEach((skill) => skills.append(element("li", "", skill)));
      items.push(element("h4", "skill-title", "Ordem das habilidades"), skills);
    } else if (!result.reference && !build.starting && !build.purchase_order) {
      items.push(element("p", "empty", "Importe a linha do tempo para ver itens iniciais, ordem de compra e habilidades."));
    }
    items.push(element("p", "opgg-note", "Situacionais e opções de botas exigem dados do OP.GG."));
  } else {
    items.push(element("p", "empty", "Itens: amostra insuficiente."));
  }
  const runeColumn = [];
  if (runes) {
    runeColumn.push(gearRow("Runas", runes.ids, "runes"));
    if (runes.shards?.some(Boolean)) {
      runeColumn.push(gearRow("Fragmentos", runes.shards.filter(Boolean), "shards"));
    }
  } else {
    runeColumn.push(element("p", "empty", "Runas: amostra insuficiente."));
  }
  card.append(buildSplit(runeColumn, items));
  return card;
}

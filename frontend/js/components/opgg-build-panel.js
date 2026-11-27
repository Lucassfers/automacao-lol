// Build completa do OP.GG dentro do cartão: runas, itens iniciais, feitiços, itens principais, botas e extras.
import { element } from "../core/dom.js";
import { buildExtras } from "./build-extras.js";
import { buildSplit, buildTop, coreRow, gearOptions } from "./gear.js";
import { runePanel } from "./rune-panel.js";

export function opggBuildPanel(card, request) {
  const { build, patch, options } = request.data;
  const boots = options?.boots ?? (build.boots ? [build.boots] : []);
  const starting = options?.starting ?? (build.starting ? [build.starting] : []);
  // Feitiços ao lado dos itens iniciais; só a build geral (com extras) traz feitiços.
  const top = [gearOptions("Itens iniciais", starting, build.starting)];
  if (request.data.extras) top.push(gearOptions("Feitiços de invocador", request.data.extras.spells ?? [], null, "spells"));
  card.append(buildSplit([runePanel(request)], [
    element("p", "build-rate", `Build de maior taxa de vitória · patch ${patch}`),
    buildTop(top),
    coreRow("Itens principais", build.core?.ids ?? [], build.core),
    gearOptions("Botas", boots, build.boots),
    gearOptions("Itens situacionais", options?.situational ?? []),
  ]));
  // Só a build geral (sem adversário) traz os extras da página /build.
  if (request.data.extras) card.append(buildExtras(request.data));
}

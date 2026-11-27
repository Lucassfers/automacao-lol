// Bloco extra da aba Geral: rotas da selva, ordem de habilidades, builds principais e 4º–6º itens.
import { element } from "../core/dom.js";
import { byWinRate } from "../core/format.js";
import { gearOptions } from "./gear.js";
import { jungleRoutes } from "./jungle-routes.js";
import { skillOrder } from "./skill-order.js";

// Bloco extra da aba Geral (página /build do OP.GG): cada parte que faltar mostra "Indisponível.".
export function buildExtras(data) {
  const { extras, options, build, role } = data;
  const section = element("section", "build-extras");
  if (role === "jungle") section.append(jungleRoutes("Rotas da selva", extras.jungle));
  // T-013: os feitiços subiram para junto dos itens iniciais (opggBuildPanel).
  section.append(skillOrder("Ordem de habilidades", extras.skills),
    gearOptions("Builds principais", options?.core ?? (build.core ? [build.core] : []), build.core));
  const depth = element("div", "depth-grid");
  for (const [key, label] of [["4", "Quarto item"], ["5", "Quinto item"], ["6", "Sexto item"]]) {
    const entries = extras.depth?.[key]?.map((entry) => ({ ...entry, ids: [entry.id] })) ?? [];
    depth.append(gearOptions(label, byWinRate(entries)));
  }
  section.append(depth);
  return section;
}

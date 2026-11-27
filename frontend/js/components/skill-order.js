// Ordem de habilidades do OP.GG: prioridade de evolução e a habilidade de cada nível.
import { element, icon } from "../core/dom.js";
import { state } from "../core/state.js";
import { optionStats } from "./gear.js";

// Ordem de habilidades: prioridade de evolução (Q › W › E) e os 15 primeiros níveis, com o R destacado.
export function skillOrder(title, skills) {
  const group = element("div", "gear-group skill-group");
  group.append(element("h4", "", title));
  if (!skills) {
    group.append(element("p", "empty", "Indisponível."));
    return group;
  }
  const priority = element("ol", "skill-priority");
  priority.setAttribute("aria-label", `Prioridade: ${skills.priority.join(", ")}`);
  skills.priority.forEach((key, index) => {
    const file = skills.icons?.[key];
    const valid = typeof file === "string" && /^[A-Za-z0-9_]{1,64}\.png$/.test(file) && state.gear?.version;
    const step = element("li", "");
    const frame = icon("", valid ? `https://ddragon.leagueoflegends.com/cdn/${state.gear.version}/img/spell/${file}` : "");
    frame.append(element("span", "skill-key", key));
    step.append(frame);
    if (index < skills.priority.length - 1) {
      const arrow = element("span", "skill-arrow", "›");
      arrow.setAttribute("aria-hidden", "true");
      step.append(arrow);
    }
    priority.append(step);
  });
  const levels = element("ol", "skill-levels");
  levels.setAttribute("aria-label", "Habilidade em cada nível");
  skills.order.forEach((key, index) => {
    const level = element("li", "");
    level.dataset.skill = key;
    level.append(element("span", "visually-hidden", `Nv ${index + 1}: `), key);
    levels.append(level);
  });
  group.append(priority, levels, optionStats(skills));
  return group;
}

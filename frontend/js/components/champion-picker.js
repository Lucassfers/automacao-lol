// Lista genérica de campeões (busca, filtro de rota, ordem e taxa) usada nas colunas da esquerda e da direita.
import { element, icon } from "../core/dom.js";
import { searchKey } from "../core/format.js";
import { championRoles, rolesOf } from "../core/selectors.js";
import { state } from "../core/state.js";
import { portraitUrl } from "../core/urls.js";

// Linha de campeão usada nas listas lateral esquerda e direita.
export function championButton({ id, name }, { pressed, detail, rate, title }) {
  const button = element("button", "champion-button");
  button.type = "button";
  button.dataset.champion = id;
  button.setAttribute("aria-pressed", String(pressed));
  if (title) button.title = title;
  const info = element("span", "");
  info.append(element("strong", "", name));
  if (detail) info.append(element("small", "", detail));
  if (rate) {
    const badge = element("small", "matchup-rate", rate.text);
    if (rate.tone !== undefined) badge.dataset.tone = rate.tone;
    info.append(badge);
  }
  const chevron = element("span", "chevron", "›");
  chevron.setAttribute("aria-hidden", "true");
  button.append(icon(name[0], portraitUrl(id)), info, chevron);
  return button;
}

export function renderChampionPicker({ list, input, count, empty, emptyText, role, accept, order, isPressed, onPick, rateText, title }) {
  const query = searchKey(input.value);
  const focused = list.contains(document.activeElement) ? document.activeElement.dataset.champion : null;
  const buttons = [];
  const visible = state.champions.filter((champion) => {
    const { id, name } = champion;
    if (!searchKey(name).includes(query) && !searchKey(id).includes(query)) return false;
    if (role && !rolesOf(champion).includes(role)) return false;
    return !accept || accept(champion);
  });
  if (order) visible.sort(order);
  for (const champion of visible) {
    const pressed = isPressed(champion);
    const button = championButton(champion, {
      pressed,
      detail: championRoles(champion),
      rate: rateText?.(champion),
      title: title?.(champion, pressed),
    });
    button.addEventListener("click", () => onPick(champion, button));
    buttons.push(button);
  }
  list.replaceChildren(...buttons);
  buttons.find((button) => button.dataset.champion === focused)?.focus();
  if (count) count.textContent = buttons.length;
  empty.textContent = emptyText ?? "Nenhum campeão encontrado.";
  empty.hidden = buttons.length > 0;
}

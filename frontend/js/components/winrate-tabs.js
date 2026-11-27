// Abas "Geral" e "vs inimigo" de "Maior taxa de vitória", com navegação por teclado e aba salva na sessão.
import { element } from "../core/dom.js";
import { state } from "../core/state.js";
import { saveWinrateTab } from "../core/storage.js";

// Abas "Campeão · Geral" e "Campeão vs inimigo": trocam só o hidden, sem refazer o painel.
export function winrateTabs(panels, active) {
  const wrapper = element("div", "winrate-tabbed");
  const tablist = element("div", "winrate-tabs");
  tablist.setAttribute("role", "tablist");
  tablist.setAttribute("aria-label", "Recorte da build");
  const hint = element("p", "winrate-tab-hint", "Selecione um adversário na coluna Inimigos.");
  hint.id = "winrate-tab-hint";
  const buttons = panels.map(({ key, label, disabled }) => {
    const tab = element("button", "winrate-tab", label);
    tab.type = "button";
    tab.id = `winrate-tab-${key}`;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", `winrate-panel-${key}`);
    tab.dataset.winrateTab = key;
    if (disabled) {
      tab.setAttribute("aria-disabled", "true");
      tab.setAttribute("aria-describedby", hint.id);
      tab.title = hint.textContent;
    }
    return tab;
  });
  const bodies = panels.map(({ key, card }) => {
    card.id = `winrate-panel-${key}`;
    card.setAttribute("role", "tabpanel");
    card.setAttribute("aria-labelledby", `winrate-tab-${key}`);
    return card;
  });
  const enabled = panels.map((panel, index) => (panel.disabled ? null : index)).filter((index) => index !== null);

  function select(index, save) {
    buttons.forEach((tab, position) => {
      tab.setAttribute("aria-selected", String(position === index));
      tab.tabIndex = position === index ? 0 : -1;
      bodies[position].hidden = position !== index;
    });
    if (save) {
      state.winrateTab = panels[index].key;
      saveWinrateTab();
    }
  }

  buttons.forEach((tab, index) => {
    tab.addEventListener("click", () => {
      if (!panels[index].disabled) select(index, true);
    });
    tab.addEventListener("keydown", (event) => {
      const at = enabled.indexOf(index);
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
      const next = event.key === "Home" ? enabled[0] : event.key === "End" ? enabled[enabled.length - 1]
        : step && at >= 0 ? enabled[(at + step + enabled.length) % enabled.length] : null;
      if (next === null || next === undefined) return;
      event.preventDefault();
      select(next, true);
      buttons[next].focus();
    });
  });

  tablist.append(...buttons);
  const bar = element("div", "winrate-tabs-bar");
  bar.append(tablist);
  if (panels.some(({ disabled }) => disabled)) bar.append(hint);
  wrapper.append(bar, ...bodies);
  const current = panels.findIndex(({ key, disabled }) => key === active && !disabled);
  select(current >= 0 ? current : enabled[0] ?? 0, false);
  return wrapper;
}

// Seção "Maior taxa de vitória": dispara as consultas ao OP.GG do campeão atual e monta as abas Geral e Confronto.
import { roleNames } from "../core/constants.js";
import { byId } from "../core/dom.js";
import { roleName } from "../core/format.js";
import { referenceByClass } from "../core/reference-build.js";
import { activeRole, draftOwns, opggGeneralRate, opggRate, opggStatusText } from "../core/selectors.js";
import { state } from "../core/state.js";
import { saveWinrateTab } from "../core/storage.js";
import { buildUrl } from "../core/urls.js";
import { readOpgg, readOpggCounters } from "../services/opgg.js";
import { renderSelectedRate } from "./hero.js";
import { winratePanel } from "./winrate-panel.js";
import { winrateTabs } from "./winrate-tabs.js";

export function renderWinrates(enemy, role) {
  const champion = draftOwns()
    ? state.champions.find(({ id }) => id === state.draft.champion.id) ?? state.draft.champion
    : state.champions.find(({ name }) => name === state.selected);
  if (!draftOwns()) readOpggCounters("own", champion, activeRole());
  renderSelectedRate();
  const opgg = state.opggCounters.own?.data;
  const flexRole = role || opgg?.role || (state.opggCounters.own?.status === "loading" ? null : "");
  const roleStats = state.winrates?.champions?.[champion?.key] ?? {};
  const references = (state.catalog.get(champion?.name) ?? []).filter((entry) => entry.reference);
  const chosenRole = role || opgg?.role || Object.keys(roleStats).sort((a, b) =>
    (roleStats[b]["0"]?.games ?? 0) - (roleStats[a]["0"]?.games ?? 0),
  )[0] || references[0]?.role || (champion?.tags?.includes("Support") ? "support" : null);
  const stats = roleStats[chosenRole];
  const general = stats?.["0"];
  const localEntry = references.find((entry) => entry.role === chosenRole);
  const reference = localEntry?.reference ?? referenceByClass(champion, chosenRole);
  const generalResult = general?.build || general?.runes ? general
    : reference && { ...reference, reference: true };
  const target = enemy && state.champions.find(({ id }) => id === enemy.id);
  const matchup = stats?.[target?.key];
  const published = (state.catalog.get(champion?.name) ?? []).find(
    (entry) => entry.role === chosenRole && entry.champion_rates,
  )?.champion_rates;
  function championRecord(result, entry) {
    if (result?.record) return result.record;
    if (!entry) return null;
    const { source, url, patch, scope } = published;
    return { ...entry, source, url, patch, scope };
  }
  const matchupReference = localEntry?.matchup_references?.[enemy?.id];
  const matchupResult = matchup?.build || matchup?.runes ? matchup
    : matchupReference && {
      reference: true,
      note: matchupReference.note,
      build: { ...reference.build, ids: matchupReference.item_ids },
      runes: reference.runes,
    };
  byId("winrates-summary").textContent = state.winrates
    ? `Amostra da Riot · patch ${state.winrates.patch}${chosenRole ? ` · ${roleName(chosenRole)}` : ""} · mínimo de ${state.winrates.minimum} partidas por opção`
    : "Taxas de itens e runas dependem da amostra de partidas importada da Riot.";
  const noData = state.winrates ? "Amostra de itens e runas insuficiente para este recorte." : "Importe partidas da Riot para calcular as taxas de itens e runas.";
  // A Flex segue a rota do Solo/Duo; sem rota definida, espera o OP.GG indicar a principal.
  readOpggCounters("ownFlex", flexRole === null ? null : champion, flexRole ?? "", "flex");
  readOpgg("aram", champion, "aram");
  // Build e runas do OP.GG só existem por rota; sem rota, fica a referência local.
  const buildRole = Object.hasOwn(roleNames, chosenRole ?? "") ? chosenRole : null;
  const buildTarget = enemy && enemy.id.toLowerCase() !== champion?.id.toLowerCase() ? enemy.id.toLowerCase() : null;
  readOpgg("build", buildRole ? champion : null, "build", { role: buildRole });
  readOpgg("matchupBuild", buildRole && buildTarget ? champion : null, "build", { role: buildRole, target: buildTarget });
  const ownStatus = opggStatusText(state.opggCounters.own);
  const flexStatus = flexRole === null ? ownStatus : opggStatusText(state.opggCounters.ownFlex);
  const generalRate = opggGeneralRate(opgg) ?? championRecord(general, published?.general);
  const aram = state.opggCounters.aram?.data;
  const enemyStatus = (status) => (enemy ? status : "Selecione o adversário.");
  const focused = document.activeElement?.dataset ?? {};
  const focusedTab = focused.runeTab ? ["runeTab", focused.runeTab]
    : focused.winrateTab ? ["winrateTab", focused.winrateTab] : null;
  // Com inimigo, a aba de confronto abre sozinha uma vez por par campeão|inimigo.
  const pairKey = champion && enemy ? `${champion.id}|${enemy.id}` : null;
  if (pairKey && pairKey !== state.matchupAutoKey) {
    state.winrateTab = "matchup";
    state.matchupAutoKey = pairKey;
    saveWinrateTab();
  }
  const championName = champion?.name ?? "Campeão";
  byId("winrates-cards").replaceChildren(winrateTabs([
    {
      key: "general",
      label: `${championName} · Geral`,
      card: winratePanel(champion ? `${champion.name} · Geral` : "Geral", generalResult, noData,
        champion && buildUrl(champion.id, chosenRole), [
          ["Taxa de vitória · Solo/Duo", generalRate, ownStatus],
          ["Taxa de vitória · Flex", opggGeneralRate(state.opggCounters.ownFlex?.data), flexStatus],
          ["Taxa de vitória · ARAM", Number.isFinite(aram?.rate) ? aram : null, opggStatusText(state.opggCounters.aram)],
        ], state.opggCounters.build),
    },
    {
      key: "matchup",
      label: `${championName} vs ${enemy ? enemy.name : "inimigo"}`,
      disabled: !pairKey,
      card: winratePanel(champion && enemy ? `${champion.name} contra ${enemy.name}` : "Contra o adversário",
        matchupResult, enemy ? noData : "Selecione um adversário na coluna Inimigos.",
        champion && enemy && buildUrl(champion.id, chosenRole, enemy.id), [
          ["Confronto · Solo/Duo", enemy ? opggRate(enemy.id) : null, enemyStatus(ownStatus)],
          ["Confronto · Flex", enemy ? opggRate(enemy.id, "flex") : null, enemyStatus(flexStatus)],
        ], state.opggCounters.matchupBuild),
    },
  ], pairKey ? state.winrateTab : "general"));
  if (focusedTab) {
    const [attribute, value] = focusedTab;
    [...byId("winrates-cards").querySelectorAll(`[data-${attribute === "runeTab" ? "rune-tab" : "winrate-tab"}]`)]
      .find((tab) => tab.dataset[attribute] === value)?.focus();
  }
}

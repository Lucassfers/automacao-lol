// Montagem de URLs externas: página de build do OP.GG e retrato do campeão (local ou Data Dragon).
import { championTitles } from "./constants.js";
import { state } from "./state.js";

export function buildUrl(championId, role, enemyId) {
  const slug = encodeURIComponent(championId.toLowerCase());
  const url = new URL(`https://op.gg/pt/lol/champions/${slug}/build${role ? `/${role}` : ""}`);
  if (enemyId) url.searchParams.set("target_champion", enemyId.toLowerCase());
  return url.href;
}

export function portraitUrl(id) {
  const filename = `${encodeURIComponent(id)}.png`;
  return Object.hasOwn(championTitles, id)
    ? `/assets/${filename}`
    : `https://ddragon.leagueoflegends.com/cdn/${state.dragonVersion}/img/champion/${filename}`;
}

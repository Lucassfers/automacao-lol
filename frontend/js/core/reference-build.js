// Build de referência automática pela classe e rota do campeão (perfis de assets/build-profiles.json).
import { state } from "./state.js";

export function referenceByClass(champion, role) {
  if (!champion?.tags?.length) return null;
  const primary = champion.tags[0];
  const tank = champion.tags.includes("Tank");
  const magicAssassin = primary === "Assassin"
    && (champion.tags.includes("Mage") || ["Akali", "Fizz"].includes(champion.id));
  const profile = role === "support" && tank ? "supportTank"
    : magicAssassin || ["Diana", "Mordekaiser", "Gwen"].includes(champion.id) ? "mage"
    : champion.id === "Senna" ? "marksman"
    : primary === "Support" ? "enchanter"
    : primary.toLowerCase();
  const preset = state.buildProfiles[profile];
  if (!preset) return null;

  let items = preset.items;
  let starting = [1055, 2003];
  if (role === "support") {
    starting = [3865, 2003, 2003];
    if (!["supportTank", "enchanter"].includes(profile)) items = [3876, ...items.slice(0, 5)];
  } else if (role === "jungle") {
    starting = [1102];
  } else if (profile === "mage" || profile === "enchanter") {
    starting = [1056, 2003, 2003];
  } else if (tank) {
    starting = [1054, 2003];
  }
  return {
    build: { ids: items, starting, spells: [4, { jungle: 11, top: 12, adc: 7 }[role] ?? 14] },
    runes: { ids: preset.runes, shards: preset.shards },
    note: "Sugestão automática pela classe e rota do campeão.",
  };
}

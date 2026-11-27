// Chamadas HTTP ao servidor local (dashboard.py): devolvem a Response crua, com as mesmas opções de fetch.

export const fetchChampions = () => fetch("/api/champions", { cache: "no-store" });
export const fetchBuilds = () => fetch("/api/builds", { cache: "no-store" });
export const fetchBuildProfiles = () => fetch("/assets/build-profiles.json", { cache: "no-store" });
export const fetchGear = () => fetch("/api/gear", { cache: "no-store" });
export const fetchWinrates = () => fetch("/api/winrates", { cache: "no-store" });
export const fetchPositions = () => fetch("/api/opgg/positions", { cache: "no-store" });
export const fetchDraft = () => fetch("/api/draft", { cache: "no-store" });
// Consultas ao OP.GG (counters, aram, build): sem opção de cache, como no original.
export const fetchOpgg = (endpoint, query) => fetch(`/api/opgg/${endpoint}?${query}`);

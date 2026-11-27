// Consultas ao OP.GG com cache por slot: cada slot guarda a última requisição e pede um refresh ao responder.
import { refresh } from "../core/refresh.js";
import { state } from "../core/state.js";
import { fetchOpgg } from "./api.js";

export function readOpgg(slot, champion, endpoint, params = {}) {
  if (!champion) {
    state.opggCounters[slot] = null;
    return;
  }
  const query = new URLSearchParams({ champion: champion.id, ...params });
  const key = `${endpoint}?${query}`;
  const current = state.opggCounters[slot];
  if (current?.key === key && (!current.expires || current.expires > Date.now())) return;

  const request = { key, champion: champion.id, name: champion.name, status: "loading" };
  state.opggCounters[slot] = request;
  (async () => {
    try {
      const response = await fetchOpgg(endpoint, query);
      if (response.ok) {
        request.data = await response.json();
        request.status = "ready";
      } else {
        request.status = response.status === 404 ? "no-data" : "unavailable";
      }
    } catch {
      request.status = "unavailable";
    }
    request.expires = Date.now() + (request.status === "unavailable" ? 30000 : 600000);
    if (state.opggCounters[slot] !== request) return;
    refresh();
  })();
}

export function readOpggCounters(slot, champion, role, queue = "ranked") {
  readOpgg(slot, champion, "counters", queue === "ranked" ? { role } : { role, queue });
}

// Poll do draft do cliente do LoL a cada 2s (cadeia de setTimeout): entrega só snapshots que mudaram.
import { refresh } from "../core/refresh.js";
import { state } from "../core/state.js";
import { fetchDraft } from "./api.js";

let draftKey = "";

export function startDraftPolling(onSnapshot) {
  async function pollDraft() {
    let snapshot;
    try {
      const response = await fetchDraft();
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      snapshot = await response.json();
    } catch {
      snapshot = { status: "unavailable" };
    }
    const nextKey = JSON.stringify(snapshot);
    if (draftKey !== nextKey) {
      draftKey = nextKey;
      onSnapshot(snapshot);
    } else if (Object.values(state.opggCounters).some((request) => request?.expires <= Date.now())) {
      refresh();
    }
    setTimeout(pollDraft, 2000);
  }
  pollDraft();
}

// Selo "Taxa de vitória" do campeão (hero e quadro do draft) a partir de uma consulta ao OP.GG.
import { matchupPercent, rateTone, roleName } from "../core/format.js";

export function championRateBadge(node, request) {
  const general = request?.data?.general;
  if (request?.status === "ready" && Number.isFinite(general?.rate)) {
    const { role, patch } = request.data;
    const details = [roleName(role), patch && `patch ${patch}`].filter(Boolean).join(" · ");
    node.textContent = `Taxa de vitória ${matchupPercent.format(general.rate)}${details ? ` · ${details}` : ""}`;
    node.dataset.tone = rateTone(general.rate);
  } else if (!request || request.status === "loading") {
    node.textContent = "Consultando OP.GG…";
    node.dataset.tone = "muted";
  } else {
    node.textContent = "Taxa de vitória indisponível no OP.GG";
    node.dataset.tone = "muted";
  }
}

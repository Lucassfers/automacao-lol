// Janela "Como funciona": abre o diálogo de ajuda pelo botão da barra superior.
import { byId, dom } from "../core/dom.js";

export function bindGuide() {
  byId("open-guide").addEventListener("click", () => dom.guide.showModal());
}

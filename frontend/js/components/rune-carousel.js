// Carrossel horizontal das páginas de runas: setas, posição de rolagem salva por consulta e revelação da aba.
import { element } from "../core/dom.js";

// Rolagem horizontal do carrossel de runas em cada consulta (mesma chave das abas de runas).
const runeScroll = new Map();

// Carrossel das páginas de runas: uma linha com rolagem horizontal e setas ‹ ›. A posição fica
// guardada por consulta para o poll de 2s não devolver o carrossel ao início.
export function runeCarousel(head, tabs, buttons, key, selectedTab) {
  const nav = element("div", "rune-nav");
  const arrows = [["‹", "Opções anteriores", -1], ["›", "Próximas opções", 1]].map(([glyph, label, direction]) => {
    const arrow = element("button", "rune-arrow", glyph);
    arrow.type = "button";
    arrow.setAttribute("aria-label", label);
    arrow.title = label;
    arrow.addEventListener("click", () => {
      const step = (buttons[0]?.offsetWidth ?? tabs.clientWidth) + 6;
      tabs.scrollBy({ left: direction * Math.max(step, 1), behavior: scrollBehavior() });
    });
    return arrow;
  });
  nav.append(...arrows);
  head.append(nav);

  function update() {
    const max = tabs.scrollWidth - tabs.clientWidth;
    nav.hidden = max <= 1;
    arrows[0].disabled = tabs.scrollLeft <= 1;
    arrows[1].disabled = tabs.scrollLeft >= max - 1;
  }
  tabs.addEventListener("scroll", () => {
    runeScroll.set(key, tabs.scrollLeft);
    update();
  }, { passive: true });
  tabs.addEventListener("rune-reveal", update);
  // Quando o carrossel ganha largura (entra no DOM ou a aba dele aparece), antes da pintura, volta
  // à posição salva ou mostra a página selecionada (a de maior vitória ao abrir).
  let placed = false;
  function place() {
    if (!placed && tabs.isConnected && tabs.clientWidth) {
      placed = true;
      if (runeScroll.has(key)) tabs.scrollLeft = runeScroll.get(key);
      else revealTab(tabs, selectedTab(), "auto");
    }
    update();
  }
  if (typeof ResizeObserver === "function") {
    const observer = new ResizeObserver(() => {
      // Removido do DOM depois de posicionado = painel substituído por um novo render.
      if (!tabs.isConnected) {
        if (placed) observer.disconnect();
      } else place();
    });
    observer.observe(tabs);
  }
  requestAnimationFrame(place);
  const carousel = element("div", "rune-carousel");
  carousel.append(head, tabs);
  return carousel;
}

export function scrollBehavior() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

// Rola só o carrossel (sem mexer na rolagem vertical da página) até a aba ficar inteira à vista.
export function revealTab(tabs, tab, behavior = scrollBehavior()) {
  if (!tab || !tabs.isConnected) return;
  const left = tab.offsetLeft;
  const right = left + tab.offsetWidth;
  // Alinha pelo início do cartão (mesmo ponto do scroll-snap; alinhar pela direita faria o snap
  // obrigatório puxar de volta para o cartão anterior).
  const hidden = left < tabs.scrollLeft || right > tabs.scrollLeft + tabs.clientWidth;
  if (hidden) tabs.scrollTo({ left: Math.max(0, left - 3), behavior });
  tabs.dispatchEvent(new Event("rune-reveal"));
}

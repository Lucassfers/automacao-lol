// Utilitários de DOM: busca por id, criação de elementos e ícones, e os nós fixos da página.

export const byId = (id) => document.getElementById(id);

export const dom = {
  championList: byId("champions"),
  search: byId("champion-search"),
  enemyList: byId("enemy-champions"),
  enemySearch: byId("enemy-search"),
  guide: byId("guide"),
  art: byId("champion-art"),
  loading: byId("loading"),
};

export function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function icon(label, src) {
  const frame = element("span", "icon-frame", label);
  frame.setAttribute("aria-hidden", "true");
  if (src) {
    const image = element("img", "");
    image.alt = "";
    image.loading = "lazy";
    image.addEventListener("error", () => image.remove(), { once: true });
    image.src = src;
    frame.append(image);
  }
  return frame;
}

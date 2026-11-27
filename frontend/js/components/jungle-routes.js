// Rotas da selva mais jogadas em cada lado do mapa, com os ícones dos campos.
import { element, icon } from "../core/dom.js";

// Conjunto fechado de campos: o caminho do ícone sai só deste mapa, nunca do texto da API.
const jungleCamps = {
  BLUE: { name: "Azul", icon: "/assets/jungle/blue.png" },
  RED: { name: "Vermelho", icon: "/assets/jungle/red.png" },
  GROMP: { name: "Grompe", icon: "/assets/jungle/gromp.png" },
  WOLVES: { name: "Lobos", icon: "/assets/jungle/wolves.png" },
  RAPTORS: { name: "Aves", icon: "/assets/jungle/raptors.png" },
  KRUG: { name: "Krugs", icon: "/assets/jungle/krug.png" },
};

// Um passo da rota: ícone do campo com "›" antes; sem ícone (ou se ele falhar), o selo de texto.
export function jungleStop(camp, index) {
  const known = Object.hasOwn(jungleCamps, camp) ? jungleCamps[camp] : null;
  const name = known?.name ?? camp;
  const stop = element("li", "jungle-stop");
  if (known) stop.dataset.camp = camp.toLowerCase();
  stop.title = name;
  if (index > 0) {
    const separator = element("span", "jungle-sep", "›");
    separator.setAttribute("aria-hidden", "true");
    stop.append(separator);
  }
  const label = element("span", "jungle-camp-label", `${index + 1}. ${name}`);
  if (known) {
    const frame = icon("", known.icon);
    const image = frame.querySelector("img");
    image.alt = "";
    image.addEventListener("error", () => {
      frame.remove();
      stop.classList.remove("has-icon");
    }, { once: true });
    stop.classList.add("has-icon");
    stop.append(frame);
  }
  stop.append(label);
  return stop;
}

// Rota da selva mais jogada em cada lado do mapa (dados do último mês, todos os patches).
export function jungleRoutes(title, jungle) {
  const group = element("div", "gear-group jungle-group");
  group.append(element("h4", "", title));
  if (!jungle) {
    group.append(element("p", "empty", "Indisponível."));
    return group;
  }
  const list = element("ul", "jungle-sides");
  for (const [side, label] of [["blue", "Lado azul"], ["red", "Lado vermelho"]]) {
    const entry = jungle[side];
    const line = element("li", "jungle-side");
    const name = element("span", "side-label", label);
    name.dataset.side = side;
    line.append(name);
    if (!entry) {
      line.append(element("span", "empty", "Indisponível."));
    } else {
      const route = element("ol", "jungle-route");
      route.setAttribute("aria-label", `Rota do ${label.toLowerCase()}`);
      entry.route.forEach((camp, index) => route.append(jungleStop(camp, index)));
      line.append(route, element("span", "jungle-games", `${entry.games.toLocaleString("pt-BR")} partidas`));
    }
    list.append(line);
  }
  group.append(list, element("p", "opgg-note", "Último mês, todos os patches."));
  return group;
}

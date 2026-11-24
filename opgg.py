import copy
import json
import logging
import math
import re
from functools import lru_cache
from html.parser import HTMLParser
from http.client import HTTPException
from time import monotonic
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen


FILTERS = {"region": "global", "tier": "emerald_plus"}
QUEUES = {"ranked": "Solo/Duo", "flex": "Flex"}
ARAM_SCOPE = "ARAM · todas as regiões"
LANES = {"Top": "top", "Jungle": "jungle", "Middle": "mid", "Bottom": "adc", "Support": "support"}
MAX_BODY = 4_000_000
RSC_CHUNK = re.compile(r"<script>self\.__next_f\.push\((\[.*?\])\)</script>", re.S)
CANONICAL = re.compile(r'<link rel="canonical" href="([^"]+)"')
ITEM_SECTIONS = {"Core builds": "core", "Boots": "boots", "Starter items": "starting"}
SECTION = re.compile(r'"children":"(Core builds|Boots|Starter items)"')
# "Items" também é um rótulo da navegação da página, que vem antes de "Core builds":
# a âncora da lista de outros itens só vale depois de "Starter items".
OTHER_ITEMS = '"children":"Items"'
MIN_PICK, MIN_GAMES = 0.01, 100
DECODER = json.JSONDecoder()
INVALID = "Estrutura do OP.GG não reconhecida."
SHAPE_ERRORS = (KeyError, TypeError, IndexError, AttributeError)


class NoDataError(ValueError):
    """Página reconhecida, mas sem dados publicados para o recorte."""


class CounterPage(HTMLParser):
    def __init__(self):
        super().__init__()
        self.canonical = ""
        self.heading = []
        self.in_heading = False
        self.row = None
        self.general_rate = None
        self.matchups = {}

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "link" and attrs.get("rel") == "canonical":
            self.canonical = urlsplit(attrs.get("href", "")).path
        if tag == "h1":
            self.in_heading = True
        if tag == "li":
            self.row = {"champions": set(), "rates": [], "counts": [], "text": []}
        if self.row is not None and tag == "img":
            image = urlsplit(attrs.get("src", "")).path
            match = re.search(r"/champion/([a-zA-Z0-9]+)\.png$", image)
            if match:
                self.row["champions"].add(match[1].lower())

    def handle_data(self, data):
        if self.in_heading:
            self.heading.append(data)
        if self.row is None:
            return
        data = data.strip()
        self.row["text"].append(data)
        if re.fullmatch(r"\d{1,3}(?:\.\d+)?%", data):
            self.row["rates"].append(float(data[:-1]) / 100)
        if re.fullmatch(r"\d{1,3}(?:,\d{3})*|\d+", data):
            self.row["counts"].append(int(data.replace(",", "")))

    def handle_endtag(self, tag):
        if tag == "h1":
            self.in_heading = False
        if tag != "li" or self.row is None:
            return
        general = re.fullmatch(r"Win rate\s*(\d{1,3}(?:\.\d+)?)\s*%", " ".join(self.row["text"]).strip())
        if general and self.general_rate is None and 0 <= float(general[1]) <= 100:
            self.general_rate = float(general[1]) / 100
        champions, rates, counts = (self.row[key] for key in ("champions", "rates", "counts"))
        if len(champions) == len(rates) == len(counts) == 1 and 0 <= rates[0] <= 1 and counts[0] > 0:
            self.matchups[champions.pop()] = {"rate": rates[0], "games": counts[0]}
        self.row = None


def parse_counters(html, champion, role):
    page = CounterPage()
    page.feed(html)
    header = re.search(r"Counters for (Top|Jungle|Middle|Bottom|Support), Patch (\d+(?:\.\d+)+)",
                       "".join(page.heading))
    base_path = f"/lol/champions/{champion}/counters"
    if not header or not (page.canonical == base_path or page.canonical.startswith(f"{base_path}/")):
        raise ValueError("Página de confrontos do OP.GG não reconhecida.")
    page_role = LANES[header[1]]
    if role and page_role != role:
        raise ValueError("O OP.GG devolveu uma rota diferente da solicitada.")
    return page_role, header[2], page.general_rate, page.matchups


class AramPage(HTMLParser):
    def __init__(self):
        super().__init__()
        self.canonical = ""
        self.heading = []
        self.title = []
        self.tags = []
        self.skip = 0
        self.texts = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "link" and attrs.get("rel") == "canonical":
            self.canonical = urlsplit(attrs.get("href", "")).path
        if tag in {"script", "style"}:
            self.skip += 1
        if tag in {"h1", "title"}:
            self.tags.append(tag)

    def handle_endtag(self, tag):
        if tag in {"script", "style"} and self.skip:
            self.skip -= 1
        if tag in {"h1", "title"} and tag in self.tags:
            self.tags.remove(tag)

    def handle_data(self, data):
        if "h1" in self.tags:
            self.heading.append(data)
        if "title" in self.tags:
            self.title.append(data)
        data = data.strip()
        if data and not self.skip:
            self.texts.append(data)

    def general_rate(self):
        for label, value in zip(self.texts, self.texts[1:]):
            match = re.fullmatch(r"(\d{1,3}(?:\.\d+)?)\s*%", value)
            if label == "Win rate" and match and 0 <= float(match[1]) <= 100:
                return round(float(match[1]) / 100, 4)
        return None


def parse_aram(html, champion):
    page = AramPage()
    page.feed(html)
    if page.canonical != f"/lol/modes/aram/{champion}/build" or "ARAM Build" not in " ".join(page.heading):
        raise ValueError("Página de ARAM do OP.GG não reconhecida.")
    patch = re.search(r"ARAM Build Patch (\d+(?:\.\d+)+)", "".join(page.title) or " ".join(page.heading))
    return patch[1] if patch else None, page.general_rate()


def download(url):
    request = Request(url, headers={"Accept": "text/html"})
    with urlopen(request, timeout=7) as response:
        if urlsplit(response.geturl()).hostname != "op.gg":
            raise ValueError("O OP.GG redirecionou a consulta para outro domínio.")
        body = response.read(MAX_BODY + 1)
    if len(body) > MAX_BODY:
        raise ValueError("Resposta do OP.GG acima do limite esperado.")
    return body.decode("utf-8")


@lru_cache(maxsize=128)
def fetch_counters(champion, role, queue, cache_window):
    path = f"https://op.gg/lol/champions/{champion}/counters"
    if role:
        path += f"/{role}"
    html = download(f"{path}?{urlencode(FILTERS | {'type': queue})}")
    return parse_counters(html, champion, role)


def champion_counters(champion, role, queue="ranked"):
    if queue not in QUEUES:
        raise ValueError("Fila não suportada.")
    page_role, patch, general_rate, rows = fetch_counters(champion, role, queue, int(monotonic() // 600))
    path = f"https://op.gg/pt/lol/champions/{champion}/counters/{page_role}"
    return {
        "role": page_role, "patch": patch, "queue": queue, "source": "OP.GG",
        "scope": f"Esmeralda+ · {QUEUES[queue]} · todas as regiões",
        "url": f"{path}?{urlencode(FILTERS | {'type': queue, 'patch': patch})}",
        "general": {"rate": general_rate} if general_rate is not None else None,
        "matchups": rows,
    }


@lru_cache(maxsize=128)
def fetch_aram(champion, cache_window):
    html = download(f"https://op.gg/lol/modes/aram/{champion}/build?{urlencode({'region': 'global'})}")
    return parse_aram(html, champion)


def champion_aram(champion):
    patch, rate = fetch_aram(champion, int(monotonic() // 600))
    return {
        "rate": rate, "patch": patch, "scope": ARAM_SCOPE, "source": "OP.GG",
        "url": f"https://op.gg/pt/lol/modes/aram/{champion}/build?{urlencode({'region': 'global'})}",
    }


def rsc_text(html):
    """Junta as strings do RSC do Next, publicadas em self.__next_f.push([1, "..."])."""
    chunks = []
    for match in RSC_CHUNK.finditer(html):
        try:
            entry = json.loads(match[1])
        except ValueError:
            continue
        if isinstance(entry, list) and len(entry) == 2 and entry[0] == 1 and isinstance(entry[1], str):
            chunks.append(entry[1])
    if not chunks:
        raise ValueError("Payload do OP.GG não encontrado.")
    return "".join(chunks)


def value_after(text, marker, kind, start=0):
    index = text.find(marker, start)
    if index < 0:
        raise ValueError(INVALID)
    value, _ = DECODER.raw_decode(text, index + len(marker) - 1)
    if not isinstance(value, kind):
        raise ValueError(INVALID)
    return value


def page_patch(html, text, champion, role, kind):
    """Confere canonical e recorte (global, Esmeralda+, rota) e devolve o patch da página."""
    canonical = CANONICAL.search(html)
    if not canonical or urlsplit(canonical[1]).path != f"/lol/champions/{champion}/{kind}/{role}":
        raise ValueError("Página do OP.GG não reconhecida.")
    start = text.find('"params":{')
    while start >= 0:
        params = value_after(text, '"params":{', dict, start)
        if "game_position" in params:
            patch = params.get("game_patch_version")
            if (params.get("game_region") != FILTERS["region"] or params.get("game_tier") != FILTERS["tier"]
                    or params["game_position"] != role or not isinstance(patch, str)
                    or not re.fullmatch(r"\d+\.\d+", patch)):
                raise ValueError("Recorte do OP.GG diferente do solicitado.")
            return patch
        start = text.find('"params":{', start + 1)
    raise ValueError(INVALID)


def count(value):
    if isinstance(value, str) and re.fullmatch(r"\d{1,3}(?:,\d{3})+|\d+", value):
        return int(value.replace(",", ""))
    if isinstance(value, int) and not isinstance(value, bool) and value >= 0:
        return value
    raise ValueError("Número de partidas inválido.")


def rate(value, scale=1):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("Taxa inválida.")
    value = value / scale
    if not 0 <= value <= 1:
        raise ValueError("Taxa fora do intervalo.")
    return round(value, 4)


def share(games, total):
    return rate(games / total) if total else 0.0


def best_index(options):
    """Índice da opção de maior taxa de vitória com escolha >= 1% e >= 100 partidas.

    O empate fica com a de mais partidas. Sem opção elegível, vence a de mais partidas
    e o segundo valor (amostra pequena) vem verdadeiro.
    """
    eligible = [i for i, option in enumerate(options)
                if option["pick_rate"] >= MIN_PICK and option["games"] >= MIN_GAMES]
    if eligible:
        return max(eligible, key=lambda i: (options[i]["win_rate"], options[i]["games"])), False
    return max(range(len(options)), key=lambda i: options[i]["games"]), True


def best(options):
    if not options:
        return None
    index, low_sample = best_index(options)
    return {**options[index], "low_sample": low_sample}


def rune_cells(rows, total):
    cells = []
    for row in rows:
        line = []
        for rune in row:
            games = count(rune.get("play") or 0)
            line.append({"id": count(rune["id"]), "games": games, "pick_rate": share(games, total),
                         "win_rate": rate(rune.get("win_rate") or 0, 100)})
        cells.append(line)
    return cells


def rune_variant(build, total):
    if "importClientData" in build:
        perks = build["importClientData"]["selectedPerkIds"]
    else:
        perks = [rune["id"] for group in ("main_runes", "sub_runes", "shards")
                 for row in build[group] for rune in row if rune["isActive"]]
    games = count(build["play"])
    return {
        "primary": count(build["primary_perk_style"]["id"]),
        "secondary": count(build["perk_sub_style"]["id"]),
        "perks": [count(perk) for perk in perks],
        "games": games,
        "pick_rate": share(games, total),
        "win_rate": rate(build["win_rate"]),
    }


def parse_runes(html, champion, role):
    """Devolve (patch, partidas, runas) da página /runes do OP.GG, com taxas em fração de 0 a 1."""
    text = rsc_text(html)
    patch = page_patch(html, text, champion, role, "runes")
    try:
        pages = value_after(text, '"rune_pages":[', list)
        trees = {count(tree["primary_perk_style"]["id"]): tree
                 for tree in value_after(text, '"single_rune_builds":[', list)}
        if len(trees) != 5 or not pages:
            raise ValueError(INVALID)
        shard_rows = next(iter(trees.values()))["shards"]
        total = sum(count(shard.get("play") or 0) for shard in shard_rows[0]) if shard_rows else 0
        if len(shard_rows) != 3 or total <= 0:
            raise ValueError(INVALID)

        result, used = [], set()
        for page in pages:
            variants = [rune_variant(build, total) for build in page["builds"]]
            if not variants or any(len(variant["perks"]) != 9 for variant in variants):
                raise ValueError(INVALID)
            chosen = best(variants)
            if chosen["primary"] not in trees or chosen["secondary"] not in trees:
                raise ValueError(INVALID)
            used.update((chosen["primary"], chosen["secondary"]))
            result.append({
                "keystone": count(page["id"]),
                "primary": chosen["primary"],
                "secondary": chosen["secondary"],
                "games": count(page["play"]),
                "pick_rate": rate(page["pick_rate"]),
                "win_rate": rate(page["win_rate"]),
                "perks": chosen["perks"],
                "variant": {key: chosen[key] for key in ("games", "pick_rate", "win_rate", "low_sample")},
            })
        runes = {
            "selected": best_index(result)[0],
            "pages": result,
            "trees": {str(style): {"primary": rune_cells(trees[style]["main_runes"], total),
                                   "secondary": rune_cells(trees[style]["sub_runes"], total)}
                      for style in sorted(used)},
            "shards": rune_cells(shard_rows, total),
        }
    except SHAPE_ERRORS as error:
        raise ValueError(INVALID) from error
    return patch, total, runes


def item_options(entries, starters=False):
    options = []
    for entry in entries:
        ids = [count(item) for item in entry["ids"]]
        if starters and len(ids) != sum(count(amount) for _, amount in entry["metaStarterItems"]):
            raise ValueError(INVALID)
        options.append({"ids": ids, "games": count(entry["play"]),
                        "pick_rate": rate(entry["pick_rate"], 100), "win_rate": rate(entry["win_rate"], 100)})
    return options


def other_items(text, start):
    """Lista "Items" (outros itens, um id por entrada) que vem depois de "Starter items".

    É opcional: ausente, vazia ou fora do formato esperado vira lista vazia, sem derrubar a build.
    """
    anchor = text.find(OTHER_ITEMS, start)
    if anchor < 0:
        return []
    # Os dados vêm logo após o título; sem "data" por perto, a seção está vazia.
    index = text.find('"data":[', anchor + len(OTHER_ITEMS), anchor + len(OTHER_ITEMS) + 1000)
    if index < 0:
        return []
    try:
        options = item_options(value_after(text, '"data":[', list, index))
    except (ValueError, *SHAPE_ERRORS):
        return []
    if any(len(option["ids"]) != 1 for option in options):
        return []
    return options


def parse_items(html, champion, role):
    """Devolve (patch, opções de core, botas, iniciais e outros itens) da página /items do OP.GG.

    Taxas em fração de 0 a 1. A lista de outros itens ("items") é opcional.
    """
    text = rsc_text(html)
    patch = page_patch(html, text, champion, role, "items")
    sections = {}
    matches = list(SECTION.finditer(text))
    starter = next((match for match in matches if match[1] == "Starter items"), None)
    other_at = text.find(OTHER_ITEMS, starter.end()) if starter else -1
    bounds = [match.start() for match in matches] + ([other_at] if other_at >= 0 else [])
    try:
        for match in matches:
            key = ITEM_SECTIONS[match[1]]
            if key in sections:
                continue
            # Seção sem dados não tem "data": o próximo bloco já é da seção seguinte.
            end = min((bound for bound in bounds if bound > match.start()), default=len(text))
            index = text.find('"data":[', match.end(), end)
            entries = value_after(text, '"data":[', list, index) if index >= 0 else []
            sections[key] = item_options(entries, starters=key == "starting")
    except SHAPE_ERRORS as error:
        raise ValueError(INVALID) from error
    if set(sections) != set(ITEM_SECTIONS.values()):
        raise ValueError(INVALID)
    if not sections["core"]:
        raise NoDataError("O OP.GG não publicou builds principais para este recorte.")
    if any(not 2 <= len(option["ids"]) <= 6 for option in sections["core"]):
        raise ValueError(INVALID)
    sections["items"] = other_items(text, starter.end())
    return patch, sections


def ranked(options, limit):
    """Opções ordenadas pela regra de best_index: elegíveis (escolha >= 1% e >= 100 partidas) por vitória,
    desempate por partidas. Sem elegíveis, as de mais partidas, marcadas como amostra pequena.

    Devolve cópias (inclusive da lista de ids) com "low_sample"; não altera as opções recebidas.
    """
    eligible = [option for option in options if option["pick_rate"] >= MIN_PICK and option["games"] >= MIN_GAMES]
    if eligible:
        order = sorted(eligible, key=lambda option: (option["win_rate"], option["games"]), reverse=True)
        return [{**option, "ids": list(option["ids"]), "low_sample": False} for option in order[:limit]]
    order = sorted(options, key=lambda option: option["games"], reverse=True)
    return [{**option, "ids": list(option["ids"]), "low_sample": True} for option in order[:limit]]


def situational_items(items, core, boots, starting, components=frozenset(), limit=6):
    """Itens situacionais: os outros itens fora do core escolhido, das botas, dos iniciais e dos componentes."""
    excluded = set(components)
    excluded.update(core["ids"] if core else [])
    for option in (*boots, *starting):
        excluded.update(option["ids"])
    return ranked([option for option in items if option["ids"][0] not in excluded], limit)


def boot_options(boots, chosen, limit=4):
    """Opções de botas: a escolhida primeiro, depois as demais pela regra de maior vitória."""
    if not chosen:
        return ranked(boots, limit)
    others = [option for option in boots if option["ids"] != chosen["ids"]]
    return [{**chosen, "ids": list(chosen["ids"])}, *ranked(others, limit - 1)][:limit]


def starting_options(starting, chosen, limit=2):
    """Opções de itens iniciais: a escolhida primeiro, depois as demais pela regra de maior vitória."""
    return boot_options(starting, chosen, limit)


def core_options(core, chosen, limit=5):
    """Builds principais (combos de itens): a escolhida primeiro, depois as demais pela regra de maior vitória."""
    return boot_options(core, chosen, limit)


# --- Página /build (T-011): feitiços, ordem de habilidades, 4º/5º/6º item e rotas da selva ---

RSC_ROW = re.compile(r"(?:^|\n)([0-9a-f]+):(?=[\[{])")
RSC_REF = re.compile(r"\$L([0-9a-f]+)")
MAX_REF_DEPTH = 80
MAX_DEPTH = 600
MAX_NODES = 200_000
PERCENT = re.compile(r"\d{1,3}(?:\.\d+)?%")
GAMES = re.compile(r"(\d{1,3}(?:,\d{3})+|\d+) games?")
SKILL_KEYS = ("Q", "W", "E")
SKILL_LEVELS = 15
SKILL_ICON = re.compile(r"[A-Za-z0-9_]{1,64}\.png")
JUNGLE_CAMPS = frozenset({"BLUE", "GROMP", "WOLVES", "RAPTORS", "RED", "KRUG"})
DEPTHS = ("4", "5", "6")
EXTRA_KEYS = ("spells", "skills", "depth", "jungle")


def rsc_rows(text):
    """Posição do valor de cada linha "id:[...]"/"id:{...}" do RSC. Linhas "id:I[" (módulos) e "id:T" ficam de fora."""
    rows = {}
    for match in RSC_ROW.finditer(text):
        rows.setdefault(match[1], match.end())
    return rows


def resolve(text, rows, node):
    """Troca referências "$Lxx" pelo valor da linha xx do RSC (cópia nova; o nó recebido não é alterado).

    Referência desconhecida, em ciclo ou além do limite de profundidade fica como string.
    Estrutura funda demais ou grande demais levanta ValueError.
    """
    decoded = {}
    budget = [MAX_NODES]

    def load(ref):
        if ref not in decoded:
            try:
                decoded[ref] = DECODER.raw_decode(text, rows[ref])[0]
            except ValueError:
                decoded[ref] = None
        return decoded[ref]

    def walk(value, path, depth):
        budget[0] -= 1
        if budget[0] < 0 or depth > MAX_DEPTH:
            raise ValueError(INVALID)
        if isinstance(value, str):
            match = RSC_REF.fullmatch(value)
            if not match or match[1] not in rows or match[1] in path or len(path) >= MAX_REF_DEPTH:
                return value
            target = load(match[1])
            if target is None:
                return value
            return walk(target, path | {match[1]}, depth + 1)
        if isinstance(value, list):
            return [walk(item, path, depth + 1) for item in value]
        if isinstance(value, dict):
            return {key: walk(item, path, depth + 1) for key, item in value.items()}
        return value

    return walk(node, frozenset(), 0)


def is_element(node):
    return (isinstance(node, list) and len(node) == 4 and node[0] == "$"
            and isinstance(node[1], str) and isinstance(node[3], dict))


def first_src(node):
    stack = [node]
    while stack:
        value = stack.pop()
        if isinstance(value, dict):
            if isinstance(value.get("src"), str):
                return value["src"]
            stack.extend(reversed(list(value.values())))
        elif isinstance(value, list):
            stack.extend(reversed(value))
    return None


def jsx_walk(node):
    """Percorre a árvore JSX do RSC em ordem, emitindo eventos simples.

    ("meta", metaType, metaId, extraData, src da imagem filha) para ícones do OP.GG (sem descer neles),
    ("tr", chave) para linhas de tabela e (tipo, texto) para textos que não começam com "$".
    """
    events = []
    stack = [node]
    while stack:
        value = stack.pop()
        if is_element(value):
            _, kind, key, props = value
            if "metaType" in props:
                events.append(("meta", props.get("metaType"), props.get("metaId"), props.get("extraData"),
                               first_src(props.get("children"))))
                continue
            if kind == "tr":
                events.append(("tr", key))
            children = props.get("children")
            if isinstance(children, str):
                if not children.startswith("$"):
                    events.append((kind, children))
            elif is_element(children):
                stack.append(children)
            elif isinstance(children, list):
                for child in reversed(children):
                    if isinstance(child, str):
                        if not child.startswith("$"):
                            stack.append((kind, child))
                    elif isinstance(child, list):
                        stack.append(child)
        elif isinstance(value, tuple):
            events.append(value)
        elif isinstance(value, list):
            stack.extend(reversed(value))
    return events


def parse_percent(value):
    """"61.24%" → 0.6124. Rejeita formato diferente e valores acima de 100%."""
    if not isinstance(value, str) or not PERCENT.fullmatch(value):
        raise ValueError("Taxa inválida.")
    return rate(float(value[:-1]), 100)


def parse_games(value):
    """"12,991 games" → 12991."""
    match = GAMES.fullmatch(value) if isinstance(value, str) else None
    if not match:
        raise ValueError("Número de partidas inválido.")
    return count(match[1])


def element_at(text, rows, marker, start):
    """Elemento JSX que contém o marcador: lê a partir do último '["$","$L' antes dele e resolve as referências."""
    index = text.find(marker, start)
    if index < 0:
        raise ValueError(INVALID)
    begin = text.rfind('["$","$L', 0, index)
    if begin < 0:
        raise ValueError(INVALID)
    node, _ = DECODER.raw_decode(text, begin)
    if not is_element(node):
        raise ValueError(INVALID)
    return resolve(text, rows, node)


def low_sample(pick_rate, games):
    return pick_rate < MIN_PICK or games < MIN_GAMES


def parse_spells(text, rows):
    """Os 2 combos de feitiços de invocador da página /build (ids, partidas, escolha e vitória)."""
    combos = []
    for index in range(2):
        marker = f'"spells_table_{index}",{{'
        props = value_after(text, marker, dict)
        events = jsx_walk(resolve(text, rows, ["$", "table", None, props]))
        ids = [event[2] for event in events if event[0] == "meta" and event[1] == "spell"]
        texts = [event for event in events if event[0] != "meta" and event[0] != "tr"]
        strong = [value for kind, value in texts if kind == "strong"]
        games = [value for kind, value in texts if kind == "span" and GAMES.fullmatch(value)]
        if len(ids) != 2 or len(strong) != 2 or len(games) != 1:
            raise ValueError(INVALID)
        ids = [count(spell) for spell in ids]
        played = parse_games(games[0])
        pick = parse_percent(strong[0])
        combos.append({"ids": ids, "games": played, "pick_rate": pick, "win_rate": parse_percent(strong[1]),
                       "low_sample": low_sample(pick, played)})
    return combos


def parse_skills(text, rows, champion):
    """Ordem de habilidades: prioridade Q/W/E, os 15 primeiros níveis, ícones, partidas, escolha e vitória."""
    events = jsx_walk(element_at(text, rows, '"children":"SkillOrder Table"', 0))
    metas = [i for i, event in enumerate(events) if event[0] == "meta"]
    if len(metas) != 3:
        raise ValueError(INVALID)
    priority, icons = [], {}
    for i in metas:
        _, kind, meta_id, key, src = events[i]
        if kind != "skill" or meta_id != champion or key not in SKILL_KEYS or key in priority:
            raise ValueError(INVALID)
        priority.append(key)
        name = urlsplit(src).path.rsplit("/", 1)[-1] if isinstance(src, str) else ""
        if SKILL_ICON.fullmatch(name):
            icons[key] = name
    after = [event for event in events[metas[-1] + 1:] if event[0] != "tr"]
    order = [value for kind, value in after if kind == "strong" and value in {"Q", "W", "E", "R"}]
    stats = [(kind, value) for kind, value in after if not (kind == "strong" and value in {"Q", "W", "E", "R"})]
    strong = [value for kind, value in stats if kind == "strong"]
    games = [value for kind, value in stats if kind == "span" and GAMES.fullmatch(value)]
    if len(order) != SKILL_LEVELS or len(strong) != 2 or len(games) != 1:
        raise ValueError(INVALID)
    played = parse_games(games[0])
    pick = parse_percent(strong[0])
    return {"priority": priority, "order": order, "icons": icons, "games": played, "pick_rate": pick,
            "win_rate": parse_percent(strong[1]), "low_sample": low_sample(pick, played)}


def parse_depth(text, rows):
    """Quarto, quinto e sexto item: até 5 opções cada (id, partidas, vitória), na ordem do OP.GG."""
    result = {}
    for depth in DEPTHS:
        props = value_after(text, f'"depth_{depth}",{{', dict)
        events = jsx_walk(resolve(text, rows, ["$", "table", None, props]))
        lines, current = [], None
        for event in events:
            if event[0] == "tr":
                current = [] if isinstance(event[1], str) and event[1].startswith(f"depth_{depth}_item_") else None
                if current is not None:
                    lines.append(current)
            elif current is not None:
                current.append(event)
        options = []
        for line in lines:
            ids = [event[2] for event in line if event[0] == "meta" and event[1] == "item"]
            strong = [event[1] for event in line if event[0] == "strong"]
            games = [event[1] for event in line if event[0] == "span" and GAMES.fullmatch(event[1])]
            if len(ids) != 1 or len(strong) != 1 or len(games) != 1:
                raise ValueError(INVALID)
            played = parse_games(games[0])
            options.append({"id": count(ids[0]), "games": played, "win_rate": parse_percent(strong[0]),
                            "low_sample": played < MIN_GAMES})
        result[depth] = options[:5]
    return result


def parse_jungle(text):
    """Rota da selva mais jogada em cada lado (6 campos, partidas da rota e total do lado), ou None se não houver."""
    index = text.find('"team_key":"')
    if index < 0:
        return None
    sides = value_after(text, '"data":[', list, text.rfind('"data":[', 0, index))
    result = {}
    try:
        for side in sides:
            key = {"BLUE": "blue", "RED": "red"}.get(side["team_key"])
            if key is None or key in result:
                raise ValueError(INVALID)
            routes = sorted(side["routes"], key=lambda route: count(route["rank"]))
            if not routes:
                raise ValueError(INVALID)
            route = routes[0]["route"]
            if (not isinstance(route, list) or len(route) != 6
                    or any(not isinstance(camp, str) or camp not in JUNGLE_CAMPS for camp in route)):
                raise ValueError(INVALID)
            result[key] = {"route": list(route), "games": count(routes[0]["play"]), "total": count(side["play"])}
    except SHAPE_ERRORS as error:
        raise ValueError(INVALID) from error
    if set(result) != {"blue", "red"}:
        raise ValueError(INVALID)
    return {"blue": result["blue"], "red": result["red"]}


def parse_build_extras(html, champion, role):
    """Devolve (patch, extras) da página /build. Cada bloco que falhar vira None, sem derrubar os demais."""
    text = rsc_text(html)
    patch = page_patch(html, text, champion, role, "build")
    rows = rsc_rows(text)
    blocks = {
        "spells": lambda: parse_spells(text, rows),
        "skills": lambda: parse_skills(text, rows, champion),
        "depth": lambda: parse_depth(text, rows),
        "jungle": lambda: parse_jungle(text) if role == "jungle" else None,
    }
    extras = {}
    for key, parse in blocks.items():
        try:
            extras[key] = parse()
        except (ValueError, RecursionError, *SHAPE_ERRORS) as error:
            logging.warning("Bloco %s da build do OP.GG não reconhecido: %s", key, error)
            extras[key] = None
    return patch, extras


@lru_cache(maxsize=128)
def fetch_extras(champion, role, cache_window):
    """Extras da página /build (geral, sem adversário). Falha vira (None, blocos vazios) e também fica em cache."""
    query = urlencode(FILTERS | {"type": "ranked"})
    try:
        return parse_build_extras(download(f"https://op.gg/lol/champions/{champion}/build/{role}?{query}"),
                                  champion, role)
    except (OSError, HTTPException, ValueError) as error:
        logging.warning("Página de build do OP.GG indisponível: %s", error)
        return None, dict.fromkeys(EXTRA_KEYS)


@lru_cache(maxsize=128)
def fetch_build(champion, role, target, cache_window):
    query = urlencode(FILTERS | {"type": "ranked"} | ({"target_champion": target} if target else {}))
    base = f"https://op.gg/lol/champions/{champion}"
    runes_patch, games, runes = parse_runes(download(f"{base}/runes/{role}?{query}"), champion, role)
    items_patch, items = parse_items(download(f"{base}/items/{role}?{query}"), champion, role)
    if runes_patch != items_patch:
        raise ValueError("Patches diferentes entre runas e itens do OP.GG.")
    build = {key: best(items[key]) for key in ITEM_SECTIONS.values()}
    # Fica em cache: quem usa as listas brutas nunca deve alterá-las.
    return runes_patch, games, build, runes, items


def champion_build(champion, role, target=None, components=frozenset()):
    """Build de maior taxa de vitória e runas do OP.GG no último patch (Solo/Duo, Esmeralda+).

    "options" traz as outras botas e os itens situacionais; components são ids de itens que viram
    outros itens (não finais) e ficam fora dos situacionais.
    """
    if role not in LANES.values():
        raise ValueError("Rota não suportada.")
    target = target or None
    patch, games, build, runes, items = fetch_build(champion, role, target, int(monotonic() // 600))
    options = {
        "boots": boot_options(items["boots"], build["boots"]),
        "starting": starting_options(items["starting"], build["starting"]),
        "core": core_options(items["core"], build["core"]),
        "situational": situational_items(items.get("items", []), build["core"], items["boots"],
                                         items["starting"], components),
    }
    query = FILTERS | {"type": "ranked", "patch": patch} | ({"target_champion": target} if target else {})
    extra = {}
    if target is None:
        # A página /build é só geral; uma falha nela nunca derruba a build (blocos viram None).
        extras_patch, extras = fetch_extras(champion, role, int(monotonic() // 600))
        if extras_patch != patch:
            extras = dict.fromkeys(EXTRA_KEYS)
        # Cópia profunda: o resultado em cache nunca é alterado por quem usa a resposta.
        extra["extras"] = copy.deepcopy(extras)
    return {
        "champion": champion, "role": role, "target": target, "patch": patch,
        "queue": "ranked", "source": "OP.GG", "scope": f"Esmeralda+ · {QUEUES['ranked']} · todas as regiões",
        "games": games,
        "url": f"https://op.gg/pt/lol/champions/{champion}/build/{role}?{urlencode(query)}",
        "build": build,
        "runes": runes,
        "options": options,
        **extra,
    }


POSITION_KEYS = {"TOP": "top", "JUNGLE": "jungle", "MID": "mid", "ADC": "adc", "SUPPORT": "support"}
POSITIONS_URL = f"https://op.gg/lol/champions?{urlencode(FILTERS)}"
MIN_CHAMPIONS = 150


def parse_role_rates(text, positions):
    """Fração das partidas de cada campeão em cada rota ({campeão: {rota: 0..1}}), na ordem de positions.

    Vem do bloco do RSC com "positionRoleRate" (uma linha por campeão e rota). Linhas inválidas são
    ignoradas; se o bloco não existir ou não for reconhecido, devolve {} sem afetar as rotas.
    """
    marker = '"positionName"'
    first = text.find(marker)
    start = text.rfind('"data":[', 0, first) if first >= 0 else -1
    if start < 0:
        logging.warning("Taxas de rota do OP.GG não encontradas.")
        return {}
    try:
        rows = value_after(text, '"data":[', list, start)
    except ValueError as error:
        logging.warning("Taxas de rota do OP.GG não reconhecidas: %s", error)
        return {}
    found = {}
    skipped = 0
    for row in rows:
        key = row.get("key") if isinstance(row, dict) else None
        lane = POSITION_KEYS.get(row.get("positionName")) if isinstance(row, dict) else None
        value = row.get("positionRoleRate") if isinstance(row, dict) else None
        valid = (isinstance(key, str) and key in positions and lane in positions[key]
                 and isinstance(value, (int, float)) and not isinstance(value, bool)
                 and math.isfinite(value) and 0 <= value <= 1 and lane not in found.get(key, {}))
        if not valid:
            skipped += 1
            continue
        found.setdefault(key, {})[lane] = round(value, 4)
    if skipped:
        logging.warning("%d taxas de rota do OP.GG ignoradas por formato inválido.", skipped)
    return {key: {lane: found[key][lane] for lane in positions[key] if lane in found[key]}
            for key in positions if key in found}


def parse_positions(html):
    """Devolve (patch, {campeão: [rotas]}, {campeão: {rota: fração}}) da lista de campeões do OP.GG.

    As rotas vêm na ordem do OP.GG, da mais jogada para a menos jogada: a primeira é a principal.
    As frações (positionRoleRate) são opcionais: se faltarem, vêm vazias e as rotas continuam valendo.
    """
    canonical = CANONICAL.search(html)
    if not canonical or urlsplit(canonical[1]).path != "/lol/champions":
        raise ValueError("Página do OP.GG não reconhecida.")
    text = rsc_text(html)
    try:
        params = value_after(text, '"params":{', dict, text.find('"params":{"type":"ranked"'))
        patch = params.get("version")
        if (params.get("region") != FILTERS["region"] or params.get("tier") != FILTERS["tier"]
                or params.get("position") != "all" or not isinstance(patch, str)
                or not re.fullmatch(r"\d+\.\d+", patch)):
            raise ValueError("Recorte do OP.GG diferente do solicitado.")
        positions = {}
        for row in value_after(text, '"type":"ranked","data":[', list):
            key, roles = row["key"], row["positions"]
            if not isinstance(key, str) or not re.fullmatch(r"[a-z0-9]+", key) or key in positions:
                raise ValueError(INVALID)
            if not isinstance(roles, list):
                raise ValueError(INVALID)
            lanes = [POSITION_KEYS[role] for role in roles]
            if len(set(lanes)) != len(lanes):
                raise ValueError(INVALID)
            positions[key] = lanes
    except SHAPE_ERRORS as error:
        raise ValueError(INVALID) from error
    if len(positions) < MIN_CHAMPIONS:
        raise ValueError(INVALID)
    return patch, positions, parse_role_rates(text, positions)


@lru_cache(maxsize=4)
def fetch_positions(cache_window):
    return parse_positions(download(POSITIONS_URL))


def champion_positions():
    """Rotas de cada campeão no OP.GG (Solo/Duo, Esmeralda+, todas as regiões), da principal para a menos jogada."""
    patch, positions, rates = fetch_positions(int(monotonic() // 3600))
    return {"source": "OP.GG", "patch": patch, "stale": False, "positions": positions, "rates": rates}

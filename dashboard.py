import argparse
import json
import logging
import webbrowser
from functools import partial
from http.client import HTTPException
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Event, Thread
from urllib.error import HTTPError
from urllib.parse import parse_qs, quote, urlencode, urlsplit

from app import load_env
from draft import DraftClient
from opgg import LANES, QUEUES, NoDataError, champion_aram, champion_build, champion_counters, champion_positions


ROOT = Path(__file__).resolve().parent
CATALOG_FILES = {
    "/api/builds": "builds.json",
    "/api/champions": "champions.json",
    "/api/gear": "gear.json",
    "/api/winrates": "winrates.json",
}
LOCAL_POSITIONS = ROOT / "data" / "roles.json"
GEAR_FILE = ROOT / "data" / "gear.json"


def load_components(path=GEAR_FILE):
    """Ids dos itens que viram outros itens (componentes), marcados com "final": false no gear.json."""
    try:
        items = json.loads(path.read_text(encoding="utf-8"))["items"]
        return frozenset(int(key) for key, item in items.items() if item.get("final") is False)
    except (OSError, ValueError, KeyError, TypeError, AttributeError) as error:
        logging.warning("Lista de componentes indisponível: %s", error)
        return frozenset()


class DraftBrowser:
    def __init__(self, open_tab):
        self.open_tab = open_tab
        self.champion = None
        self.opened = set()

    def observe(self, snapshot):
        if snapshot["status"] in {"waiting", "offline"} or snapshot.get("in_game"):
            self.champion = None
            self.opened.clear()
            return
        champion = snapshot.get("champion")
        if snapshot["status"] != "active" or not champion or not snapshot.get("confirmed"):
            return

        slug = champion["id"].lower()
        if self.champion != slug:
            self.champion = slug
            self.opened.clear()
        role = snapshot.get("role")
        enemies = [enemy for enemy in snapshot.get("enemies", []) if role and enemy.get("role") == role]
        opponent = enemies[0]["id"].lower() if len(enemies) == 1 else None
        if (opponent is None and self.opened) or (opponent is not None and "matchup" in self.opened):
            return

        url = f"https://op.gg/pt/lol/champions/{quote(slug, safe='')}/build"
        if role:
            url += f"/{quote(role, safe='')}"
        if opponent:
            url += "?" + urlencode({"target_champion": opponent})
        self.opened.add("matchup" if opponent else "general")
        try:
            if not self.open_tab(url):
                logging.warning("Não foi possível abrir o OP.GG. Use o link do painel.")
        except (OSError, webbrowser.Error):
            logging.warning("Não foi possível abrir o OP.GG. Use o link do painel.")


class DraftMonitor:
    def __init__(self, client, browser):
        self.client = client
        self.browser = browser
        self.current = {"status": "waiting"}

    def snapshot(self):
        return self.current

    def run(self, stop):
        while not stop.is_set():
            self.current = self.client.snapshot()
            if self.browser:
                self.browser.observe(self.current)
            stop.wait(2)


class DashboardHandler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".js": "application/javascript"}

    def __init__(self, *args, draft_client, champion_ids, components=frozenset(), **kwargs):
        self.draft_client = draft_client
        self.champion_ids = champion_ids
        self.components = components
        super().__init__(*args, directory=str(ROOT / "frontend"), **kwargs)

    def do_GET(self):
        url = urlsplit(self.path)
        if url.path == "/api/draft":
            return self.send_json(self.draft_client.snapshot())
        if url.path in {"/api/opgg/counters", "/api/opgg/aram", "/api/opgg/build"}:
            return self.send_opgg(url)
        if url.path == "/api/opgg/positions":
            return self.send_positions()
        return super().do_GET()

    def send_positions(self):
        """Rotas de cada campeão no OP.GG; sem OP.GG, usa a cópia local em data/roles.json."""
        try:
            data = champion_positions()
        except (OSError, HTTPException, ValueError) as error:
            logging.warning("Falha na consulta de rotas ao OP.GG: %s", error)
            try:
                local = json.loads(LOCAL_POSITIONS.read_text(encoding="utf-8"))
                data = {"source": "local", "patch": local["patch"], "stale": True, "positions": local["positions"]}
                if not isinstance(data["positions"], dict):
                    raise ValueError("Cópia local de rotas inválida.")
                rates = local.get("rates", {})
                data["rates"] = rates if isinstance(rates, dict) else {}
            except (OSError, ValueError, KeyError, TypeError) as fallback_error:
                logging.warning("Cópia local de rotas indisponível: %s", fallback_error)
                return self.send_json({"error": "OP.GG indisponível no momento."}, 502)
        positions = {key: roles for key, roles in data["positions"].items() if key in self.champion_ids}
        rates = {key: value for key, value in (data.get("rates") or {}).items()
                 if key in positions and isinstance(value, dict)}
        return self.send_json({**data, "positions": positions, "rates": rates})

    def send_opgg(self, url):
        query = parse_qs(url.query)
        champion = query.get("champion", [""])[0].lower()
        role = query.get("role", [""])[0]
        queue = query.get("queue", ["ranked"])[0]
        if url.path == "/api/opgg/build":
            target = query.get("target", [""])[0].lower()
            if (champion not in self.champion_ids or role not in LANES.values()
                    or target and (target not in self.champion_ids or target == champion)):
                return self.send_json({"error": "Campeão, rota ou adversário inválidos."}, 400)
        elif champion not in self.champion_ids or role and role not in LANES.values() or queue not in QUEUES:
            return self.send_json({"error": "Campeão, rota ou fila inválidos."}, 400)
        try:
            if url.path == "/api/opgg/build":
                return self.send_json(champion_build(champion, role, target or None, self.components))
            if url.path == "/api/opgg/aram":
                data = champion_aram(champion)
                if data["rate"] is None:
                    return self.send_json({"error": "Taxa de ARAM não publicada no OP.GG."}, 404)
                return self.send_json(data)
            return self.send_json(champion_counters(champion, role, queue))
        except HTTPError as error:
            if error.code == 404:
                return self.send_json({"error": "Dados não publicados no OP.GG."}, 404)
            logging.warning("OP.GG retornou HTTP %s.", error.code)
        except NoDataError as error:
            logging.info("Sem dados no OP.GG: %s", error)
            return self.send_json({"error": "Dados não publicados no OP.GG."}, 404)
        except (OSError, HTTPException, ValueError) as error:
            logging.warning("Falha na consulta ao OP.GG: %s", error)
        return self.send_json({"error": "OP.GG indisponível no momento."}, 502)

    def send_json(self, data, status=200):
        payload = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def end_headers(self):
        path = urlsplit(self.path).path
        if path in {"/", "/index.html", "/styles.css"} or path.startswith("/js/"):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def translate_path(self, path):
        filename = CATALOG_FILES.get(urlsplit(path).path)
        if filename:
            return str(ROOT / "data" / filename)
        return super().translate_path(path)


def main():
    parser = argparse.ArgumentParser(description="Abre o catálogo de builds localmente.")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--auto-open", action="store_true", help="Abre o OP.GG no navegador ao confirmar o campeão.")
    parser.add_argument("--no-auto-open", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()
    client = DraftClient(ROOT, load_env(ROOT / ".env"))
    auto_open = args.auto_open and not args.no_auto_open
    browser = DraftBrowser(webbrowser.open_new_tab) if auto_open else None
    monitor = DraftMonitor(client, browser)
    champion_ids = {row["id"].lower() for row in client.champions.values()}
    handler = partial(DashboardHandler, draft_client=monitor, champion_ids=champion_ids,
                      components=load_components())
    with ThreadingHTTPServer(("127.0.0.1", args.port), handler) as server:
        stop = Event()
        Thread(target=monitor.run, args=(stop,), daemon=True).start()
        print(f"Painel disponível em http://127.0.0.1:{server.server_port}", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            stop.set()


if __name__ == "__main__":
    main()

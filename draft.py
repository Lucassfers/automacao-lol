import base64
import hashlib
import http.client
import json
import os
import ssl
import subprocess
import time
from contextlib import closing
from pathlib import Path

from integrations import IntegrationError, RiotClient


ROLES = {
    "top": "top", "jungle": "jungle", "middle": "mid", "mid": "mid",
    "bottom": "adc", "bot": "adc", "adc": "adc", "utility": "support", "support": "support",
}


def session_key(session):
    """Identificador estável da seleção de campeões, resumido em hash; None se o LCU não expuser nenhum."""
    chat = session.get("chatDetails") or {}
    game = session.get("gameId")
    for value in (session.get("id"), chat.get("multiUserChatId"), chat.get("chatRoomName"), game if game else None):
        if isinstance(value, (str, int)) and not isinstance(value, bool) and str(value).strip():
            return hashlib.sha256(str(value).encode()).hexdigest()[:16]
    return None


def draft_snapshot(session, champions):
    local_cell = session.get("localPlayerCellId")
    player = next((row for row in session.get("myTeam", []) if row["cellId"] == local_cell), None)
    if player is None:
        return {"status": "waiting"}

    picks = [
        action for group in session.get("actions", []) for action in group
        if action.get("type") == "pick"
    ]
    own_picks = [action for action in picks if action["actorCellId"] == local_cell]
    own_pick = own_picks[-1] if own_picks else {}
    assigned_champion = player.get("championId")
    action_champion = own_pick.get("championId")
    confirmed = own_pick.get("completed") is True or (not own_picks and bool(assigned_champion))
    if confirmed:
        champion_id = assigned_champion or action_champion
    else:
        champion_id = action_champion or assigned_champion or player.get("championPickIntent")

    opponents = {row["cellId"]: row for row in session.get("theirTeam", [])}
    allies = {row["cellId"] for row in session.get("myTeam", [])}
    enemies = {}
    for pick in picks:
        cell = pick["actorCellId"]
        if cell in allies or pick.get("completed") is not True:
            continue
        if cell not in opponents and pick.get("isAllyAction") is not False:
            continue
        champion = champions.get(pick.get("championId"))
        if champion:
            row = opponents.get(cell, {})
            enemies[cell] = {
                **champion, "cell": cell,
                "role": ROLES.get((row.get("assignedPosition") or "").lower()),
            }

    return {
        "status": "active",
        "champion": champions.get(champion_id),
        "confirmed": confirmed,
        "role": ROLES.get((player.get("assignedPosition") or "").lower()),
        "enemies": list(enemies.values()),
        "session": session_key(session),
    }


def live_snapshot(data, champions):
    active = data["activePlayer"]
    identity = active.get("riotId") or active.get("summonerName")
    players = data["allPlayers"]
    local = next((row for row in players if identity and identity in (
        row.get("riotId"), row.get("summonerName"),
    )), None)
    if local is None or not local.get("team"):
        return None
    by_id = {row["id"].casefold(): row for row in champions.values()}
    by_name = {row["name"].casefold(): row for row in champions.values()}

    def champion(row):
        raw_name = row.get("rawChampionName", "").removeprefix("game_character_displayname_")
        return by_id.get(raw_name.casefold()) or by_name.get(row.get("championName", "").casefold())

    own = champion(local)
    if own is None:
        return None
    enemies = []
    for cell, row in enumerate(players):
        if not row.get("team") or row["team"] == local["team"]:
            continue
        enemy = champion(row)
        if not enemy:
            continue
        runes = row.get("runes") or {}
        enemies.append({
            **enemy, "cell": cell,
            "role": ROLES.get((row.get("position") or "").lower()),
            "items": [{"id": item.get("itemID"), "name": item["displayName"]} for item in row.get("items", [])
                      if item.get("displayName") and item.get("slot") != 6],
            "runes": [{"id": runes[key].get("id"), "name": runes[key]["displayName"]}
                      for key in ("keystone", "primaryRuneTree", "secondaryRuneTree")
                      if (runes.get(key) or {}).get("displayName")],
        })
    return {
        "status": "active", "in_game": True, "champion": own, "confirmed": True,
        "role": ROLES.get((local.get("position") or "").lower()), "enemies": enemies,
    }


class DraftClient:
    def __init__(self, root, settings):
        data = json.loads((root / "data" / "champions.json").read_text(encoding="utf-8"))
        self.champions = {
            int(row["key"]): {"id": row["id"], "name": row["name"]}
            for row in data["data"].values()
        }
        self.ca_file = root / (settings.get("RIOT_CA_FILE") or "riotgames.pem")
        configured = settings.get("LOL_LOCKFILE")
        self.configured_lockfile = root / configured if configured else None
        self.lockfile = None
        self.next_discovery = 0

    @staticmethod
    def installed_lockfile():
        product = "league_of_legends.live"
        metadata = (Path(os.environ.get("ProgramData", r"C:\ProgramData")) / "Riot Games"
                    / "Metadata" / product / f"{product}.product_settings.yaml")
        try:
            settings = metadata.read_text(encoding="utf-8-sig")
        except (OSError, UnicodeError):
            return None
        for line in settings.splitlines():
            key, _, value = line.partition(":")
            if key.strip() == "product_install_full_path":
                installation = Path(value.strip().strip('"\''))
                if installation.is_absolute():
                    return installation / "lockfile"
        return None

    def locate_lockfile(self):
        if self.configured_lockfile is not None:
            return self.configured_lockfile
        if self.lockfile is not None and self.lockfile.is_file():
            return self.lockfile
        now = time.monotonic()
        if os.name != "nt" or now < self.next_discovery:
            return None
        self.next_discovery = now + 5
        self.lockfile = self.installed_lockfile()
        if self.lockfile is not None and self.lockfile.is_file():
            return self.lockfile

        result = subprocess.run(
            ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command",
             "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); "
             "Get-Process -Name LeagueClientUx,LeagueClient -ErrorAction SilentlyContinue | "
             "Select-Object -ExpandProperty Path"],
            capture_output=True, encoding="utf-8", errors="replace", timeout=4,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
        for executable in result.stdout.splitlines():
            if executable.strip():
                lockfile = Path(executable.strip()).with_name("lockfile")
                if lockfile.is_file():
                    self.lockfile = lockfile
                    return lockfile
        return None

    def snapshot(self):
        draft = self.champion_select()
        if draft["status"] == "active" or not self.ca_file.is_file():
            return draft
        try:
            data = RiotClient(str(self.ca_file)).game_data()
            return (live_snapshot(data, self.champions) if data else None) or draft
        except (IntegrationError, OSError, ValueError, TypeError, KeyError, AttributeError):
            return draft

    def champion_select(self):
        try:
            lockfile = self.locate_lockfile()
            if lockfile is None or not lockfile.is_file():
                return {"status": "offline"}
            _, _, port, token, protocol = lockfile.read_text(encoding="utf-8").strip().split(":")
            if protocol != "https" or not token or not 1 <= int(port) <= 65535:
                return {"status": "unavailable"}
            if not self.ca_file.is_file():
                return {"status": "certificate"}
            context = ssl.create_default_context(cafile=str(self.ca_file))
            auth = base64.b64encode(f"riot:{token}".encode()).decode("ascii")
            with closing(http.client.HTTPSConnection("127.0.0.1", int(port), timeout=3, context=context)) as conn:
                conn.request("GET", "/lol-champ-select/v1/session", headers={"Authorization": f"Basic {auth}"})
                response = conn.getresponse()
                if response.status == 404:
                    return {"status": "waiting"}
                if response.status != 200:
                    return {"status": "unavailable"}
                return draft_snapshot(json.load(response), self.champions)
        except ssl.SSLError:
            return {"status": "certificate"}
        except FileNotFoundError:
            return {"status": "offline"}
        except (OSError, subprocess.SubprocessError, http.client.HTTPException, ValueError, TypeError, KeyError, AttributeError):
            return {"status": "unavailable"}

"""Gera estatísticas locais a partir de partidas ranqueadas da Riot."""

import argparse
import json
import time
from collections import Counter, defaultdict
from fractions import Fraction
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from app import load_env
from draft import ROLES


ROOT = Path(__file__).resolve().parent
REGIONS = ("americas", "asia", "europe", "sea")
QUEUE = 420


def riot_get(region, path, key):
    request = Request(f"https://{region}.api.riotgames.com{path}")
    request.add_unredirected_header("X-Riot-Token", key)
    for attempt in range(2):
        time.sleep(0.1)
        try:
            with urlopen(request, timeout=10) as response:
                return json.load(response)
        except HTTPError as error:
            with error:
                retry = error.headers.get("Retry-After", "")
                if error.code != 429 or attempt or not retry.isdigit() or int(retry) > 60:
                    raise ValueError(f"A API da Riot respondeu HTTP {error.code}.") from None
            time.sleep(int(retry))
        except URLError:
            raise ValueError("Não foi possível conectar à API da Riot.") from None


def fetch_matches(region, riot_ids, count, key):
    matches = set()
    for riot_id in riot_ids:
        name, separator, tag = riot_id.strip().rpartition("#")
        if not separator or not name or not tag:
            raise ValueError("Informe o Riot ID no formato Nome#TAG.")
        account = riot_get(region, f"/riot/account/v1/accounts/by-riot-id/{quote(name, safe='')}/{quote(tag, safe='')}", key)
        puuid = quote(account["puuid"], safe="")
        matches.update(riot_get(region, f"/lol/match/v5/matches/by-puuid/{puuid}/ids?queue={QUEUE}&count={count}", key))

    for match_id in sorted(matches):
        yield riot_get(region, f"/lol/match/v5/matches/{quote(match_id, safe='')}", key)


def build_details(player, items, timeline):
    details = {"spells": [player[slot] for slot in ("summoner1Id", "summoner2Id") if player.get(slot)]}
    if not timeline:
        return details

    purchases = []
    skills = []
    participant = player.get("participantId")
    if not participant:
        return details
    for frame in timeline["info"]["frames"]:
        for event in frame["events"]:
            if event.get("participantId") != participant:
                continue
            kind = event["type"]
            if kind == "ITEM_PURCHASED" and event.get("itemId"):
                purchases.append((event["timestamp"], event["itemId"]))
            elif kind == "ITEM_UNDO" and event.get("beforeId"):
                for index in range(len(purchases) - 1, -1, -1):
                    if purchases[index][1] == event["beforeId"]:
                        purchases.pop(index)
                        break
            elif kind == "SKILL_LEVEL_UP" and event.get("levelUpType") == "NORMAL":
                slot = event.get("skillSlot")
                if slot in (1, 2, 3, 4):
                    skills.append("QWER"[slot - 1])

    remaining = Counter(items)
    ordered = []
    for _, item in reversed(purchases):
        if remaining[item]:
            ordered.append(item)
            remaining[item] -= 1
    details.update({
        "starting": [item for timestamp, item in purchases if timestamp <= 60_000],
        "purchase_order": ordered[::-1],
        "skills": skills,
    })
    return details


def summarize(matches, minimum, assets, get_timeline=None):
    by_patch = defaultdict(dict)
    item_ids = {int(key) for key, item in assets["items"].items() if item["build"]}
    for match in matches:
        info = match["info"]
        if info.get("queueId") != QUEUE or info.get("gameDuration", 0) < 300:
            continue
        version = tuple(int(part) for part in info["gameVersion"].split(".")[:2])
        by_patch[version][match["metadata"]["matchId"]] = info["participants"]
    if not by_patch:
        raise ValueError("Nenhuma partida válida de ranqueada Solo/Duo na amostra.")

    patch = max(by_patch)
    sample = by_patch[patch]
    groups = defaultdict(lambda: (Counter(), Counter(), Counter(), Counter()))
    games = Counter()
    wins = Counter()
    examples = {}
    for match_id, players in sample.items():
        for player in players:
            role = ROLES.get(player.get("teamPosition", "").lower())
            champion_id = player.get("championId")
            if not role or not champion_id or type(player.get("win")) is not bool:
                continue
            items = tuple(sorted(item for index in range(6) if (item := player.get(f"item{index}")) in item_ids))
            perks = player.get("perks", {})
            runes = tuple(selection["perk"] for style in perks.get("styles", []) for selection in style["selections"])
            stats = perks.get("statPerks", {})
            shards = tuple(stats.get(slot, 0) for slot in ("offense", "flex", "defense"))
            opposite = [row for row in players if row["teamId"] != player["teamId"]
                        and row.get("teamPosition") == player["teamPosition"] and row.get("championId")]
            targets = [0, opposite[0]["championId"]] if len(opposite) == 1 else [0]
            for enemy in targets:
                group = (champion_id, role, enemy)
                games[group] += 1
                wins[group] += player["win"]
                item_counts, item_wins, rune_counts, rune_wins = groups[group]
                if len(items) >= 3:
                    item_counts[items] += 1
                    item_wins[items] += player["win"]
                    key = (champion_id, role, enemy, items)
                    previous = examples.get(key)
                    if previous is None or (player["win"] and not previous[1]["win"]):
                        examples[key] = (match_id, player)
                if len(runes) == 6:
                    rune_counts[(runes, shards)] += 1
                    rune_wins[(runes, shards)] += player["win"]

    def best(counts, wins):
        eligible = (choice for choice, count in counts.items() if count >= minimum)
        return max(eligible, key=lambda choice: (Fraction(wins[choice], counts[choice]), counts[choice], choice), default=None)

    result = {}
    timelines = {}
    for (champion, role, enemy), (items, item_wins, runes, rune_wins) in groups.items():
        complete = Counter({choice: count for choice, count in items.items() if len(choice) == 6})
        best_items = best(complete, item_wins) or best(items, item_wins)
        best_runes = best(runes, rune_wins)
        build = None
        if best_items:
            match_id, player = examples[(champion, role, enemy, best_items)]
            if get_timeline and match_id not in timelines:
                timelines[match_id] = get_timeline(match_id)
            build = {
                "ids": best_items, "games": items[best_items], "wins": item_wins[best_items],
                **build_details(player, best_items, timelines.get(match_id)),
            }
        result.setdefault(str(champion), {}).setdefault(role, {})[str(enemy)] = {
            "games": games[(champion, role, enemy)],
            "record": {"games": games[(champion, role, enemy)], "wins": wins[(champion, role, enemy)]},
            "build": build,
            "runes": {"ids": best_runes[0], "shards": best_runes[1], "games": runes[best_runes],
                      "wins": rune_wins[best_runes]} if best_runes else None,
        }
    return {"patch": ".".join(map(str, patch)), "matches": len(sample), "minimum": minimum, "champions": result}


def read_matches(folder):
    matches = []
    timelines = {}
    for path in sorted(folder.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        if "frames" in data["info"]:
            timelines[data["metadata"]["matchId"]] = data
        else:
            matches.append(data)
    return matches, timelines.get


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--riot-id", action="append", help="Riot ID no formato Nome#TAG. Pode ser repetido.")
    source.add_argument("--matches", type=Path, help="Pasta com respostas JSON individuais do Match-V5.")
    parser.add_argument("--region", choices=REGIONS, default="americas")
    parser.add_argument("--count", type=int, choices=range(1, 101), default=50, metavar="1–100")
    parser.add_argument("--minimum", type=int, default=5)
    args = parser.parse_args()
    if args.minimum < 2:
        parser.error("--minimum precisa ser pelo menos 2.")
    try:
        assets = json.loads((ROOT / "data" / "gear.json").read_text(encoding="utf-8"))
        if args.riot_id:
            key = load_env(ROOT / ".env").get("RIOT_API_KEY")
            if not key:
                raise ValueError("Configure RIOT_API_KEY no .env para consultar o Match-V5.")
            matches = fetch_matches(args.region, args.riot_id, args.count, key)
            def get_timeline(match_id):
                path = f"/lol/match/v5/matches/{quote(match_id, safe='')}/timeline"
                return riot_get(args.region, path, key)
        else:
            matches, get_timeline = read_matches(args.matches)
        stats = summarize(matches, args.minimum, assets, get_timeline)
        output = ROOT / "data" / "winrates.json"
        temporary = output.with_suffix(".tmp")
        temporary.write_text(json.dumps(stats, ensure_ascii=False), encoding="utf-8")
        temporary.replace(output)
        print(f"Estatísticas geradas com {stats['matches']} partidas do patch {stats['patch']}.")
    except (ValueError, KeyError, OSError) as error:
        parser.exit(1, f"Erro: {error}\n")


if __name__ == "__main__":
    main()

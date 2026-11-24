import argparse
import json
import logging
import math
import os
import ssl
import time
from collections.abc import Callable
from pathlib import Path

from builds import format_recommendation, load_catalog
from integrations import DiscordWebhook, IntegrationError, Match, RiotClient, parse_match


ROOT = Path(__file__).resolve().parent


def load_env(path: Path) -> dict[str, str]:
    settings = {}
    if path.is_file():
        for number, line in enumerate(path.read_text(encoding="utf-8-sig").splitlines(), start=1):
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            key, separator, value = line.partition("=")
            if not separator or not key.strip().isidentifier():
                raise ValueError(f"Linha {number} do .env inválida. Use CHAVE=valor.")
            settings[key.strip()] = value.strip()
    return settings | dict(os.environ)


class MatchMonitor:
    def __init__(self, catalog: list[dict], role: str, patch: str, send: Callable[[str], None]):
        self.catalog = catalog
        self.role = role
        self.patch = patch
        self.send = send
        self.previous_match = None

    def observe(self, match: Match) -> None:
        previous = self.previous_match
        self.previous_match = match
        # A API não fornece ID de partida. O relógio volta ao início quando muda a sessão.
        if previous and previous.champion == match.champion and match.game_time >= previous.game_time - 1:
            return

        logging.info("Partida detectada. Campeão: %s.", match.champion)
        message = format_recommendation(self.catalog, match.champion, self.role, self.patch)
        self.send(message)
        logging.info("Recomendação gerada com sucesso.")


def run_live(client: RiotClient, monitor: MatchMonitor, interval: float) -> None:
    waiting = False
    while True:
        try:
            match = client.current_match()
            if match:
                waiting = False
                monitor.observe(match)
            elif not waiting:
                logging.info("Aguardando uma partida no League of Legends.")
                waiting = True
        except IntegrationError as error:
            logging.warning("%s", error)
        time.sleep(interval)


def main() -> int:
    parser = argparse.ArgumentParser(description="Monitora partidas de LoL e envia builds ao Discord.")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--demo", action="store_true", help="Simula uma partida e imprime o resultado.")
    mode.add_argument("--enviar-demo", action="store_true", help="Simula uma partida e envia ao Discord.")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    try:
        settings = load_env(ROOT / ".env")
        catalog = load_catalog(ROOT / "data" / "builds.json")
        if args.demo or args.enviar_demo:
            send = print if args.demo else DiscordWebhook(settings.get("DISCORD_WEBHOOK_URL", "")).send
            data = json.loads((ROOT / "data" / "partida_demo.json").read_text(encoding="utf-8"))
            monitor = MatchMonitor(catalog, "mid", "geral", send)
            monitor.observe(parse_match(data))
            data["gameData"]["gameTime"] += 5
            monitor.observe(parse_match(data))
        else:
            webhook = DiscordWebhook(settings.get("DISCORD_WEBHOOK_URL", ""))
            role = settings.get("BUILD_ROLE", "mid").strip()
            patch = settings.get("BUILD_PATCH", "geral").strip()
            interval = float(settings.get("POLL_SECONDS", "5"))
            if not role or not patch or not math.isfinite(interval) or interval < 1:
                raise ValueError("Informe BUILD_ROLE e BUILD_PATCH e use POLL_SECONDS de pelo menos 1.")
            ca_file = ROOT / settings.get("RIOT_CA_FILE", "riotgames.pem")
            if not ca_file.is_file():
                raise ValueError("Certificado da Riot ausente. Veja no README como configurar RIOT_CA_FILE.")
            run_live(RiotClient(str(ca_file)), MatchMonitor(catalog, role, patch, webhook.send), interval)
    except KeyboardInterrupt:
        logging.info("Monitoramento encerrado.")
    except (ValueError, OSError, IntegrationError) as error:
        if isinstance(error, ssl.SSLError):
            logging.error("Certificado da Riot inválido. Revise RIOT_CA_FILE.")
        else:
            logging.error("%s", error)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

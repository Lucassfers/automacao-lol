import http.client
import json
import logging
import math
import re
import ssl
import time
from contextlib import closing
from dataclasses import dataclass
from urllib.parse import urlsplit


TIMEOUT = 4
DISCORD_HOSTS = {"discord.com", "canary.discord.com", "ptb.discord.com"}


class IntegrationError(Exception):
    pass


@dataclass(frozen=True)
class Match:
    champion: str
    game_time: float


def parse_match(data: dict) -> Match:
    active = data["activePlayer"]
    riot_id = active.get("riotId")
    summoner_name = active.get("summonerName")
    for player in data["allPlayers"]:
        same_player = (
            player["riotId"] == riot_id
            if riot_id and player.get("riotId")
            else bool(summoner_name and player.get("summonerName") == summoner_name)
        )
        if same_player:
            champion = player["championName"]
            game_time = data["gameData"]["gameTime"]
            if (
                not isinstance(champion, str) or not champion.strip()
                or type(game_time) not in (int, float)
                or not math.isfinite(game_time) or game_time < 0
            ):
                break
            return Match(champion.strip(), game_time)
    raise ValueError("Campeão do jogador ativo ou tempo de partida indisponível.")


class RiotClient:
    def __init__(self, ca_file: str):
        self.context = ssl.create_default_context(cafile=ca_file)

    def game_data(self) -> dict | None:
        with closing(http.client.HTTPSConnection(
            "127.0.0.1", 2999, timeout=TIMEOUT, context=self.context
        )) as connection:
            try:
                connection.request("GET", "/liveclientdata/allgamedata")
                response = connection.getresponse()
                if response.status != 200:
                    raise IntegrationError(f"Cliente da Riot retornou HTTP {response.status}.")
                return json.loads(response.read())
            except ConnectionRefusedError:
                return None
            except (ValueError, KeyError, TypeError, AttributeError) as error:
                raise IntegrationError("O cliente da Riot devolveu dados incompletos ou inválidos.") from error
            except (OSError, http.client.HTTPException) as error:
                raise IntegrationError(f"Falha ao consultar o cliente da Riot ({type(error).__name__}).") from error

    def current_match(self) -> Match | None:
        data = self.game_data()
        if data is None:
            return None
        try:
            return parse_match(data)
        except (ValueError, KeyError, TypeError, AttributeError) as error:
            raise IntegrationError("O cliente da Riot devolveu dados incompletos ou inválidos.") from error


class DiscordWebhook:
    def __init__(self, url: str):
        parts = urlsplit(url)
        if (
            parts.scheme != "https" or parts.netloc not in DISCORD_HOSTS
            or not re.fullmatch(r"/api/webhooks/\d+/[\w-]+", parts.path, re.ASCII)
            or parts.query or parts.fragment
        ):
            raise ValueError("Configure DISCORD_WEBHOOK_URL com a URL HTTPS copiada do Discord.")
        self.host = parts.netloc
        self.path = parts.path + "?wait=true"

    def send(self, message: str) -> None:
        if len(message.encode("utf-16-le")) // 2 > 2000:
            raise IntegrationError("A mensagem excede o limite do Discord. Reduza os textos do catálogo.")

        payload = json.dumps({
            "content": message,
            "allowed_mentions": {"parse": []},
        }).encode("utf-8")
        for attempt in range(1, 4):
            try:
                with closing(http.client.HTTPSConnection(self.host, timeout=TIMEOUT)) as connection:
                    connection.request("POST", self.path, payload, {"Content-Type": "application/json"})
                    response = connection.getresponse()
                    status = response.status
                    if status in (200, 204):
                        return
                    if status == 429:
                        retry_after = response.getheader("Retry-After", "")
                    else:
                        retry_after = ""
            except (OSError, http.client.HTTPException) as error:
                raise IntegrationError(
                    f"Falha de rede no Discord ({type(error).__name__}). Confirmação de envio indisponível."
                ) from None

            if status != 429 or attempt == 3:
                raise IntegrationError(f"Discord retornou HTTP {status}.")
            try:
                delay = float(retry_after)
            except ValueError:
                raise IntegrationError("Discord retornou HTTP 429 sem intervalo de espera válido.") from None
            if not 0 <= delay <= 30:
                raise IntegrationError("Discord retornou HTTP 429 com espera fora do limite configurado.")
            logging.warning("Discord limitou o envio. Nova tentativa em %.1f s.", delay)
            time.sleep(delay)

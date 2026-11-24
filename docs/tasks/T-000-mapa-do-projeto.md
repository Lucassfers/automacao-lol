# T-000 — Mapa do projeto

Projeto acadêmico: assistente de builds de League of Legends. A pasta não é repositório git, então não há registros retroativos por commit.

## Módulos
- `app.py`: monitor de partida (Live Client Data API, `127.0.0.1:2999`) que envia a recomendação ao webhook do Discord. Modos `--demo` e `--enviar-demo`.
- `builds.py`: carrega e formata o catálogo `data/builds.json`.
- `integrations.py`: `RiotClient` (Live Client, TLS com `riotgames.pem`), `DiscordWebhook` (com retry em 429) e `parse_match`.
- `draft.py`: `DraftClient` lê o `lockfile` do cliente (LCU), consulta `/lol-champ-select/v1/session` e gera um snapshot (meu campeão, rota e inimigos com pick concluído). Na partida, usa `live_snapshot`.
- `opgg.py`: faz o scraping da página `op.gg/lol/champions/<c>/counters/<rota>` (Esmeralda+, Solo/Duo, global) e extrai a taxa geral e os matchups `{rate, games}` do ponto de vista do campeão. Cache de 10 min (`lru_cache` + janela).
- `winrates.py`: importa partidas Match-V5 (com `RIOT_API_KEY`) e gera `data/winrates.json` com a melhor build e as melhores runas por campeão/rota/adversário.
- `dashboard.py`: servidor HTTP local (`127.0.0.1:8765`) com os endpoints `/api/draft`, `/api/opgg/counters`, `/api/builds|champions|gear|winrates` e os arquivos estáticos de `frontend/`. Opcionalmente, abre o OP.GG no navegador ao confirmar o pick.
- `frontend/`: SPA em JS puro (`app.js`), com lista de campeões, quadro do draft (poll de 2 s), banner, cartões "Maior taxa de vitória" e builds do catálogo.

## Fluxos
1. Draft: LCU → `draft.py` → `/api/draft` → `app.js` (`renderDraft`/`renderMatchup`) → `/api/opgg/counters` → taxas na tela.
2. Partida: Live Client → `app.py` → Discord.
3. Estatísticas: Riot Match-V5 → `winrates.py` → `data/winrates.json` → painel.

## Configuração
`.env` (ver `.env.example`): `DISCORD_WEBHOOK_URL`, `RIOT_CA_FILE`, `BUILD_ROLE`, `BUILD_PATCH`, `POLL_SECONDS`, `LOL_LOCKFILE`, `RIOT_API_KEY`. Não há banco de dados nem deploy, tudo roda localmente.

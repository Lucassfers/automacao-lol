# T-003 — Taxas Flex e ARAM no cartão Geral

- **Status:** Concluído
- **Data:** 2026-11-13
- **Risco:** Médio (endpoint novo e scraping)

## Pedido
"Nos do lado deve exibir tipo % na flex, e aram na direita, dai bota no lugar desse de Taxa de vitória dos itens e Taxa de vitória das runas."

## Padrões adotados
- **Flex:** página de counters do OP.GG com `type=flex`, mesma rota e tier (Esmeralda+) do Solo/Duo.
- **ARAM:** página `op.gg/lol/modes/aram/<c>/build`, global, sem rota nem tier.
- **Cartão "Contra o adversário":** passa a mostrar "Confronto · Solo/Duo" e "Confronto · Flex". O ARAM fica fora porque não tem confronto por rota.

## Arquitetura e decisões
**Agente 1: dispensado.** O orquestrador investigou as páginas do OP.GG (curl) e definiu a arquitetura no briefing.
- `opgg.py`:
  - `champion_counters(..., queue)` aceita `ranked` ou `flex`;
  - novo parser `parse_aram`;
  - `download` compartilhado, com limite de tamanho, timeout e checagem de domínio;
  - cache de 10 min.
- `dashboard.py`: `/api/opgg/counters` com `queue`; novo `/api/opgg/aram`. Valida contra lista fechada e devolve erros genéricos.
- `frontend/app.js`: slots `ownFlex` e `aram`; métricas do cartão Geral e do confronto.

## Arquivos alterados
`opgg.py`, `dashboard.py`, `frontend/app.js`, `frontend/index.html` (`app.js?v=15`).

## QA
Agente 3: **APROVADO**.
- **Parsers:** testados com os HTMLs salvos.
- **Endpoints ao vivo:** Orianna 47,4 / 48,55 / 48,96 e Garen 50,84 / 52,24 / 50,98 (Solo/Duo / Flex / ARAM).
- **Entradas inválidas:** todas devolveram 400. Foram testadas tentativas de path traversal e de SSRF.
- **Erros:** respostas genéricas, sem detalhes internos.
- **Navegador headless:** offline e com draft simulado. Orianna x Galio deu Solo/Duo 49,79% e Flex 59,28%.
- **Regressão:** nenhuma em relação à T-001.

Observações menores que não bloqueiam:
- se o OP.GG omitir o patch do ARAM, aparece "patch null";
- os arquivos alterados passaram de LF para CRLF;
- `queue=` vazio vira Solo/Duo.

## Revisão final
- Design system: foram mantidos os componentes `winrateMetric` e `build-card`.
- Vazamento: os endpoints só fazem a consulta ao OP.GG e não expõem dados do projeto. As entradas passam por lista fechada.

## Como reverter
Restaurar `opgg.py`, `dashboard.py`, `frontend/app.js` e `frontend/index.html` do backup `backup-T-003` (scratchpad da sessão).

## Riscos
O scraping depende do HTML do OP.GG. Se o layout mudar, os estados exibidos passam a ser "Sem dados" ou "indisponível".

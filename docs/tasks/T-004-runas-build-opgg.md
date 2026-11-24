# T-004 — Runas e build de maior winrate do OP.GG (último patch)

- **Status:** Concluído
- **Data:** 2026-11-13
- **Risco:** Médio (endpoint novo, scraping de payload RSC)

## Pedido
"Aqui deveria exibir as runas tal qual já exibe no site também dessa mesma forma, e a build tem que ser a com maior % de vitória e na versão mais atualizada do jogo (último patch)." (print do bloco de runas do OP.GG)

## Padrões adotados
- **Patch:** o atual publicado pelo OP.GG, no recorte Esmeralda+, Solo/Duo, global, na rota do campeão.
- **Maior taxa de vitória:** só entram opções com escolha ≥ 1% e ≥ 100 partidas. Se nenhuma passar, vale a de mais partidas, com o aviso "amostra pequena".
- **Onde a regra vale:** itens principais, botas, itens iniciais, a página de runas que abre selecionada e a combinação de runas dentro de cada página.
- **Contra o adversário:** o cartão usa o mesmo componente, com `target_champion`.

## Arquitetura e decisões
Agente 1 executado.
- Fonte: as páginas `/runes/{role}` e `/items/{role}` do OP.GG. A página `/build` foi descartada porque é incompleta e não traz os IDs.
- Os dados vêm do payload Next.js RSC (`self.__next_f.push`).
- `opgg.py`: `champion_build`, com 9 validações de layout. Qualquer falha vira `ValueError`, e a resposta é 502.
- Endpoint `/api/opgg/build`, com validação por lista fechada.
- Frontend: `runePanel` (abas acessíveis + grade) e build com vitória, escolha e partidas.

## Arquivos alterados
- Alterados: `opgg.py`, `dashboard.py`, `frontend/app.js`, `frontend/styles.css`, `frontend/index.html` (`v=9` e `v=16`).
- Novos: `tests/test_opgg_build.py` (18 testes) e `tests/fixtures/*.html`.

## QA
Agente 3: **APROVADO**.
- Testes: 18 de 18.
- Regra de escolha conferida ao vivo (Orianna mid e Zed jungle x Aatrox).
- A aba de runas se mantém entre os polls.
- Fallback validado.
- Endpoint: 400 em todos os casos de traversal e injeção; 404 e 502 genéricos.
- Sem regressão em T-001 e T-003.
- Sem rolagem horizontal em 375 px com as grades carregadas.

Observações que não bloqueiam (possíveis próximas tarefas):
1. Requisição extra de build, numa rota provisória, antes de a rota padrão do OP.GG chegar (`app.js` ~632/668).
2. Confrontos raros (com menos de 5 árvores) caem em 502 em vez de 404 e tentam de novo a cada 30 s. O fallback local cobre.
3. `styles.css` passou de LF para CRLF.

## Revisão final
- Design system: segue os tokens existentes (dourado/escuro) e o padrão `build-card`/`gearRow`.
- Vazamento: o endpoint só faz a consulta ao OP.GG; as entradas passam por lista fechada e os erros são genéricos.

## Como reverter
Restaurar os 5 arquivos do backup `backup-T-004` (scratchpad da sessão) e apagar a pasta `tests/`.

## Riscos
- O payload RSC do OP.GG não é uma API pública e pode mudar. Se mudar, o painel volta à build de referência.
- A regra de maior taxa de vitória favorece builds de "bola de neve" com pouca escolha.

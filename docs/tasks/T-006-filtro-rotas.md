# T-006 — Filtro por rota nas listas + limpeza da coluna Inimigos

- **Status:** Concluído
- **Data:** 2026-11-23
- **Risco:** Médio (endpoint novo de scraping)

## Pedido
"Remove o texto que eu destaquei vermelho aqui (Revelados no draft / Abra o League of Legends… / Escolher manualmente 173). Daí adiciona opção de filtros por rotas abaixo do campo de buscar campeão (bota o ícone de cada rota do jogo) num quadradinho todos lado a lado. E quando eu escolher meu campeão já deve filtrar automaticamente os campeões da respectiva rota padrão do meu campeão, mas com opção de filtrar outro também."

## Dúvidas e respostas / padrões adotados
Sem perguntas. Padrões:
- **Onde ficam os filtros:** nas duas listas (esquerda e direita). Clicar no filtro ativo mostra todos.
- **Filtro automático:** só na lista de inimigos. Na abertura da página não filtra. Escolher um campeão, inclusive clicar no que já está selecionado, aplica a rota padrão dele. Uma troca manual vale até a escolha de outro campeão.
- **Rota padrão:** a do draft. Sem draft, `positions[0]` do OP.GG, que é a rota com maior role rate.
- **Ícones:** SVG inline próprio, no estilo dos ícones de posição do LoL. Não dependem de rede.

## Arquitetura e decisões
Agente 1 executado.
- **Fonte:** `op.gg/lol/champions?region=global&tier=emerald_plus`. O payload RSC traz `positions` dos 173 campeões numa só requisição, ordenado por role rate.
- **`opgg.py`:** `parse_positions`, `fetch_positions` (`lru_cache` de 1 h) e `champion_positions`. Validações: canonical, recorte, chaves, rotas e um mínimo de 150 campeões.
- **`GET /api/opgg/positions`:** se o OP.GG falhar, usa `data/roles.json` (`stale:true`). Sem esse arquivo, responde 502 com mensagem genérica.
- **Front:** `rolesOf`, `roleFilters`, `syncEnemyRoleFilter`, `ownDefaultRole` e `ownRoleKey`, mais a flag `enemyRoleFromOpening`.

## Arquivos alterados
- Alterados: `opgg.py`, `dashboard.py`, `frontend/index.html` (`v=11` e `v=18`), `frontend/app.js` e `frontend/styles.css`.
- Novos: `data/roles.json`, `tests/test_opgg_positions.py` e `tests/fixtures/champions_list.html`.

## Banco / infra
Nenhum. O servidor local precisou ser reiniciado por causa do endpoint novo.

## QA
Agente 3: **REPROVADO** na 1ª rodada. Clicar no campeão inicial, que já vinha selecionado, não aplicava o filtro. O Dev corrigiu e o reteste deu **APROVADO**.
- `pytest` 29 de 29 e `node --check` OK.
- O filtro funciona nas duas listas, soma com a busca, tem `aria-pressed` e liga e desliga com o mesmo clique.
- Filtro automático conferido com Ahri (Meio), Garen (Topo) e draft simulado `adc` (Atirador). A troca manual persiste nos polls.
- Segurança do endpoint:
  - parâmetros estranhos e traversal não vazam nada;
  - POST, PUT e DELETE respondem 501;
  - o fallback local e o 502 genérico foram conferidos.
- Layout em 1920, 1180 e 375 px sem rolagem horizontal. Sem regressões de T-001 a T-005.

## Revisão final
- **Design system:** usa os tokens `--line`, `--panel`, `--gold` e `--gold-light`, com estado ativo dourado.
- **Vazamento:** endpoint só de leitura, sem parâmetros, devolve só os ids do catálogo. Os erros são genéricos e o detalhe fica só no log.

## Como reverter
Restaurar os arquivos de `backup-T-006` no scratchpad da sessão (`app.js`, `index.html`, `styles.css`, `dashboard.py`, `opgg.py`). Apagar `data/roles.json`, `tests/test_opgg_positions.py` e `tests/fixtures/champions_list.html`, e reiniciar `python dashboard.py`.

## Riscos
- O payload RSC do OP.GG não é API pública. Se mudar, o painel cai no `roles.json`, que tem o snapshot do patch 16.23.
- Com o filtro ativo, um inimigo escolhido à mão pode sumir da lista, mas continua valendo no confronto.

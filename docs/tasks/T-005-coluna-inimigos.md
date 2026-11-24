# T-005 — Lista lateral de inimigos (draft + busca manual)

- **Status:** Concluído
- **Data:** 2026-11-23
- **Risco:** Baixo (só frontend)

## Pedido
"Quero que conforme for exibindo os campeões inimigos eles apareçam na lista lateral aqui à direita. Daí move a lista à esquerda dos campeões mais pra esquerda e deixa tudo centralizado. Além disso na direita deixe a opção de selecionar um inimigo também (buscando) tal qual a esquerda, caso eu queira selecionar sem buscar na API." (print com a área vazia à direita destacada)

## Dúvidas e respostas / padrões adotados
Sem perguntas ao usuário. Padrões:
- Clicar num inimigo (do draft ou manual) tem o mesmo efeito do clique em inimigo que já existia: filtra o 2º bloco, mostra a winrate do confronto, a build/runas do matchup e o link do OP.GG.
- A escolha manual fica em `sessionStorage["rift-enemy"]` e o poll do draft não a apaga. Clicar de novo no campeão marcado limpa a escolha. Clicar num inimigo do draft substitui a escolha manual.
- A escolha manual também vale sem o cliente do LoL aberto.
- Responsivo: até 1180px, 2 colunas, com Inimigos acima do conteúdo; até 620px, tudo empilhado (esquerda → inimigos → conteúdo).

## Arquitetura e decisões
Agente 1 executado. O backend não muda: `/api/draft` já devolve `enemies` só com picks confirmados.
- `manualEnemy` é um estado separado de `selectedEnemy`, porque `renderDraft` zera `selectedEnemy` quando o inimigo sai do snapshot.
- `currentEnemy()` decide qual inimigo vale. `refresh()` e `renderOverview()` tratam o caso sem draft.
- As duas listas usam `renderChampionPicker` (`renderOwnPicker` e `renderEnemyPicker`). `renderDraftEnemies` saiu de `renderMatchup`.
- O grid de 3 colunas tem `max-width` de 1760px, igual à topbar.

## Arquivos alterados
- `frontend/index.html`: novo aside `.sidebar-enemies`, `#draft-enemies` movido para ele, `styles.css?v=10` e `app.js?v=17`.
- `frontend/app.js`: o estado e as funções acima, mais a guarda `&& draft.champion` em `opggRate`.
- `frontend/styles.css`: grid de 3 colunas, estilo da coluna Inimigos e media queries de 1180, 840 e 620px.

## Banco / infra
Nenhum.

## QA
Agente 3: **APROVADO**.
- `node --check`: OK.
- `pytest`: 18 de 18.
- Teste no Chrome headless com draft simulado:
  - a busca sem acento funciona;
  - a escolha manual funciona com e sem draft e continua depois de polls e do F5;
  - clicar num inimigo do draft substitui a escolha manual.
- Layout conferido em 1920, 1180, 1024, 840 e 375px. Em 375px, `scrollWidth` = 375.
- Sem regressões de T-001 a T-004 e sem `window.open`.
- Não testado: draft real com o cliente do LoL aberto.

Observação que não bloqueia: na lista manual dá para escolher o próprio campeão como inimigo (Ahri contra Ahri).

## Revisão final
- Design system: reaproveita `.sidebar`, `.champion-button`, os tokens dourado/escuro e as cores `data-tone`.
- Vazamento: nenhum endpoint novo e nenhum dado sensível. A escolha fica só no sessionStorage do navegador.

## Como reverter
Restaurar `frontend/index.html`, `frontend/app.js` e `frontend/styles.css` do backup `backup-T-005`, no scratchpad da sessão.

## Riscos
- Re-render de cerca de 340 botões por atualização das duas listas. O desempenho ficou aceitável no teste.
- O comportamento com o cliente real do LoL foi validado só com draft simulado.

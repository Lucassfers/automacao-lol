# T-007 — Abas Geral/Confronto, runas ao lado dos itens e build completa

- **Status:** Concluído
- **Data:** 2026-11-23
- **Risco:** Médio (parser novo do OP.GG, contrato do endpoint ampliado, refatoração de layout)

## Pedido
"1. Aqui quero que o Ahri Geral e o Ahri vs inimigo sejam abas que dê para intercalar. 2. Quero que ao lado dos itens fiquem as runas, daí à direita fiquem os respectivos itens. 3. A build do personagem deve vir completa com os itens principais em destaque e os situacionais abaixo. A bota deve vir com as outras opções da bota também." (print da seção "Maior taxa de vitória")

## Dúvidas e respostas / padrões adotados
Sem perguntas. Padrões:
- A aba Geral abre por padrão.
- A aba de confronto abre sozinha uma vez por par campeão|inimigo. Sem inimigo, fica desabilitada e mostra uma dica.
- A aba escolhida é salva em `sessionStorage["rift-winrate-tab"]` e o poll não a reseta.
- Os cartões de taxa ficam em cima. Abaixo, runas à esquerda e itens à direita; em telas estreitas a tela empilha.
- Itens: até 6 situacionais e até 4 botas, com a regra da T-004 (escolha ≥ 1% e ≥ 100 partidas, ordenando por vitória). A bota da build vem primeiro.
- O selo "Maior vitória" aparece só quando os dados vêm do OP.GG.

## Arquitetura e decisões
Agente 1 executado.
- **Fonte:** a mesma página `/items/{role}`, que já trazia a lista "Items" (30 itens soltos). Não há requisição extra. A página `/build` foi descartada (é JSX, sem `pick_rate`).
- **`opgg.py`:**
  - `sections["items"]` opcional;
  - `ranked`, `situational_items` e `boot_options`, que excluem core, botas, iniciais e componentes;
  - `champion_build` ganhou `options: {boots, situational}`.
- O contrato é retrocompatível. O cache nunca é mutado.
- **`data/gear.json`:** 138 itens marcados com `"final": false` (componentes que têm `into` no Data Dragon 16.22.1).
- **`dashboard.py`:** carrega `components` na inicialização.
- **Front:** `winrateTabs` (tablist acessível), `.build-split` com container query, `coreRow` (destaque e selo) e `gearOptions`.

## Arquivos alterados
`opgg.py`, `dashboard.py`, `data/gear.json`, `frontend/app.js`, `frontend/styles.css`, `frontend/index.html` (`styles.css?v=12`, `app.js?v=20`) e `tests/test_opgg_build.py` (41 testes no total).

## Banco / infra
Nenhum. O servidor local foi reiniciado.

## QA
Agente 3:
- **1ª rodada: REPROVADO.** No fallback, a build de referência aparecia com o selo "Maior vitória".
- **Reteste após a correção: APROVADO.**

O que foi conferido:
- `pytest` 41 de 41 e `node --check` OK.
- **Abas:** padrão, aba desabilitada, abertura automática, persistência no poll e no F5, teclado e foco.
- **Layout:** 1920, 1180 e 375 px, sem ids duplicados.
- **Itens:** situacionais sem componentes e sem repetição; botas com a escolhida marcada.
- **Segurança:** traversal, null byte, XSS e SQLi devolvem 400 genérico, sem campos sensíveis.
- **Regressões:** nenhuma em T-001 a T-006 e nenhum `window.open`.

## Revisão final
- **Design system:** usa os tokens dourado e escuro, `rune-best` (selo) e `build-card`.
- **Vazamento:** nenhum endpoint novo. `/api/opgg/build` só ganhou `options`, com a mesma validação por lista fechada e erros genéricos.

## Como reverter
Restaurar os arquivos de `backup-T-007` no scratchpad da sessão: `app.js`, `index.html`, `styles.css`, `dashboard.py`, `opgg.py`, `gear.json` (em `data/`) e `tests/test_opgg_build.py`. Depois, reiniciar `python dashboard.py`.

## Riscos
- O payload RSC do OP.GG não é uma API pública. Se a lista "Items" sumir, os situacionais ficam vazios ("Indisponível."), mas o resto da build continua.
- A regra de maior vitória favorece itens de "bola de neve" (Mejai, com cerca de 82%).
- O `gear.json` precisa ser regenerado quando entrarem itens novos. Por padrão, um id desconhecido conta como item final.

# T-008 — Carrossel de runas, itens à esquerda e remover Builds do catálogo

- **Status:** Concluído
- **Data:** 2026-11-23
- **Risco:** Baixo (só frontend)

## Pedido
1. "Em runas deixa as 2 ou mais opções que tem abaixo num carrossel, daí deixa um botão pra passar pra esquerda/direita pra conseguir visualizar as demais informações."
2. "Quero que inverta para exibir os itens à esquerda e as runas à direita."
3. "Remove esse tópico aí de builds do catálogo."
4. (acréscimo) "Os ícones dos itens deixa verticalmente centralizados conforme os textos."

## Dúvidas e respostas / padrões adotados
Sem perguntas. Padrões:
- **Carrossel:**
  - uma linha só com scroll-snap; botões ‹ › acima, à direita do título;
  - cada clique anda um cartão; as setas desabilitam nas pontas e somem quando tudo cabe;
  - abre na página de maior vitória e mantém a posição após o poll;
  - aceita swipe.
- **Ordem em tela estreita:** itens primeiro, runas depois. Proporção 5fr/7fr.
- **Catálogo local:** continua sendo usado como reserva de build e de rotas. Só a seção visual foi removida.
- **Ícones:** centralizados acima do nome, em colunas de largura igual, nas linhas de itens (iniciais, principais e fallback). Situacionais e botas não mudaram.

## Arquitetura e decisões
Agente 1 dispensado: mudança pontual de front, sem backend e sem regra nova.

## Arquivos alterados
`frontend/index.html` (`styles.css?v=16`, `app.js?v=23`), `frontend/app.js` e `frontend/styles.css`. Em `app.js` foram removidos `renderBuilds`, `patchName`, `fillSelect`, `updatePatches`, `itemIcons` e os filtros da seção removida.

## Banco / infra
Nenhum.

## QA
Agente 3: **APROVADO**.
- `pytest`: 41 de 41. `node --check`: OK.
- **Carrossel:** testado com Ahri, Zed, Lee Sin, Thresh, Ezreal, Jinx e Yasuo.
  - Setas, pontas desabilitadas e auto-ocultar funcionam.
  - Abre na página de maior vitória e mantém a posição após o poll.
  - Navegação por teclado OK.
- **Layout:** itens à esquerda em 1920; em 1180 e 375 tudo empilha, sem rolagem horizontal.
- **Catálogo:** não sobrou referência aos ids removidos. O fallback continua funcionando, sem o selo.
- **Ícones:** a diferença entre o centro do ícone e o centro do nome é de 0 px, inclusive com nomes de 2 ou 3 linhas.
- **Regressões:** nenhuma em T-005 a T-007. Nenhum `window.open`.

## Revisão final
- **Design system:** usa os tokens existentes e o estilo dos botões existentes.
- **Vazamento:** nada de backend foi alterado.

## Como reverter
Restaurar os 3 arquivos de `backup-T-008`, no scratchpad da sessão.

## Riscos
- `index.html` passou de CRLF para LF. Não muda nada na tela.
- Na aba Confronto, sem OP.GG e sem referência local para aquele confronto, só a nota aparece. Esse comportamento já existia.

# T-009 — Filtro Bom contra / Ruim contra na coluna Inimigos

- **Status:** Concluído
- **Data:** 2026-11-23
- **Risco:** Baixo (só frontend)

## Pedido
"Adiciona nos inimigos uma opção de ver os campeões os quais o meu personagem é bom contra ou ruim contra, daí deve ser os que têm +50% de winrate é bom e -50% é ruim."

## Dúvidas e respostas / padrões adotados
Sem perguntas. Padrões:
- O controle "Todos · Bom contra · Ruim contra" fica abaixo do filtro de rota. "Todos" vem marcado.
- **Taxa usada:** a do meu campeão contra o inimigo, do OP.GG, Solo/Duo, na minha rota.
- **Bom contra:** mostra taxas acima de 50%, da maior para a menor.
- **Ruim contra:** mostra taxas abaixo de 50%, da menor para a maior.
- Campeões com exatamente 50% ou sem dado ficam de fora dos dois filtros.
- O filtro se soma à busca e ao filtro de rota.
- A escolha fica salva em `sessionStorage["rift-enemy-tone"]` e continua valendo depois do poll e da troca de campeão.

## Arquitetura e decisões
Agente 1 dispensado: os dados já existiam (`opggRate`/`enemyRateText`) e a mudança é só de front. `renderChampionPicker` ganhou três parâmetros opcionais: `accept`, `order` e `emptyText`.

## Arquivos alterados
`frontend/index.html` (`styles.css?v=17`, `app.js?v=24`), `frontend/app.js` e `frontend/styles.css`.

## Banco / infra
Nenhum.

## QA
Agente 3: **APROVADO**.
- `pytest` 41 de 41 e `node --check` OK.
- A taxa mostrada é a mesma do "Confronto · Solo/Duo".
- A lista de cada filtro confere com um cálculo independente: Ahri tem 36 em "Bom contra" e 14 em "Ruim contra"; Garen tem 29 em "Bom contra" e Rumble (50%) fica de fora.
- O filtro funciona junto com a busca e com a rota, e continua valendo no poll, no F5 e na troca de campeão.
- A tela vazia mostra a mensagem certa.
- O inimigo escolhido à mão continua valendo mesmo quando o filtro o esconde.
- Em 375 px não há rolagem horizontal.
- Sem regressões.

## Revisão final
- **Design system:** usa os tokens `--win`/`--loss` e os estilos de botão que já existiam.
- **Vazamento:** não houve mudança no backend.

## Como reverter
Restaurar os 3 arquivos de `backup-T-009`, no scratchpad da sessão.

## Riscos
- A lista só considera os confrontos que o OP.GG publica para a rota do meu campeão. Campeões fora dessa amostra não aparecem em "Bom contra" nem em "Ruim contra".

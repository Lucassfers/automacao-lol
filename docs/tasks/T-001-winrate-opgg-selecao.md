# T-001 — Winrate do OP.GG ao selecionar e por inimigo

- **Status:** Concluído
- **Data:** 2026-11-13
- **Risco:** Baixo/Médio (só frontend)

## Pedido
"Toda vez que eu selecionar um personagem, quero que automaticamente faça uma busca na API do OP GG e exiba SEMPRE a winrate do respectivo personagem selecionado, logo ao selecionar ele. Além disso, conforme os inimigos forem selecionando seus respectivos personagens, deverá exibir a % de winrate que o meu personagem tem sobre os inimigos (individual de cada inimigo)."

## Dúvidas e respostas / padrões adotados
Não houve perguntas ao usuário. Padrões adotados:
- Recorte: Esmeralda+, Solo/Duo, todas as regiões (o mesmo de antes).
- Rota: a do draft. Sem rota no draft, vale a rota padrão do OP.GG.
- O OP.GG só publica confrontos da mesma rota. Inimigo de outra rota mostra "sem dados".
- Cores: verde acima de 50%, vermelho abaixo, dourado em exatamente 50%. Tooltip com o nº de partidas e o patch.

## Arquitetura e decisões
**Agente 1: dispensado.** O backend (`opgg.py`, `/api/opgg/counters`) já existia e funcionava (testado ao vivo). A mudança é só na tela.
- Selo `#champion-rate` no banner: sempre do campeão exibido. Usa o slot `own` quando o campeão exibido é o do draft. Para os demais, usa o novo slot `opggCounters.selected`, com rota vazia.
- `#draft-rate` no quadro do draft: taxa do meu campeão.
- Chips de inimigo: mostram a %, "…" enquanto carrega ou "sem dados".

## Arquivos alterados
- `frontend/app.js`
- `frontend/index.html` (novos elementos, `styles.css?v=8`, `app.js?v=14`)
- `frontend/styles.css` (variáveis `--win*` e `--loss*`, estilos do selo e dos chips)
- `docs/tasks/*` (registro criado)

## Banco / infra
Nenhum.

## QA
Agente 3: **APROVADO**.
- `node --check` e import do `dashboard` passaram.
- Endpoints testados: 200 nas consultas válidas, 400 com campeão inválido.
- Chrome headless com draft simulado:
  - selo, `#draft-rate` e chips conferidos (Ahri x Annie 49,38% em vermelho, Garen top "sem dados");
  - corridas assíncronas não sobrescrevem o campeão errado;
  - sem rolagem horizontal em 375px;
  - sem loop de re-render.
- Observações menores, que não bloqueiam: o tooltip mostraria "patch undefined" se o backend omitisse o patch (hoje não omite).

## Revisão final
- Design system: segue a paleta escura/dourada e a borda do `.tag`.
- Vazamento de dados: nenhum endpoint novo, nada de innerHTML com dado externo.

## Como reverter
A pasta não é repositório git. Restaure os 3 arquivos de `frontend/` a partir do backup feito antes da mudança (`backup-T-001`, no scratchpad da sessão) ou desfaça manualmente os blocos `champion-rate`, `draft-rate` e `opggCounters.selected`.

## Riscos
O scraping do OP.GG depende do HTML do site. Se o layout mudar, as taxas passam a aparecer como "indisponível".

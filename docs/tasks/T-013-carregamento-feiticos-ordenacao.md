# T-013 — Carregamento sem build de referência, feitiços junto dos itens iniciais e 4º/5º/6º item por vitória

- **Status:** Concluído
- **Data:** 2026-11-23
- **Risco:** Baixo (só frontend, sem mudança de contrato)

## Pedido
1. "Quando tiver carregando, não quero que exiba runas aleatórias (deve ter uma animação de carregamento no lugar disso)."
2. "As spells (feitiços de invocador) devem aparecer acima, junto com os itens iniciais."
3. (pedido durante a tarefa) Quarto, Quinto e Sexto item: maior taxa de vitória no topo e a menor embaixo.

## Dúvidas e respostas / padrões adotados
Não houve perguntas. Padrões adotados:
- **Causa das "runas aleatórias":** enquanto a build do OP.GG carregava, a página mostrava a build de referência gerada pela classe do campeão (`referenceByClass`).
- **Só o estado `loading` mudou.** Em `no-data` ou erro, a build de referência continua aparecendo com a nota, como antes.
- **Carregamento:** esqueleto com brilho e indicador girando, `role="status"`, `aria-live="polite"` e `aria-busy`. Com `prefers-reduced-motion`, sem animação. As métricas de vitória e o link do OP.GG continuam visíveis.
- **Feitiços:** lado a lado com Itens iniciais em tela larga e empilhados quando a coluna fica estreita. Também valem para a build de referência. Na aba de confronto, que não tem extras, o bloco não aparece.
- **Ordenação do 4º, 5º e 6º item:** taxa de vitória decrescente; empate fica com quem tem mais partidas. Opções com "amostra pequena" vão depois das com amostra suficiente, cada grupo por vitória. A ordenação é feita numa cópia, sem mexer nos dados. Os outros blocos mantêm a ordem do OP.GG.

## Arquitetura e decisões
Agente 1: dispensado. É uma mudança visual pontual no frontend, sem backend nem contrato novo.
- `winratePanel`: no `loading`, desenha só `opggBuildLoading()`.
- `opggBuildPanel` e a build de referência: nova linha de topo `buildTop()` com Itens iniciais e Feitiços.
- `buildExtras`: os feitiços saíram daqui. Ficam a Ordem de habilidades e os blocos de profundidade, que passam por `byWinRate()`.

## Arquivos alterados
- `frontend/app.js`: `winratePanel`, `opggBuildPanel`, `buildExtras`, e as funções novas `opggBuildLoading`, `buildTop` e `byWinRate`.
- `frontend/styles.css`: `.build-top`, classes do esqueleto e da animação (só com os tokens existentes), `prefers-reduced-motion`, e remoção de `.extras-grid`, que ficou sem uso.
- `frontend/index.html`: `styles.css?v=21` e `app.js?v=28`.

## Banco / infra
Nenhum.

## QA
Agente 3: **APROVADO** (nível Baixo).
- `node --check` passou e o `pytest` deu 74 de 74.
- **No Chrome headless**, com `/api/opgg/build` simulado:
  - Carregando: só o esqueleto, 0 runas ou itens.
  - Pronto: build completa.
  - 404 e 502: referência com a nota.
  - Feitiços lado a lado em 1400px e empilhados em 375px.
  - Sem rolagem horizontal em 375px.
  - Sem exceções de JS.
  - Ahri mid: o Quarto item chega da API ordenado por partidas e aparece por vitória (77,48%, 60,15%, 59,48%, 57,99% e 51,62%).
- **No node:** casos de borda do `byWinRate` (taxa ausente ou NaN, lista vazia, todas de amostra pequena, sem alterar os dados).

## Revisão final
- **Design system:** usa só os tokens `--panel`, `--line`, `--gold` e `--muted` e segue o padrão `gearOptions`.
- **Vazamento de dados:** nenhum endpoint novo e nenhum dado novo exposto.
- **Observações sem impacto:**
  - `styles.css` e `index.html` passaram de CRLF para LF.
  - O comentário em `app.js` sobre "refaz o painel a cada 2s" não é exato: o redesenho acontece só quando o draft muda ou uma consulta expira.

## Como reverter
Restaurar `frontend/app.js`, `frontend/styles.css` e `frontend/index.html` da pasta `backup-T-013` no scratchpad da sessão.

## Riscos
- Uma opção de amostra pequena com vitória alta fica abaixo de opções confiáveis com vitória menor. É intencional e pode ser mudado se o usuário preferir ordenar só pela %.

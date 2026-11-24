# T-011 — Feitiços, ordem de habilidades, itens iniciais, botas, builds principais e rotas da selva

- **Status:** Concluído
- **Data:** 2026-11-23
- **Risco:** Médio (parser novo do OP.GG com resolvedor RSC, contrato do endpoint ampliado, bloco novo no front)

## Pedido
"Quero conseguir visualizar aqui os feitiços de invocador utilizados em cada respectiva rota jogada pelo personagem. Quero ver também a ordem das habilidades e os itens iniciais, e deveria mostrar tbm as botas com maior % de vitória com o personagem e opções de builds principais, tipo como exibe aqui [prints do OP.GG do Lee Sin]. E quando a rota for selva deveria exibir também a rota de lados, tipo lado azul, lado vermelho."

## Dúvidas e respostas / padrões adotados
Não houve perguntas ao usuário. Padrões adotados:
- **Onde aparece:** aba Geral, abaixo do split runas/itens, para a rota ativa. A aba de Confronto não mostra o bloco e não baixa a página nova.
- **Ordem:** Rotas da selva (só na selva) → Feitiços → Ordem de habilidades → Builds principais → Quarto, Quinto e Sexto item.
- **Itens iniciais:** até 2 opções. **Botas:** até 4, ordenadas por vitória (regra da T-004). **Builds principais:** até 5. **4º/5º/6º item:** até 5 cada.
- **Feitiços e ordem de habilidades** seguem o OP.GG (os mais jogados), não a maior vitória.
- **4º/5º/6º item:** mostram vitória e partidas. O OP.GG não dá a taxa de escolha. "Amostra pequena" quando há menos de 100 partidas.
- **Rotas da selva:** selos de texto em pt-BR (Azul, Vermelho, Grompe, Lobos, Aves, Krugs), com a nota "Último mês, todos os patches".
- **Falhas:** um bloco que falta mostra "Indisponível." e não afeta os outros.

## Arquitetura e decisões
Agente 1 executado.
- **Fonte:** a página `op.gg/lol/champions/{c}/build/{rota}`. É 1 requisição a mais, só na aba Geral, no mesmo cache de 10 min (`fetch_extras`, `lru_cache` 128). A falha também fica no cache.
- **Itens:** iniciais e builds principais vêm da `/items`, que já era baixada.
- **Resolvedor RSC:** `rsc_rows`, `resolve` e `jsx_walk` trocam as referências adiadas `$Lxx` do payload. Têm limites de profundidade e de nós e protegem contra ciclos.
- **Parsers:** `parse_spells`, `parse_skills`, `parse_depth`, `parse_jungle` e `parse_build_extras`, um por bloco, com marcadores `spells_table_N`, `SkillOrder Table`, `depth_N` e `team_key`.
- **Contrato:** `GET /api/opgg/build` continua retrocompatível e ganhou:
  - `options.starting`;
  - `options.core`;
  - `extras {spells, skills, depth, jungle}`, que só vem sem `target`.
- **Validação dos dados:** se o patch da `/build` for diferente do patch das runas, todos os blocos viram `None`. A resposta é uma cópia profunda, então o cache nunca é mutado.
- **Front:** `buildExtras`. O `gearOptions` foi estendido para combos de vários itens e para feitiços. Os ícones de habilidade vêm do Data Dragon; se a imagem falhar, aparece a letra.

## Arquivos alterados
- `opgg.py`
- `frontend/app.js`
- `frontend/styles.css`
- `frontend/index.html` (`styles.css?v=19`, `app.js?v=26`)
- `tests/test_opgg_build.py`
- novo: `tests/test_opgg_extras.py`
- fixtures novas do patch 16.23 em `tests/fixtures/`: `leesin_jungle_build.html`, `leesin_jungle_runes.html`, `leesin_jungle_items.html` e `ahri_mid_build.html`

## Banco / infra
Nenhum. O servidor local foi reiniciado.

## QA
Agente 3: **APROVADO** (nível Médio).
- `pytest` 74 de 74 (26 novos) e `node --check` OK.
- **Segurança:** 14 entradas inválidas devolvem 400 genérico (traversal, null byte, XSS, SQLi). Métodos diferentes de GET devolvem 501. A resposta só traz inteiros, frações entre 0 e 1, letras QWER, campos de conjunto fechado e nomes `.png` validados. Com `target`, não vem `extras`.
- **Tela** (Chrome headless):
  - Lee Sin na selva mostra todos os blocos; Ahri no meio, todos menos as rotas da selva.
  - O R fica dourado nos níveis 6 e 11.
  - Sem ids duplicados, sem erros no console e sem `window.open`.
  - Em 375 px não há rolagem horizontal.
  - Sem regressões de T-007 a T-010.

## Revisão final
- **Design system:** usa os mesmos tokens e cartões (`gear-options`, `rune-best` e `rune-warning`). Os tokens novos são `--side-blue` e `--side-red`.
- **Vazamento de dados:** nenhum endpoint ou parâmetro novo. A validação continua por lista fechada e os erros são genéricos. Nenhum texto livre ou HTML do OP.GG chega ao front.

## Como reverter
1. Restaurar os arquivos de `backup-T-011` no scratchpad da sessão: `opgg.py`, `dashboard.py`, `frontend/*`, `data/*` e `tests/*.py`.
2. Apagar `tests/test_opgg_extras.py` e as 4 fixtures novas.
3. Reiniciar `python dashboard.py`.

## Riscos
- **Fragilidade da fonte:** o JSX da `/build` não é uma API pública. Ele depende de chaves, de textos em inglês ("games") e das referências `$L`. Se mudar, o bloco afetado vira "Indisponível.".
- **Builds principais com 4 itens:** algumas vêm com 4 itens em vez de 3 (ex.: Ahri, que começa com o Lacre Sombrio), porque o OP.GG conta assim.
- **Ícones faltando:** itens novos do patch 16.23 aparecem com letra até o `gear.json` (Data Dragon 16.22.1) ser regenerado.
- **Rotas da selva:** cobrem o último mês e vários patches, não só o patch atual.

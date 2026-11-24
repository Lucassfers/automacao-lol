# T-010 — Botas acima dos situacionais, clique manual sobrepõe draft e seletor de rota secundária

- **Status:** Concluído
- **Data:** 2026-11-23
- **Risco:** Médio (muda quem manda no painel com draft; contrato do endpoint ampliado)

## Pedido
1. "A bota deve vir acima dos itens situacionais (abaixo dos principais)."
2. "Se eu trocar manualmente para um boneco, deverá trocar as informações para o respectivo campeão clicado automaticamente. Cliquei em Akali mas a automação selecionou o Yasuo." (print: draft arquivado Yasuo vs Annie)
3. "Quero que exiba sempre a opção de visualizar a build/runas do personagem na lane secundária dele, ex. Yasuo joga mais mid mas tem builds/runas para o top também, como no OP.GG." (print: Meio 61% · Topo 25% · 15%)

## Dúvidas e respostas / padrões adotados
Sem perguntas ao usuário. Padrões adotados:
- **Clique na lista:** clicar à esquerda num campeão diferente do do draft vira escolha manual (`sessionStorage["rift-champion"]`).
- **Volta ao draft:** o draft volta a mandar quando:
  - o usuário clica no campeão do draft; ou
  - chega um draft **ao vivo** com assinatura nova (campeão, rota ou confirmação diferentes).
  
  O draft arquivado e o F5 mantêm a escolha manual.
- **Botões de rota:** ficam no hero e substituem o select "Minha rota". Mostram ícone, nome e % de role rate. Aparecem sempre, mesmo quando o campeão tem só uma rota.
  - A escolha vale por campeão (`sessionStorage["rift-lane"]`).
  - No draft, a rota do draft abre ativa.
  - A porcentagem é arredondada para inteiro.

## Arquitetura e decisões
Agente 1 executado.
- **Causa do bug:** o snapshot arquivado mantinha `status:"active"`. O `refresh()` ia para `renderMatchup()`, que usa `draft.champion` em tudo, e o clique só trocava o hero. O mesmo acontecia no draft ao vivo.
- **Correção:** `manualChampion {id, sig}` mais o helper `draftOwns()`, que substitui as leituras de `draft.champion`. Com escolha manual, `renderOverview` mostra o status "Exibindo X (escolha manual)…". `rift-matchup` não é sobrescrito, e o adversário não é inferido pela rota do draft.
- **Rotas:** `positionRoleRate` vem da mesma página do T-006, que é a fonte do role rate.
  - `parse_role_rates`: `parse_positions` passa a devolver `(patch, positions, rates)`.
  - Se uma linha for inválida, só ela é descartada. Se a lista inteira faltar, `rates` fica `{}`.
  - `GET /api/opgg/positions` passou a devolver `rates`, de forma retrocompatível.
  - O fallback `roles.json` foi regenerado com `rates`.
- **Front:** `activeRole()` e `renderLanes()`. Os usos de `draftRole.value` foram trocados.
- **Botas:** passaram para cima dos situacionais em `opggBuildPanel`.

## Arquivos alterados
`opgg.py`, `dashboard.py`, `data/roles.json`, `tests/test_opgg_positions.py`, `frontend/app.js`, `frontend/index.html` (`styles.css?v=18`, `app.js?v=25`) e `frontend/styles.css`.

## Banco / infra
Nenhum. O servidor local foi reiniciado.

## QA
Agente 3: **APROVADO**.
- `pytest` 48 de 48 e `node --check` OK.
- **Caso real simulado** (Yasuo vs Annie arquivado → clique em Akali):
  - hero, selo, status, abas, build, runas, Flex/ARAM, filtro de inimigos e Bom/Ruim contra passam todos para Akali;
  - a escolha persiste no poll e no F5;
  - clicar em Yasuo volta ao draft;
  - um draft ao vivo novo retoma o controle.
- **Rotas:** Yasuo mostra Meio 60% · Topo 24% · Atirador 15%. Ao clicar em Topo, todas as consultas saem com `role=top`. Ahri mostra 1 botão. Em 375 px não há rolagem horizontal.
- **Segurança do endpoint:**
  - parâmetros estranhos são ignorados;
  - traversal devolve 404;
  - métodos diferentes de GET devolvem 501;
  - `rates` só traz chaves do catálogo, com valores entre 0 e 1.
- Sem regressões de T-005 a T-009. Nenhum `window.open`.

## Revisão final
- **Design system:** os botões de rota usam os tokens de `.role-filter`, com o ativo em dourado e fundo legível sobre a arte.
- **Vazamento:** o endpoint continua sem parâmetros e só de leitura. Os erros são genéricos.

## Como reverter
1. Restaurar os arquivos de `backup-T-010` no scratchpad da sessão: `app.js`, `index.html`, `styles.css`, `dashboard.py`, `opgg.py`, `data/roles.json` e `tests/test_opgg_positions.py`.
2. Reiniciar `python dashboard.py`.

## Riscos
- **Rota sem amostra:** numa rota rara, o confronto pode aparecer "Sem dados no OP.GG" (ex.: Yasuo Topo vs Annie, que joga Meio). É esperado.
- **Fallback local:** no fallback, `rates` vindo de `roles.json` só é validado como dict por campeão. O arquivo é local.
- **Draft real:** o draft real com o LoL aberto foi validado só por simulação.

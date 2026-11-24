# T-002 — Não abrir o OP.GG automaticamente

- **Status:** Concluído
- **Data:** 2026-11-13
- **Risco:** Baixo

## Pedido
"Deveria exibir aqui o winrate e não abrir uma página nova" (print do cartão "Orianna · Geral" com "Sem amostra").

## Diagnóstico
- A API devolvia a Orianna normalmente (mid, patch 16.22). O log do servidor mostrou que o navegador do usuário não chamava `/api/opgg/counters` nem baixava o `app.js`. O texto do print não existe no código atual, então era uma aba antiga com JS antigo (anterior à T-001).
- Orientação: fechar as abas antigas e recarregar com Ctrl+F5.
- Problema real: o `dashboard.py` abria o OP.GG numa aba nova por padrão ao confirmar o pick.

## Arquitetura e decisões
**Agente 1: dispensado** (troca do padrão de uma flag de CLI).
- `--auto-open` passa a ser opcional: por padrão o painel não abre aba nenhuma.
- `--no-auto-open` continua aceito, mas oculto, por compatibilidade.

## Arquivos alterados
- `dashboard.py` (função `main`)
- `README.md`

## QA
- `python -c "import dashboard"` passou sem erro.
- `--help` lista só `--port` e `--auto-open`.
- A flag antiga `--no-auto-open` continua aceita (saída 0).
- O servidor foi reiniciado.

## Revisão final
Não há endpoint novo nem exposição de dados.

## Como reverter
Em `dashboard.py`, voltar a criar o `DraftBrowser` por padrão, com a flag `--no-auto-open` visível, e restaurar o parágrafo do README.

## Riscos
Nenhum relevante.

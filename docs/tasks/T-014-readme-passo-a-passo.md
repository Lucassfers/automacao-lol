# T-014 — README com passo a passo para rodar e testar + .env.example comentado

- **Status:** Concluído
- **Data:** 2026-11-23
- **Risco:** Baixo (só documentação)

## Pedido
"Cria um readme explicando tudo que o usuário precisa fazer pra rodar o projeto, ... um passo a passo bem simples só pra baixar as credenciais, o que precisar no .env bota como env example, e da mesma forma passo a passo pra testar."

## Dúvidas e respostas / padrões adotados
Não houve perguntas. Padrões adotados:
- O `README.md` existente foi mantido. A seção "Como executar" virou "Passo a passo para rodar" e ganhou as seções "Passo a passo para testar" e "Problemas comuns". O texto técnico anterior ficou em "Detalhes do funcionamento".
- O `.env.example` recebeu comentários linha a linha (onde obter cada valor), sem nenhum valor real. Continua com as mesmas 7 variáveis lidas pelo código.
- Os testes estão documentados com `python -m unittest discover -s tests`, porque o projeto não depende de pytest.

## Arquitetura e decisões
Agente 1 e Agente 2: dispensados. É só documentação, sem código de produto, e o orquestrador escreveu direto.

## Arquivos alterados
- `README.md`
- `.env.example`

## Banco / infra
Nenhum.

## QA
Comandos do README conferidos na máquina:
- `python --version`: 3.11.9.
- `python -m unittest discover -s tests`: 74 testes OK.
- `python app.py --demo`: imprime as builds da Annie.
- As variáveis do `.env.example` foram conferidas contra `app.py`, `draft.py` e `winrates.py`.

## Revisão final
- Nenhuma credencial ou dado real nos arquivos.
- O `.env` e o `riotgames.pem` continuam no `.gitignore`.

## Como reverter
Restaurar a versão anterior de `README.md` e `.env.example`. O projeto não tem git, e o conteúdo anterior da seção "Como executar" está descrito neste registro.

## Riscos
- Os links e as telas do portal da Riot e do Discord podem mudar com o tempo.

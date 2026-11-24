# T-012 — Ícones dos campos nas Rotas da selva

- **Status:** Concluído
- **Data:** 2026-11-23
- **Risco:** Baixo (só visual, sem mudança de contrato)

## Pedido
"Não dá pra exibir o ícone dos mobs da jungle?" (print do bloco Rotas da selva da T-011, com selos de texto)

## Dúvidas e respostas / padrões adotados
Não houve perguntas. Padrões adotados:
- **Ícones locais:** os 6 ícones ficam salvos no projeto, em `frontend/assets/jungle/`. O front não chama CDN externo.
- **Aparência:** ícone de 32px com "›" entre os passos. O Azul tem borda azul e o Vermelho, borda vermelha.
- **Acessibilidade:** o nome e o número do passo ficam como texto escondido para leitor de tela ("1. Aves"). Cada passo também tem `title` com o nome em pt-BR.
- **Fallback:** se a imagem falhar, o passo volta ao selo de texto da T-011.

## Arquitetura e decisões
Agente 1: dispensado. É uma mudança visual pontual num bloco que já existe, sem backend nem contrato.
- **Fonte dos ícones:** a mesma que o OP.GG usa nessa seção, `c-lol-web.op.gg/.../assets/images/jungle-monsters/<camp>.png` (PNG 64×64, cerca de 4 KB cada). Os arquivos foram baixados uma vez e salvos no projeto.
- **`jungleCamps`:** é um conjunto fechado `{name, icon}`. O caminho da imagem sai só dele, nunca do texto da API.
- **`jungleStop(camp, index)`:** monta cada passo e reaproveita `icon()` (`.icon-frame`).

## Arquivos alterados
- `frontend/app.js`
- `frontend/styles.css`
- `frontend/index.html` (`styles.css?v=20`, `app.js?v=27`)
- novo: `frontend/assets/jungle/{blue,red,gromp,wolves,raptors,krug}.png`

## Banco / infra
Nenhum.

## QA
Agente 3: **APROVADO** (nível Baixo).
- `pytest` 74 de 74 e `node --check` OK. Os 6 ícones respondem 200.
- **Lee Sin Selva:** as duas linhas mostram 6 ícones carregados e bordas corretas.
- **375 px:** sem rolagem horizontal.
- **Falha de imagem (assets bloqueados):** volta ao selo de texto.
- **Ahri Meio:** o bloco não aparece.
- Sem erros de JS no console.

## Revisão final
- **Design system:** mantém o padrão `.icon-frame` dos itens e os tokens `--side-blue`/`--side-red`.
- **Vazamento de dados:** nenhum endpoint novo. As imagens são estáticas e locais.

## Como reverter
1. Restaurar `app.js`, `index.html` e `styles.css` de `backup-T-012` no scratchpad da sessão.
2. Apagar `frontend/assets/jungle/`.

## Riscos
- Se o OP.GG mudar a arte dos monstros, os ícones locais não são atualizados sozinhos. O impacto é baixo.

---
name: lk-poker-identidade-visual
description: Use ao criar qualquer peça visual para a marca de poker do Luã (botão de dealer, fichas, placas de mesa, timer de torneio, etc.) — monograma "LK" com a mesma paleta do portfólio (violeta/índigo/ciano), mas com layout e regras próprias de poker.
---

# Identidade Visual — Marca "LK" (poker caseiro do Luã)

Sistema de marca para o jogo de poker caseiro do Luã, baseado no monograma "LK" que ele já usa (botão de dealer e peças de mascote). **Usa os mesmos tokens de cor da identidade do portfólio** (skill `pelaes-identidade-visual` / `:root` de `luanpelaes18.github.io`) — nunca a dupla/tripla cor original das artes de referência (dourado, amarelo, bronze, preto puro). O que diferencia esta marca da do portfólio é o **monograma e as regras de layout**, feitos para fichas, botões e peças de jogo — não a paleta.

## Tokens de cor (compartilhados com o portfólio)

```css
:root {
  --bg:     #13152a;
  --deep:   #2b124c;
  --indigo: #1a1f5a;
  --raised: #2a2a5a;
  --line:   #4b2e83;
  --violet: #8f7bd9;
  --blue:   #3f6bd4;
  --cyan:   #6ce4ff;
  --text:   #f2e9ff;
}
```

## O monograma "LK"

É uma marca customizada (não é uma fonte padrão), construída como um lettermark único, não duas letras soltas lado a lado:
- O **L** fica à esquerda, com traço vertical grosso e uma flag/base horizontal no topo (lembra uma bandeirola ou um "1" estilizado saindo do topo do L).
- O **K** entra colado/entrelaçado ao L, compartilhando massa visual com ele — a perna diagonal do K cruza para frente, criando uma ponta tipo seta apontando para a direita.
- Terminações **retas, chanfradas** (sem cantos arredondados) — visual de emblema/talhe, não geométrico-limpo.
- Tratar sempre como **um bloco único e compacto** (mesma caixa delimitadora em todas as aplicações), nunca esticar ou separar as letras.

## As 3 variantes de cor (escolher pelo uso, nunca misturar numa mesma peça)

**A — Selo/Botão de Dealer (autoridade do jogo)**
- Círculo central: `--text` (quase branco/lilás), para contraste máximo
- Anel externo: `--indigo` ou `--line`, com o texto **"DEALER"** repetido ao redor, em `--text`, caixa alta, fonte slab/stencil condensada e bold, arqueado acompanhando o círculo
- Monograma: preenchido com o mesmo gradiente usado no logo/badge do portfólio — `linear-gradient(135deg, var(--violet), var(--blue))` — com glow sutil em `color-mix(in srgb, var(--violet) 50%, transparent)`
- Uso: botão de dealer físico, ficha de autoridade, carimbo de "regras da casa"

**B — Mascote/Varsity (energia, merchandising)**
- Preenchimento: `--cyan` (o acento de maior energia da paleta)
- Contorno duplo: camada externa em `--bg` ou `--deep` (mais grossa, dá o efeito "escuro profundo"), camada intermediária em `--violet` entre a externa e o preenchimento ciano (substitui o antigo bronze, mantendo o efeito de contorno duplo tipo "número de uniforme")
- Sem fundo (aplicável sobre qualquer superfície clara ou escura)
- Uso: camisetas, adesivos, capa de grupo, convite de noite de poker, qualquer peça que precise de energia/diversão

**C — Flat/Mono (gravação, carimbo, tamanho pequeno)**
- Uma cor só, sem contorno nem gradiente: `--text` sobre fundo escuro, ou `--bg`/`--deep` sobre fundo claro
- Uso: gravação a laser (ex.: fichas 3D impressas ou madeira), carimbos, favicon, qualquer aplicação muito pequena onde contornos duplos somem

## Tipografia de apoio

- Texto do anel "DEALER": caixa alta, bold, condensada, estilo slab/stencil (visual de carimbo de cassino) — usar essa mesma fonte bold condensada para qualquer texto de acompanhamento (nomes de torneio, "BUY-IN", "ALL-IN" etc.), nunca uma sans-serif fina.
- Para textos de corpo/legenda nas peças (ex.: data do torneio, regras), usar a mesma família do portfólio: `"Helvetica Neue", Helvetica, Arial, sans-serif`.
- Letter-spacing generoso em textos curtos e em caixa alta, para reforçar o visual de selo/carimbo.

## Regras de uso

1. Nunca combinar as 3 variantes na mesma peça — escolher uma pelo contexto e aplicar inteira.
2. O monograma precisa sempre de uma área de respiro ao redor (não encostar em bordas ou outros elementos).
3. Qualquer glow/gradiente usado deve seguir exatamente o padrão do portfólio (gradientes violet→blue, glow em color-mix da própria cor) — nunca um brilho branco genérico.
4. Esta marca é para o universo do poker caseiro (torneios, fichas, convites, timer). Para material do portfólio profissional, usar a skill `pelaes-identidade-visual` diretamente.

# @neo/design — tokens do design system NEO

`tokens.css` é a **fonte única** dos valores do design system NEO / Locavia
("Venice by blite"). A referência escrita continua sendo
[`nero-portal/DESIGN.md`](../../nero-portal/DESIGN.md); este pacote é a forma executável dela.

## Fronteira: só tokens

Nada de componentes aqui. Compartilhar componente React entre três setups React diferentes
mais um app em HTML puro é como um "pacote compartilhado" vira o monolito que o monorepo
evita. Se você está prestes a colocar um `.tsx` nesta pasta, pare.

## Prefixo `--neo-` é obrigatório

Não é estilo, é para evitar quebra silenciosa. Os apps já usam nomes curtos com significados
**conflitantes entre si**:

| Variável | `nero-portal` | `maturitymodel` |
|---|---|---|
| `--accent` | `#eceae4` — hover **neutro**, deliberadamente não-verde | `#2be86b` — **o verde da marca** |

Um token compartilhado chamado `--accent` quebraria um dos dois sem erro nenhum.

## Estado da adoção (2026-07-26)

| App | Situação |
|---|---|
| `neo-hub` | ✅ **consome o pacote** — os tokens saíram do `:root` inline |
| `nero-portal` | ⚠️ valores idênticos aos canônicos, mas declarados no próprio `globals.css` (o Tailwind v4 precisa deles no `@theme`) |
| `locavia-dashboard` | ⚠️ tem paleta própria; não declara os tokens NEO |
| `maturitymodel` | ⚠️ `#2be86b` **cravado literal** em ~dezenas de lugares do `index.css`, em vez de usar a própria `--accent` |

## Divergência que existia e foi resolvida no hub

O accent verde todos acertavam; os **neutros não**. O `neo-hub` usava neutros levemente
esverdeados, anteriores à adoção do design system:

| Token | hub (antes) | canônico (`DESIGN.md`) |
|---|---|---|
| papel | `#f2f4ef` | `#f7f6f3` (papel quente) |
| tinta | `#161915` | `#1f2024` (charcoal quente) |
| cinza de apoio | `#707771` | `#6b6862` (cinza quente) |
| linha/borda | `#d9dfd8` | `#e4e1d9` (borda quente) |

O hub passou a usar os canônicos — é uma mudança **visível** (neutros mais quentes) na
landing. Reverter é trocar as 4 linhas de `neo-hub/src/tokens-override.css`... que não existe:
basta voltar os valores no `:root` do `index.html`, que hoje só importa o pacote.

## Como consumir

**Vite / CSS puro:**

```css
@import '@neo/design/tokens.css';
```

**Tailwind v4** (caso do `nero-portal`): o `@theme` precisa dos valores no próprio arquivo
para gerar as classes utilitárias, então lá os tokens são declarados localmente. Ao mudar um
valor aqui, mudar lá também — a tabela de adoção acima registra essa dívida de propósito, em
vez de fingir que o pacote já é a única fonte para todos.

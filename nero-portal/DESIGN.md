# DESIGN.md · Portal Nero (design system NEO)

> Charter de design do Portal Nero. O Nero será **absorvido pela NEO** (ferramenta
> central do cliente LM), então adota o **design system NEO / Locavia — "Venice by
> blite"**. Fonte de verdade upstream: o charter `Portal MMA + Locavia` v1.0
> (2026-07-12). Este arquivo é a aplicação desse charter ao Nero. Agentes de IA e
> devs leem este arquivo **antes de gerar qualquer tela**.

---

## 0. Identificação

| Campo | Valor |
|---|---|
| Produto | Portal Nero — advisor de governança de dados (DAMA-DMBOK2) |
| Contexto | Absorvido pela **NEO** (LM Mobilidade · torre ágil Blite) |
| Marca visível | "Venice by blite" (white-label do cliente) |
| Herança | Design system NEO/Locavia + fundação `estilo-blite`; desvios em §7 |

## 1. O que NÃO se importa do charter MMA

O charter upstream descreve o produto **MMA** (avaliação de maturidade de squads). O
domínio dele **não** se aplica ao Nero e não deve ser implementado aqui:

- ❌ Voto secreto individual + revelação simultânea (o "flip") — a **assinatura** do
  MMA (§5 do charter). O Nero não tem esse ritual; **não** criar telas de Workshop,
  cartões que viram, régua de estágios.
- ❌ Estágios de Tuckman, 10 dimensões, kanban kaizen, homologação, âncoras com veredito.
- ❌ Vocabulário do MMA ("dimensão", "estágio", "âncora"). O Nero usa o **seu** vocabulário
  DAMA: catálogo, dicionário, glossário, status de verdade (template/assumido/confirmado/
  lacuna), dependência, aging, maturidade DAMA.

O que se importa é a **camada visual compartilhada** (cor, tipografia, tema, movimento) —
para o Nero parecer parte da mesma família NEO. É só isso que as seções abaixo cobrem.

## 2. Cor

Tokens vivos em [src/app/globals.css](src/app/globals.css) (`:root` claro, `.dark` escuro).

| Token | Hex (claro / escuro) | Papel | Regra |
|---|---|---|---|
| `--brand` (accent) | `#2BE86B` | ação principal, ícone de destaque, estado ativo, marca | **Nunca** em áreas grandes / como fundo de bloco. Só destaque. |
| `--brand-strong` | `#1FAA52` / `#2BE86B` | **texto** de marca no tema claro (o verde vivo falha AA sobre claro), hover | Todo texto colorido de marca no claro usa este, não `--brand`. |
| `--primary` | `#2BE86B` + texto `#0D1F14` | botões (CTA) | Fill de accent com texto escuro (AA). |
| `--apoio-violet` | `#8A38F5` / `#A370F7` | 2ª série em dataviz, comparativo Q×Q | Nunca como botão. |
| neutros | `#f7f6f3`/`#fff` claro · `#1b1815`/`#24211c` escuro | fundo, cards | **Quentes** ("Papel & tinta"), não os neutros frios Blite (§7). |
| `--success/--warning/--error/--info` | `#15925a`/`#b45309`/`#dc2626`/`#2563eb` (claro) · `#34D399`/`#FBBF24`/`#F87171`/`#60A5FA` (escuro) | feedback e status | Vereditos/status usam **feedback**, nunca o accent. |

- **Tema padrão: claro.** Dark completo disponível (charcoal quente) para apresentação/relatórios.
- **Regra de ouro:** o verde do accent (`--brand`) **nunca dobra como "sucesso"**. Status de
  verdade "confirmado", RAG verde e afins usam o token de **feedback** (`--success`), que é um
  esmeralda distinto do accent. Assim o significado do verde de marca não se contamina.
- Badges de categoria (status de verdade, sensibilidade LGPD) são uma escala semântica própria
  (template=info · assumido=warning · confirmado=success · lacuna=error) — mapeiam ao feedback,
  não ao accent.

## 3. Tipografia

| Papel | Fonte | Onde | Token |
|---|---|---|---|
| Display | **Newsreader** (serif, 500–600) | título de página (`<h1>`), momentos de ritual/editorial (hero do chat, título do report, aulas da Academia), números de destaque | `font-serif` |
| Corpo / UI | **Inter** (400–600) | toda a UI, tabelas, formulários, cards de gestão | `font-sans` (padrão) |
| Dados | **JetBrains Mono** | valores de catálogo, métricas, deltas, nomes técnicos (`gold.vendas.fato_pedidos`) | `font-mono` |

- Carregadas via `next/font/google` em [src/app/layout.tsx](src/app/layout.tsx) (self-hosted, sem CDN).
- **Fronteira serif↔sans:** Newsreader marca o ritmo "ritual/editorial"; Inter comanda o ritmo
  "gestão" (denso, tabular). Se a serifada aparecer em tabela, formulário ou rótulo de UI, é bug.
- Hierarquia por peso e tamanho; **cor só para estado**.

## 4. Layout & movimento

- **Dois ritmos:** gestão (denso, Inter — /estado, /catálogo, /report, /roadmap) e ritual
  (respirado, serifado — hero do chat, Academia, cabeçalho do report). Cada tela pertence a um.
- Navegação global no topo (`TopNav`); estado ativo usa accent como destaque (texto/realce), não
  como bloco preenchido de verde.
- Herda de `estilo-blite`: grid 4px, raios, sombras suaves, movimento 120–300ms, foco visível.
  `prefers-reduced-motion` respeitado.

## 5. Regras para agentes de IA

1. Leia este arquivo antes de gerar qualquer tela, componente ou copy.
2. Cor e fonte saem das tabelas §2/§3. Verde `#2BE86B` é destaque, nunca fundo de bloco;
   vereditos/status usam feedback (`--success` etc.), nunca o accent.
3. Newsreader só nos momentos de §3. Em tabela/form/rótulo é bug — use Inter.
4. Dados técnicos (nomes de tabela, métricas, deltas) em JetBrains Mono (`font-mono`).
5. **Não** implemente o ritual do MMA (§1). O Nero não tem voto/flip/estágios.
6. Teste do genérico: se a tela pudesse ser de qualquer SaaS, revise a partir do assunto (governança
   DAMA com status de verdade). O diferencial do Nero é a honestidade template×confirmado×lacuna.
7. Piso: responsivo, foco visível, contraste AA nos dois temas, `print-color-adjust: exact` no PDF
   do report.

## 6. Contraste (pendências herdadas do charter)

- Verde `#2BE86B` como **texto** sobre fundo claro falha AA → usar `--brand-strong` (`#1FAA52`).
  Como ícone/realce/preenchimento com texto escuro, o accent vivo é permitido.
- Validar AA de `--brand-strong` sobre `#f7f6f3` para textos pequenos (borderline ~3.3:1) —
  preferir peso ≥600 ou tamanho ≥ large quando for texto de marca no claro.

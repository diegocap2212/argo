# Redesign "Papel & tinta" — plano de continuação

Estado em 2026-07-12. Retomar daqui. Objetivo: aplicar o design que o Diego
montou no Claude Design ao app real (`maturitymodel`), **sem** rodar tudo de novo.

## Fonte do design (Claude Design MCP `DesignSync`)
- projectId: `c0f4f414-7473-4ea8-a0bc-5a67e87cc8d9` (dono: Diego, `canEdit:true`)
- Arquivos: `Portal MMA.dc.html` (10 telas + estado), `Paletas MMA.dc.html` (3 paletas),
  `support.js`, `venice-by-blite.svg`.
- Reler quando precisar: `DesignSync get_file` com o path acima. (Formato `.dc.html`:
  `<x-dc>` com `sc-for`/`sc-if` e `<script type="text/x-dc">` de estado — é o mock, não código de produção.)

## Decisões travadas (do usuário, via AskUserQuestion)
1. **Escopo = "Visual + hub, manter consenso".** Aplicar toda a estética + as cascas
   navegacionais (Jornada/hub, Torre por agilista, Modo apresentação). **NÃO** reconstruir
   voto individual secreto / workshop de revelação. **Sem backend novo.** O app segue no
   modelo de **sessão colaborativa** (SM registra consenso; `votes` morta; sem hooks de voto).
   → A tela "Minha avaliação" e "Workshop (revelação por papel)" do mock **não** viram feature;
   o conteúdo de consenso vive em `squad/Sessao.tsx`.
2. **Tema = adaptar um modo escuro** da paleta papel/verde e **manter o toggle** claro/escuro.

## Descoberta-chave (o atalho)
Os **nomes de token do app já batem 1:1 com o design.** `src/index.css` já define
`--accent, --surface(-2/-3), --page, --shell-bg, --text-primary/secondary/tertiary,
--border-subtle/default/strong, --ok/warn/err/info (+bg/fg), --btn-pri-*, --radius-md/lg,
--font-serif`. `tailwind.config.ts` mapeia tudo em `venice-*` + bridge shadcn.
**Logo, trocar os VALORES no `:root` e `[data-theme="dark"]` reskina o app inteiro.**
O paleta escolhida é a **"1a · Papel & tinta"** (neutros quentes + verde sóbrio `#15b14c`,
usado com parcimônia; botão primário quase-preto). Foi o pedido: "mais fluido, menos verde estridente".

## Passo 1 — Trocar tokens em `src/index.css` (o grosso do trabalho)

### `:root` (claro) — valores "Papel & tinta"
```
--accent:#15b14c; --accent-strong:#11602c; --accent-soft:#eef7f0; --accent-soft-fg:#15803a;
--btn-pri-bg:#161513; --btn-pri-fg:#ffffff; --btn-pri-hover:#2c2a26; --btn-pri-active:#000000;
--surface:#ffffff; --surface-2:#f4f2ee; --surface-3:#ece9e3; --page:#f7f6f3; --shell-bg:#ffffff;
--text-primary:#161513; --text-secondary:#5c5850; --text-tertiary:#948f84; --text-disabled:#b8b3a8;
--border-subtle:#ece8e0; --border-default:#e6e2da; --border-strong:#cfc9bd;
--ring-venice:rgba(21,177,76,.30);
--ok:#15b14c; --ok-bg:#eef7f0; --ok-fg:#15803a;
--warn:#c77d0a; --warn-bg:#faf1e0; --warn-fg:#8a5a00;
--err:#d1453b; --err-bg:#fbecea; --err-fg:#b3261e;
--info:#3073c9; --info-bg:#eaf1fb;
--shadow-sm:0 1px 2px rgba(22,21,19,.06); --shadow-md:0 4px 12px rgba(22,21,19,.10);
--shadow-lg:0 10px 24px rgba(22,21,19,.12); --shadow-brand:0 4px 16px rgba(21,177,76,.28);
--logo-fill:#161513;
```
Manter intactos: bridge shadcn (`--background`…`--sidebar-*`) e legado magenta (`--brand-*`, `--navy*`).

### `[data-theme="dark"]` — charcoal quente + verde clareado (PROPOSTO, afinar no browser)
```
--accent:#3ecb70; --accent-strong:#7fe3a2; --accent-soft:rgba(21,177,76,.16); --accent-soft-fg:#86e6a8;
--btn-pri-bg:#f2efe9; --btn-pri-fg:#17150f; --btn-pri-hover:#e4e0d7; --btn-pri-active:#d6d1c6;
--surface:#1c1913; --surface-2:#232019; --surface-3:#2c2820; --page:#14120d; --shell-bg:#1a1712;
--text-primary:#f3efe7; --text-secondary:rgba(243,239,231,.72); --text-tertiary:rgba(243,239,231,.48);
--text-disabled:rgba(243,239,231,.30);
--border-subtle:#262219; --border-default:#332e24; --border-strong:#4a4436;
--ok-bg:rgba(21,177,76,.18); --ok-fg:#86e6a8;
--warn-bg:rgba(199,125,10,.20); --warn-fg:#e6b871;
--err-bg:rgba(209,69,59,.20); --err-fg:#f0a39c;
--info:#6ba6e8; --info-bg:rgba(107,166,232,.18);
--shadow-*: manter rgba(0,0,0,...) atuais; --logo-fill:#f3efe7;
```

### `::selection` e verde neon hardcoded
Grep no `src/` por `2be86b` e `43, 232, 107` / `43,232,107` e trocar pelo verde novo
(ou por `var(--accent)`). Suspeitos: `index.css` (selection/ring/shadow-brand), `CycleJourney.tsx`,
`AxisPills.tsx`, e os SVGs de radar/scatter em `squad/Jornada.tsx`, `squad/Comparativo.tsx`, `Torre.tsx`, `Inicio.tsx`.

## Passo 2 — Refinos de shell (`src/components/layout/AppShell.tsx`)
Já está ~90% igual ao mock (250px sidebar, logo, user chip, "Geral", nav, footer com toggle+guia+admin,
header crumb/título + AxisPills + Apresentar). Ajustes finos do mock: label de seção "Geral" com
linha divisória ao lado; subtítulo de papel no user chip ("Agile Master · LM Mobilidade"); cartão
"Squad ativo · Q3 2026" acima da sub-nav do squad. Opcional — não bloqueia.

## Passo 3 — Polir telas (herdam dos tokens; corrigir cores hardcoded pontuais)
Telas reais (rotas em `src/App.tsx`): `Inicio`, `Torre`, `Guia`, `AdminMMA`, e squad:
`Jornada` (hub/stepper via `CycleJourney`), `Sessao` (consenso), `Homologacao`, `Plano` (kaizens),
`Metricas` (âncoras/tabela), `Comparativo` (radar Q×Q), `Apresentar` (modo apresentação).
Referência visual de cada uma: as `sc-if` correspondentes no `Portal MMA.dc.html`
(isInicio, isTorre, isHub, isHomolog, isPlano, isMetricas, isComparativo, isApresentar).
Nota: nomes de squad no mock (S/4HANA, Esteira de Crédito…) são ilustrativos; os reais são
SF Cloud, SF Vendas, Gol, Nivus, Optimus, Jetta, Scania, Parati (vêm do Supabase).

## Passo 4 — Validar e subir
`npm run typecheck && npm run build` limpos; smoke claro/escuro (toggle no rodapé da sidebar);
branch própria (não commitar direto na main); push dispara deploy Vercel.

## Pendências paralelas (não-bloqueiam o redesign)
- P0: usuário confirmar que consegue redefinir a senha (email reenviado).
- P2: âncoras — descoberta Jira + definir as 4 fórmulas COM o usuário + implementar em
  `supabase/functions/sync-anchors/index.ts` + ligar cron. Ver `ARCHITECTURE.md`/`STATUS.md`.

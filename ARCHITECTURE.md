# Arquitetura do NEO — o mapa

Leia isto antes de mexer em qualquer coisa. O objetivo aqui não é descrever o que o código
faz (o código faz isso melhor) — é explicar **por que ele é assim**, o que é **load-bearing**
e onde estão as **restrições de plataforma que já custaram tempo a alguém**.

- Como rodar e deployar: [`ONBOARDING.md`](ONBOARDING.md)
- Variáveis e segredos: [`SECRETS.md`](SECRETS.md)
- Estado operacional corrente: [`HANDOFF.md`](HANDOFF.md)
- Papéis e jornada do MMA: [`maturitymodel/docs/PAPEIS.md`](maturitymodel/docs/PAPEIS.md)
- **Sair do Supabase / da Vercel:** [`PORTABILIDADE.md`](PORTABILIDADE.md) — o acoplamento
  medido peça por peça, e o que quebra ao migrar (leia antes de exportar qualquer dado)

> **Sobre navegar esta documentação em graph (Obsidian).** Os `.md` deste repositório usam
> **links markdown padrão** de propósito, para renderizarem no GitHub — onde a consultoria vai
> lê-los. Isso **já é** um vault: abra a pasta `argo/` no Obsidian e o graph aparece, porque ele
> resolve links markdown normalmente. **Zero mudança no repositório.**
>
> Converter para `[[wikilink]]` foi avaliado e recusado em 2026-07-26: quebraria a renderização no
> GitHub, introduziria uma segunda sintaxe e acrescentaria pouco a ~20 documentos que já têm mapa
> explícito (este arquivo aponta para os demais).

---

## O sistema em uma tela

Uma origem (`neo-lm.vercel.app`), cinco apps, dois projetos Vercel.

```
                       neo-lm.vercel.app          projeto Vercel: neo-lm
  ┌──────────────────────────────────────────────────────────────────────┐
  │  /              neo-hub          login OTP + as portas (por permissão)│
  │  /dash/**       locavia-dashboard ─┐                                 │
  │  /maturity/**   maturitymodel     ─┤ barrados na BORDA por           │
  │  /admin/**      neo-admin         ─┤ middleware.ts: sessão + a        │
  │  /nero/**       ──── rewrite ─────┐│ PERMISSÃO da porta               │
  │  /api/**        functions          │ (fora do matcher; validam       │
  │                                    │  Bearer/segredo por conta)      │
  └────────────────────────────────────┼─────────────────────────────────┘
                                       │  rewrite externa
                                       ▼
                          nero-portal.vercel.app     projeto Vercel: nero-portal
                          Next.js 16, basePath /nero
                          exige neo_session + GET /api/authz (ao vivo)
```

| App | Pasta | Rota | Stack | LOC |
|---|---|---|---|---|
| NEO Hub | `neo-hub/` | `/` | TS puro + Vite | 293 |
| Performance Dash | `locavia-dashboard/` | `/dash/**` | React Router + recharts | 4.145 |
| Maturity Model | `maturitymodel/` | `/maturity/**` | React Router + TanStack Query | 9.776 |
| Administração | `neo-admin/` | `/admin/**` | React 19 + TanStack Query | ~1.500 |
| Nero | `nero-portal/` | `/nero/**` | Next 16 + Prisma + Claude | 7.859 |
| — | `packages/neo-auth` | — | contrato de sessão + mapa de portas | ~200 |
| — | `packages/neo-design` | — | tokens de design | — |

### Autorização: permissão é DADO (RBAC do NEO, 2026-07-31)

Um predicado só decide tudo: **`has_perm(permissao, squad)`** no Postgres. A matriz papel ×
função vive em `neo_role_permissions` — tabela, não código — e é editável na tela `/admin`.

```
PAPEL GLOBAL (portal_roles, por e-mail)      PAPEL DE SQUAD (squad_members)
  admin_geral  governa acesso                  sm      facilita um squad
  admin        opera a estrutura                member  participa de um squad
  am           vê todos, homologa
  todos        IMPLÍCITO: toda pessoa com acesso ao NEO
```

**A borda decide navegação; o ponto do dado decide dado.** Nunca a mesma camada:

| Superfície | Pré-filtro (claims do cookie) | Autoritativo (ao vivo) |
|---|---|---|
| `/dash/**` | `neo.dash.access` | `/api/data` chama `has_perm` |
| `/maturity/**` | `neo.mma.access` | RLS com o JWT |
| `/admin/**` | `neo.admin.access` | RLS com o JWT |
| `/nero/**` | `neo.nero.access` | `proxy.ts` → `/api/authz` (memo 60s) |

As claims do cookie **envelhecem** — só fazem a porta aparecer. Recusa na borda não é "acesso
negado": é um 302 para o hub, que re-emite o cookie com claims frescas e só então dá a palavra
final (com trava de repetição, para não virar ping-pong).

## Por que cinco apps e não um

Porque fundir custaria portar ~14 mil LOC de duas ferramentas em uso diário, recém
estabilizadas (recalibração de saúde, redesenho de papéis, matriz RLS, rodadas de QA e
segurança — tudo em 2026-07-15), com ganho de usuário próximo de zero: Next.js não compra
quase nada para um dashboard SPA sobre um JSON.

O problema real nunca foi "são quatro apps" — era "são quatro **convenções**". O que foi
unificado são as **costuras**: uma instalação (pnpm workspaces), um contrato de sessão
(`@neo/auth`), tokens de design compartilhados, e esta documentação. Os frameworks seguem
diferentes de propósito.

**Quando reconsiderar:** se o Dash precisar de acesso a dados server-side (por exemplo mover
o comparativo da Torre para o servidor), ou se chegar uma quinta **ferramenta**.

> ### A quinta caixa chegou — e a resposta ao próprio gatilho acima
>
> `neo-admin` é o quinto app, e o parágrafo anterior mandava reavaliar a divisão quando isso
> acontecesse. A reavaliação, escrita na hora: **o `neo-admin` não é uma quinta ferramenta de
> produto.** É a superfície de GOVERNANÇA das outras quatro — e é exatamente por isso que não
> pode morar dentro de nenhuma delas. Enquanto a administração vivia em `/maturity/admin`,
> "quem administra o MMA" e "quem administra o NEO" eram a mesma pessoa por acidente de layout.
>
> O gatilho, portanto, segue de pé para a próxima ferramenta de PRODUTO. E ele fica mais afiado:
> hoje o portal tem um app de ~1.500 LOC que existe só para editar duas tabelas. Se um dia
> houver um segundo app dessa natureza, a pergunta a fazer é se não deviam ser um só.

---

## Load-bearing — não mexa sem entender

### 1. As funções da Vercel não resolvem código compartilhado

Isto é **restrição de plataforma medida**, não preferência de estilo. Medido em 2026-07-26:

| Alvo | Formato | Resultado |
|---|---|---|
| `middleware.ts` (Edge standalone) | `import from '@neo/auth'` | deploy **falha**: "referencing unsupported modules" |
| `middleware.ts` | `import from './packages/neo-auth/src/index.ts'` | deploy **falha**, mesma mensagem |
| `api/session.ts` (function Node) | `import from '../packages/neo-auth/...'` | build passa, **runtime 500** `ERR_MODULE_NOT_FOUND` |

Ou seja: **o build passar não significa nada** — só o runtime revela. Por isso
`middleware.ts`, `api/session.ts` e `api/gate.ts` são **autocontidos** e cada um tem a própria
cópia do HMAC. A duplicação é da plataforma, não escolha.

**Como ela é mantida segura:** `packages/neo-auth/test.ts` tem uma seção de **contrato** que
importa as funções de cada cópia e exige que concordem com o pacote, token por token (77
asserções). Mexeu em qualquer cópia? `pnpm --filter @neo/auth test`. Divergir agora é CI
vermelho, não incidente.

O `nero-portal` é o único que importa `@neo/auth` por nome — ali funciona, porque quem faz o
bundle é o Next (via `transpilePackages`), não o builder da Vercel.

### 2. pnpm, e por que não npm workspaces

O HANDOFF antigo dizia "SEM npm workspaces de propósito": o hoisting aninhava o rollup de um
app Vite e o npm derrubava o binário nativo da plataforma (npm#4828) no builder Linux. O
`node_modules` isolado do pnpm não faz esse hoisting, então a **causa** foi removida em vez de
contornada. Validado no builder: os 3 builds Vite passam.

Não voltar para npm. E `allowBuilds` no `pnpm-workspace.yaml` é uma decisão por linha, não um
"liberar tudo" — `@scarf/scarf` está negado porque é telemetria de terceiro.

### 3. O deploy do Nero exige `--local-config`

```bash
vercel deploy --local-config nero-portal/vercel.json   # projeto nero-portal
```

Sem essa flag, a CLI lê `argo/vercel.json` (config local vence settings de projeto) e roda
`pnpm run build:portal` — o build do **portal** — dentro do projeto do Nero. O Root Directory
orienta o *builder*, não a resolução de config da CLI.

### 4. `--base` do build composto

`scripts/build-portal.mjs` builda cada app Vite com `--base` diferente (`/dash/`,
`/maturity/`) e compõe os três `dist/` em um. Em dev cada app roda com base `/`. Mudar isso
quebra todos os caminhos de asset em produção.

### 5. Um `SESSION_SECRET`, dois projetos Vercel

O mesmo segredo assina `neo_session` no `neo-lm` e é verificado pelo proxy do Nero no
`nero-portal`. **Os dois projetos têm de ter o valor idêntico** — se divergirem, o Nero rejeita
toda sessão. Rotacionar exige atualizar os dois e redeployar ambos.

### 6. Env na Vercel só vale no próximo deploy

Mudar env **não afeta** deployment já rodando; os valores são assados no deploy. Isso é bom
(mudança não derruba produção na hora) e é pegadinha (você acha que mudou e não mudou).

### 7. Fail-closed em produção, fail-open em dev

`middleware.ts`, `api/gate.ts`, `api/data.ts` e o proxy do Nero: quando a env necessária falta,
**dev/preview abrem** (paridade com o dev local) e **produção fecha** (`VERCEL_ENV ===
'production'` → 503). Env sumida nunca vira bypass.

A exceção deliberada é o **freio de orçamento** do Nero, que é fail-OPEN: teto de custo não é
controle de segurança, e transformar queda do Postgres em "o Nero parou" seria pior. Está
comentado no código.

### 8. RLS do MMA

Os papéis do Maturity Model (`po/tl/sm/am/team`) vivem em RLS no Postgres do Supabase, não no
front. As views são `security_invoker`. Mexer nas policies sem rodar
`maturitymodel/tests/rls/rls-matrix.ts` (exige branch Supabase) é como mexer em auth sem teste.

---

## Fronteiras dos pacotes compartilhados

| Pacote | Contém | **Não** contém |
|---|---|---|
| `@neo/auth` | HMAC (Web Crypto), cookies, `verifyBearer` | nada específico de app |
| `@neo/design` | tokens como CSS custom properties | **componentes React** |

A fronteira do `@neo/design` é dura: compartilhar componente entre três setups React
diferentes mais um app em HTML puro é exatamente como um "pacote compartilhado" viraria o
monolito que este monorepo evita. Se você está prestes a criar um `.tsx` ali, pare.

O prefixo `--neo-*` também não é enfeite: hoje `--accent` significa **coisas opostas** nos
apps — no `nero-portal` é hover neutro (`#eceae4`), no `maturitymodel` é o verde da marca
(`#2be86b`). Token compartilhado sem prefixo quebraria um dos dois em silêncio.

---

## Fluxo de dados

- **Dash:** `locavia-dashboard/sync/` coleta Jira + SFMKT → Vercel Blob privado →
  `GET /api/data` (Bearer). Comentários em Upstash Redis. O sync roda por GitHub Actions no
  repo `diegocap2212/locavia-dashboard` (cron nativo a cada 30 min), gravando direto no Blob.
- **MMA:** Postgres do Supabase via RLS; âncoras do Jira por Edge Function.
- **Nero:** Postgres do Neon via Prisma (projeto `neon-celeste-globe`). Toda escrita de estado
  passa por `mutations.ts` → transação + `StateVersion` (auditoria/undo).

**Dois bancos de propósito.** Supabase (auth + RLS) para o NEO; Neon para o Nero. Não fundir:
o Nero é feito para ser levado ao domínio do cliente, e o isolamento do dado dele é feature.

---

## Dívida conhecida e assumida

| Item | Onde |
|---|---|
| `--accent` divergente entre apps; `#2be86b` cravado literal no MMA | `packages/neo-design/README.md` |
| Adoção parcial dos tokens (só o hub consome o pacote) | idem |
| `swagger-ui-dist` / página ApiDocs — vale a manutenção? | `docs/QA-REVIEW.md` |
| Gate fecha se o Upstash cair | `nero-portal/docs/QA-REVIEW.md` §9 |
| Invariante de `mutations.ts` só em comentário | idem §7 |
| Prompt injection pela Biblioteca | idem §8 |
| Envs de Preview do Nero apontando para produção | idem §6 |
| Saúde dos times afrouxada temporariamente | `HANDOFF.md` |

## Uma simplificação que não foi feita

As 6 functions em `api/` cada uma com sua cópia de `verifyBearer` poderiam virar 2–3 functions
com roteamento interno (`?action=`), eliminando a duplicação **por construção** em vez de por
teste de contrato, e reduzindo cold starts. Não foi feito porque muda todos os call sites do
Dash e o `openapi.ts` — maior que o escopo desta rodada. Fica registrado como a próxima
simplificação óbvia.

---

## Histórico do Nero antes do monorepo

O `nero-portal/` entrou por `git subtree`, então os commits anteriores existem no repositório
mas com os caminhos **sem** o prefixo. Para ver a história pré-move:

```bash
git log --oneline fbe5cb2^2 -- src/lib/nero/core.ts   # e não nero-portal/src/...
```

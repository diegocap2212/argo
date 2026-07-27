# Deploy — runbook do Portal Nero

> **O deploy não altera mais o schema.** O `vercel-build` era
> `prisma generate && prisma db push && next build` e aplicava schema a cada deploy —
> inclusive **de preview, contra o banco de produção** (medido em 2026-07-26; ver
> `docs/QA-REVIEW.md` §6). Agora é `prisma generate && next build`, e mudança de schema é
> **ato deliberado**, nunca efeito colateral de build.
>
> ```bash
> pnpm --filter nero-portal db:migrate:new   # cria a migration (sem aplicar)
> pnpm --filter nero-portal db:migrate       # prisma migrate deploy — aplica
> ```
>
> `db:push` foi **removido** do package.json: era o gatilho do problema.

## Baseline (uma vez, por banco) — ✅ APLICADO em produção (2026-07-26)

As migrations começam em `prisma/migrations/0_init`, gerada do schema atual. O banco de
produção já tem essas 17 tabelas (criadas por `db push`), então o `0_init` **não deve ser
executado** lá — deve ser marcado como já aplicado:

```bash
# 1. Backup ANTES (branch Neon + dump). Ver §1 abaixo.
# 2. Conferir que o schema do repo bate com o banco — a saída tem de ser VAZIA:
npx prisma migrate diff --from-url "$DATABASE_URL_UNPOOLED" \
  --to-schema-datamodel prisma/schema.prisma --script
# 3. Marcar o baseline (grava só metadados em _prisma_migrations; não mexe em tabela):
npx prisma migrate resolve --applied 0_init
# 4. Confirmar:
npx prisma migrate status     # -> "Database schema is up to date!"
```

**Aplicado em produção em 2026-07-26**, na ordem acima e com verificação a cada passo:

| Passo | Resultado |
|---|---|
| Backup | branch Neon `backup-pre-migrate-baseline` (`br-round-heart-ac5sg4oj`), criada de `main` |
| Paridade de schema | `migrate diff` do repo × produção → **vazio** |
| `resolve --applied 0_init` | `Migration 0_init marked as applied` |
| `migrate status` | `Database schema is up to date!` |
| `migrate deploy` | `No pending migrations to apply` (no-op) |
| Dados | `UsageLog=198 Document=10 StateVersion=212` — **idênticos ao antes** |

O procedimento havia sido ensaiado antes na branch `preview` do mesmo projeto Neon
(`neon-celeste-globe`), então produção não foi o primeiro teste. Daqui em diante, mudança de
schema é `db:migrate:new` → revisar o SQL → `db:migrate`.

---

## Histórico — checklist da v2 (report + radar + catálogo + academia)

> **⚠️ SEÇÃO HISTÓRICA — NÃO EXECUTAR COMO ESCRITA.** Ela descreve o mundo em que o
> `vercel-build` aplicava schema sozinho. Hoje `vercel-build` é
> `prisma generate && next build` e **`db:push` não existe mais no `package.json`** —
> os comandos `npm run db:push` abaixo simplesmente falham. Substitua por
> `pnpm --filter nero-portal db:migrate` (migration versionada, revisada antes).
> O passo de **backup continua obrigatório**: é a única parte desta seção que vale
> literalmente. Ver "Como aplicar schema hoje" no topo do arquivo.

Esta versão adiciona 4 modelos NOVOS ao banco (`Report`, `MaturityAssessment`,
`CatalogAsset`, `DataField`). A mudança é **100% aditiva** (nenhuma tabela/coluna
existente é alterada ou removida). Na época o `vercel-build` rodava `prisma db push`
sozinho no deploy, e por isso o backup vinha **ANTES** do push/merge.

## 1. Backup (obrigatório — nada do que está no Nero pode se perder)

```bash
# a) Branch de snapshot no Neon (rollback instantâneo se algo der errado)
neonctl branches create --name backup-pre-v2
# (ou pelo console do Neon: Branches → New branch a partir de main)

# b) Dump local (cinto e suspensório) — usar a URL DIRETA (unpooled)
pg_dump "$DATABASE_URL_UNPOOLED" -Fc -f backup-pre-v2.dump
```

## 2. Revisar o SQL que o push vai aplicar

```bash
npx prisma migrate diff \
  --from-url "$DATABASE_URL_UNPOOLED" \
  --to-schema-datamodel prisma/schema.prisma \
  --script
```

Conferir que só existem `CREATE TABLE` / `CREATE INDEX` (4 tabelas novas).
**Se aparecer qualquer `DROP` ou `ALTER ... NOT NULL`, PARAR e investigar.**
Nunca usar `db:reset` / `--force-reset` / `--accept-data-loss`.

## 3. Aplicar e semear

```bash
# HISTÓRICO: era `npm run db:push`. Hoje o script não existe — use a migration versionada:
corepack pnpm --filter nero-portal db:migrate   # aplica prisma/migrations/ (revisar o SQL antes)
corepack pnpm --filter nero-portal db:seed      # idempotente: cria as 11 áreas DAMA como "lacuna"; não toca no resto
```

## 4. Verificar (com o banco real)

```bash
# ESCREVE no banco apontado pelas envs — só contra branch descartável, NUNCA produção.
corepack pnpm --filter nero-portal test:state   # versionamento + undo + reserva de orçamento (deve: 0 fail)
corepack pnpm --filter nero-portal test:core    # 88 checks sem banco (modelo, preço, PII, tools, input)
```

Depois, no portal:
1. `/estado` — card "Maturidade DAMA" aparece (vazio = ok).
2. Chat: "avalie a maturidade de Metadata como nível 1, meta 3, assumido" →
   radar ganha forma em `/estado`; entrada some ao desfazer na auditoria.
3. Chat: "documente a tabela gold.vendas.fato_pedidos no padrão do golden example"
   → aparece em `/catalogo` com % de completude.
4. `/report` → "Gerar report da quinzena" → conferir PDF (Chrome/Edge) e
   "Copiar como markdown".
5. `/academia` → abrir a trilha, conversar com o tutor num passo.

## 5. Ambiente de demo (isolado — nunca produção)

```bash
# criar branch "demo" no Neon e apontar POSTGRES_PRISMA_URL/DATABASE_URL_UNPOOLED para ela
corepack pnpm --filter nero-portal db:seed
DEMO_SEED_ALLOWED=true corepack pnpm --filter nero-portal db:seed:demo   # aborta sem a flag, por segurança
```

Roteiro do apresentador: `content/demo-roteiro.md`.

## Variáveis de ambiente

`ANTHROPIC_API_KEY`, `POSTGRES_PRISMA_URL`, `DATABASE_URL_UNPOOLED`, `SESSION_SECRET`,
`NEO_ORIGIN`. Opcionais: `NERO_MODEL` (fora da allowlist **aborta** o startup em produção),
`NERO_MONTHLY_BUDGET_USD` (teto global), `NERO_USER_MONTHLY_BUDGET_USD` (teto por identidade).

**`APP_PASSWORD` foi removida** e não deve ser reintroduzida: o Nero não tem login próprio —
ele valida o token de sessão do Portal NEO (subchave HKDF de propósito `nero`).

## Headers de segurança (`vercel.json`)

`vercel.json` é JSON estrito — não aceita comentário nem chave extra dentro de
`headers[].headers[]`. O porquê de cada header fica aqui.

| Header | Por quê |
|---|---|
| `X-Content-Type-Options: nosniff` | Impede o browser adivinhar o content-type. |
| `Referrer-Policy: strict-origin-when-cross-origin` | Não vaza path do Nero para terceiros. |
| `X-Frame-Options: SAMEORIGIN` | Legado; coberto também pelo `frame-ancestors` da CSP. |
| `Strict-Transport-Security` | Acrescentado em 2026-07-27. |
| `Content-Security-Policy` | Acrescentado em 2026-07-27. |
| `Permissions-Policy` | Nega câmera/microfone/geolocalização/pagamento/USB — nada disso é usado. |

**Por que o deployment precisa dos próprios headers.** O Nero é servido pela origem do portal
(`neo-lm.vercel.app/nero`), que já tem CSP e HSTS. Mas o deployment do `nero-portal` também é
alcançável pela URL do próprio projeto, e ali **nenhum header do portal se aplica**. O review
de 2026-07-27 (§7.16) registrou isto: um deployment tem de ser defensivo por si, não por
herança de quem faz o rewrite.

**Notas da CSP.** `script-src` NÃO tem `'unsafe-inline'`. `'unsafe-eval'` está presente porque
o runtime do Next precisa dele em produção; `style-src 'unsafe-inline'` é exigido pelo
Tailwind/Next para estilo em runtime. `connect-src 'self'` basta porque o browser nunca fala
com a API da Anthropic direto — quem chama o modelo é o servidor (`lib/nero/core.ts`, o único
ponto de IA). Se algum dia a UI passar a consumir um serviço externo, é aqui que libera.

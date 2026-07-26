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

Esta versão adiciona 4 modelos NOVOS ao banco (`Report`, `MaturityAssessment`,
`CatalogAsset`, `DataField`). A mudança é **100% aditiva** (nenhuma tabela/coluna
existente é alterada ou removida) — mas o `vercel-build` roda `prisma db push`
sozinho no deploy, então o backup vem **ANTES** do push/merge.

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
npm run db:push     # aplica o schema (aditivo)
npm run db:seed     # idempotente: cria as 11 áreas DAMA como "lacuna"; não toca no resto
```

## 4. Verificar (com o banco real)

```bash
npx tsx scripts/test-state.ts   # versionamento + undo, incl. entidades novas (deve: 0 fail)
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
npm run db:seed
DEMO_SEED_ALLOWED=true npm run db:seed:demo   # aborta sem a flag, por segurança
```

Roteiro do apresentador: `content/demo-roteiro.md`.

## Variáveis de ambiente

Sem novidades: `ANTHROPIC_API_KEY`, `POSTGRES_PRISMA_URL`, `DATABASE_URL_UNPOOLED`,
`APP_PASSWORD`, `SESSION_SECRET` (e opcionais `NERO_MODEL`, `NERO_MONTHLY_BUDGET_USD`).

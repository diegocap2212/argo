# Deploy — checklist da v2 (report + radar + catálogo + academia)

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

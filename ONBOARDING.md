# Onboarding — do zero ao deploy

Caminho dourado para quem está assumindo o projeto. Leia
[`ARCHITECTURE.md`](ARCHITECTURE.md) antes de mexer em código, e
[`SECRETS.md`](SECRETS.md) quando precisar de credencial.

## 1. Instalar (uma vez)

```bash
git clone https://github.com/diegocap2212/argo.git && cd argo
corepack enable          # o pnpm vem do campo packageManager
pnpm install             # UM install cobre os 4 apps + packages/*
```

Requisitos: Node 24 (paridade com o runtime da Vercel), `pnpm` 11 via corepack. Para operar
infra: `vercel` CLI e `neonctl`, ambos autenticados.

> Se você vem de um `npm ci` por pasta: isso não existe mais. Um lockfile só, na raiz.

## 2. Rodar

```bash
pnpm --filter neo-hub          dev   # hub          — requer VITE_SUPABASE_*
pnpm --filter locavia-dashboard dev  # /dash  :5173 — sem env: fallback local, auth aberto
pnpm --filter maturitymodel    dev   # /maturity:8080 — requer VITE_SUPABASE_*
pnpm --filter nero-portal      dev   # /nero        — requer ANTHROPIC_API_KEY + Postgres
```

Cada app roda standalone com base `/` e sem middleware. **O portal composto não se valida em
localhost** — ver §5.

## 3. Gates de qualidade

```bash
pnpm typecheck                          # 7 pacotes
pnpm lint
pnpm --filter @neo/auth test            # contrato de sessão (77 asserções)
pnpm --filter nero-portal test:core     # modelos, preços, orçamento (30)
pnpm --filter locavia-dashboard test:performance
pnpm build:portal                       # hub + dash + maturity compostos em dist/
```

Tudo isso roda no CI em push/PR. Dois testes ficam de fora de propósito, por exigirem
recurso externo:

```bash
# destrutivo: SEMPRE contra branch do Neon, nunca produção
npx tsx nero-portal/scripts/test-state.ts
# exige branch Supabase + service_role
npx tsx maturitymodel/tests/rls/rls-matrix.ts
```

## 4. E2E do portal (gate pós-deploy)

Verifica a matriz de acesso das três ferramentas contra um **deployment**. Não roda em
push/PR — ver o comentário no `ci.yml` para o porquê.

```bash
# metade sem sessão: não precisa de segredo nenhum
NEO_BASE_URL=https://neo-lm.vercel.app pnpm test:portal

# metade logada: forja cookie com o segredo do deployment
NEO_BASE_URL=<url> NEO_SESSION_SECRET=<segredo> NEO_FULL_STACK=1 pnpm test:portal
```

O login por OTP **não** é automatizado (precisaria de caixa de entrada); a suíte forja o
`neo_session` e cobre tudo abaixo dele. Testar o OTP é manual: hub → e-mail → código.

## 5. Deploy

Dois projetos Vercel, **Git desconectado nos dois** — deploy é sempre por CLI, deliberado.

```bash
# Portal (hub + dash + maturity + functions + middleware), da RAIZ
vercel deploy --target=production --skip-domain    # staging, não aliasado
vercel promote <url>                               # vira produção

# Nero — a flag NÃO é opcional (ver ARCHITECTURE §3)
vercel deploy --local-config nero-portal/vercel.json --prod
```

**Nunca `vercel dev`** para validar middleware/functions: ele não os executa como produção.
Valide em deployment.

### Schema do banco (Nero)

O deploy **não** altera schema. Mudança é ato deliberado:

```bash
pnpm --filter nero-portal db:migrate:new   # cria a migration, sem aplicar
# revisar o SQL gerado
pnpm --filter nero-portal db:migrate       # aplica
```

Backup antes de qualquer migration: `neonctl branches create --project-id frosty-star-37790121
--name backup-<data>`. Runbook completo em [`nero-portal/DEPLOY.md`](nero-portal/DEPLOY.md).

---

## Pegadinhas que custam um dia

Cada uma destas já queimou alguém. Ler antes de debugar.

| Sintoma | Causa |
|---|---|
| Build do Nero roda `build:portal` | Falta `--local-config nero-portal/vercel.json` |
| Function 500 `ERR_MODULE_NOT_FOUND`, mas o build passou | Import compartilhado em `api/` ou no middleware — **não é suportado**; ver ARCHITECTURE §1 |
| Mudei a env e nada mudou | Env só vale no **próximo deploy** |
| Nero rejeita toda sessão | `SESSION_SECRET` divergente entre os dois projetos Vercel |
| `vercel env add ... preview` nunca completa | Catch-22 da CLI 54 (`git_branch_required`) — a CLI sugere um comando que ela mesma rejeita. Usar dashboard |
| `vercel env rm NOME preview` | Apaga a variável **inteira**, produção incluída. E env de produção é *write-only* — sem o valor reconstituível, não há volta |
| `vercel env pull` traz tudo vazio | Envs de produção são *Sensitive* (write-only). Normal, não é bug |
| `supabase config push` zerou o `[auth]` | Ele reseta a seção; SMTP/allowlist vão por Management API |
| `npm run build` no Dash pede credencial | Ele roda `sync:sfmkt`. No CI/portal use `vite build` |
| Deploy de preview escreveu em produção | Era `prisma db push` no `vercel-build` — **corrigido**; se voltar, é regressão |
| `git log nero-portal/arquivo` sem história | Entrou por subtree: `git log fbe5cb2^2 -- src/...` |

## Onde as coisas vivem

| Preciso de… | Vá para |
|---|---|
| Por que é assim / o que não mexer | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Variável, segredo, quem rotaciona | [`SECRETS.md`](SECRETS.md) |
| Estado corrente, pendências | [`HANDOFF.md`](HANDOFF.md) |
| Achados de QA e segurança do portal | [`docs/QA-PLAN.md`](docs/QA-PLAN.md), [`docs/SECURITY-PLAN.md`](docs/SECURITY-PLAN.md) |
| Achados do Nero | [`nero-portal/docs/QA-REVIEW.md`](nero-portal/docs/QA-REVIEW.md) |
| Como vender a estrutura enterprise | [`nero-portal/docs/ARQUITETURA-ENTERPRISE.md`](nero-portal/docs/ARQUITETURA-ENTERPRISE.md) |
| Regras visuais | [`nero-portal/DESIGN.md`](nero-portal/DESIGN.md) |
| Rodar/testar um app específico | o `README.md` da pasta dele |

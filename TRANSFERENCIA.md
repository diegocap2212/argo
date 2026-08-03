# Transferência do NEO — runbook de entrega

> **Para:** quem conduz a passagem do NEO da Blite/Venice-Tech (Diego) para a Venice.
> **Escrito em:** 2026-07-31.
>
> **Nenhum valor de credencial aparece aqui, e isso é regra, não estilo.** Este documento diz
> *onde* cada coisa vive, *quem* faz, *em que ordem* e *como se prova que foi feito*. Os valores
> ficam nos consoles. O inventário do que existe está em [`SECRETS.md`](SECRETS.md).

---

## A regra que governa este documento

**Um item só fecha com evidência.** É a mesma disciplina da tabela de pendências do
`SECRETS.md`, e existe por um motivo concreto: o code review de 2026-07-27 classificou aquelas
linhas como *risco operacional* — não como documentação — justamente porque nenhuma tinha prova
de revogação. "Acho que revoguei" mantém o incidente aberto.

Enquanto a coluna de evidência estiver vazia, **considere a credencial viva e o item aberto**.

---

## A ordem, e por que ela é esta

A tentação é rotacionar tudo primeiro, para "limpar" antes de entregar. **Não faça isso.**
Rotacionar antes de a Venice ter acesso próprio deixa um intervalo em que ninguém consegue
operar — e se algo quebrar nesse intervalo, quem sabe consertar já perdeu o acesso.

```
FASE 1  transferir a propriedade      → a Venice passa a poder operar
FASE 2  a Venice cria as credenciais dela
FASE 3  revogar as do Diego            → o acesso antigo morre
FASE 4  provar que morreu              → é aqui que os itens fecham
```

A Fase 3 nunca começa antes de a Fase 2 estar verificada.

---

## FASE 1 — Transferir a propriedade

| # | O quê | Onde | Quem | Feito? |
|---|---|---|---|---|
| 1.1 | **Projeto Supabase** `cvkcngrmnfwupstyrpsd` (maturitymodel) | Dashboard → Settings → General → Transfer project | Diego | ☐ |
| 1.2 | **Projeto Vercel `neo-lm`** (hub, Dash, MMA, Administração, functions) | Vercel → Settings → Transfer | Diego | ☐ |
| 1.3 | **Projeto Vercel `nero-portal`** | idem | Diego | ☐ |
| 1.4 | **Projeto Neon** `neon-celeste-globe` (banco do Nero) | console.neon.tech | Diego | ☐ |
| 1.5 | **Repositório** `github.com/diegocap2212/argo` | GitHub → Settings → Transfer ownership | Diego | ☐ |
| 1.6 | **Conta Anthropic** (Claude API do Nero) | console.anthropic.com | Diego | ☐ |
| 1.7 | **Upstash Redis** (comentários do Dash, rate-limit) | via Vercel → Storage | Diego | ☐ |
| 1.8 | **Vercel Blob** (dataset do Jira, ~5 MB) | acompanha o projeto `neo-lm` | — | ☐ |

### 1.1 tem pré-requisitos — confira ANTES de tentar

A transferência de projeto Supabase falha se qualquer um destes não estiver satisfeito
(verificado na documentação oficial em 2026-07-31):

- Diego precisa ser **owner da organização de origem** (`zwzadexqvdlxvratunom`)
- quem recebe precisa ser **ao menos membro da organização de destino** — ou seja, **a Venice
  precisa ter uma org Supabase criada antes**
- o projeto **não** pode ter integração GitHub ativa
- **sem** project-scoped roles apontando para ele (planos Team/Enterprise)
- **sem** log drains configurados

E o que ela **não** faz: não muda de região (o projeto é `sa-east-1`), não leva a Vercel nem o
Neon junto, e mover para um plano Free pode custar **1–2 minutos de indisponibilidade** mais o
teto de 2 projetos.

> 📎 **Por que transferir em vez de migrar:** a transferência preserva `auth.users`, então os
> UUIDs não mudam e **os vínculos de `squad_members` continuam válidos**. Migrar para outro banco
> quebra isso em silêncio — todo SM abre o MMA e vê lista vazia, sem erro. O detalhe está em
> [`PORTABILIDADE.md`](PORTABILIDADE.md) §0 e §3.

---

## FASE 2 — A Venice cria as credenciais dela

Só depois que a Fase 1 estiver completa. Nada aqui é feito pelo Diego.

| # | O quê | Onde | Quem | Feito? |
|---|---|---|---|---|
| 2.1 | Token pessoal Supabase (`sbp_…`) — **de conta de serviço, não pessoal** | Supabase → Account → Access Tokens | Venice | ☐ |
| 2.2 | Nova **chave secreta** do projeto (`sb_secret_…`) | Supabase → Settings → API Keys | Venice | ☐ |
| 2.3 | Nova `ANTHROPIC_API_KEY` | console.anthropic.com | Venice | ☐ |
| 2.4 | Rotacionar `SESSION_SECRET` **nos DOIS projetos Vercel, com o mesmo valor** | Vercel → Environment Variables | Venice | ☐ |
| 2.5 | Rotacionar `NEO_AUTHZ_SECRET` **e** o segredo `neo_authz_secret` do Vault, **com o mesmo valor** | Vercel + `vault.create_secret` | Venice | ☐ |
| 2.6 | Rotacionar `ANCHOR_SYNC_CRON_SECRET` **e** `anchor_sync_secret` do Vault, mesmo valor | `supabase secrets set` + Vault | Venice | ☐ |
| 2.7 | Credenciais do Jira (sync do Dash) e do Neon | secrets do GitHub Actions / Vercel | Venice | ☐ |

### Três pares que precisam bater exatamente

Estes já pregaram peça neste projeto e o modo de falha é **silencioso**:

| Par | Se divergirem |
|---|---|
| `SESSION_SECRET` no `neo-lm` × no `nero-portal` | o Nero rejeita toda sessão do portal |
| `NEO_AUTHZ_SECRET` × `neo_authz_secret` (Vault) | `/api/authz` devolve `{}` → **o Nero fecha para a empresa inteira** |
| `ANCHOR_SYNC_CRON_SECRET` × `anchor_sync_secret` (Vault) | o cron das âncoras para de rodar |

E lembre: **env nova só vale no próximo deploy.** Rotacionar sem redeployar não muda nada — e
faz parecer que a rotação não funcionou.

> ⚠️ **Rotacionar `SESSION_SECRET` derruba toda sessão viva.** Todos refazem login por OTP. Não é
> incidente, mas avise antes.

---

## FASE 3 — Revogar o que era do Diego

Só depois que a Fase 2 estiver **verificada em produção** — isto é, alguém da Venice conseguiu
entrar no portal, abrir o Nero e abrir a Administração com as credenciais novas.

| # | Credencial | Gravidade | Feito? |
|---|---|---|---|
| 3.1 | **Chave secreta `sb_secret_55qL…`** — exposta em chat (2026-07-31) | 🔴 **ignora RLS inteiramente** | ☐ |
| 3.2 | Token pessoal `sbp_11903c…` — exposto em chat (2026-07-31) | 🟠 acesso à Management API | ☐ |
| 3.3 | Tokens pessoais `sbp_a5f2…` e `sbp_6ac9…` (pendências 1 e 2 do SECRETS.md) | 🟠 | ☐ |
| 3.4 | Anon key do projeto (pendência 7 — está no histórico do git) | 🟡 higiene | ☐ |
| 3.5 | `TOWER_PASSWORD` e `NERO_PASSWORD` — **sem uso** desde 31/07 | 🟡 | ☐ |
| 3.6 | Apagar o arquivo `Nero-LM-2026.md` da raiz (senha em texto puro) | 🟡 | ☐ |
| 3.7 | Remover o Diego das orgs: Supabase, Vercel, Neon, GitHub, Anthropic, Upstash | 🔴 é o que fecha tudo | ☐ |

**3.1 é a mais urgente da lista inteira, incluindo as pendências antigas.** `sb_secret_` é a
sucessora do `service_role`: quem a tem lê e escreve qualquer linha de qualquer tabela, por cima
das 62 policies — inclusive `portal_roles` e `neo_role_permissions`, ou seja, pode conceder a si
mesmo qualquer papel no NEO.

---

## FASE 4 — Provar que morreu

Sem esta fase, nada acima está fechado.

| # | Prova | Como | Feito? |
|---|---|---|---|
| 4.1 | Tokens `sbp_…` não aparecem mais em Account → Access Tokens **e** uma chamada com eles responde 401 | anotar data/hora | ☐ |
| 4.2 | A `sb_secret_` antiga responde **401** no PostgREST | `curl` com a chave antiga | ☐ |
| 4.3 | O Diego **não** consegue mais abrir o dashboard de nenhum provedor | tentar, anotar | ☐ |
| 4.4 | Portal, Nero, Torre e Administração abrem para uma conta da Venice | roteiro manual abaixo | ☐ |
| 4.5 | Preencher as colunas **Revogado em** e **Evidência** na tabela do [`SECRETS.md`](SECRETS.md) | commit | ☐ |

### Roteiro manual (4.4) — 5 minutos, exige login real

1. Entrar no hub → as portas aparecem, e o link **Administração** no canto superior direito para
   quem tem `neo.admin.access`
2. `/admin` → Pessoas lista gente; Papéis × Funções mostra a matriz
3. Abrir o **Nero** → entra **sem pedir senha**
4. `/dash/torre` → abre para quem tem `dash.tower.view`
5. Revogar `neo.nero.access` de alguém e navegar no Nero → **fecha em ≤60s**, sem novo login

---

## O que a Venice herda além das credenciais

| Precisa entender | Documento |
|---|---|
| Por que o sistema é assim, o que é load-bearing | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Do zero ao deploy, com as pegadinhas | [`ONBOARDING.md`](ONBOARDING.md) |
| Runbooks de incidente | [`OPERATIONS.md`](OPERATIONS.md) |
| O que **não** tem garantia, dito de frente | [`SECURITY.md`](SECURITY.md) §6 |
| Sair do Supabase/Vercel, se um dia for preciso | [`PORTABILIDADE.md`](PORTABILIDADE.md) |
| Estado corrente e pendências | [`HANDOFF.md`](HANDOFF.md) |
| O Nero como ativo: custo, incorporação | [`nero-portal/docs/ARQUITETURA-ENTERPRISE.md`](nero-portal/docs/ARQUITETURA-ENTERPRISE.md) |

### Duas armadilhas de operação que só se descobre apanhando

1. **O deploy do Nero mira o projeto errado.** Rodado da raiz do monorepo, o comando deploya
   para `neo-lm` — o `.vercel` da raiz aponta para o portal, e o projeto do Nero tem Root
   Directory = `nero-portal`. É preciso forçar `VERCEL_ORG_ID`/`VERCEL_PROJECT_ID`. Um deploy
   descuidado **sobrescreve o portal com um build do Nero**.
2. **`supabase db dump` exige Docker.** Sem ele, backup de dado se faz com
   `supabase db query -o csv`. E `supabase db query --linked -f <arquivo>` é como se aplica SQL
   sem mexer no histórico de migrations — `db push` tentaria reaplicar as 60 já aplicadas.

### Depois de qualquer mudança de schema

```bash
supabase db advisors --linked --type security
```

Ele pegou um vazamento real em 31/07 (view sem `security_invoker` contornando RLS) que nem a
revisão de código nem o harness de testes tinham pego.

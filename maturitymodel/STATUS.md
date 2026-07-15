# Status — Portal MMA

> Snapshot do estado atual. Arquitetura completa (schema, RLS, hooks, DS,
> governança) em `ARCHITECTURE.md`. Este arquivo é "o que já foi feito" e "o
> que falta".
>
> ⚠️ **Este arquivo é de 2026-07-10 e ficou defasado em dois pontos grandes**:
> a URL/deploy abaixo e a lista de AMs (§"Squads e pessoas") descrevem o
> **modelo antigo de acesso** (AM = poder global via `is_any_am()`). Desde
> 2026-07-15 existe admin global explícito por e-mail (`portal_admins`) e
> SM/AM ficam escopados ao próprio squad — ver `ARCHITECTURE.md` §4.2/§8.4
> (já corrigidas) e `docs/ROLES-REDESIGN.md`. Fonte de verdade do estado
> operacional corrente: `HANDOFF.md` da raiz do monorepo.

## 🟢 EM PRODUÇÃO — `https://neo-lm.vercel.app/maturity/**`

> Domínio antigo (`maturitymodel-ashen.vercel.app`) foi descontinuado no cutover
> do Portal NEO (2026-07-14) — o MMA agora é servido pelo domínio unificado.

Deploy do monorepo `argo/` (raiz), não mais deste repositório isoladamente. Login via sessão Supabase unificada (OTP no Hub), não mais email+senha próprio do MMA.

## Revisão mais recente (sessão colaborativa + Jira direto + jornada clara)

Três mudanças de núcleo pedidas após o primeiro uso, na branch `feat/sessao-colaborativa`:

1. **Voto individual sigiloso → sessão colaborativa.** O SM (ou AM) apresenta cada dimensão e registra a **nota de consenso** do grupo; os demais membros acompanham em **modo leitura** (polling ~5s). Sem etapa de revelação.
   - Estados do ciclo: `session → homologation → official → archived` (migration `20260710130000`, **já aplicada em produção**). Removidos voting/workshop/proposed.
   - `Sessao.tsx` (nova) substitui `Avaliar.tsx` + `Workshop.tsx` (removidos). Tabela `votes` virou morta (sem drop).
   - **Verificado ponta-a-ponta via Playwright** (conta QA descartável, já removida): login → Iniciar assessment → registrar consenso → enviar homologação → homologar 10/10 → oficializar → 10 kaizens. Modo participante (leitura) também verificado.
2. **Jornada clara.** Início ganhou CTA verde **"Iniciar assessment"** por squad (SM/AM) que cria o ciclo e leva direto à Sessão. Jornada renomeada com empty state explícito. Resolve o "onde eu começo?".
3. **Âncoras via Jira direto** (não mais `/api/data` do Locavia). Edge Function reescrita: Basic auth no Jira **Grupo LM** (`grupolm.atlassian.net`), JQL por squad (mapa `SQUAD_JIRA` embutido cobre os 8 squads), normalização + 8 âncoras. **Deployada e testada contra o Jira real** (2026-07-10): sync do Nivus puxou 163 itens e gravou 8 leituras com valores reais (aderência 97,6%, variação de cycle time 151%, retrabalho 19%, etc.). Secrets `JIRA_*` configurados. Vereditos vêm `na` até o squad ter um ciclo (proposta/oficial) que dê o estágio de referência — comportamento correto.

**Estado de deploy desta revisão**: o código (M1+M2+M3) está na branch `feat/sessao-colaborativa`, `npm run build` limpo. **Ainda não mergeado na `main`** — mas a migration M1 já foi aplicada no banco, então a `main` (front antigo) está temporariamente desalinhada com o banco (o front antigo tentaria inserir status `voting`, agora inválido). **Prioridade: mergear e deployar o front novo.**

## Squads e pessoas

9 squads (`SF Cloud, SF Vendas, Gol, Nivus, Optimus, Jetta, Scania, Parati` + `Time` legado). Nenhum ciclo aberto.

| Papel | Pessoas | Status |
|---|---|---|
| AM (todos os 8 squads) | Diego Caporusso, Diego Torres, Elaine Mendes, Elizabeth Prado | ✅ conta + acesso completo |
| SM SF Cloud/SF Vendas/Gol | Gabriela Reis | ❌ convite travado em rate limit |
| SM Nivus/Optimus/Jetta | Rafael Silva | ❌ convite travado em rate limit |
| SM Scania/Parati | Tiago (?) | ⏳ aguardando nome + email |

Só Diego Caporusso tem login funcional confirmado (email de senha reenviado).

## Pendências (nenhuma bloqueia o app já no ar)

1. ~~Mergear + deploy do front~~ — **feito** (produção alinhada com o banco).
2. ~~Credenciais/deploy do Jira~~ — **feito** (função deployada e testada; secrets `JIRA_*` no Supabase).
3. **Confirmar as 4 fórmulas** de âncora assumidas (fura-fila/gmud, multi_sprint, return_rate, adherence) — agora com valores reais visíveis pra calibrar. Ver comentários "ASSUNÇÃO" em `sync-anchors/index.ts`.
4. **Convites Gabriela/Rafael** (rate limit) + **Tiago** (dados). Configurar SMTP customizado no Supabase se for convidar em lote.
5. **Cron da Edge Function** — adiado até o item 2; precisa `pg_cron`/`pg_net` (não ativos).

## Como retomar

Leia este arquivo + `ARCHITECTURE.md` (§4 auth, §8 banco, §9 Edge Function, §11 governança). Histórico nos commits.

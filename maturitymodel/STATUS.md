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
>
> ⚠️ **Terceiro ponto defasado (corrigido aqui em 2026-07-27):** a seção "Estado de
> deploy desta revisão" dizia que o código estava na branch `feat/sessao-colaborativa`
> e **ainda não mergeado**, com a `main` desalinhada do banco. Isso já não é verdade —
> a sessão colaborativa está em produção. E a lista de acesso não é mais "só Diego tem
> login": o login é OTP no Hub, liberado pela allowlist `is_neo_allowed()` — desde
> 09/09/2026, apenas quem está aprovado em `neo_access` (não há mais regra de domínio).
>
> Do hardening de 2026-07-27: a Edge Function `sync-anchors` virou **duas**
> (`sync-anchors-user` com JWT + papel, `sync-anchors-cron` com secret do Vault),
> `npm run typecheck` passou a verificar de verdade (`tsc -b`; antes escondia 201 erros),
> a policy `homolog_update` passou a exigir `is_portal_am()`, e o app ganhou suíte de RLS
> em Postgres efêmero (88 checks) + fórmulas de âncora (17). Ver
> `docs/HARDENING-EM-ANDAMENTO.md` na raiz.

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

~~**Estado de deploy desta revisão**: o código (M1+M2+M3) está na branch `feat/sessao-colaborativa`, `npm run build` limpo. **Ainda não mergeado na `main`** — mas a migration M1 já foi aplicada no banco, então a `main` (front antigo) está temporariamente desalinhada com o banco (o front antigo tentaria inserir status `voting`, agora inválido). **Prioridade: mergear e deployar o front novo.**~~

**RESOLVIDO** (obsoleto desde 2026-07-14): a sessão colaborativa foi mergeada e está em
produção pelo build composto do monorepo. Não existe mais desalinhamento entre front e banco,
e a `feat/sessao-colaborativa` não é a branch de trabalho.

## Squads e pessoas

9 squads (`SF Cloud, SF Vendas, Gol, Nivus, Optimus, Jetta, Scania, Parati` + `Time` legado). Nenhum ciclo aberto.

| Papel | Pessoas | Status |
|---|---|---|
| AM (todos os 8 squads) | Diego Caporusso, Diego Torres, Elaine Mendes, Elizabeth Prado | ✅ conta + acesso completo |
| SM SF Cloud/SF Vendas/Gol | Gabriela Reis | ❌ convite travado em rate limit |
| SM Nivus/Optimus/Jetta | Rafael Silva | ❌ convite travado em rate limit |
| SM Scania/Parati | Tiago (?) | ⏳ aguardando nome + email |

~~Só Diego Caporusso tem login funcional confirmado (email de senha reenviado).~~
**Obsoleto**: não há mais senha nem convite por senha. Login é **OTP no NEO Hub**, liberado
pela allowlist `is_neo_allowed()` — desde 09/09/2026, só quem está aprovado em `neo_access`.
Os "convites travados em rate limit" da tabela acima deixaram de existir como problema: quem
está na allowlist entra sozinho. O que ainda importa da tabela é o **mapa de papéis por squad**
(`squad_members` + `portal_roles`), não o estado de convite.

## Pendências (nenhuma bloqueia o app já no ar)

1. ~~Mergear + deploy do front~~ — **feito** (produção alinhada com o banco).
2. ~~Credenciais/deploy do Jira~~ — **feito** (função deployada e testada; secrets `JIRA_*` no Supabase).
3. **Confirmar as 4 fórmulas** de âncora assumidas (fura-fila/gmud, multi_sprint, return_rate,
   adherence) — agora com valores reais visíveis pra calibrar. Ver comentários "ASSUNÇÃO" em
   `functions/_shared/anchor-sync.ts` (era `sync-anchors/index.ts`).
   **Atenção:** duas dessas fórmulas estavam *erradas*, não só "assumidas", e foram corrigidas em
   2026-07-27 — "sprint injetada" era inferida comparando **comprimento de string** dos campos
   `from`/`to` do changelog, e o timestamp era comparado ao início mais antigo entre **todas** as
   sprints do item em vez da sprint efetivamente adicionada. Os 17 checks de
   `tests/anchor-formulas.ts` fixam o comportamento novo. Calibrar a partir dele, não dos valores
   antigos.
4. ~~**Convites Gabriela/Rafael** (rate limit) + **Tiago** (dados).~~ — obsoleto: login por OTP
   no Hub. Falta apenas confirmar o **nome/e-mail do SM de Scania/Parati** para o mapa de papéis.
5. **Cron da Edge Function** — `pg_cron`/`pg_net` já ativos e o cron existe. Pendência real
   agora é de **operador**: criar os segredos no Vault (`anchor_sync_url`, `anchor_sync_secret`)
   e `supabase secrets set ANCHOR_SYNC_CRON_SECRET=... SB_ANON_KEY=...`, senão o cron chama a
   função nova e toma 401. Ver `docs/HARDENING-EM-ANDAMENTO.md` na raiz.

## Como retomar

Leia este arquivo + `ARCHITECTURE.md` (§4 auth, §8 banco, §9 Edge Function, §11 governança). Histórico nos commits.

# HANDOFF — Estado da implementação NEO

> Retomada rápida. Plano em `C:\Users\Usuario\.claude\plans\fable-precisamos-sincronizar-essas-frolicking-rainbow.md`.
> Marca: **NEO — Núcleo de Evolução e Operação** (ex-"ARGO", renomeado por conflito com o carro Fiat).
> Última atualização: 2026-07-13.

## Arquitetura decidida (definitiva)

- **Login = Magic Link (e-mail OTP) do Supabase, só no hub.** Sem Azure/Microsoft (a conta do Diego não tem privilégio para criar App Registration no tenant LM; optamos por não depender do TI).
- **Autorização = allowlist `is_neo_allowed()`**: auto-libera `@lmmobilidade.com.br` + exceções na tabela `neo_access` (gerenciadas no dashboard Supabase). Papéis do MMA continuam manuais via `/admin`.
- **Apps sem login próprio**: sem sessão → redirecionam ao hub. Hub e apps são origens Vercel distintas → hub faz **handoff de sessão via fragment** (`#neo_at`/`#neo_rt`), consumido e limpo no boot das apps.
- **Iframe MMA→Dash**: sessão repassada por `postMessage` (`neo:session`/`neo:ready`, origin validado).
- Domínios seguem em `*.vercel.app` (sem domínio único por ora).

## ✅ FEITO (working tree; buildado, commit pendente após o rebrand)

Commits existentes: `6cf820c` (monorepo+limpeza), `89c5afa` (hub inicial+workflow).

1. **Limpeza + monorepo + README raiz** (NEO, arquitetura completa).
2. **Migração Supabase** `maturitymodel/supabase/migrations/20260713120000_neo_access_allowlist.sql`: tabela `neo_access` + função `is_neo_allowed()` (SECURITY DEFINER). **Ainda não aplicada no Supabase.**
3. **Hub** (`neo-hub/`): app Vite, identidade preservada, login Magic Link, gate de allowlist, handoff de sessão nas doors. Tagline = "Núcleo de Evolução e Operação". Build ✓.
4. **Locavia (Performance Dash)**:
   - `api/data.ts`, `api/refresh.ts`, `api/comments.ts`: `isAuthed` aceita cookie legado OU `verifyBearer` (RPC `is_neo_allowed`). Envs novas: `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
   - `api/login.ts` e `src/components/LoginScreen.tsx` DELETADOS.
   - `src/lib/supabase.ts` novo; `authService.ts` reescrito (getSession/authHeaders/hasSession/logout/consumeNeoSession/redirectToHub).
   - `AuthGate.tsx`: sem sessão→hub; embed recebe sessão via postMessage. `dataService.ts` usa Bearer. `AppShell.tsx` logout novo. `vite.config.ts` sem mock de /api/login. `tsc -b` ✓.
5. **Maturity (Portal MMA)**:
   - `useAuth.tsx`: sem `signInWithPassword`; expõe `allowed`, `signOut`→hub, `redirectToHub`, `consumeNeoSession` no boot.
   - `ProtectedRoute.tsx`: sem sessão→hub; sem allowlist→signOut; interstitials.
   - `App.tsx`: rotas `/login` e `/reset-password` + `AuthRecoveryGate` removidas (legadas → `/`).
   - `Login.tsx` e `ResetPassword.tsx` DELETADOS. `Metricas.tsx`: envia sessão ao iframe via postMessage. `tsc --noEmit` ✓.
6. **Rebrand ARGO→NEO** em todo o código/docs (preservando "cargo"/"encargo" no conteúdo do MMA). Pasta `argo-hub`→`neo-hub`.

## ⏳ FALTA (ordem de deploy)

**Ferramentas prontas:** Vercel CLI 54.14.0 logado como `diegocapstealth` (org `diegocaporusso-2820s-projects`); `gh` logado como `diegocap2212`. Projetos Vercel atuais: `locavia-dashboard`, `maturitymodel`. Hub ainda não existe.

1. **Commit** de todo o working tree.
2. **Supabase**: aplicar a migração `neo_access` (dashboard SQL editor OU `supabase db push`, projeto `cvkcngrmnfwupstyrpsd`). Auth → URL Configuration: additional_redirect_urls += URL do hub (`/**`). Confirmar Magic Link (e-mail) habilitado.
3. **GitHub**: criar repo `diegocap2212/neo` e push da `main`.
4. **Vercel**:
   - Criar projeto do hub (nome a confirmar: "neo"?), Root Directory `neo-hub`, envs `VITE_SUPABASE_*`. Anotar URL.
   - Reapontar `locavia-dashboard` e `maturitymodel` para o repo `neo`. Envs novas: locavia (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `VITE_SUPABASE_*`, `VITE_HUB_URL`, `GITHUB_REPO=diegocap2212/neo`), maturity (`VITE_HUB_URL`).
   - Ajustar `HUB_URL` default (hoje `https://neo-lm.vercel.app`) em `locavia-dashboard/src/services/authService.ts` e `maturitymodel/src/hooks/useAuth.tsx` para a URL real, ou setar `VITE_HUB_URL`.
   - GitHub Actions secrets (JIRA_*, BLOB_READ_WRITE_TOKEN) no repo novo.
5. **E2E**: hub → magic link (@lmmobilidade) → doors → Dash (Bearer) → Maturity → /s/:id/metricas (iframe) → logout. E-mail fora do domínio: bloqueado.
6. **Pós-validação (Fase 3c)**: remover ramo cookie das 3 functions + envs `DASHBOARD_PASSWORD`/`SESSION_SECRET`; atualizar `openapi.ts`, `CLAUDE.md`, `ARCHITECTURE.md`. Apagar este HANDOFF.

## Pegadinhas
- Aplicar a migração `neo_access` ANTES de setar `SUPABASE_URL`/`SUPABASE_ANON_KEY` no locavia (senão RPC 404 → gate nega). O cookie legado cobre a transição.
- `supabase config push` reseta `[auth]` (aviso em `maturitymodel/supabase/config.toml`).
- Redis (Upstash) permanece necessário para `api/comments.ts`.
- `verifyBearer`/`isAuthed` é duplicado inline nas 3 functions de propósito (Vercel não bundleia imports entre functions).
- Logo NEO oficial (imagem do Diego): o hub usa hoje símbolo abstrato + texto "NEO". Para o logo oficial, salvar PNG/SVG em `neo-hub/public/` e trocar no `index.html`.

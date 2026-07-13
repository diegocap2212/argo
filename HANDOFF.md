# HANDOFF — Estado da migração ARGO (SSO Microsoft)

> Documento de retomada. Plano completo em `C:\Users\Usuario\.claude\plans\fable-precisamos-sincronizar-essas-frolicking-rainbow.md`.
> Última atualização: 2026-07-13.

## Objetivo (aprovado pelo Diego)

- Hub (`argo-hub/`) = página de entrada com **login "Entrar com Microsoft"** (Entra ID), restrito ao tenant **lmmobilidade.com.br**, com auto-cadastro.
- Apps **sem tela de login própria**: sem sessão local → disparam `signInWithOAuth({provider:'azure'})` automaticamente (SSO silencioso via sessão do IdP; origens vercel.app continuam separadas — **sem** domínio único/proxy por ora).
- Identidade = **Supabase Auth do projeto `cvkcngrmnfwupstyrpsd`** (o mesmo do maturity) + provider Azure single-tenant. Contas email/senha existentes são auto-linkadas pelo email.
- Locavia: functions trocam cookie HMAC por validação de JWT Supabase (`GET {SUPABASE_URL}/auth/v1/user` com header `apikey` = anon key + `Authorization: Bearer <token>`).
- Iframe MMA→Locavia (cross-origin): pai envia `{type:'argo:session', access_token, refresh_token}` via `postMessage` (targetOrigin explícito); Locavia em `?embed=1` faz `supabase.auth.setSession()` e valida `event.origin`.

## ✅ FEITO (commitado ou no working tree)

1. **Limpeza** (deletados): `locavia-dashboard/locavia-redesign/`, `tools/debug/`, `tools/scratch/`, `jira_fields.json`, `sync/all_fields*.{txt,json}`, `maturitymodel/src/types/maturity.ts`, `bun.lockb`, `argo-hub/hub-preview-v2.html`, `performance-dash-logo.svg`.
2. **Monorepo**: `.git` internos removidos (históricos permanecem em github.com/diegocap2212/{locavia-dashboard,maturitymodel}); commit inicial `6cf820c` na raiz; `.gitignore` raiz criado; `!.env.example` corrigido no `.gitignore` do locavia.
3. **README.md raiz** escrito (arquitetura unificada — descreve o estado ALVO da auth).
4. **Workflow de sync** movido para `.github/workflows/hourly-sync.yml` (raiz) com `working-directory: locavia-dashboard`; `api/trigger-sync.ts` agora usa `process.env.GITHUB_REPO || 'diegocap2212/argo'`.
5. **Builds verificados pós-limpeza**: locavia `tsc -b` + `vite build` ✓; maturity `tsc --noEmit` + `vite build` ✓ (precisou `npm install` no maturity).
6. **Hub reconstruído como app Vite** (`argo-hub/`): `index.html` (ex hub-preview.html, identidade 100% preservada + seção `#gate` com botão "Entrar com Microsoft", `#session-bar`, `#doors` ocultas até logar), `src/main.ts`, `src/supabase.ts` (flowType pkce, localStorage), `src/vite-env.d.ts`, `package.json` (supabase-js ^2.81.1, vite ^5.4.19), `tsconfig.json`, `vercel.json` (headers), `.env.example`, assets em `public/`. **Build ✓** (`npm run build`).
7. **Azure CLI instalada** via winget em `C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd` (NÃO está no PATH das sessões — usar caminho completo).

## ⏸️ PAROU AQUI: `az login`

Tentativas de `az login --use-device-code` em background falharam por buffering de output (o device code não aparecia no log). **Usuário exige EDGE como navegador da autorização.**

**Próximo passo ao retomar** — rodar interativo ou com tee, ler o código e abrir o Edge:
```powershell
& "C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd" login --use-device-code --allow-no-subscriptions
# quando aparecer "enter the code XXXXXXXX", abrir para o usuário:
Start-Process msedge "https://microsoft.com/devicelogin"
```
(Alternativa: `az login` normal abre o browser default — se o default não for Edge, manter device code + abrir Edge manualmente.)

## 📋 A FAZER (ordem)

### Fase 1 — Azure + Supabase (após az login)
```bash
AZ="C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd"
TENANT_ID=$($AZ account show --query tenantId -o tsv)
APP_ID=$($AZ ad app create --display-name "ARGO (Supabase SSO)" --sign-in-audience AzureADMyOrg \
  --web-redirect-uris "https://cvkcngrmnfwupstyrpsd.supabase.co/auth/v1/callback" --query appId -o tsv)
$AZ ad sp create --id $APP_ID
SECRET=$($AZ ad app credential reset --id $APP_ID --display-name supabase --years 2 --query password -o tsv)
# permissões delegadas Graph openid/email/profile:
$AZ ad app permission add --id $APP_ID --api 00000003-0000-0000-c000-000000000000 --api-permissions \
  37f7f235-527c-4136-accd-4a02d197296e=Scope 64a6cdd6-aab1-4aaf-94b8-3cc8405e90d0=Scope 14dad69e-099b-42c9-810b-d002981feec1=Scope
```
Depois no **Supabase** (dashboard → Auth → Providers → Azure, projeto `cvkcngrmnfwupstyrpsd`):
- Enable, Client ID=$APP_ID, Secret=$SECRET, **Azure Tenant URL = `https://login.microsoftonline.com/$TENANT_ID`** (NUNCA /common).
- URL Configuration → additional_redirect_urls += URL do hub vercel.app `/**`, `https://locavia-dashboard.vercel.app/**`, `https://maturitymodel-ashen.vercel.app/**`. NÃO mudar site_url.
- "Allow new users to sign up" = ON.
- ⚠️ Refletir no `maturitymodel/supabase/config.toml` (o comentário nas linhas 3-8 avisa que `supabase config push` apaga config manual).
- Registrar a data de expiração do secret no README raiz.

### Fase 3a — Backend locavia (deploy sem downtime)
Em `api/data.ts` (auth: linhas ~12-58), `api/refresh.ts` (~16-61), `api/comments.ts` (~4-55): ADICIONAR `isAuthedBearer` inline (fetch `{SUPABASE_URL}/auth/v1/user`, headers `apikey`+`Authorization`; fail-open se envs ausentes) e trocar call sites para `if (!isAuthedCookie(req) && !(await isAuthedBearer(req)))`. Envs novas: `SUPABASE_URL`, `SUPABASE_ANON_KEY`. NÃO tocar `api/trigger-sync.ts`.

### Fase 3b — Frontend locavia (cutover junto com Fase 4)
- Novo `src/lib/supabase.ts` (igual ao do hub: pkce, localStorage). Dep: `@supabase/supabase-js ^2.81.1`. Envs `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY`.
- Reescrever `src/services/authService.ts`: `getSession()`, `authHeaders()` (Bearer), `login()` = signInWithOAuth azure redirectTo location.href, `logout()` = signOut + redirect hub. Guard dev: sem `VITE_SUPABASE_URL` → autenticado (paridade com fail-open atual).
- `AuthGate.tsx`: sem sessão → auto-OAuth (interstitial "Autenticando…"); **se `?embed=1`**: escutar postMessage do MMA (validar origin `https://maturitymodel-ashen.vercel.app`) e `setSession()`. Deletar `LoginScreen.tsx`.
- `dataService.ts:26`: fetch com `await authHeaders()`, remover `credentials:'same-origin'`; 401 → re-login.
- `AppShell.tsx:76`: novo logout. **Deletar `api/login.ts`**.

### Fase 4 — Maturity (mesmo cutover)
- `useAuth.tsx`: + `signInWithAzure()`; − `signInWithPassword`; `signOut` → redirect hub.
- `ProtectedRoute.tsx:11-13`: sem user → auto `signInWithAzure()` (interstitial), NÃO Navigate /login.
- `App.tsx`: remover rota `/login` (lazy import linha ~12, rota ~85), `/reset-password` e `AuthRecoveryGate`; legadas → `/`.
- Deletar `src/pages/Login.tsx` e `src/pages/ResetPassword.tsx`.
- `src/pages/squad/Metricas.tsx` (LOCAVIA_BASE_URL na linha ~12, iframe ~36): enviar sessão via postMessage no load do iframe + a cada onAuthStateChange, targetOrigin `https://locavia-dashboard.vercel.app`.

### Deploy + E2E
- Criar repo GitHub `diegocap2212/argo` (gh CLI autenticado ✓) e push.
- Vercel: reapontar `locavia-dashboard` e `maturitymodel` para o repo `argo` com Root Directory; criar projeto `argo-hub`. Migrar envs + adicionar as novas (ver README raiz, tabela de envs). Atualizar env `GITHUB_REPO=diegocap2212/argo` no projeto locavia. Secrets do GitHub Actions (JIRA_*, BLOB_READ_WRITE_TOKEN) no repo novo.
- E2E: hub → login MS → doors → Performance (dados via Bearer) → Maturity (jornada) → /s/:id/metricas (iframe via postMessage) → logout. Conta fora do tenant bloqueada. Auto-link da conta email/senha do Diego.
- Verificação locavia (CLAUDE.md): `npm run test:performance`, `tsc -b`, `lint`.

### Fase 3c — Pós-validação
Remover ramo cookie das 3 functions, envs `DASHBOARD_PASSWORD`/`SESSION_SECRET`, atualizar `src/api-docs/openapi.ts` (cookie→bearer), `CLAUDE.md` seção auth, `maturitymodel/ARCHITECTURE.md` §4, `STATUS.md`. Apagar este HANDOFF.md ao concluir.

## Pegadinhas já mapeadas
- `supabase config push` reseta `[auth]` → config Azure some (aviso no próprio config.toml).
- Redis (Upstash) continua necessário para `api/comments.ts` (só o rate-limit do login morre).
- `verifyToken`/`isAuthed` é duplicado INLINE em cada function de propósito (Vercel não bundleia imports entre functions) — manter o padrão.
- maturity: usuário sem squad já é tratado graciosamente (useMySquads=[] → onboarding no Inicio.tsx). RequireAM manda pra /.
- Maturity roda na porta 8080 em dev; locavia 5173. `npm run build` local do locavia exige credenciais (usar `tsc -b && vite build`).

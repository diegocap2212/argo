# HANDOFF — NEO (Núcleo de Evolução e Operação)

> Plano: `C:\Users\Usuario\.claude\plans\fable-precisamos-sincronizar-essas-frolicking-rainbow.md`.
> **Estado: NO AR e validado E2E em produção (2026-07-13).**

## URLs de produção (Vercel, org diegocaporusso-2820s-projects)
- **Hub:** https://neo-lm.vercel.app (login Magic Link)
- **Performance Dash:** https://locavia-dashboard.vercel.app
- **Portal MMA:** https://maturitymodel-ashen.vercel.app
- Supabase: projeto `cvkcngrmnfwupstyrpsd` (auth + Postgres + allowlist)

## Arquitetura (definitiva, validada)
- **Login = Magic Link (e-mail OTP), só no hub.** `flowType: 'implicit'` no hub (PKCE quebrava cross-browser). Sem Azure.
- **Autorização = allowlist Postgres**: `is_neo_allowed()` (pós-login, lê JWT) e `is_neo_email_allowed(email)` (pré-envio no hub). Liberam `@lmmobilidade.com.br` OU exceção aprovada em `public.neo_access`. Migração: `maturitymodel/supabase/migrations/20260713120000_neo_access_allowlist.sql` (JÁ APLICADA no banco via Management API).
- **Apps sem login próprio**: sem sessão → redirecionam ao hub. Handoff de sessão cross-origin via **fragment** (`#neo_at`/`#neo_rt`) que a app consome com `setSession()` e limpa. Iframe MMA→Dash via **postMessage** (`neo:session`/`neo:ready`).
- **Backend Dash** (`api/*`): valida Bearer + allowlist via RPC `is_neo_allowed` (aceita cookie legado na transição — a remover).
- Projetos Vercel do Dash e Maturity foram **desconectados do Git** (deploy via CLI `vercel --prod`); o monorepo NÃO está no GitHub. Push nos repos antigos não afeta produção.

## E-mail (SMTP) — ESTADO ATUAL
- Configurado no Supabase: **SMTP do Gmail** (`smtp.gmail.com:587`, user `diegocaporusso@gmail.com`, senha de app). `rate_limit_email_sent=100`.
- Envia para qualquer `@lmmobilidade` (validado — Diego recebeu o link e logou). **Cai no spam** porque o remetente é gmail (SPF/DKIM não são do domínio).
- **Resend** também está configurado como domínio pendente de verificação: domínio `lmmobilidade.com.br` registrado (id `59139aa3-a009-499d-b34e-1471783e5a33`), aguardando os 3 registros DNS (TXT `resend._domainkey`, MX `send`, TXT `send` SPF). Quando o DNS for adicionado e verificado, trocar o SMTP de volta para o Resend (`smtp.resend.com:465`, user `resend`, pass = API key) e remetente `neo@lmmobilidade.com.br` → sai do spam.

## ✅ E2E validado (Playwright, produção)
Login (magic link implicit) → gate allowlist (@lmmobilidade) → portas → Dash logado com dados (`/api/data` 200) → Maturity logado (squad/admin) → iframe de métricas no Maturity buscou `/api/data` 200 → botões "Trocar aplicação/Voltar ao NEO". Fix aplicados nesta sessão: `[hidden]!important` (portas não vazam sem login), `flowType implicit`, e AuthGate do Dash não redireciona no `INITIAL_SESSION null` (só `SIGNED_OUT`).

## ⏳ Pendências (não bloqueiam o uso)
1. **Produção do e-mail (sair do spam):** adicionar os 3 registros DNS do Resend no DNS de `lmmobilidade.com.br`; depois `POST https://api.resend.com/domains/59139aa3.../verify` e reconfigurar o SMTP para Resend + remetente `neo@lmmobilidade.com.br`.
2. **Segurança — ROTACIONAR (passaram pelo chat):** senha de app do Gmail, API key do Resend (`re_...`), token de management do Supabase (`sbp_...`). Ao trocar a key do Resend/Gmail, reconfigurar `smtp_pass` no Supabase (via Management API ou dashboard).
3. **Papéis do MMA:** atribuídos manualmente em `/admin` (AdminMMA, por e-mail). Usuário novo @lmmobilidade sem squad vê onboarding.
4. **Fase 3c (limpeza):** remover ramo cookie legado das 3 functions do Dash + envs `DASHBOARD_PASSWORD`/`SESSION_SECRET`; atualizar `openapi.ts`.

## Contas/tokens (na máquina)
- Vercel CLI logado (`diegocapstealth`). `gh` logado (`diegocap2212`). Supabase CLI logado. Anon key do Supabase em `/tmp/neo_anon_key.txt`.
- Envs de produção já setadas nos 3 projetos Vercel (VITE_SUPABASE_*, SUPABASE_URL/ANON_KEY, VITE_HUB_URL=neo-lm.vercel.app).

## Pegadinhas
- `supabase config push` reseta `[auth]` (aviso em `config.toml`) — a config SMTP/allowlist foi feita via Management API, não via config.toml.
- Redis (Upstash) ainda é usado por `api/comments.ts`.
- `verifyBearer`/`isAuthed` duplicado inline nas 3 functions de propósito (Vercel não bundleia imports entre functions).
- Handoff de sessão: quem PEDE o magic link e quem CLICA no link devem ser o mesmo dispositivo só no fluxo implicit? Não — implicit resolve cross-browser. Mas link ANTIGO (gerado em PKCE) não funciona; sempre pedir link novo.

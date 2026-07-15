# Plano de Cybersecurity — Portal NEO

> **Objetivo declarado (Diego):** garantir que outras pessoas COM acesso à aplicação não consigam
> roubar nosso código ou nossos dados. Este plano é para execução apartada; cada item tem ação e verificação.

## Modelo de ameaça (em ordem de probabilidade)

| # | Ameaça | Vetor |
|---|---|---|
| T1 | **Usuário legítimo curioso/abusivo** (@lmmobilidade logado) | Baixar bundle, chamar `/api/data` direto, fuçar rotas/RLS, compartilhar senha da Torre |
| T2 | **Ex-colaborador** | Sessão/refresh token ainda válido; exceção esquecida em `neo_access` |
| T3 | **Vazamento de segredo** | Tokens colados em chats/repos; envs legíveis; senha da Torre repassada |
| T4 | **XSS/injeção** | Conteúdo dinâmico (Jira summaries, kaizens/propostas do MMA) renderizado no front |
| T5 | **Supply chain** | Dependência npm maliciosa; GitHub Action comprometida |

---

## 1. Proteção do CÓDIGO

**Realidade a aceitar:** SPA entrega JavaScript ao browser — usuário logado sempre poderá ler o bundle
(minificado). O que protegemos é (a) legibilidade, (b) o código-fonte real, (c) segredos.

- [ ] **Sourcemaps NÃO publicados**: confirmar que nenhum `vite build` gera `.map` no `dist/` (default do Vite é não gerar — verificar os 3 apps e o portal: `find dist -name "*.map"` após `build:portal`). Sem sourcemap, o bundle é minificado e sem comentários.
- [ ] **Bundle atrás do middleware**: já feito — `/dash/**` e `/maturity/**` (JS incluso) só são servidos com `neo_session`. O bundle do hub (`/assets`) é público por necessidade (é a tela de login) — conferir que não contém nada além do fluxo de login.
- [ ] **Nenhum segredo no bundle**: auditar `grep -rE "(sbp_|re_[A-Za-z0-9]{20,}|BLOB_|KV_|SECRET)" dist/` após build — deve achar ZERO (as únicas chaves no client são `VITE_SUPABASE_URL` e a anon key, públicas por design; a segurança delas é a RLS).
- [ ] **Repos GitHub privados**: verificar visibilidade de `diegocap2212/locavia-dashboard` (repo do cron, contém o código do sync) — `gh repo view diegocap2212/locavia-dashboard --json visibility`. Se público → tornar privado imediatamente.
- [ ] **Backup do monorepo**: o monorepo NÃO está no GitHub — existe só nesta máquina. Risco de PERDA supera o de roubo. Criar espelho privado (GitHub private repo) com push regular; o repositório privado não expõe nada a usuários da aplicação.
- [ ] **Protection Bypass da Vercel**: o secret de automação (`x-vercel-protection-bypass`) dá acesso a deployments protegidos — rotacionar após a fase de QA e guardar como env, nunca em documento.

## 2. Proteção dos DADOS

### 2.1 Performance Dash (dataset Jira)
- **Fato:** `/api/data` entrega o dataset COMPLETO (~6 mil itens, com nomes de assignees, sumários de cards, times) para **qualquer usuário autorizado** (@lmmobilidade + exceções). A senha da Torre protege a *visualização comparativa*, não o dado bruto.
- [ ] **Decisão de produto**: aceitar (todos são do mesmo grupo) OU escopar a API por papel (ex.: agilista só vê seus times) — mudança relevante de backend; registrar a decisão por escrito.
- [ ] **Minimização**: avaliar remover do dataset campos não usados pelo front (e-mails de assignee, labels sensíveis) no sync — menor superfície vazável.
- [ ] **Blob privado**: confirmar que o Blob `jira-data.json` é `access: private` e que a URL asinada não vaza em logs/erros.
- [ ] **Redis (comentários)**: conferir que `api/comments` só aceita origem do portal (`ALLOWED_ORIGIN`) e exige Bearer; comentários podem conter informação sensível de gestão.

### 2.2 Maturity Model (Postgres/RLS)
- **A RLS é a única barreira** — o client fala direto com o banco. Estado atual tem furos conhecidos (mapa completo em `maturitymodel/docs/ROLES-REDESIGN.md`):
- [ ] `is_any_am()` global: **qualquer AM lê e administra TODOS os squads** (membros, ciclos, propostas, homologações, restart/delete). Com novos SMs entrando, executar o redesenho de roles ANTES de conceder papel `am` a qualquer um deles.
- [ ] **Policies legadas de `teams`** (`is_public`, `owner_id`, `is_admin` antigo) somam-se às novas (OR permissivo) — derrubar as legadas.
- [ ] `profiles` com SELECT aberto (`using(true)`): qualquer logado lista todo o diretório (nomes/e-mails). Restringir a membros de squads em comum + admin, ou aceitar formalmente.
- [ ] **`service_role` nunca no client**: `grep -r "service_role" maturitymodel/src locavia-dashboard/src neo-hub/src` → deve ser ZERO (só a Edge Function usa).
- [ ] Views (`v_cycle_scores` etc.): confirmar `security_invoker` (herdam RLS) — testar com JWT de não-membro.

### 2.3 Torre (comparativo restrito)
- [ ] Senha forte (feita — aleatória) e trocada se compartilhada; rotação = trocar env `TOWER_PASSWORD` (cookies antigos expiram em ≤12h).
- [ ] Rate-limit de tentativas (ver QA-PLAN A2) — hoje força bruta é possível.

## 3. Sessões e ciclo de vida de acesso

- [ ] **Offboarding (T2)**: quando alguém sai da LM: (1) mailbox desativada bloqueia novos OTP; (2) sessão ativa: access token expira ≤1h, refresh token persiste — **revogar no Supabase** (Auth → user → sign out/ban); (3) remover exceção de `neo_access` se houver; (4) `neo_session` morre sozinho em ≤12h ou rotacione `SESSION_SECRET` para matar todos imediatamente.
- [ ] **Revisão trimestral**: listar `neo_access` (exceções) e usuários Supabase ativos; remover quem não deveria estar.
- [ ] **Allowlist por domínio**: qualquer mailbox @lmmobilidade entra — o RH/TI da LM é parte do perímetro. Registrar isso como premissa.
- [ ] Rate-limit de OTP no Supabase (hoje 100/h) — suficiente; monitorar abuso nos Auth logs.

## 4. Hardening de aplicação

- [ ] **Clickjacking**: `frame-ancestors 'self'` hoje só em `/dash` — estender a TODA a origem (hub de login é o alvo clássico). (Achado do QA-PLAN A4.)
- [ ] **CSP completa** (`default-src 'self'` + ajustes p/ Supabase): elimina exfiltração via XSS mesmo se T4 acontecer. Testar bem (Vite inline chunks).
- [ ] **XSS review (T4)**: React escapa por padrão — auditar `dangerouslySetInnerHTML` (`grep -r` nos 3 apps; esperado zero) e qualquer render de HTML vindo do Jira/inputs do MMA.
- [ ] **HSTS** já ativo (preload) — ok.
- [ ] Cookies: `HttpOnly; Secure; SameSite=Lax` — ok; documentado.

## 5. Segredos e infraestrutura

- [ ] **Rotação IMEDIATA dos itens já expostos em chat** (pendência conhecida): token Supabase `sbp_a5f2...`, senha de app do Gmail, API key antiga do Resend. Após rotacionar, atualizar SMTP no Supabase.
- [ ] Envs como **Sensitive** na Vercel (write-only): `SESSION_SECRET`, `TOWER_PASSWORD`, `BLOB_READ_WRITE_TOKEN`, `KV_*` — impede leitura futura até por quem tem acesso ao dashboard.
- [ ] **Menor privilégio nos tokens**: o `GITHUB_TOKEN`/dispatch usado pelo sync deve ser fine-grained, escopo só no repo do cron.
- [ ] **Supply chain (T5)**: `npm audit` mensal nos 3 apps; lockfiles commitados (feito); pin de GitHub Actions por SHA no workflow do sync; Dependabot/renovate no repo privado.
- [ ] **2FA** nas contas Vercel, GitHub, Supabase e cron-job.org.

## 6. Auditoria e detecção

- [ ] Supabase Auth logs: revisar OTPs negados (allowlist) e logins fora de horário.
- [ ] Vercel logs: monitorar 403 em `/api/tower` (força bruta) e 401 em `/api/data` (scraping sem token).
- [ ] Canário de fail-open (QA-PLAN C2): `/dash/` sem cookie DEVE ser 302 — se 200, alarme (env sumiu → gate aberto).
- [ ] Registrar acessos à Torre (log no `api/tower` POST com e-mail do JWT — já disponível no payload) para saber QUEM abriu o comparativo.

## 7. Ordem de execução sugerida

1. Rotação de segredos expostos (§5, item 1) + repos privados/backup (§1).
2. Headers frame-ancestors global + sourcemap check (§4/§1) — mudanças de 10 min.
3. Redesenho de roles do MMA (doc dedicado) — ANTES de dar `am` a novos SMs.
4. Rate-limit Torre + canário + logs (§2.3, §6).
5. CSP completa + revisão XSS (§4).
6. Decisão de produto sobre escopo do `/api/data` (§2.1).

# Plano de QA profundo — Portal NEO (code review + testes + debug)

> **Uso:** este plano é para execução apartada (sessão dedicada). Cada bloco tem pré-condições,
> passos e critério de aceite. Ordem recomendada: A (review) → B (testes) → C (debug/observabilidade) → D (aceite).
> Estado de referência: cutover de 2026-07-14 — portal em `https://neo-lm.vercel.app` (hub `/`, Dash `/dash`, MMA `/maturity`),
> middleware Edge + cookie `neo_session`, Torre com senha (`neo_tower`), redirects 308 nos domínios antigos.

## Status final (2026-07-15) — o que foi executado desta rodada

> Detalhe completo das correções e evidências: `HANDOFF.md` (seções "QA profundo — correções
> aplicadas" e "Validação do SECURITY-PLAN.md"). Tabela abaixo é o mapa rápido do que ficou
> resolvido/verificado versus o que segue como trabalho futuro.

| Bloco | Item | Status | Nota |
|---|---|---|---|
| A1 | Fail-open sem `SESSION_SECRET` | ✅ Resolvido | Fail-closed em produção (`VERCEL_ENV==='production'`); dev/preview seguem abertos |
| A1 | Cookie malformado → 500 | ✅ Resolvido | `decodeURIComponent` com try/catch (middleware + tower) |
| A1 | Matcher `/DASH/`, `//dash/`, `?next` adversarial | ⬜ Pendente | Não testado nesta rodada |
| A1 | TTL 12h — UX do expirado com app aberto | ⬜ Pendente | Não revisado |
| A2 | Rate-limit da Torre | ✅ Resolvido | Já existia (KV); corrigido bug do `EXPIRE` (lockout permanente) |
| A2 | GET/POST fail-open sem `TOWER_PASSWORD` | ✅ Resolvido | Fail-closed em produção |
| A2 | `/api/data` mesmo dado p/ todo logado | ✅ Aceito (não é bug) | Documentado: Torre protege visualização, não o dado — decisão de produto registrada |
| A3 | `dash_session`/`DASHBOARD_PASSWORD` inerte | ⬜ Pendente | Fase 3c — remover ramo legado das functions + `openapi.ts` |
| A3 | `ALLOWED_ORIGIN`/CORS em comments | ✅ Verificado | Confere origem + Bearer |
| A3 | `trigger-sync` sem validar método (PUT→401) | ✅ Resolvido | Agora 405 antes da auth |
| A4 | `frame-ancestors` só em `/dash` | ✅ Já estava correto | Confirmado que já cobria `/(.*)` — achado do relatório externo estava desatualizado |
| A4 | CSP completa | ✅ Resolvido | `default-src 'self'` + ajustes Supabase; validado sem quebrar as 3 SPAs (0 erros de console) |
| A5 | Logout nos 3 pontos | ✅ Verificado ao vivo | Sessão real: logout → `/dash/` volta a 302 |
| A6 | Sourcemaps não publicados | ✅ Verificado | `find dist -name "*.map"` vazio |
| A7 | `is_any_am()` global (escalada) | ✅ Resolvido e **provado** | Migration `20260715150000` + teste de regressão ao vivo em produção (JWT real de SM, 4/4 negado) |
| A7 | Policies legadas de `teams` | ✅ Já estava resolvido | Confirmado morto via query direta ao banco (não só leitura de migration) |
| A7 | `profiles` aberto | ✅ Já estava resolvido | `shares_squad_with` + `is_portal_admin()` |
| A7 | Views sem `security_invoker` | ✅ Já estava resolvido | Confirmado: zero views sem o flag |
| A8 | Jira sync — repo do cron | ✅ Resolvido (achado novo) | Repo estava **público** com dado real do Jira — tornado privado (ver SECURITY-PLAN) |
| B1 | Gate de regressão local | ✅ Verde | tsc/lint/test/build nos 3 apps + `build:portal` |
| B2 | Matriz HTTP do portal | ✅ Verificado em produção | 200/302/401/405, cookie malformado, CSP — todos conferidos por curl real |
| B3 | E2E do portal (logado) | ✅ Verificado manualmente ao vivo | Home+dados, detalhe do time, MMA+iframe, Torre (senha certa), logout — percorridos com sessão real; **não** viraram specs Playwright versionados contra o portal (só o `tests/dashboard.spec.ts` standalone do Dash foi corrigido/roda em CI) |
| B4 | Matriz de RLS do MMA | ⚠️ Parcial | Script completo criado (`rls-matrix.ts`, requer branch Supabase — bloqueado por plano free); teste de regressão mínimo da escalada rodou de fato em produção (4/4) |
| B5 | Unidade da camada nova (HMAC extraído) | ⬜ Pendente | Não extraído em função pura testável |
| B6 | Compatibilidade (Firefox/WebKit/mobile/dark) | ⬜ Pendente | Não testado |
| B7 | Perf do dataset | ✅ Verificado | ~5,77 MB / ~579 KB gzip / ~16ms cache quente, medido ao vivo |
| C2 | Canário fail-open | ✅ Coberto pelo fail-closed | Não existe monitor ativo separado; o comportamento correto (302, nunca 200) já é garantido em código |
| C5 | Runbook de rollback testado | ⬜ Pendente | Não exercido nesta rodada |
| — | CI (lint/typecheck/build/test) | ✅ Novo | `.github/workflows/ci.yml` criado |
| — | Saúde dos times (achado fora do plano original) | ✅ Resolvido | Critério recalibrado (menos rígido, motivos + legenda na UI) — ver HANDOFF |

**Pendências reais para uma próxima rodada:** B4 completo (precisa Supabase Pro para branch, ou aceitar rodar direto em produção com o mesmo cuidado desta sessão), B5, B6, C1/C4 (revisão de logs), C5 (exercício de rollback), Fase 3c (remover `dash_session` legado).

## O que JÁ existe de verificação (inventário)

| Área | Cobertura atual |
|---|---|
| Dash — lógica pura | `npm run test:performance` (métricas, trends, analytics, Monte Carlo, comparativo SM) + `npm run audit:performance` (invariantes no dataset real) |
| Dash — E2E | 1 spec Playwright (`tests/dashboard.spec.ts`), home+detalhe+agilista, roda contra dev server standalone com fallback local |
| Dash — estático | `npx tsc -b`, `npm run lint`, `vite build` |
| MMA | **zero testes** — só `npm run typecheck` + `vite build` |
| Hub | **zero testes** — só `tsc --noEmit` no build |
| Portal (middleware, api/session, api/tower, build composto) | **zero testes automatizados** — smoke HTTP manual do cutover (HANDOFF) |
| CI | só o hourly-sync de dados (não roda teste nenhum) |

As maiores lacunas: **camada nova do portal** (middleware/sessão/torre), **MMA inteiro** (incl. RLS) e **ausência de CI de qualidade**.

---

## Bloco A — Code review profundo (por área de risco)

### A1. Middleware e sessão (`middleware.ts`, `api/session.ts`) — CRÍTICO
- [ ] Matcher cobre tudo? Testar variações: `/dash` (sem barra), `/DASH/` (case), `/dash%2F..%2F`, `//dash/`, `/dash/..%2f..`. Confirmar que a Vercel normaliza o path ANTES do matcher.
- [ ] Cookie: `HttpOnly; Secure; SameSite=Lax; Path=/` — conferir que `Lax` não quebra o iframe same-origin do MMA e que não há cenário cross-site que envie o cookie.
- [ ] HMAC: `crypto.subtle.verify` é timing-safe (ok); payload não é criptografado (só assinado) — confirmar que não carrega nada sensível além de e-mail+exp.
- [ ] **Fail-open sem `SESSION_SECRET`**: decisão consciente (paridade dev), mas em produção é um single point — adicionar canário no Bloco C que ALARME se `/dash/` responder 200 sem cookie.
- [ ] `?next=`: regex `^\/(dash|maturity)(\/|$)` — validar que rejeita `//evil.com`, `/dash/../..`, `https:/dash`, `\dash`.
- [ ] TTL 12h: o que acontece quando `neo_session` expira com o app aberto? (SPA continua em memória; próximo hard-nav/asset → 302). Revisar UX desse caso.

### A2. Torre (`api/tower.ts`) — ALTO
- [ ] **Sem rate-limit na senha** — força bruta é viável (função serverless não tem estado). Revisar: adicionar atraso/contador (KV Upstash já existe no projeto) ou aceitar o risco (senha forte aleatória).
- [ ] `timingSafeEqual` com early-return por comprimento vaza o TAMANHO da senha — risco baixo (senha aleatória), registrar como aceito ou padronizar hash-compare.
- [ ] GET fail-open sem `TOWER_PASSWORD`/`SESSION_SECRET` — mesmo canário do A1.
- [ ] O dado por trás da Torre (`/api/data`) é o MESMO para qualquer usuário logado — a senha protege a **visualização**, não o dado. Confirmar que isso é aceitável (ver SECURITY-PLAN §2).

### A3. Functions legadas (`api/data.ts`, `comments.ts`, `refresh.ts`, `trigger-sync.ts`)
- [ ] Ramo `dash_session`/`DASHBOARD_PASSWORD` inerte (env ausente) — remover de vez (Fase 3c) e re-testar 401.
- [ ] `ALLOWED_ORIGIN` no comments = `https://neo-lm.vercel.app` — validar preflight/CORS no portal e que origens antigas falham.
- [ ] `refresh.ts`: `GITHUB_*` não configuradas no neo-lm (vazias/sensíveis no projeto antigo) — o botão de refresh manual do Dash está funcional? Decidir: configurar ou remover o botão.
- [ ] `trigger-sync.ts`: sem `CRON_SECRET` no neo-lm → fail-closed. Decidir se o endpoint ainda tem função (ver incidente do sync no HANDOFF).

### A4. Headers de segurança (`vercel.json` raiz) — ACHADO JÁ IDENTIFICADO
- [ ] `frame-ancestors 'self'` só existe em `/dash/(.*)`. **Hub (`/`) e `/maturity` estão SEM proteção de clickjacking.** Corrigir: mover o header para `/(.*)`(com exceção se o embed externo do MMA antigo ainda for necessário — não é mais).
- [ ] Avaliar CSP completa (script-src 'self') — SPA Vite permite; reduz XSS drasticamente.
- [ ] Conferir `Cache-Control` dos assets com hash vs `index.html` (não cachear HTML).

### A5. Auth client-side (AuthGate dash, ProtectedRoute/useAuth MMA, hub main.ts)
- [ ] Logout nos 3 pontos limpa `neo_session` (DELETE) + Supabase e volta ao hub.
- [ ] `INITIAL_SESSION null` não redireciona cedo (comentário no AuthGate) — revalidar pós-remoção do handoff.
- [ ] Fluxo `?next` no hub: só paths internos; testar com sessão JÁ ativa (deve pular o form e ir direto).

### A6. Portal/build (`scripts/build-portal.mjs`, `.vercelignore`, rewrites)
- [ ] Rewrites: filesystem → assets primeiro; `/dash/:path*` → index correto; rota inexistente `/dash/xyz` renderiza SPA (não 404).
- [ ] `.vercelignore` não exclui nada necessário (public/ dos apps sobem).
- [ ] Confirmar que `vite build` NÃO publica sourcemaps (proteção de código — ver SECURITY-PLAN §1).

### A7. MMA — RLS (usar o mapa em `maturitymodel/docs/ROLES-REDESIGN.md`)
- [ ] `is_any_am()` é global: qualquer AM lê/escreve TUDO (membros, teams, conteúdo, restart/delete de qualquer squad). Confirmado por leitura — precisa do redesenho de roles antes de trazer novos SMs.
- [ ] **Policies legadas de `teams` coexistem** (`owner_id`, `is_public`, `is_admin` legado) — união permissiva com as novas. Revisar e derrubar as legadas (risco de leitura indevida via `is_public`).
- [ ] `profiles`: SELECT `using(true)` — qualquer logado vê o diretório inteiro (nomes/e-mails). Decidir se aceitável.
- [ ] `kaizens`: escrita por **qualquer membro** do squad — conferir se é o desejado.
- [ ] `votes`: tabela morta sem policies — dropar ou documentar.

### A8. Jira sync (`locavia-dashboard/sync/`)
- [ ] Invariantes do CLAUDE.md (Resolved=resolutiondate, exclusão de subtasks/épicos, Team=cf11795, TimeInStatus, Epic via parent).
- [ ] O repo do cron (`diegocap2212/locavia-dashboard`) tem CÓPIA do código de sync — diff contra o monorepo para garantir paridade (drift = bug silencioso nos dados).

## Bloco B — Testes

### B1. Regressão do que existe (gate de entrada — deve estar verde antes de tudo)
```bash
cd locavia-dashboard && npm run test:performance && npm run audit:performance && npx tsc -b && npm run lint && npx vite build
cd ../maturitymodel && npm run typecheck && npx vite build
cd ../neo-hub && npx tsc --noEmit && npx vite build
cd .. && npm run build:portal
```

### B2. Matriz HTTP do portal (curl, contra produção ou staging `--skip-domain` + bypass header)
| Requisição | Esperado |
|---|---|
| `GET /` | 200 (hub) |
| `GET /dash/`, `/maturity/`, `/dash/time/GOL`, `/dash/assets/*.js` sem cookie | 302 `/?next=<path>` |
| mesmos COM `neo_session` válido | 200 |
| mesmos com cookie adulterado/expirado | 302 |
| `GET/POST /api/data\|session\|tower` sem credencial | 401 (session POST), 401 (data), 401 (tower GET) |
| `POST /api/session` com Bearer válido | 204 + Set-Cookie |
| `POST /api/tower` senha errada ×20 | 403 sempre (e avaliar rate-limit — A2) |
| `DELETE /api/session` | 204 + cookie zerado |
| métodos não suportados (PUT etc.) | 405 |
| domínios antigos `/` e paths profundos | 308 para `/dash/*` e `/maturity/*` |

### B3. E2E Playwright do PORTAL (novo — criar `tests-portal/`)
- Config: `baseURL` = staging `--skip-domain` com `extraHTTPHeaders: { 'x-vercel-protection-bypass': ... }`, ou produção.
- **Sessão de teste**: capturar `storageState` uma vez com login manual (OTP) e versionar como secret local — OU criar usuário de teste na allowlist `neo_access` e automatizar OTP via caixa de e-mail de teste. Sem isso, os specs logados não automatizam.
- Specs mínimos:
  1. Anônimo: `/dash/torre` → volta ao hub com `?next`; form de login visível; portas ocultas.
  2. Logado: portas visíveis → `/dash/` carrega home com dados reais (`/api/data` 200) → navegar time/agilista/abas (Entrega/Tempo/Saúde/Épicos/Previsão).
  3. `?next`: logado, abrir `/?next=%2Fdash%2Ftime%2FGOL` → cai direto no time.
  4. Torre: `/dash/torre` pede senha → senha errada mostra erro → senha certa mostra comparativo (cards+ranking, toggle Agilistas/Times, seletor de métrica).
  5. MMA: `/maturity/` carrega Início; iframe de Métricas de um squad renderiza o Dash embed com dados.
  6. Logout: sair no Dash → volta ao hub → `/dash/` re-bloqueado (302).
- Adaptar o spec existente do dash (`tests/dashboard.spec.ts`) para também rodar no modo portal (baseURL `/dash`) OU manter só standalone e cobrir o portal pelos novos specs.

### B4. Testes de RLS do MMA (hoje ZERO — maior lacuna de dados)
- Estratégia: script SQL/TS com 3 JWTs de teste (membro squad A, SM squad A, AM squad B) validando SELECT/INSERT/UPDATE por tabela × papel — matriz completa em `ROLES-REDESIGN.md`. Rodar contra um branch/preview do Supabase (não produção).
- Casos-chave: membro de A não lê cycles/proposals/homolog de B; não-membro não escreve nada; `restart_assessment`/`delete_squad` negados a não-AM.

### B5. Unidade para a camada nova
- Extrair a verificação HMAC do middleware para função pura e testar: válido/expirado/adulterado/secret errado/lixo (o smoke manual já provou; virar teste versionado).
- `api/tower`: comparação de senha e formatos de cookie.

### B6. Compatibilidade e visual
- Chromium + WebKit + Firefox (Playwright projects) no fluxo anônimo e 1 fluxo logado.
- Viewport mobile (375px): hub, login, dash home, MMA início.
- Dark mode do Dash (ThemeProvider) nas 5 abas + Torre.

### B7. Sanidade de performance
- `GET /api/data` (logado): tamanho (~6MB) e tempo; TTFB do middleware (<50ms típico de Edge); cold start das functions.

## Bloco C — Debug e observabilidade

1. **Logs runtime**: `vercel logs neo-lm.vercel.app` (functions + middleware). Procurar 500 de `/api/session` (SESSION_SECRET ausente) e volume anômalo de 403 no tower (força bruta).
2. **Canário anti fail-open** (A1/A2): check periódico `curl /dash/ → esperar 302`; se 200 sem cookie → alarme (fail-open ativo = env sumiu).
3. **Sync Jira**: `gh run list -R diegocap2212/locavia-dashboard --workflow hourly-sync.yml` (runs 30/30min verdes); comparar `syncedAt` do Blob (via app logado) contra o relógio — staleness >90min = investigar. Ver incidente 2026-07-14 no HANDOFF (gatilho externo morto pelo cutover).
4. **Supabase**: Auth logs (OTPs enviados/negados), Postgres logs para RLS denies inesperados.
5. **Runbook de rollback**: portal → `vercel promote` do deployment anterior; redirects → promote dos deployments antigos; sessões → rotacionar `SESSION_SECRET` derruba todos os cookies (12h) sem afetar Supabase.

## Bloco D — Critérios de aceite (a "certeza absoluta")

- [ ] Bloco A revisado com achados registrados (aceitos ou corrigidos) — em especial A1, A2, A4 e A7.
- [ ] B1 verde local; B2 matriz 100%; B3 specs 1-6 verdes em staging E produção; B4 matriz RLS verde; B6 sem quebra visual.
- [ ] Canário C2 ativo; runbook C5 testado (1 promote de ida-e-volta em staging).
- [ ] HANDOFF.md atualizado com resultados e pendências residuais.

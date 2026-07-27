# Hardening do code review — estado da execução

> ## ✅ FECHADO E NA `main` — 2026-07-27
>
> **`main` = `bff3536`. CI inteiramente verde.** As ondas 0, 1, 2 e 3 estão mergeadas
> (`git revert -m 1 7faf9a5` desfaz tudo). O que **falta é deploy e ação de operador** — e o
> **P0 continua tecnicamente aberto** até `supabase functions delete sync-anchors` rodar.
>
> **Para retomar, leia a seção "▶ RETOMADA" no topo do [`HANDOFF.md`](../HANDOFF.md)** — ela tem
> a lista em ordem de dependência e as duas armadilhas de ordem (migration antes do código do
> Nero; a função antiga que ainda está no ar). Este documento continua sendo o registro do
> *raciocínio* e dos achados; o HANDOFF é o que fazer amanhã.
>
> Verificação em um comando: `corepack pnpm verify` (exit 0, ~15 min).

**Branch:** `hardening/code-review-2026-07-27` (criada a partir de `main`, que é produção) —
**já mergeada** em `7faf9a5`, mais dois PRs de correção do CI (#43 e #46).
**Base:** commit `371a038`
**Plano completo:** `C:\Users\Usuario\.claude\plans\claude-valide-o-full-frolicking-quilt.md`
**Review original:** `docs/FULL-CODE-REVIEW-2026-07-27.md`

## ⚠️ Como verificar (aprendi errando)

**Sempre por EXIT CODE, nunca contando linhas de saída.** Eu verifiquei por
`pnpm lint | grep -ci '\berror\b'` e reportei "0 erros" enquanto o eslint estava CRASHANDO —
a mensagem era `TypeError: expand is not a function`, e `\berror\b` não casa dentro de
"TypeError". O lint do monorepo estava quebrado e minha verificação dizia que estava limpo.

```bash
# Assim:
if corepack pnpm --filter <app> lint >/tmp/v.txt 2>&1; then echo OK; else echo FALHOU; fi
```

O `pnpm lint` da RAIZ falha localmente (o script chama `pnpm` aninhado, fora do PATH) — rode
por workspace. E `neo-hub` **não tem script de lint** (o `--if-present` o pulava em silêncio);
o typecheck dele é real, verifiquei com sonda. Gap menor, registrado.

## Como retomar

```bash
cd c:/Users/Usuario/Desktop/Venice_LM_Hub/argo
git branch --show-current      # main (a branch de hardening já foi mergeada)
corepack pnpm verify           # exit 0 = nada regrediu
```

Ambiente (aprendido na marra, economiza tempo):

- `pnpm` **não está no PATH** — usar `corepack pnpm ...` sempre.
- O `cwd` do shell Bash **reseta entre chamadas**: usar caminhos absolutos ou `cd` no mesmo comando.
- Não há Docker, nem Python, nem banco Postgres/Neon disponível no ambiente.
- `npx tsc -p tsconfig.json --noEmit` (na raiz) é o typecheck da borda; `corepack pnpm -r --if-present typecheck` é o dos workspaces. O script `pnpm typecheck` da raiz roda os dois, mas falha localmente porque o corpo do script chama `pnpm` (que não está no PATH) — no CI funciona, lá tem `corepack enable`.

## Verificação — estado atual (tudo verde)

| Suíte | Resultado |
|---|---|
| Typecheck da borda (`api/` + `middleware.ts`) | **OK** — não existia antes |
| Typecheck dos 4 apps + packages | **OK** |
| Lint global | **0 erros** |
| `@neo/auth test` | **96/96** |
| `locavia-dashboard test:performance` | OK |
| `locavia-dashboard test:sync` (novo) | **32 invariantes** |
| `maturitymodel test:journey` | 21/21 |
| `maturitymodel test:anchors` (novo) | **17 verificações** |
| `maturitymodel test:migrations` | 55 aplicadas, 2 puladas |
| `maturitymodel test:rls-local` | **88/88** (eram 59) |
| `nero-portal test:core` | **88/88** (eram 30) |

> Números FINAIS, conferidos em 2026-07-27 pelo `corepack pnpm verify` (exit 0). A tabela
> anterior guardava contagens do meio da execução (77, 8, 54, 74, 59) e passou a contradizer
> `SECURITY.md` — que é o drift de documentação que esta própria rodada existe para eliminar.

> **Baseline de métrica exige `AUDIT_NOW`.** `audit:performance` usa janela de 56 dias a
> partir de `now`, então ela DESLIZA: com o dataset congelado e o código idêntico, medi
> throughput 1198 às 06:00 UTC e 1187 às 18:00 do mesmo dia. Comparar duas execuções sem fixar
> o `now` compara horários, não código — quase me fez perseguir uma regressão de 9 itens
> inexistente. Use `AUDIT_NOW=2026-07-27T12:00:00Z pnpm --filter locavia-dashboard
> audit:performance` (throughput 1198, 6.345 itens, 21 times).

**Não executável aqui:** `nero-portal test:state` (exige banco descartável — o script foi
ampliado com os casos de undo, mas nunca rodou), build do Docker do Nero (sem Docker),
~~`hourly-sync.yml`~~ — **validado em 2026-07-27**: rodou verde de `main` via `workflow_dispatch` e o `bulkFetchChangelogs` foi exercitado contra o Jira real (6.371 issues, 7 lotes, 99,78% com histórico completo).

---

## O que está FEITO

### Onda 0 — os P0 (7/7)

| # | Item | O que mudou |
|---|---|---|
| 0.1 | `sync-anchors` sem authz | Dividida em `sync-anchors-user` (JWT + RPC `can_sync_anchors`: SM do squad ou AM/admin) e `sync-anchors-cron` (secret do Vault, `verify_jwt=false`). Lógica em `_shared/anchor-sync.ts`, autorização em `_shared/authz.ts`. Migrations `20260727130000` (RPC, testada) e `20260727130100` (cron, pulada no PGlite). 8 casos novos em `rls-local.ts`. |
| 0.2 | `Resolved = UpdatedAt` | Removido do sync **e do `trends.ts`**, que tinha uma segunda cópia do mesmo fallback. `Math.abs` → diferença assinada. Novo `scripts/test-sync-invariants.ts` (8 invariantes) no CI. |
| 0.3 | `/api/data` mentia | Resposta agora tem `source`/`stale`/`hash`/`count`; fallback nunca empresta o `syncedAt` do heartbeat; ETag deriva do hash; `dataService` expõe procedência + `invalidateData()`; `AppShell` mostra aviso de dado congelado. Sync grava `count`+`hash` no Blob. |
| 0.4 | `hourly-sync.yml` | Corepack + `pnpm install --frozen-lockfile`, filtros de workspace, `concurrency`, `git pull --rebase` antes do push. |
| 0.5 | `NERO_MODEL` sem validação | `isNeroModelId` como predicado único; env inválida aborta em produção, loga fora dela. Teste em processo separado (`probe-default-model.ts`). |
| 0.6 | Rotações de segredo | `SECRETS.md`: tabela com responsável/substituto/`revogado_em`/evidência + a anon key exposta na migration antiga + as secrets novas do cron. |
| 0.7 | Dockerfile do Nero | `prisma db push` fora do `CMD`, pnpm/workspace corrigidos, marcado **NÃO VERIFICADO** no topo; `ARQUITETURA-ENTERPRISE.md` deixou de afirmar que o container está pronto. |

### Onda 1 (9/10 — falta só 1.9)

- **1.1 Typecheck do Maturity: 201 erros → 0.** Causa raiz: duas cópias de `@types/react`
  (18.3.31 e 19.2.17) no mesmo programa. Corrigido com `paths` locais em `tsconfig.app.json`
  (override global de pnpm quebraria Dash e Nero, que estão em React 19). Script trocado de
  `tsc --noEmit` (falso verde) para `tsc -b` — provado com uma sonda que agora falha.
  Os 5 erros reais restantes eram tipos afirmando domínio que o banco não garantia →
  migration `20260727140000_domain_constraints.sql` (CHECK em `axes.key`, `stages.number`,
  `dsd.stage_number`) + `src/lib/domain.ts` validando na fronteira de leitura.
- **1.2 `homolog_update`.** Nova policy exigindo `is_portal_am()` e ciclo destino em
  homologação + trigger `homolog_keys_immutable`. 7 casos novos.
- **1.3 Nero — auditoria e undo.** `ENTITY_CHILDREN` faz o snapshot levar os `campos`;
  `undoVersion` virou LIFO por entidade + concorrência otimista + restauração de filhos;
  `StateVersion.actorEmail` gravado a partir do header que o `proxy.ts` injeta usando
  `readToken` (que já existia "para o e-mail de auditoria" e nunca era usado).
  Migration Prisma `20260727160000` escrita à mão (sem banco para o `migrate dev`).
- **1.8 Lint/typecheck onde não havia.** `sync/`, `scripts/`, `tools/` entraram nos dois
  (`tsconfig.tools.json`); criado `tsconfig.json` na RAIZ para `api/` + `middleware.ts`.
  Adicionado `@types/node` na raiz.
- **1.4 Rota de chat.** `lib/nero/chat-input.ts` valida schema por mensagem, limites
  (40 msgs / 20k chars por msg / 120k no total), exige última role `user` e **rejeita
  histórico de `assistant` forjado** (vetor de tool use num agente com tools de escrita).
  `usage.ts` ganhou **reserva atômica** (advisory lock + leitura sem cache + linha
  `estimated`), **teto por pessoa** (`actorEmail` no `UsageLog` +
  `NERO_USER_MONTHLY_BUDGET_USD`, default = metade do global) e `settleTurn`, que fecha o
  buraco de orçamento quando a persistência falha. `generate.ts` passou a invalidar o cache.
  `chat-slots.ts` limita conversas simultâneas por pessoa.
- **1.5 Erros internos.** Chat devolve mensagem estável + `ref` (o texto cru ia para o
  cliente **e para o modelo**, que o lê no turno seguinte); `runNeroTool` distingue erro de
  DOMÍNIO (útil ao modelo) de erro de INFRA por lista de PERMISSÃO; `comments.ts` não devolve
  mais `details` do Upstash.
- **1.6 Períodos e forecast.** `src/performance/period.ts` é a biblioteca única: intervalo
  `[start, end)` e `previousPeriodOf`. **Contrato mudou: `end` é EXCLUSIVO** — "junho" é
  `end: '2026-07-01'`, não `'2026-06-30'`. Quem estica o limite é o CHAMADOR (os dois hooks
  usam `endOfDayExclusiveUTC(now)`); esticar dentro do cálculo era metade da contagem dupla.
  Monte Carlo com PRNG semeado pelo próprio dado + `sufficientSample` (mínimo 6 semanas),
  respeitado na UI.
- **1.7 Descarte.** Havia **três** cópias do predicado (`discard.ts` canônico, `epics.ts` e
  `montecarlo.ts` com match exato) — o review citou duas. Todas usam `isDiscardedStatus`. O
  painel de épicos passou a **declarar** que usa histórico completo (filtrar por período seria
  pior: completude de épico é cumulativa).
- **1.10 Superfície morta.** `api/refresh.ts` e `api/trigger-sync.ts` REMOVIDOS (nada os
  chamava; `HANDOFF.md:429` confirma que nunca estiveram ativos), com OpenAPI, SECRETS.md,
  READMEs e o workflow atualizados. `safeNextPath` aceita `/nero`. `config.toml` aponta para a
  origem NEO. Nero ganhou CSP/HSTS/Permissions-Policy (o porquê está em `DEPLOY.md`, porque
  `vercel.json` é JSON estrito).

---

## Onde EXATAMENTE paramos: 1.9 (último da Onda 1)

**Nada feito ainda.** É o `purpose`/HKDF nos tokens HMAC (§4.2 do review):

- `SessionPayload` é `{ email?, exp }` — sem `aud`/`purpose`/`scope`, em
  `packages/neo-auth/src/index.ts`.
- O teste de contrato **afirma** que um token da função de sessão passa no verificador do gate
  (`packages/neo-auth/test.ts`, caso `'emitido pela function de sessão'`) — esse caso precisa
  virar teste NEGATIVO de confusão de token.
- Ao adicionar `purpose`, as **três cópias autocontidas** do HMAC têm de mudar juntas:
  `middleware.ts` (raiz), `api/gate.ts`, `api/session.ts`. O teste de contrato do `@neo/auth`
  é justamente o que garante que não divirjam.
- Severidade real é menor que "alta": os cookies são HttpOnly/Secure/SameSite=Lax na mesma
  origem, então explorar já exige o cookie jar da vítima ou XSS. É defesa em profundidade.
- Atenção: mudar o formato do token **invalida as sessões vivas** (o cabeçalho de
  `packages/neo-auth/src/index.ts` avisa). Rotação de `SESSION_SECRET` tem o mesmo efeito.

Decisão a preservar: manter o **fail-open documentado** na leitura do gasto (`usage.ts`) — é
consciente e correta (correção nº 3 do plano). O que NÃO é fail-open é o estouro de teto: os
dois erros de orçamento são repropagados em `reserveTurn`. Deixar `UserBudgetExceededError`
cair no catch genérico anularia o limite por pessoa — foi um bug meu, corrigido.

### Onda 2 (6/10 feitos)

- **2.2 Fórmulas de âncora.** A métrica "sprint injetada" inferia adição comparando o
  **comprimento** de duas strings e comparava o timestamp com o início da sprint **mais
  antiga** do item. Errava nas duas direções — provei com o algoritmo antigo: falso positivo
  num item que entrou antes da sprint começar, falso negativo numa adição real. Agora é
  diferença de CONJUNTOS de ids, cada um comparado com o início DAQUELA sprint. A lógica foi
  extraída para `_shared/jira-normalize.ts` (puro) porque `anchor-sync.ts` lê `Deno.env` na
  carga e por isso NUNCA pôde ser testado. 17 verificações novas + `tsconfig.tests.json`
  (o `tests/` do Maturity também não tinha typecheck). O sync ganhou timeout, retry/backoff e
  **falha** no estouro de páginas em vez de gravar recorte silencioso.
  Bônus achado pelo teste: `everDone` só era setado por `toString`, então item cuja transição
  "→ CONCLUÍDO" foi truncada do changelog saía do DENOMINADOR da taxa de reabertura —
  subestimando a métrica.
- **2.4 PII.** `lib/nero/redact.ts`: remove e-mail/CPF/CNPJ/telefone do contexto montado e
  pseudonimiza (estável, `Pessoa-1234`) os campos que o schema declara como pessoa. A copy de
  `/privacidade` e do chat foi **corrigida** — dizia "nunca envie nomes" como se fosse garantia
  do produto enquanto o servidor mandava `Stakeholder.nome`, `Decision.quem` e `Risk.dono` todo
  turno.
- **2.5 Prompt injection.** O estado agora vai dentro de `<estado_do_projeto>` com regra de
  precedência ANTES do dado. E `lib/nero/tool-policy.ts` decide as tools por escopo no
  SERVIDOR: o chat tutor da Academia recebia o conjunto INTEIRO e podia gravar decisão e
  sobrescrever o catálogo. Há barreira de oferta (lista filtrada) **e** de execução
  (`isToolAllowed` no laço), porque modelo alucina nome de tool.
- **2.6 Constraints do Nero.** 13 CHECKs de domínio (`NOT VALID`, para não travar deploy em
  dado legado — há bloco de `VALIDATE` documentado na migration) + unicidade em
  `Dependency.codigo`, `Risk.codigo`, `Feature.codigo`, `StackItem.item`, `PhaseStatus.fase`,
  fechando a corrida `findFirst → create`. Número do Report passou a ser calculado sob
  advisory lock.
- **2.7 Preço do Sonnet.** $3/$15 → $2/$10 (promocional). Não inflava a fatura, inflava a
  CONTABILIDADE: o freio fechava com ~50% a menos de uso real. Há um teste que **falha de
  propósito** depois de 2026-08-31, para a volta ao preço de lista não passar batido.

- **2.3 Contrato do dataset.** `sync/dataset-contract.ts`: volume (piso, teto e queda > 30%
  vs. baseline), Key duplicada, time desaparecido, datas impossíveis, drift de custom field e
  `resolutiondate` ausente em massa. O schema Zod antigo validava ITEM; os erros que machucam
  são de CONJUNTO e publicavam um dataset "válido" descrevendo realidade falsa. Bloqueia o sync
  antes de tocar o Blob. `src/data-baseline.json` é a referência (commitada pelo workflow) —
  sem ela, queda de 90% é indistinguível de trimestre fraco. Aprova o dataset real de produção
  com 0 bloqueios; 10 testes novos.
- **2.10 Segurança do CI + dependências.** Jobs novos: gitleaks (com `.gitleaks.toml` que
  reconhece o ÚNICO achado conhecido — a anon key no histórico imutável — porque job vermelho
  permanente treina o time a ignorar vermelho), `pnpm audit`, SBOM CycloneDX e CodeQL. Os SHAs
  das actions foram VERIFICADOS via API do GitHub e batem com as tags anotadas.
  **Correção ao review:** o Dependabot JÁ EXISTIA (§9 dizia "não observado"); foi melhorado com
  agrupamento e ignore do major de React.
  **E os CVEs foram obtidos** — o review dizia que não conseguiu: eram **23 (10 high)**. Agora
  são **9 (2 high)**, com builds passando:
  · `next` 16.2.9 → 16.2.11 — o advisory era **"Middleware / Proxy bypass in App Router"**, e o
    gate inteiro do Nero *é* o proxy (`src/proxy.ts`). Era o CVE mais grave para este projeto.
  · overrides em `postcss`, `sharp`, `brace-expansion` (transitivos, ninguém declara).
  · **Deliberadamente NÃO feitos:** `vite >=6.4.3` (bypass do dev server, exige major 5→6 no
    maturity e no hub) e `react-router >=8.3.0` (CSRF em modo RSC, que o app não usa; exige
    migração 6→8). Ambos são decisão registrada, não esquecimento.

- **2.9 Governança do Maturity.** Migration `20260727180000`: trigger que impede remover o
  ÚLTIMO admin (era lockout irrecuperável pela aplicação); `granted_by`/`revoked_at`/`user_id`
  em `portal_roles` com trigger que estampa quem concedeu **no banco** (confiar na app é o
  mesmo que não ter o campo); `is_portal_admin`/`is_portal_am` passam a exigir
  `revoked_at is null` — a linha revogada FICA, como prova de offboarding, mas o papel desliga;
  `kz_write ... for all` virou insert/update (membro) + delete (só admin); e
  `restart_assessment` exige MOTIVO e grava snapshot do que apagou em `destructive_audit`
  (append-only: quem executa não apaga o próprio rastro). 14 testes novos → 88/88.
  Nos hooks, `lib/query-error.ts` classifica o erro: recurso ausente/permissão devolvem vazio
  **com log que sobrevive em produção**; qualquer outra falha é LANÇADA, para a tela dizer "não
  consegui carregar" em vez de "nada aqui". Antes usavam `devWarn`, que é no-op em produção — o
  erro desaparecia exatamente onde importa. `usePortalRole` é exceção deliberada e documentada
  (não lança: fail-closed em papel).

  > Peguei uma REGRESSÃO minha aqui: ao reescrever `restart_assessment` copiei o corpo de uma
  > ocorrência antiga e ia devolver o ciclo para `'session'` com `workshop_at = now()`. O certo
  > (corrigido em 26/07) é `'pre_session'` com `workshop_at = null` — resetar para `session`
  > pularia a análise prévia do SM. O teste existente pegou.

## O que ainda NÃO foi tocado

Onda 2 (**COMPLETA**, com uma parcialidade declarada + 1 bloqueado): changelog via bulkfetch ·
fórmulas de âncora (sprint injetada por comparação de comprimento de string) · contrato de dados ·
PII/DLP · prompt injection · constraints do Prisma · preço promocional do Sonnet · **preview
isolado/backup/RPO-RTO (BLOQUEADO: exige console Neon/Vercel)** · governança do Maturity ·
SAST/secret scanning/SBOM.

> **2.1 é parcial, de propósito e declarado.** O **Dashboard** migrou para
> `POST /rest/api/3/changelog/bulkfetch` (lotes de 1.000 por `issueId`, paginação por
> `nextPageToken`, guarda de 200 páginas que marca `complete = false`), com
> `DataQuality.historyComplete` por item, degradação graciosa se o bulkfetch falhar (o sync não
> aborta — entrega e lead time vêm de `resolutiondate` e seguem válidos) e a regra `historico-parcial`
> no contrato do dataset, que **alerta sem bloquear** quando >50% dos itens estão sem histórico
> completo. O **`sync-anchors` do Maturity continua com `expand: changelog`**: ali a mitigação
> aplicada foi tornar a detecção de `everDone` robusta a truncamento (checa `toString` **e**
> `fromString`). Migrar o Maturity também exigiria repaginar a Edge Function inteira e não caberia
> com verificação honesta nesta rodada. Registrado em `SECURITY.md` §6 como garantia ausente.

Onda 3 (**COMPLETA**):

- **3.1 docs perigosos reconciliados** — `README.md` raiz (pnpm em vez de "sem npm workspaces…
  `npm ci`", `api/gate.ts` em vez do removido `api/tower.ts`, "sem `SESSION_SECRET` o gate **fecha**"
  em vez de "abre", quadro de envs sem as variáveis de sync que nunca existiram) ·
  `nero-portal/CLAUDE.md` e `README.md` (allowlist `claude-sonnet-5`, `vercel-build` sem `db push`,
  `APP_PASSWORD` removida) · `nero-portal/DEPLOY.md` (seções históricas marcadas como
  NÃO-EXECUTAR; `npm run db:push` → `db:migrate`) · `locavia-dashboard/CLAUDE.md` (a invariante de
  período estava **invertida**: dizia "fim do dia fechado em UTC", que era a causa da contagem
  dupla) e `README.md` · `maturitymodel/README.md` (pnpm, `tsc -b`, as **duas** Edge Functions),
  `ARCHITECTURE.md` e `STATUS.md` (banners de defasagem + §4.1 marcado como histórico) ·
  `HANDOFF.md` · `.agent/workflows/`.
- **3.2 o review atualizado** — nova §0 no topo de `FULL-CODE-REVIEW-2026-07-27.md` com as **sete
  correções** em tabela, o achado da **composição** (§P0.2+§5.7+§4.7 juntos), os **oito achados
  novos** e a armadilha de método do `grep`. O corpo original ficou intacto de propósito: é o
  diagnóstico, e serve para auditar o raciocínio.
- **3.3 estrutura documental** — `SECURITY.md` (cada garantia com onde é imposta + qual teste a
  prova, e uma seção 6 com o que **não** tem garantia) e `OPERATIONS.md` (runbooks: verificação,
  sync bloqueado, 503, orçamento, cron das âncoras, migrations, deploy, queda de sessões).
  Ambos linkados do topo do `README.md`. Não criei `docs/apps/`, `docs/adr/` nem `docs/archive/`:
  os docs por app já vivem nas pastas dos apps e movê-los quebraria todos os links relativos
  existentes — o ganho seria estético e o custo, real.

---

## Achados NOVOS desta execução (não estão no review)

1. **`api/` e `middleware.ts` não tinham typecheck NENHUM.** Não havia `tsconfig.json` na
   raiz e `pnpm -r` não visita o projeto raiz. Toda a fronteira de autenticação do portal
   estava sem verificação de tipos — pior que o "falso verde" do Maturity.
2. ~~**§4.7 do review está com o diagnóstico errado.** O `hourly-sync` **não** falha: as
   execuções estão verdes e produziram o `data-meta.json` de hoje.~~ **ESTA CORREÇÃO ESTAVA
   ERRADA — ver `FULL-CODE-REVIEW-2026-07-27.md` §0.5.** O achado do review estava certo no
   efeito. O `hourly-sync` ficou verde de 26/07 16:06 até **27/07 11:30 UTC** e desde **14:48
   UTC falha em toda execução** (3 falhas consecutivas), sem nenhum commit na `main` no meio: o
   GitHub passou a forçar as actions fixadas por SHA a rodar sob Node 24, e o
   `cache-dependency-path: locavia-dashboard/package-lock.json` — arquivo que não existe desde
   `c5393c2` — deixou de ser condição tolerada e virou **erro fatal** no `Set up Node.js`.
   Errei o mecanismo por inferir em vez de ler o log do passo.

   O que se confirma, com evidência mais forte do que eu tinha: o log da última execução verde
   mostra `npm ci` **"added 331 packages" sem lockfile nenhum no repositório** — install não
   reproduzível, comprovado, num job que carrega `JIRA_API_TOKEN`, `BLOB_READ_WRITE_TOKEN` e
   `contents: write` em `main`. O log também reporta **8 vulnerabilidades (7 high)**, dado de
   CVE que o review disse não ter conseguido obter.

   **URGÊNCIA OPERACIONAL:** o dataset do Dashboard está congelado em 27/07 11:32 UTC e
   envelhece a cada hora. O commit `4e199a1` desta branch conserta exatamente esta falha —
   enquanto ele não entrar na `main`, o sync segue morto.
3. **`trends.ts` tinha uma segunda cópia do fallback `Resolved ?? UpdatedAt`** — era a causa
   da divergência entre a vazão do snapshot e a da tendência.
4. **`DataQuality.missingResolutionDate` era código morto:** 0 de 6.345 itens, estruturalmente
   impossível de disparar. 35 itens carregam `Resolved === UpdatedAt` (assinatura do fallback).
5. **Dois campos fantasma** gravados pelo `field-mapper` e inexistentes em `DashboardItem`:
   `doneWithoutCycleData` e `CycleTime`. Só o typecheck revelou.
6. **O harness de RLS nunca aplicava migrations posteriores à de papéis** — `drop_is_any_am` e
   as novas ficavam fora do teste. Corrigido com `startAfter` em `apply-migrations.ts`.
7. **O shim de teste desfaz todo `revoke` de migration:** `grantSupabaseDefaults` roda
   `grant all on all routines ... to anon` DEPOIS das migrations, invertendo a ordem de
   produção. Qualquer teste de privilégio de RPC precisa reaplicar a migration antes de
   medir — vale para os revokes que o review elogiou em §6.1.
8. **O bug de `homolog_update` derrubava a oficialização inteira**, não só uma linha: com a
   policy antiga, mover a homologação para outra dimensão *funcionava*, deixando 9 de 10
   dimensões e fazendo `officialize_cycle` recusar (sem kaizens, sem arquivamento).
9. **`axes.key` e `stage_number` não tinham CHECK** — os tipos do TS afirmavam domínio que o
   banco não garantia. Mesma classe do achado 7.7 (Nero: 113 `String`, 0 enums).
10. **Havia TRÊS cópias do predicado de descarte**, não duas: `discard.ts` (canônico, por
    raízes), `epics.ts` e `montecarlo.ts` (ambas com match exato). A do `montecarlo` inflava o
    backlog e empurrava a previsão de entrega para mais longe.
11. **`audit:performance` era não determinístico** — janela de 56 dias sobre `new Date()`. Com
    dado congelado e código idêntico, throughput medido 1198 às 06:00 UTC e 1187 às 18:00 do
    mesmo dia. Um "baseline" assim não detecta regressão nenhuma. Agora aceita `AUDIT_NOW`.
12. **O erro do chat vazava para o MODELO, não só para o cliente.** O texto
    `[Erro do Nero: ${err.message}]` era escrito no stream, e o stream é o que o modelo lê nos
    turnos seguintes do laço agêntico — nome de tabela e constraint do Postgres entravam no
    contexto do próprio agente.
13. **`tests/` do Maturity também não tinha typecheck** — a suíte de RLS, o contrato da jornada
    e o aplicador de migrations, ou seja o código que decide se a política de acesso do banco
    está certa. Mesmo gap de `sync/` no Dashboard. Corrigido com `tsconfig.tests.json`.
14. **`everDone` das âncoras só olhava `toString`.** Item cuja transição "→ CONCLUÍDO" foi
    truncada do changelog (o `expand: changelog` devolve histórico limitado) era classificado
    como nunca concluído e saía do DENOMINADOR de `quality.return_rate_pct` junto com o
    numerador — subestimando a taxa de reabertura, o erro na direção que faz o time parecer
    melhor do que é.
15. **§7.9 do review superestima o alcance da PII.** `owner`, `steward` e `validadoPor` do
    catálogo **não** entram em `buildMemoriaContext` — a tabela emite só
    `nome | nº campos | % | sensibilidade | statusVerdade`. Eles são ENTRADA da tool
    `documentar_ativo` (o modelo escreve, não lê de volta). O caminho real de PII ali é a
    mensagem que a pessoa digita, que nenhuma redação de contexto pode interceptar — por isso
    a correção central de 2.4 foi a copy, não só o regex.
16. **O chat tutor da Academia recebia TODAS as tools de escrita.** Um chat cujo propósito é
    ensinar podia gravar decisão, mudar status de fase e sobrescrever o catálogo do projeto.
    O review tratou "aprovação humana para escrita" como item de escala; a política de tools
    por rota era o buraco imediato.
17. **O Dependabot já existia.** §9 do review lista "sem Dependabot/Renovate observado", mas
    `.github/dependabot.yml` está no repo cobrindo npm e github-actions.
18. **Os CVEs eram obteníveis, e havia um crítico para ESTE projeto.** O review registrou
    "auditoria CVE não autorizada pelo ambiente; resultado desconhecido" — aqui `pnpm audit`
    rodou e apontou 23 vulnerabilidades (10 high). Entre elas, `next` com **"Middleware / Proxy
    bypass in App Router"**: o gate do Nero é exatamente um proxy do App Router, então o
    advisory batia na trava de acesso da ferramenta mais restrita do portal. Corrigido
    (16.2.9 → 16.2.11).

## Pendências que dependem de você (não de código)

- Fechar as rotações em `SECRETS.md` (tabela com colunas de evidência já preparada).
- Criar as secrets do cron antes de aplicar `20260727130100`:
  `vault.create_secret(...)` para `anchor_sync_url` e `anchor_sync_secret`, e
  `supabase secrets set ANCHOR_SYNC_CRON_SECRET=...` com o mesmo valor.
- `supabase secrets set SB_ANON_KEY=...` (novo — o `sync-anchors-user` usa para chamar o RPC).
- Aplicar as migrations Prisma no Neon (`pnpm --filter nero-portal db:migrate`) — são DUAS:
  `20260727160000_audit_actor_and_budget_reservation` e `20260727170000_domain_constraints`.
  A segunda cria os CHECKs como `NOT VALID` (não trava o deploy em dado legado) e **falha** se
  houver duplicata nas chaves naturais — o que seria a informação de que a corrida
  `findFirst → create` já aconteceu em produção. Há queries de diagnóstico e o bloco de
  `VALIDATE CONSTRAINT` documentados no fim daquela migration.
- **Avisar o time antes de subir:** a mudança de token (subchave HKDF por propósito) derruba
  TODA sessão viva — todos refazem login OTP e redigitam a senha da Torre/do Nero. Ver a seção
  "Tokens de sessão" no `SECRETS.md`.
- Opcional: `NERO_USER_MONTHLY_BUDGET_USD` para o teto por pessoa (sem ela, metade do global).
- Rodar `pnpm --filter nero-portal test:state` contra um banco descartável.
- Decidir se o Maturity migra para React 19 (removeria os `paths` de `tsconfig.app.json`).

---

## Depois do merge: o CI novo em contato com a realidade (2026-07-27, noite)

Registrado porque as duas falhas foram **de projeto meu**, não de ambiente, e a segunda é o tipo
de erro que se repete se o motivo não ficar escrito.

### O que o CI novo achou de verdade na primeira execução

Não foi cerimônia. O CodeQL pegou 3 achados, um deles em código escrito por este hardening:

1. **`js/incomplete-sanitization` em `_shared/anchor-sync.ts`** — o escape de JQL era
   `v.replace(/"/g, '\\"')`: escapava aspa e **não** barra invertida. Valor terminando em `\`
   virava `"foo\"`, a barra escapava a aspa de fechamento, e o resto era lido como JQL. Hoje os
   valores vêm do mapa `SQUAD_JIRA` hardcoded, então não era explorável — e é exatamente por isso
   que valia corrigir: no dia em que o mapa vier da tabela `teams` (que SM edita), vira injeção,
   e ninguém reabre aquela linha por conta própria.
2. **`devWarn` não usado** em `usePortalRole.ts`. Detalhe que vale guardar: o nome aparece DUAS
   vezes no arquivo, e a segunda é **dentro de um comentário**. Um guard por `grep -c devWarn`
   responderia "está em uso" — a mesma classe de erro do `grep -ci '\berror\b'` acima. Análise
   que entende a linguagem vê o que busca textual não vê.
3. **`serializeCookie` não usado** em `tests/fixtures.ts`.

Os itens 2 e 3 **não estavam em escopo de lint nenhum** (`tests/` da raiz não entra em nenhum
job). O CodeQL cobre lacuna real do tooling, não repete o eslint.

### Falha nº 1: escrevi um job cuja última etapa exige licença que o repo não tem

CodeQL analisou 290/290 arquivos TS e 10/10 JS, gerou o SARIF, e **morreu no upload**:
`Code scanning is not enabled for this repository (403)`. Publicar no Code Scanning exige o
produto habilitado, e em repositório **privado** isso exige **GitHub Advanced Security**, que é
pago. Não é setting: `gh api .../code-scanning/default-setup` também responde 403.

Correção: `upload: false` + `output: codeql-results`, e o SARIF é consumido do arquivo. Perde-se a
aba Security (triage, histórico, dismiss, anotação em PR); **não** se perde o gate.
`security-events: write` saiu das permissões dos dois jobs — sem publicação, não havia o que
escrever, era permissão a troco de nada.

### Falha nº 2: construí exatamente o que eu havia condenado por escrito

A primeira versão do gate falhava em **qualquer** achado. Passou no PR e **quebrou a `main`** —
por uma diferença que eu não conhecia: em `pull_request` o CodeQL v3 faz análise
**diff-informed** (só o que o PR toca) e em `push` varre o repositório inteiro. Apareceram **6
pré-existentes** que o PR nunca mostrou.

Li os 6 um a um; nenhum é defeito (SHA-256 nos dois lados para igualar comprimento antes de
`timingSafeEqual`, sem hash armazenado e sem banco de senhas; scripts de operador que leem `.sql`
de `argv`; o sync gravando resposta do Jira em caminho **constante**, com escrita atômica). Falhar
neles deixaria a `main` vermelha para sempre — e eu havia escrito no próprio `ci.yml` que
*"vermelho permanente treina o time a ignorar CI vermelho"*.

Correção: `.codeql-baseline.json`, chave `ruleId|arquivo` (sem linha — linha muda a cada edição),
com contagem esperada e **motivo obrigatório**. Motivo obrigatório é o que separa baseline de
allowlist: se não dá para escrever por que não é defeito, então é defeito. A lógica virou
`scripts/check-codeql-sarif.mjs` (script, não bash inline) para ser testável fora do CI. Cinco
comportamentos provados antes do commit — baseline exato passa · regra nova falha · mesma
regra/arquivo com contagem maior falha · SARIF ausente falha · contagem **menor** passa avisando,
para o baseline encolher junto e não apodrecer — mais validação contra o **SARIF real** da
varredura que havia falhado.

### Falha de ambiente (não minha): gitleaks em pull_request

Em `pull_request` a action entra em `ScanPullRequest` e chama `GET /repos/.../pulls/{n}/commits`
para enumerar o range. Sem `pull-requests: read` isso é 403 e derruba o job em **todo** PR, mesmo
sem achado — o próprio GitHub diz o que falta no header
(`x-accepted-github-permissions: pull_requests=read`). Concedido só **leitura**; escrever no PR
(comentário) fica desligado por `GITLEAKS_ENABLE_COMMENTS: false`, porque o achado já vai para o
log e já falha o job, e token de CI com escrita no PR é superfície a mais.

Só apareceu porque a correção foi por PR: em `push` o caminho é `ScanPush`, que não toca a API de
PRs. **O primeiro PR do repo com o CI novo é que exercitou esse ramo** — é um argumento concreto
a favor de mudar CI por PR, não por push direto.

### O sync, resolvido e verificado contra o Jira real

Depois do merge, `workflow_dispatch` manual: **verde**. E foi a **primeira execução real do
`bulkFetchChangelogs`**, que até então só tinha typecheck e invariantes — nunca API:

- 6.371 issues, **7 lotes** de até 1.000 (12, 23, 28, 25, 27, 20 e 9 páginas de changelog);
- **changelog completo para 6.357 — 99,78%**; os 14 restantes ficam marcados
  `historyComplete: false`, que é o comportamento correto;
- contrato do dataset não bloqueou nada; publicado no Blob (hash `dd960f28d9e1fb76`);
- `syncedAt` destravou de **11:32** para **21:25 UTC**, e o baseline foi atualizado para 6.371.

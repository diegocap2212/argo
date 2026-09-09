# HANDOFF — NEO (Núcleo de Evolução e Operação)

> **Novo no projeto?** Comece por [`ARCHITECTURE.md`](ARCHITECTURE.md) (o mapa e o que é
> load-bearing) e [`ONBOARDING.md`](ONBOARDING.md) (do zero ao deploy). Este arquivo é o
> **estado operacional corrente** — histórico e pendências.

---

# ▶ RETOMADA — o que atacar primeiro (atualizado 2026-07-31)

**Onde as coisas estão:** duas ondas empilhadas, nenhuma em produção.

1. **Hardening do code review (27/07)** — na `main`, CI verde, **não deployado**.
2. **RBAC do NEO (31/07)** — no worktree, **não commitado**. Permissão virou dado, nasceu o
   app `/admin`, e as senhas compartilhadas da Torre e do Nero saíram do caminho.

Nenhum dos dois projetos Vercel tem conexão git, então `main` ≠ produção — produção roda o
código de antes do hardening. É seguro e proposital, e significa que **nada disso está valendo
para ninguém ainda**.

Verificar o estado em 1 comando: `corepack pnpm verify` (sai 0; ~15 min).

## Rodada 2026-09-09 — Saída da LM: a allowlist vira a única porta

A LM Mobilidade não opera mais o NEO. O domínio `@lmmobilidade.com.br`, que desde 13/07 liberava
acesso **automaticamente**, deixou de significar qualquer coisa — inclusive para os dois admins,
que eram e-mails LM. **Não existe mais liberação implícita:** quem entra é quem está aprovado em
`neo_access`, gerido em Administração → Acesso.

| Onde | O que mudou |
|---|---|
| Banco | `20260909120000_remove_lm_domain_allowlist.sql` — `is_neo_allowed()` e `is_neo_email_allowed()` perdem a cláusula de domínio; a allowlist nova entra; papéis LM revogados |
| Hub | `ALLOWED_DOMAIN` e o atalho sem round-trip saíram de `neo-hub/src/main.ts`; copy do gate não cita mais a LM |
| Portal MMA | `useAuth.tsx` não tem mais o `endsWith` — só o RPC decide |
| Admin | `Acesso.tsx` deixa de recusar e-mail LM e de se chamar "lista de exceções": é A lista |
| Testes | asserção nova em `rls-local.ts` trava o domínio contra reintrodução; fixtures que dependiam dele migraram para allowlist explícita |

**ORDEM LOAD-BEARING na migration** (documentada nela): o admin novo entra na allowlist e recebe
`admin_geral` **antes** de o domínio cair, e os papéis LM são revogados **por último**. Invertido,
o trigger `assert_admin_path_reachable` aborta a transação — corretamente, porque o estado final
não teria ninguém capaz de administrar acesso.

**Quem tem acesso agora:** `diegocaporusso@gmail.com` (admin_geral), `carlinha4m@gmail.com`,
`tordiego@gmail.com`, `elainemendes0978@gmail.com` (os três últimos sem papel — só o implícito
`todos`). Conceder papel é pela tela, não por migration.

⚠️ **Aplicar a migration é o que corta o acesso de fato.** Até ela rodar em produção, qualquer
e-mail `@lmmobilidade.com.br` continua entrando. Sessões já emitidas sobrevivem ao corte: o
`neo_session` vale até 12h e o access token do Supabase até 1h — para matar todas na hora,
rotacione `SESSION_SECRET` e faça sign-out dos usuários no Supabase (ver `docs/SECURITY-PLAN.md`).

## A onda de 31/07 — RBAC do NEO

Permissão deixou de estar espalhada em 34 policies e em TypeScript: virou **`neo_role_permissions`**,
uma tabela, com um predicado único `has_perm(permissao, squad)` e uma tela onde uma pessoa leiga
edita a matriz papel × função. Os dois papéis que eram um se separaram: **`admin_geral`** governa
acesso (concede papel, edita a matriz) e **`admin`** opera a estrutura.

| Onde | O que mudou |
|---|---|
| Banco | `20260731120000_neo_rbac.sql` (modelo, catálogo, matriz, 34 policies) + `20260731130000_neo_authz_rpc.sql` (o RPC do `/api/authz`, autorizado por segredo do Vault) |
| Sessão | `neo_session` passa a carregar `roles`/`perms`; **ausente ≠ vazio** (cookie velho vai para autocura, não para "acesso negado") |
| Borda | `middleware.ts` confere a permissão da porta e ganhou o matcher `/admin`; recusa vira 302 para o hub, que dá a palavra final |
| Hub | Portas aparecem por permissão; `?next=` com trava de repetição para não virar ping-pong |
| App novo | `neo-admin` em `/admin/**` — Pessoas · Papéis × Funções · Acesso ao NEO · Squads · Auditoria |
| Ficha da pessoa | *Pessoas* é lista + ficha: nome, papel global, squads e "desligar" num lugar só. RPC `offboard_person` faz o desligamento em transação, com trilha (`docs/superpowers/specs/2026-07-31-ficha-da-pessoa-design.md`) |
| Nero | `proxy.ts` pergunta `GET /api/authz?perm=neo.nero.access` (memo 60s). **Senha eliminada** |
| Dash | Torre por `dash.tower.view`, decidido no `/api/data`. **Senha eliminada** |
| MMA | `/maturity/admin` virou redirect para `/admin`; `AdminMMA.tsx` removido |

**O que precisa de VOCÊ antes do deploy:**

1. **Conferir quem recebe `neo.nero.access` e `dash.tower.view`.** A matriz semente chuta
   AM + Admin + Admin Geral. Hoje quem entra é quem sabe a senha, e não existe registro de
   quem são. Se a lista real for outra, é **conceder o papel ANTES** de a senha sair — esquecer
   isso tranca o time fora numa sexta.
2. **Criar o segredo do Vault e a env**, com o MESMO valor (ver `SECRETS.md`):
   `select vault.create_secret('<32+ chars>', 'neo_authz_secret');` e
   `vercel env add NEO_AUTHZ_SECRET production`. Divergir = Nero fechado para todos, em silêncio.
3. **Avisar o time**: além do logout do HKDF, quem usava a senha da Torre/do Nero não vai mais
   ter onde digitá-la — e só entra se tiver o papel.

**O escopo do RBAC, decidido e fechado (Diego, 31/07):** a matriz semente foi conferida linha a
linha e está como se quer.

- **Admin Geral** governa acesso · **Admin** faz todo o resto — as duas únicas linhas de
  diferença são `neo.roles.manage` e `neo.matrix.manage`.
- **AM** vê e OPERA o ciclo (homologa, devolve, arquiva) em **todos** os squads, nas três
  ferramentas. Não é papel de leitura — confirmado como intencional.
- **SM / member** enxergam só os próprios squads **no MMA**. No Dash, não: ver abaixo.

⚠️ **O recorte do SM no MMA é DADO, não configuração.** Quem decide o que um SM enxerga é o
vínculo em `squad_members(user_id, team_id, role='sm')` — a permissão `mma.squad.read` é de
escopo squad e só vale onde há vínculo. Consequência direta: **SM sem vínculo abre o MMA e não
vê squad nenhum.** Conferir a lista de SM × times antes da janela é pré-requisito, não ajuste
posterior (item 9b). A tela é `/admin` → Squads e membros depois do deploy; antes dele, a
`/maturity/admin` que ainda está em produção.

**O gate da Torre é de INTERFACE, e isso foi ACEITO — não é pendência.** O comparativo entre
agilistas continua derivável do `/api/data` por qualquer sessão, porque é calculado no cliente
a partir dos mesmos itens cruzados com `sm-config.ts`, que está no bundle. O plano previa
"omitir do payload os campos que alimentam o agregado"; medindo, **não existem tais campos**.
Com as duas opções na mesa (fechar com recorte por time no servidor × manter transparente), a
escolha foi **manter transparente**: no Dash, toda pessoa do NEO vê todos os times.

⚠️ Quem for mexer nisso depois: **não é bug**. O detalhamento e as condições para revisar a
decisão estão em `SECURITY.md` §6.1.

## A ordem importa — duas coisas quebram se invertidas

**① Nero: migration ANTES do código.** `src/lib/nero/usage.ts` grava as colunas `estimated` e
`actorEmail`, que só existem depois da migration `20260727160000`. Deployar o código primeiro
quebra **todo turno de chat** com erro de coluna inexistente.

```bash
# backup primeiro, sempre
neonctl branches create --name backup-pre-hardening
pg_dump "$DATABASE_URL_UNPOOLED" -Fc -f backup-pre-hardening.dump
# revisar o SQL das duas migrations antes de aplicar
corepack pnpm --filter nero-portal db:migrate
# só então o deploy do Nero
```

**② Maturity: a função ANTIGA ainda está no ar.** Apagar a pasta local **não fez undeploy**.
Enquanto `sync-anchors` existir no Supabase, **o P0 do review continua aberto** — ela recebe
`service_role` por env, autoriza com ela, e é acionável por qualquer portador da anon key
(pública, e no histórico do git).

```bash
# Vault (SQL no Supabase): criar anchor_sync_url e anchor_sync_secret
supabase secrets set ANCHOR_SYNC_CRON_SECRET=<mesmo valor de anchor_sync_secret> SB_ANON_KEY=<anon>
supabase functions deploy sync-anchors-user
supabase functions deploy sync-anchors-cron
supabase functions delete sync-anchors      # ← o passo que fecha o P0
```

`anchor_sync_secret` (Vault) e `ANCHOR_SYNC_CRON_SECRET` (secret da função) **têm de ter o mesmo
valor**, senão o cron toma 401 em silêncio.

## Lista de retomada, em ordem

> **Atualizada em 2026-07-30.** Itens 1, 2 e 5 fechados e verificados em produção — ver
> "Execução de 2026-07-30" abaixo. O que sobrou é **uma janela coordenada** (itens 3+4) mais
> decisões suas.

| # | O quê | Estado | Quem fecha |
|---|---|---|---|
| 1 | P0 do `sync-anchors` | ✅ **FECHADO** — nome antigo republicado com a implementação autorizada; anon key agora toma 401. O `functions delete` fica para a janela do deploy | — |
| 2 | Migrations do Prisma (`20260727160000`, `20260727170000`) | ✅ **APLICADAS** no Neon, com backup antes; os 13 CHECKs foram **validados** (não ficaram `NOT VALID`) | — |
| 3 | **Avisar o time**: subchaves HKDF **derrubam toda sessão viva**; e as senhas da Torre/Nero deixam de existir | ⛔ **você** | você |
| 4 | **Janela coordenada: portal + Nero JUNTOS** (ver aviso abaixo) + migrations `20260727180000`, `20260731120000`, `20260731130000`, `20260731140000` + `functions delete sync-anchors` | ⛔ gated nos itens 3 e 9 | você |
| 5 | `test:state` contra base descartável | ✅ **31/31** num branch Neon descartável, já removido | — |
| 6 | Definir `NERO_USER_MONTHLY_BUDGET_USD` | ⛔ decisão de negócio | você |
| 7 | Rotações de segredo pendentes | ⛔ ver [`SECRETS.md`](SECRETS.md) | você |
| 8 | Backup/restore **testado**, RPO/RTO, retenção, preview isolado do Nero | ⛔ exige console Neon/Vercel | operador |
| 9 | **Conferir a linha `neo.nero.access`/`dash.tower.view` da matriz semente** + criar `neo_authz_secret` (Vault) e `NEO_AUTHZ_SECRET` (env) com o mesmo valor | ⛔ **bloqueia o item 4** | você |
| 9b | **Vincular cada SM aos times dele em `squad_members`** (`role='sm'`). Diego informa a lista | ⛔ **bloqueia o item 4** | você |
| 10 | Depois da janela: `vercel env rm TOWER_PASSWORD/NERO_PASSWORD` + remover `api/gate.ts` (ficou sem chamador) | ⛔ pós-deploy | você |
| 11 | Commitar a onda de 31/07 — **nada dela está no git** | ⛔ aguarda sua ordem | você |

### ⚠️ Portal e Nero têm de subir na MESMA janela (medido em 2026-07-30)

A RETOMADA original tratava o deploy do portal e o do Nero como itens separados. **Não são.**
`@neo/auth` deriva a chave por propósito com HKDF (`hmacKey(secret, purpose)`) e **não tem
fallback para o formato antigo**. Consequência:

- Deployar **só o portal** → ele emite token novo; o Nero em produção (código antigo) rejeita e
  fica inacessível.
- Deployar **só o Nero** → ele exige token novo; o portal em produção ainda emite o antigo, e
  todo mundo é mandado de volta ao hub.

Os dois projetos Vercel são separados, então isso é sequência manual: `deploy` nos dois,
smoke nos dois, `promote` nos dois — de preferência em minutos, não horas.

**Ordem dentro da janela** (revista em 31/07 para incluir o RBAC):

1. avisar o time (todos refazem login OTP; a senha da Torre/do Nero deixa de existir);
2. **backup do Supabase** — 34 policies reescritas, com rollback ensaiado em PGlite mas nunca
   em produção;
3. criar `neo_authz_secret` no Vault e `NEO_AUTHZ_SECRET` no projeto `neo-lm`, **mesmo valor**;
4. **aplicar as migrations ANTES do código.** Ordem obrigatória:
   `20260727180000_governanca_papeis` → `20260731120000_neo_rbac` → `20260731130000_neo_authz_rpc`
   → `20260731140000_offboard_person`.
   `has_perm` tem de existir antes de qualquer app chamá-lo, e a de RBAC empilha sobre a de
   governança;
5. **conferir a matriz semente** com a lista real de quem deve entrar no Nero e na Torre, e
   conceder os papéis que faltarem — ainda antes do deploy do código;
6. `vercel deploy --target=production --skip-domain` no portal **e** no `nero-portal`;
7. smoke nos dois → `vercel promote` nos dois;
8. `supabase functions delete sync-anchors` + apagar
   `maturitymodel/supabase/functions/sync-anchors/` (o shim), depois de conferir no bundle de
   produção que ele chama `sync-anchors-user`;
9. depois de tudo verde: `vercel env rm TOWER_PASSWORD/NERO_PASSWORD` e remover `api/gate.ts`.

**A janela entre o passo 4 e o passo 7 é a mais delicada desta rodada.** Com as migrations
aplicadas e o front antigo ainda no ar, as policies já falam `has_perm` e o front antigo não
sabe disso — é a mesma lição de 27/07 registrada mais abaixo ("a janela entre migration e
deploy"), agora sobre 34 policies em vez de uma. Mantenha o intervalo em minutos.

## Execução de 2026-07-30 — o que foi fechado

**P0 do `sync-anchors` — fechado sem esperar a janela.** O bloqueio era um acoplamento que só
apareceu ao medir: o front **em produção** invoca o nome antigo (confirmado com
`git show <commit-em-prod>:useAnchors.ts`), então `functions delete` quebraria o botão de sync.
Como o P0 não é "a função existe" e sim "a função não autoriza", o nome antigo foi republicado
com a implementação autorizada (shim de 1 linha importando o handler de `sync-anchors-user`).

Verificado contra as functions no ar: anon key + `team_id` → **401**; body vazio → **400**
(antes sincronizava TODOS os squads); cron sem secret → **401**; cron com secret errado →
**401**; `anon` sem `execute` em `can_sync_anchors`.

**Migrations do Maturity aplicadas** (as 4 que não dependem do front): `130000` (can_sync_anchors),
`140000` (CHECKs de domínio — dado pré-checado, 0 fora), `150000` (fix do `homolog_update`),
`130100` (cron via Vault). Falta só `180000_governanca_papeis`, que é front-coupled.

**Cron reagendado** para `sync-anchors-cron-daily` com segredo no Vault. O risco de falha
silenciosa foi fechado por prova, não por esperança: o digest que o Supabase expõe **é** sha256
do valor, então dá para comparar function-secret × Vault × valor gerado sem invocar (invocar
dispararia um sync real no Jira).

**Nero: duplicatas reais encontradas.** A migration `170000` prevê falhar se houver duplicata nas
chaves naturais, e havia — 4 em `Risk.codigo`. Mas o diagnóstico do review estava **errado sobre a
causa**: não foi a corrida `findFirst → create`. Os pares têm descrição idêntica e foram criados
com **413 segundos** de diferença — é um seed rodado duas vezes em 23/06. Deduplicado mantendo o
mais antigo, com snapshot salvo e branch de backup no Neon; sem FK apontando para `Risk`, e os 8
registros em `StateVersion` ficam como histórico (trilha append-only).

**Os 13 CHECKs do Nero foram VALIDADOS**, não deixados `NOT VALID`: o pré-check mostrou 0 linhas
fora do domínio, então valem para todas as linhas e não só para escrita nova.

**`test:state`: 31/31** contra um branch Neon descartável (criado e removido). Cobre reserva de
orçamento, auditoria com `actorEmail`, undo fora de ordem e undo com estado divergente.

## O que sabidamente NÃO tem garantia (não é esquecimento)

Registrado com detalhe em [`SECURITY.md`](SECURITY.md) §6:

- **Fronteira HTTP das Edge Functions sem teste automatizado.** A matriz de papéis está provada
  no banco (88 checks em Postgres efêmero); o `anon → 401`, `SM do squad → 200`,
  `cron sem secret → 401` depende de deployment e não roda no CI.
- **`sync-anchors` do Maturity segue com `expand: changelog`.** O Dashboard migrou para
  `bulkfetch` (validado contra o Jira real: 6.371 issues, 7 lotes, **99,78%** com histórico
  completo); o Maturity não. Mitigado (detecção de `everDone` robusta a truncamento), não
  resolvido.
- **Comentários do Dashboard não têm autoria** — qualquer usuário NEO escreve comentário de
  qualquer squad. Decisão documentada no código, mas quem usa como registro precisa saber.
- **`script-src 'unsafe-inline'`** no portal — remover exige nonce/hash no build composto.
- **CodeQL não publica na aba Security**: repo privado sem GitHub Advanced Security (pago). O
  gate funciona lendo o SARIF do arquivo, com baseline em `.codeql-baseline.json`.

## Duas regras que custaram caro hoje

1. **Cheque por código de saída, nunca por grep na saída.** Um `grep -ci '\berror\b'` reportou
   "0 erros" enquanto o eslint **crashava** — `\berror\b` não casa dentro de `TypeError`.
2. **Não conclua mecanismo sem ler o log do passo.** Declarei o achado do review sobre o
   `hourly-sync` "empiricamente falso" porque o job estava verde; 3h depois ele quebrou pelo
   motivo exato que o review apontava. O review falava da **configuração**; eu olhei o
   **resultado daquele dia**. Ver `docs/FULL-CODE-REVIEW-2026-07-27.md` §0.5.

**Rollback de tudo:** `git revert -m 1 7faf9a5`.

---

## Rodada 2026-07-27 — Papéis do MMA + home real — ✅ **NO AR E NO GIT**

Banco e front promovidos em 2026-07-27. Deployment de produção:
`dpl_5zZQKzim74tSL6jZ3ykcJs5PQGQs` (`neo-4s8gituta` — inclui a correção do layout da jornada).

### Git: `main` = produção (2026-07-27)

`origin/main` estava **48 commits atrás** e produção rodava código que existia **só na máquina
local** — as duas rodadas (Nero de 26/07 e papéis de 27/07) nunca tinham sido enviadas. Resolvido:
`main == origin/main == produção` em `bb56bbd`.

Detalhe operacional que vale saber: `origin/main` tinha 22 commits de `automated hourly sync`
tocando só `locavia-dashboard/{sfmkt_data.json,src/data-meta.json}` — zero sobreposição com o
trabalho, então o merge foi limpo (commit de merge, sem rebase, sem force-push). E **o push NÃO
disparou deploy**: o projeto `neo-lm` não tem conexão git de auto-deploy, então o deployment
verificado permaneceu no ar. Deploy neste projeto é sempre explícito, via
`vercel deploy` + `vercel promote`.

As branches `feat/nero-porta-03` e `feat/mma-papeis-globais` seguem locais e já estão contidas em
`main` — podem ser apagadas quando quiser.

Rollback, se necessário: `vercel promote https://neo-k3c6lu88z-diegocaporusso-2820s-projects.vercel.app`
(o último anterior a esta rodada). **Atenção:** voltar só o front deixa o estado invertido —
o front antigo lê `squad_members.role='am'`, que não existe mais, e a homologação desaparece da
UI. Para reverter de verdade, rode também
`maturitymodel/supabase/rollback/20260726120000_portal_roles_DOWN.sql` e restaure
`squad_members` do backup. Isso **reabre o vazamento de diretório** — pense duas vezes.

### Verificado em produção

| | |
|---|---|
Migration, 11 pós-condições | **4 → 4** AMs globais · **2 → 2** admins · **41 → 41** vínculos |
Conferência independente | `portal_roles` 4 am + 2 admin · `squad_members` 32 member + 9 sm |
E2E do portal contra produção | **20/21** (o pulado é o que queima rate-limit, de propósito) |
Matriz de gate | `/` 200 · `/dash/` 302 · `/maturity/` 302 · `/nero/` 302 · `/api/data` 401 |
Bundle em produção | `my_portal_roles` presente · `is_portal_admin` **ausente** · home com "Fila do AM" |

### ⚠️ A janela entre migration e deploy (lição registrada)

Entre aplicar o banco e promover o front, **a homologação ficou indisponível na UI**: o front
antigo decide "é AM?" lendo `squad_members.role='am'`, valor que a migration eliminou. O banco
permitia (as policies usam `is_portal_am()`), a interface não.

Eu havia afirmado que o front antigo seguiria funcionando porque `is_portal_admin()` não mudou
de assinatura — certo sobre a função, **errado sobre o efeito**. Para mudanças futuras de papel:
**deployar o front ANTES ou junto**, nunca depois, quando o front antigo depende de um valor que
a migration remove. O caminho seguro é a migration ser retrocompatível (manter o valor antigo
lendo em paralelo) ou fazer os dois na mesma janela.

### Personas verificadas contra produção (2026-07-27)

`node maturitymodel/scripts/verify-personas.mjs cvkcngrmnfwupstyrpsd` — assume a identidade de
cada persona real (`set local role authenticated` + `request.jwt.claims` dentro de
`begin … rollback`) e mede o que ela **de fato** enxerga sob RLS. Não escreve nada.

Verdade absoluta: 10 squads · 7 ciclos · 3 em homologação · 32 pessoas.

| persona | papéis | squads | fila homolog. | diretório |
|---|---|---|---|---|
| admin | `["admin","am"]` | 10/10 | 3 | 32/32 |
| **AM** | `["am"]` | **10/10** | **3** | 32/32 |
| SM | `[]` | **3/10** | 2 (só dos dele) | **5/32** |
| sem vínculo | `[]` | **0/10** | 0 | **1/32** |

É a medição do bug original: antes o AM só via os squads em que era membro. Sem problema de
escopo, sem escalação (SM e member não satisfazem `is_portal_am()`), sem vazamento de diretório.

**Não existe persona `member` puro em produção**: as 4 pessoas com `member` são exatamente os 4
AMs, porque o colapso converteu as linhas `am` delas. Se aparecer um `member` sem papel global,
o script passa a cobri-lo automaticamente.

### Camada visual — verificada, e achou um bug (2026-07-27)

O Diego abriu a home logado como admin e mandou screenshot. A home entrega o que devia:
"Homologar o pacote · SF Vendas" como próxima ação, **"Precisa de você · 3 pendências"** listando
SF Vendas, Gol e Parati, a jornada com "Pré-sessão ✓" e o contador **3/5 etapas**, "Aguardando
homologação" e "Administração". Badge de 3 na sidebar. É o relato original resolvido.

**E revelou um defeito que nenhum teste automatizado pegaria:** a trilha da jornada quebrava em
duas linhas — `"05 Evolução"` caía desalinhado sob "Pré-sessão". Causa: `.home-journey` tinha
`grid-template-columns: repeat(4,1fr)` cravado, e a jornada passou a ter 5 etapas.

Corrigido com `grid-auto-flow: column` + `grid-auto-columns: 1fr` (as colunas derivam da
quantidade de etapas) e `grid-auto-flow: row` no `@media (max-width: 720px)` — sem esse reset os
passos ficariam lado a lado no celular. Medido no browser contra o CSS compilado: desktop 1440px
= 5 passos numa linha, colunas de 258px; mobile 390px = 5 linhas empilhadas, sem transbordo.
Confirmado no CSS servido em produção. Deployment `dpl_5zZQKzim74tSL6jZ3ykcJs5PQGQs`.

**Lição:** a jornada tinha o CSS como uma quarta opinião sobre "quantas etapas existem", além de
`CYCLE_JOURNEY`, `CYCLE_TRANSITIONS` e o trigger. As três primeiras já estão amarradas por
contrato (`test:journey`); o CSS agora simplesmente não opina.

### Falta fazer: as outras três personas na tela

Verificado por dado e autorização (tabela acima), **não** por renderização. Emitir sessão para
outra pessoa exige a `service_role` key, que ignora RLS — não vale o risco só para tirar
screenshot. O que ver ao logar como cada uma:

1. **admin** (Diego/Tiago) — vê "Fila do AM", "Todos os squads" e "Administração"; consegue
   reiniciar assessment e excluir squad; em `/admin`, a área "Papéis do portal".
2. **AM** (os 4 promovidos) — vê todos os squads e a fila; homologa; **não** vê `/admin`;
   reiniciar/excluir devem falhar.
3. **SM** — vê só os squads dele; roda pré-sessão e sessão; **não** vê a aba Homologação.
4. **member** — leitura do próprio squad, sem ação.
5. **Round trip**: pré-sessão → sessão → homologação → **devolver para sessão** (só AM) →
   homologar → oficializar → arquivar.

---

## Rodada 2026-07-26 (2ª) — detalhe técnico dos papéis do MMA

**Estado: pronto para aplicar.** A migration foi **executada de verdade** contra Postgres
(PGlite/WASM, sem Docker/nuvem/credencial): 51 migrations aplicam em ordem, a migração de dados foi
ensaiada e a matriz de papéis roda com **RLS real**.

| Suíte | Resultado |
|---|---|
| `test:rls-local` — papéis, jornada e migração de dados com RLS real | **59/59** |
| `test:migrations` — 51 migrations num Postgres limpo | **Schema OK** (50 aplicadas, 1 pulada: `pg_cron`) |
| `test:journey` — contrato TS × SQL da jornada | **21/21** |
| `lint` · `build` · `@neo/auth test` | 0 erros · ok · **77/77** |

**Nada foi aplicado em banco real ainda.** A produção do MMA segue com o modelo de 15/07.

### Como aplicar (um comando)

```bash
cd maturitymodel
export SUPABASE_ACCESS_TOKEN=...                      # PAT: supabase.com/dashboard/account/tokens
node scripts/apply-papeis.mjs cvkcngrmnfwupstyrpsd --check   # só leitura, seguro
node scripts/apply-papeis.mjs cvkcngrmnfwupstyrpsd --apply
```

`--check` já rodou contra produção em 2026-07-26 e passou: **4 AMs por squad** (em 32 vínculos),
**2 admins**, **0 AMs órfãos**. O `--apply` aplica a migration e depois confere 11 pós-condições,
incluindo `4 → 4` em `portal_roles(role='am')` e "nenhum vínculo de squad perdido (41 → 41)".
Ele **recusa** aplicar se houver AM sem e-mail, listando quem é.

A migration é **atômica** por este canal: sonda de `begin/create/commit` + `begin/create/rollback`
confirmou que a Management API honra controle transacional (2026-07-26). Se qualquer passo falhar,
nada é aplicado.

Backup do que a migration altera de forma destrutiva já está feito, no scratchpad da sessão:
`backup-pre-papeis/{squad_members_restore.sql, portal_admins_restore.sql, policies-antes.json}`
(41 linhas, 2 linhas, 62 policies). **Copie para um lugar durável** — o SO limpa o scratchpad.

Depois de aplicar: regenerar `src/integrations/supabase/types.ts` e deployar o front (a UI nova
chama `my_portal_roles()`).

### 🧨 Histórico de migrations dessincronizado (achado 2026-07-26)

`supabase_migrations.schema_migrations` em produção tem **46 registros**, e **6 migrations do repo
não estão nele**:

```
20260713120000_neo_access_allowlist          20260723120000_qualidade_software
20260715120000_portal_admins_scoped_roles    20260724130000_pre_session
20260715150000_fix_sm_am_privilege_escalation 20260726120000_portal_roles (ainda não aplicada)
```

As cinco primeiras **estão aplicadas** (verificado objeto por objeto), mas foram aplicadas por SQL
direto via Management API — caminho que não registra histórico. Há também `20260725113124`
registrada em produção e ausente do repo: é o **mesmo conteúdo** do `20260724130000_pre_session`,
aplicado pelo CLI com outro timestamp. Não é drift de schema, é divergência de numeração.

**Consequência prática: `supabase db push` está minado.** Ele tentaria reaplicar as cinco. O
`apply-papeis.mjs --apply` registra as seis no fim, deixando o histórico honesto e o `db push`
utilizável pela consultoria. Enquanto isso não rodar, **não use `db push` neste projeto.**

### Verificação de drift feita (produção × migrations)

Era a lacuna que o PGlite não fecha. Conferido objeto por objeto contra produção: `portal_admins`,
`pre_session_assessments`, `is_member`, `is_sm`, `is_am`, `shares_squad_with`,
`squad_members_role_check` — todos presentes como a migration assume; `portal_roles` ainda não
existe. **E o vazamento de diretório foi confirmado LIVE em produção** (a policy
`"Authenticated users can view all profiles"` existe), não era artefato do replay.

Documento completo do modelo: [`maturitymodel/docs/PAPEIS.md`](maturitymodel/docs/PAPEIS.md).

### O que motivou

Relato: *"salesforce vendas já testou, mas não aparece pra mim que preciso homologar."* Diagnóstico:
**seis causas somadas**, sendo a raiz o **AM ser papel por squad** — quem homologa só via os squads
em que era membro. Detalhe na PAPEIS.md §1.

### O modelo novo, em uma linha

`portal_roles(email, role in ('admin','am'))` = papel **global**; `squad_members.role in ('sm','member')`
= vínculo **local**. `po`/`tl`/`team` colapsados em `member` (não tinham consequência funcional: o voto
individual morreu na sessão colaborativa). AM vê tudo e homologa; **não** reseta, **não** exclui,
**não** gerencia membros.

### Onde exatamente parou — retomar por aqui

| # | Passo | Estado |
|---|---|---|
| 1 | Migration, rollback, front, 4 suítes de teste, docs | ✅ escrito |
| 2 | Migration **executada** em Postgres limpo (PGlite) | ✅ Schema OK |
| 3 | **Migração de dados ensaiada**: AM por squad → AM global, contagem confere | ✅ |
| 4 | Matriz de papéis + jornada ida e volta com **RLS real** | ✅ **59/59** |
| 5 | `types.ts` (editado à mão) conferido contra o schema real | ✅ asserção no `test:rls-local` |
| 6 | `lint` · `build` · contrato da jornada · `@neo/auth` | ✅ |
| 7 | Commitado em `feat/mma-papeis-globais` | ✅ 3 commits |
| 8 | **Backup** de `squad_members` + `portal_admins` + snapshot das 62 policies | ✅ (no scratchpad — **copiar para lugar durável**) |
| 9 | Drift produção × migrations conferido objeto por objeto | ✅ casa |
| 10 | Contagem de AMs no dado REAL (`--check`) | ✅ **4 AMs, 2 admins, 0 órfãos** |
| 11 | **Aplicar em produção** (`--apply`) | ⛔ **bloqueado pelo classificador** — escrita em banco de produção exige sua aprovação |
| 12 | Registrar as 6 migrations no histórico (o `--apply` faz) | ⛔ junto do 11 |
| 13 | Regenerar `types.ts` e conferir contra a versão à mão | ⛔ depois do 11 |
| 14 | Roteiro manual das 4 personas + round trip na UI | ⛔ depois do 11 |
| 15 | Deploy do front (a UI chama `my_portal_roles()`) | ⛔ depois do 11 |

⚠️ **Ordem entre 11 e 15 importa:** a UI nova chama `my_portal_roles()`, que só existe depois da
migration. Deployar o front antes deixaria a home fail-closed (o hook devolve `[]`, ninguém vê papel
global). Aplicar a migration antes do deploy é o caminho seguro — o front antigo não conhece
`portal_roles` e continua funcionando com `is_portal_admin()`, cuja assinatura não mudou.

⚠️ **O passo 9 ainda é o que protege as pessoas.** O ensaio em PGlite prova que a *lógica* de
migração converte todo AM por squad em AM global (`1 → 1` no cenário semeado) e que a migration
**aborta sozinha** se algum AM não tiver e-mail em `profiles` — testado. O que ele não pode saber é
**quantos AMs existem em produção**. Conferir no branch:
`select count(distinct user_id) from squad_members where role='am'` **antes** ×
`select count(*) from portal_roles where role='am'` **depois**.

⚠️ **O que o PGlite não cobre:** GoTrue (login/OTP), Realtime, Storage, `pg_cron`, e se o estado da
produção casa com a soma das migrations. Os passos 10 e 11 seguem necessários.

### Arquivos desta rodada

Novos: `maturitymodel/supabase/migrations/20260726120000_portal_roles.sql` ·
`maturitymodel/supabase/rollback/20260726120000_portal_roles_DOWN.sql` ·
`maturitymodel/src/hooks/usePortalRole.ts` · `maturitymodel/tests/journey-contract.ts` ·
`maturitymodel/tests/pg/{supabase-shim,apply-migrations,rls-local}.ts` ·
`maturitymodel/docs/PAPEIS.md`

**O harness `tests/pg/`** roda Postgres em WASM (PGlite) com uma camada mínima do Supabase
(`auth.uid()`, `auth.users`, `auth.jwt()`, papéis `anon`/`authenticated`/`service_role`). Serve para
qualquer trabalho futuro de RLS no MMA: `pnpm -C maturitymodel test:rls-local` exercita policies de
verdade em ~10s, sem Docker e sem tocar em banco nenhum. Os 4 scripts estão no CI.

Reescritos: `useMySquads.ts` · `useSquadRole.ts` · `useAdminData.ts` · `Inicio.tsx` · `AdminMMA.tsx` ·
`ProtectedRoute.tsx` (`RequireManager` → **`RequireAdmin`**) · `AppShell.tsx` · `SquadSwitcher.tsx` ·
`types/mma.ts` · `CycleJourney.tsx` · `tests/rls/rls-matrix.ts` · `ci.yml` · `App.tsx`

Removido: `maturitymodel/src/hooks/useIsPortalAdmin.ts` (substituído por `usePortalRole`).

### 🔒 Vazamento de privacidade achado e corrigido (pré-existente)

A policy legada `profiles."Authenticated users can view all profiles"` (`auth.uid() is not null`)
sobreviveu à limpeza de 15/07. **Policies somam com OR**, então ela **anulava** a `profiles_read`
restritiva: qualquer usuário autenticado lia **e-mail e nome de todas as pessoas**. O "diretório
fechado" registrado como IMPLEMENTADO em `ROLES-REDESIGN.md` nunca esteve fechado.

Também corrigido: `"Admins can update any profile"` dependia de `is_admin()` sobre a tabela **legada**
`user_roles` (não gerenciada) — uma linha esquecida ali dava poder de editar qualquer perfil. E as 4
tabelas do Maturity Model antigo tinham `for all to public using (true)`, e `public` inclui **`anon`**:
escrita com a chave anônima. Tabelas mortas (zero referências em `src/`), permissão fechada.

Três asserções novas impedem a volta, incluindo **nenhuma policy de escrita alcança `public`/`anon`**
em todo o schema.

### Defeitos pré-existentes corrigidos de passagem

- `restart_assessment` voltava para `'session'`, **pulando a pré-sessão** (que virou o início do ciclo em 24/07).
- `officialize_cycle` chamado 2× **duplicava os kaizens** — agora a 2ª chamada é recusada.
- `SquadSwitcher` mapeava status mortos (`voting`/`workshop`/`proposed`) e **não** tinha
  `pre_session`/`session`: renderizava `undefined` como rótulo nos dois estados reais de hoje.

### Dois erros MEUS que só a execução pegou

- **Ordem do `CHECK` de `squad_members.role`**: o `update ... set role='member'` rodava **antes** de
  derrubar o CHECK antigo, que não aceita `'member'` — falhava com `23514` e abortava a migration.
  Eu havia raciocinado sobre o CHECK novo e esquecido que o velho também barra.
- **`officialize_cycle` reescrito perdeu a geração de kaizens** (a etapa "Plano"), além da checagem de
  completude e do `homologated_by`. Peguei relendo o original antes de aceitar a própria reescrita.

Os dois viraram asserção. É o argumento a favor do harness em PGlite: revisão de código não pegou
nenhum dos dois.

### Defeito pré-existente NÃO corrigido (deliberado)

**`pnpm -C maturitymodel typecheck` não checa nada** — `tsconfig.json` tem `"files": []` +
`references`, e `tsc --noEmit` sem `--build` não compila projeto referenciado. Foi por isso que as
lacunas de `pre_session` passaram. Apontando para `tsconfig.app.json` aparecem **214 erros**, ~135
`TS2786` de `@types/react@19.2.17` vazando (nero-portal é React 19, MMA é React 18). **Nenhum é do
código novo** — verificado arquivo por arquivo. Não mexi porque script vermelho treina o time a
ignorar, e mexer na árvore de `@types/react` afeta os três apps. Diagnóstico pronto em PAPEIS.md §7.

---

## Rodada 2026-07-26 — Nero vira a porta 03 + costuras unificadas

Estado: **NO AR.** Cutover feito em 2026-07-26 ~21:45 UTC (domingo, janela de tráfego baixo).
`neo-lm.vercel.app` serve hub (`/`), Dash (`/dash`), Maturity (`/maturity`) e **Nero (`/nero`)**.
E2E contra produção: **21/21**.

Rollback, se necessário: `vercel promote https://neo-5cctm6lzl-diegocaporusso-2820s-projects.vercel.app`
(deployment de 25/07, o último anterior a esta rodada). **Não** usar os deployments marcados
"Production" de 6h antes do cutover — são staging `--skip-domain` e um deles tem o código da
Fase 2 que dá 500 em runtime.

### Dois bugs encontrados no cutover — pelo e2e, em produção

Ambos escaparam de todas as validações anteriores porque só aparecem com o **portal e o Nero
servindo juntos**, o que nenhum ambiente parcial reproduzia.

**1. `/nero/` servia o HUB.** O caminho com barra final não casava nem `/nero` nem
`/nero/:path*`, caía no catch-all `/((?!api/).*)` → `/index.html`. E a porta 03 aponta
exatamente para `/nero/`, então o Nero ficava inalcançável pelo caminho normal. Sem exposição
de dado (servia o hub). Corrigido com uma regra explícita `/nero/` no `vercel.json`.

**2. BYPASS DO GATE na rota índice do Nero.** `/nero/` com apenas `neo_session` servia a home
do Nero (24KB, título "Portal Nero"), **sem a senha**. Causa: o matcher do proxy
`/((?!...).*)`  **não casa a rota índice** — pegadinha conhecida do Next. As demais rotas,
estáticas e dinâmicas, redirecionavam corretamente (`/privacidade` e `/academia` são estáticas
e estavam certas), então não era estático vs dinâmico: era só o índice. A API já estava
protegida (401). Corrigido com `matcher: ["/", "/((?!...).*)"]`  — **não remover o `"/"`**.

A lição: o e2e pegou o bypass e o teste estava certo enquanto o código estava errado. Sem a
matriz logada rodando contra produção, isso teria ficado aberto para qualquer usuário
@lmmobilidade.

### O que mudou

| Frente | Resultado |
|---|---|
| **pnpm workspaces** | 5 lockfiles/installs → 1. Resolve a *causa* do npm#4828 (o `node_modules` isolado não faz o hoisting que derrubava o binário do rollup) em vez de contorná-la. Validado no builder Linux |
| **`@neo/auth`** | Contrato de sessão canônico (Web Crypto: roda em Edge, Node e Next) + **arnês de contrato** com 77 asserções |
| **Nero no monorepo** | `git subtree` (história preservada) + rewrite `/nero/**` + `basePath` |
| **Gate** | `api/tower.ts` → `api/gate.ts` com escopo (`tower`\|`nero`). Nero exige `neo_session` **E** `neo_nero` |
| **Porta 03** | Layout 2+1 no hub, selo "Acesso restrito", zero JS novo |
| **`@neo/design`** | Tokens compartilhados (só tokens, sem componentes) |
| **Review do Nero** | Primeiro da história dele: `docs/QA-REVIEW.md`, 5 corrigidos / 6 pendentes |
| **E2E do portal** | 20 casos de matriz de gate; gate pós-deploy, não por commit |
| **Migrations** | `db push` fora do build; baseline aplicado em produção com backup |
| **Docs** | `ARCHITECTURE.md`, `ONBOARDING.md`, `SECRETS.md` novos |

### O que morreu

- **Login próprio do Nero** (`APP_PASSWORD`): senha única compartilhada, cookie de 30 dias, e
  o token era HMAC de uma **constante** — sem `exp`, logo **não expirava de fato**. Sem
  rate-limit. Substituído por identidade do NEO + senha com TTL 12h, rate-limit e auditoria.
- **`api/tower.ts`**, absorvido pelo `api/gate.ts`.
- **`prisma db push` no deploy** — ver incidente evitado abaixo.
- **Gatilho de deploy no repo arquivado**: o projeto `nero-portal` ainda deployava de
  `diegocap2212/nero-portal`. Um push lá subiria o código antigo, que lê a `APP_PASSWORD`
  removida — Nero quebrado disparado por push num repo que todos consideram morto. Git
  desconectado.
- **`.gitignore` furado**: listava só `.env`, `.env.local` e `.env.private` nominalmente, então
  `.env.test.local` **não era ignorado**. Trocado por `.env*` + `!.env.example`.

### Incidente evitado: preview escrevendo em produção

Um deploy de **preview** do `nero-portal` rodou `prisma db push` **contra o banco de
produção**. Sem dano (schema idêntico → no-op), mas o mecanismo está provado: se a branch
tivesse mudança de schema, o preview a aplicaria em produção em silêncio, sem backup e sem
trilha. Duas causas somadas: `vercel-build` fazia `db push`, e as envs `POSTGRES_*` estão em
`Production, Preview` (mesmo banco nos dois ambientes).

Corrigido na raiz: `vercel-build` é `prisma generate && next build`, e schema muda por
`db:migrate`. Baseline `0_init` (17 tabelas, 0 DROP) aplicado em produção com backup
(`backup-pre-migrate-baseline`) e dados conferidos antes e depois (198/10/212 idênticos).

### Restrições de plataforma medidas (não folclore)

- **Funções da Vercel não resolvem código compartilhado.** Edge Middleware falha no deploy
  ("unsupported modules") tanto com bare specifier quanto com caminho relativo; function Node
  **passa no build e quebra em runtime** com `ERR_MODULE_NOT_FOUND`. Por isso `middleware.ts`,
  `api/session.ts` e `api/gate.ts` são autocontidos — e o arnês de contrato é o que impede as
  cópias de divergirem.
- **Streaming atravessa rewrite externa** sem buffering (medido: chunks incrementais,
  `chunked` e `no-store` preservados, ~150ms no primeiro byte). Era o risco que poderia ter
  invalidado a arquitetura toda.
- **`vercel env add ... preview` é impossível não-interativamente** na CLI 54: sem branch dá
  `git_branch_required`; com branch dá `branch_not_found`; com o Git desconectado, de novo
  `git_branch_required`. A CLI sugere um comando que ela própria rejeita.
- **`vercel env rm NOME preview` apaga a variável inteira**, produção incluída. Produção é
  write-only. Quase virou incidente — só não virou porque as URLs eram reconstituíveis pelo
  `neonctl`.
- **Deploy do Nero exige `--local-config nero-portal/vercel.json`**, senão a CLI usa o
  `vercel.json` da raiz e roda o build do portal dentro do projeto do Nero.

### Custo real do Nero (primeira medição)

**US$ 6,91 no mês corrente, 80 turnos → ~US$ 0,086/turno**, 34,5% do teto de US$ 20. Base de
198 registros em `UsageLog`. É o número que ancora o modelo de custo do blueprint enterprise.

### Antes de promover

1. Deployar o `nero-portal` com o código novo (`--local-config`), depois o portal.
2. Rodar o e2e com `NEO_FULL_STACK=1` (3 casos hoje pulados dependem disso).
3. Fluxos logados manuais: OTP → 3 portas → Nero pede senha → chat/estado/catálogo/report →
   logout.
4. Regressão da Torre (mudou de `api/tower` para `api/gate`).
5. **A rotação do `SESSION_SECRET` faz todos refazerem login no primeiro deploy do `neo-lm`.**

### Pendências desta rodada

- Envs de **Preview** do `nero-portal` apontando para a branch `preview` do Neon — exige
  dashboard (catch-22 da CLI). Deixou de ser urgente com o `db push` fora do build; hoje é
  defesa em profundidade.
- Arquivar `diegocap2212/nero-portal` no GitHub (o Vercel já não deploya de lá).
- Remover o projeto Vercel descartável `neo-lm-verify` (harness de validação desta rodada).
- Os 6 itens abertos em `nero-portal/docs/QA-REVIEW.md`.

---


> Plano corrente: `C:\Users\Usuario\.claude\plans\fable-precisamos-sincronizar-essas-frolicking-rainbow.md` (Portal unificado).
> **Estado (2026-07-14): PORTAL UNIFICADO NO AR — cutover concluído.** `https://neo-lm.vercel.app` serve hub (`/`), Dash (`/dash`) e MMA (`/maturity`); domínios antigos respondem 308 para as rotas novas.

## Portal único (arquitetura nova)

- **1 projeto Vercel (`neo-lm`), deploy da RAIZ do monorepo.** Hub em `/`, Dash em `/dash/**`, MMA em `/maturity/**`, functions em `/api/**` (movidas da pasta do dash para a raiz), `middleware.ts` (Edge) na raiz.
- **Build composto:** `corepack pnpm build:portal` (`scripts/build-portal.mjs`) — 3 Vite builds (`--base=/dash/`, `--base=/maturity/`) compostos em `dist/`.
- **Workspace pnpm** (`pnpm@11.17.0` em `packageManager`): UM lockfile na raiz (`pnpm-lock.yaml`), `pnpm-workspace.yaml` declarando os apps e `packages/`. `pnpm` não está no PATH — use `corepack pnpm`. ~~SEM npm workspaces (hoisting quebrava binário linux do rollup — npm#4828); na Vercel cada app roda `npm ci` com o próprio lock.~~ **Obsoleto desde a migração para pnpm**: não existe nenhum `package-lock.json` no repo (removido no commit `c5393c2`), e `npm ci` numa pasta de app cria `node_modules` divergente do lockfile.
- **Auth same-origin:** sessão Supabase única no localStorage da origem. Fragment handoff (`#neo_at`) e postMessage do iframe REMOVIDOS. Iframe Metricas → `/dash/time/:id?embed=1` same-origin.
- **Gate server-side:** login no hub → `POST /api/session` → cookie `neo_session` (HMAC, 12h, HttpOnly). `middleware.ts` exige o cookie para TUDO sob `/dash`/`/maturity` (HTML+assets); sem ele → 302 `/?next=`. Hub segue `?next` interno após login. Logout = `DELETE /api/session` (hub, dash e MMA).
- **Torre restrita:** `/dash/torre` (comparativo SM×SM/time×time, saiu da home) — senha na env `TOWER_PASSWORD` validada em `api/gate.ts` (`POST /api/gate?scope=tower`; era `api/tower.ts`, unificado) → cookie `neo_tower` 12h, assinado com subchave HKDF de propósito `tower`. Senha de produção gerada em 2026-07-14 (mostrada 1x ao Diego).

## Cutover — CONCLUÍDO (2026-07-14)

1. ✅ Envs copiadas do projeto antigo → neo-lm Production: `BLOB_READ_WRITE_TOKEN`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`. **`CRON_SECRET` e `GITHUB_*` estavam VAZIAS no projeto antigo** — trigger-sync/refresh-dispatch nunca estiveram ativos; não há cron externo a migrar (o sync é GitHub Actions no repo antigo, grava direto no Blob).
2. ✅ Diego testou o staging logado (login OTP → doors → apps → Torre) e aprovou.
3. ✅ `vercel deploy --target=production --skip-domain` (dpl neo-121l8d5u8) + smoke → `vercel promote` — domínio virado.
4. ✅ Redirects 308 publicados nos 2 projetos antigos (pastas `redirects/*`; incluem regra explícita para `/` — o matcher `/:path*` não casa a raiz).
5. Supabase: allowlist de redirect com origens antigas — inócua (OTP por código); limpar quando conveniente.

## Infra/envs já feitas no neo-lm

- Production: `VITE_SUPABASE_*` (pré-existentes), `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SESSION_SECRET` (novo, 32B), `ALLOWED_ORIGIN`, `TOWER_PASSWORD` (gerada). Preview: bug do CLI (`git_branch_required`) impediu env add não-interativo — a validação foi via staging `--skip-domain` (usa envs de Production).
- **Protection Bypass for Automation** habilitado no neo-lm (testes HTTP em deployments SSO-protegidos): header `x-vercel-protection-bypass`.
- Raiz linkada ao projeto neo-lm (`.vercel/`); `neo-hub/.vercel` antigo ainda existe (limpar).

## Staging validado (2026-07-14)

`GET /` 200 (hub) · `/dash/`, `/maturity/`, rotas profundas e ASSETS → 302 `/?next=` · `/api/data` 401 sem Bearer · `POST /api/session` 401 · `GET /api/tower` 401 · HMAC Node↔WebCrypto testado (válido/expirado/adulterado/secret errado). Falta só o leg logado (item 2 acima).

## Incidente do hourly-sync (2026-07-14/15) — RESOLVIDO

O cutover matou o gatilho do sync: cron-job.org chamava `locavia-dashboard.vercel.app/api/trigger-sync`,
que virou redirect 308 (function não existe mais lá). **Fix aplicado:** `schedule: */30 * * * *` nativo
restaurado no workflow do repo `diegocap2212/locavia-dashboard` (commit `7692648`) — sync autossuficiente,
sem cron externo. Run manual de validação: success (2026-07-15T00:23Z). O job do cron-job.org pode ser
DESATIVADO na conta do Diego (hoje só recebe 308). `/api/trigger-sync` no portal segue fail-closed sem
`CRON_SECRET` — sem função ativa; remover na Fase 3c se ninguém for usá-lo.

## Planos para execução apartada (2026-07-14)

- `docs/QA-PLAN.md` — code review profundo + matriz de testes + debug/observabilidade + aceite.
- `docs/SECURITY-PLAN.md` — cybersecurity (insider/offboarding/segredos/headers/supply chain).
- `maturitymodel/docs/ROLES-REDESIGN.md` — SM por squad + admin global; tem 4 QUESTÕES ABERTAS para o Diego (§5) antes de implementar.
- Achados já conhecidos aguardando correção (estão nos planos): `frame-ancestors` só no `/dash` (hub/maturity sem anti-clickjacking), policies legadas de `teams` no MMA.
- ✅ **RESOLVIDO 2026-07-27** — "monorepo sem espelho remoto (backup!)": `origin/main` estava 48 commits atrás e produção rodava código que existia só na máquina local. Agora `main == origin/main == produção` (`bb56bbd`).
- ✅ **RESOLVIDO 2026-07-26** — Torre sem rate-limit de senha: `api/gate.ts` tem rate-limit Upstash por IP e escopo.

## Roles do MMA — IMPLEMENTADO E NO AR (2026-07-15)

> ⚠️ **É este modelo que está em produção hoje**, mas ele é **substituído** pela rodada de 26/07
> (2ª), no topo deste arquivo — `portal_admins` → `portal_roles`, AM passa a ser global,
> `po`/`tl`/`team` → `member`. O código novo está pronto e **não aplicado**. Não parta desta seção
> para mexer em papéis: leia [`maturitymodel/docs/PAPEIS.md`](maturitymodel/docs/PAPEIS.md).

Migration `20260715120000_portal_admins_scoped_roles.sql` aplicada em produção (Management API) e
front promovido (dpl `neo-m03zmhx8t`). Admins globais por e-mail de login: `ext.diego.caporusso@`
e `ext.tiago.massaro@lmmobilidade.com.br` (backup) — tabela `portal_admins`/`is_portal_admin()`.
SM/AM só veem/gerenciam os próprios squads; restart/exclusão/conteúdo/criação = só admin;
diretório de profiles fechado (RPC `find_profile_by_email`); views `v_*` com `security_invoker`
(bypass de RLS corrigido). Front: `RequireManager`, AdminMMA em 2 modos. Junto foi o hardening
da sessão apartada de QA (headers globais, rate-limit Torre via KV, no-store, remoção do cookie
legado das functions, cache em memória no /api/data) + fix do 302 imutável do middleware.
Detalhes: `maturitymodel/docs/ROLES-REDESIGN.md`.

## QA profundo — correções aplicadas (2026-07-15)

Rodada de fixes a partir do relatório do QA externo (`docs/QA-PLAN.md`). **Código no repo; falta
aplicar a migration no banco, deployar e validar os fluxos logados (ver "Pendências").**

- **Escalada SM→AM (CRÍTICO):** migration `20260715150000_fix_sm_am_privilege_escalation.sql` —
  `sqm_write` passa a exigir admin global OU AM existente do squad para gravar `role='am'`; SM
  não se auto-promove. UI (`AdminMMA`) esconde o papel `am` de quem não é admin global.
- **Fail-open → fail-closed em produção:** middleware, `api/data`, `api/comments` e `api/tower`
  agora NEGAM quando a env some (`VERCEL_ENV==='production'`); dev/preview seguem abertos (paridade).
- **/api/comments:** validação de tipo/tamanho (ids ≤200, gap/action ≤4000). Autz segue por sessão
  NEO (qualquer @lmmobilidade escreve — ferramenta interna; sem membership por squad no Dash).
- **Cookie malformado:** `decodeURIComponent` com try/catch no middleware e no tower (fim do 500).
- **Rate-limit da Torre:** `EXPIRE` em toda tentativa (elimina lockout permanente se o INCR criasse
  a chave e o EXPIRE falhasse). Ainda é por-IP (NAT corporativo pode agrupar tentativas — aceito).
- **trigger-sync:** valida método antes da auth (PUT→405, não 401).
- **CSP completa** no `vercel.json` (`default-src 'self'`, `connect-src` só self+supabase, `object-src none`,
  `frame-ancestors 'self'` já cobria todas as rotas). `script/style-src` mantêm `'unsafe-inline'` (SPA Vite
  tem script inline de tema + Google Fonts) — endurecer via hash/externalização é hardening futuro.
- **OpenAPI** (`locavia-dashboard/src/api-docs/openapi.ts`): reflete Bearer (JWT Supabase) + `neo_session`;
  removidos `/api/login`/`dash_session`/senha-HMAC.
- **E2E do Dash:** 5/5 verdes de novo (headings/labels desatualizados corrigidos; `ContextJourney` era
  componente morto). `browserslist`/caniuse-lite atualizado nos 4 apps. ApiDocs (1.39MB) e recharts já
  eram chunks lazy — só carregam sob demanda.
- **CI:** `.github/workflows/ci.yml` — typecheck/lint/build/test por app em push/PR.
- **Matriz de RLS:** `maturitymodel/tests/rls/rls-matrix.ts` (4 identidades; regressão da escalada).
  Precisa de branch Supabase + service_role para rodar (`npx tsx tests/rls/rls-matrix.ts`).
- **Monorepo sem backup:** o remoto `diegocap2212/argo` existe mas está VAZIO (nunca recebeu push) —
  por isso `origin/main [gone]`. Push do main resolve o backup.

Achados avaliados como NÃO-vulnerabilidade (design): senha da Torre protege a VISUALIZAÇÃO, não o
`/api/data` (mesmo dataset que qualquer usuário NEO já acessa — Torre é reorganização, não segredo novo).
Se o comparativo SM×SM virar sensível, mover o cálculo server-side atrás do cookie `neo_tower`.

## Saúde dos times recalibrada (2026-07-15) — NO AR

Critério de saúde (`locavia-dashboard/src/performance/health.ts`) estava marcando quase todo time
como Crítico (contagem plana de 5 riscos com gatilhos quase sempre ligados). **Afrouxado
temporariamente** para a janela de release (dpl `neo-p6w8r0qwf`): aging por proporção (>40% do WIP
e ≥5 itens), leadTime P85 >45d, flowBalance >max(5, saída×0,5), previsib. <60%; `dataQuality`
removido (flag morto); novo status **"Sem dados"** para times sem entregas/WIP (não são mais
"Saudável"). Efeito: Crítico 5→0, Nivus→Atenção. UI ganhou motivos no hover + legenda do critério.
Limites/labels centralizados em `health.ts` (eram duplicados em 3 telas). **REAPERTAR quando a
operação normalizar** (voltar `HEALTH_THRESHOLDS`). Smoke test logado do board ficou pendente
(sessão expirou; validado localmente por auditoria no dataset real + E2E).

## Validação do SECURITY-PLAN.md (2026-07-15) — NO AR

Checklist validado item a item contra o estado real (não só leitura de doc). Vários já
estavam corrigidos (confirmado por query direta ao banco): `is_any_am()` morto em produção,
views com `security_invoker`, clickjacking global, CSP, rate-limit da Torre. Achado novo e
grave fora do radar do plano original: **`diegocap2212/locavia-dashboard` estava PÚBLICO**
e continha `sfmkt_data.json` com dados reais do Jira (nomes de assignee, sumários de card) —
vazamento de dado, não só de código. Ações aplicadas (dpl `neo-qmsixjhdd` + `neo-5wv4d7tpt`):

- Repo tornado **privado**.
- `xlsx` removido (Dash + MMA) — vuln alta sem fix no npm, nunca importada em código.
- `npm audit fix` (sem `--force`) → **0 vulnerabilidades em deps de produção** nos 2 apps.
- GitHub Actions pinadas por SHA (`actions/checkout`, `actions/setup-node`) no monorepo
  **e** no repo externo que roda o cron de verdade.
- Dependabot (npm + github-actions) nos 2 repos.
- Torre loga e-mail de quem acessa (logs da Vercel, nunca em resposta HTTP).
- **`TOWER_PASSWORD` rotacionada** (a antiga havia passado pelo chat) — valor novo gerado e
  injetado direto na Vercel, nunca impresso; envs de Production já vêm *Sensitive* por
  padrão neste CLI. **Pegar o valor novo em**: dashboard Vercel (neo-lm → Settings →
  Environment Variables → Production) ou `vercel env pull` local.

Pendente (só você pode fazer): revogar os tokens Supabase `sbp_a5f2...` (2026-07-14) e
`sbp_6ac9...` (2026-07-15, usado nesta sessão) em supabase.com/dashboard/account/tokens;
rotacionar senha de app do Gmail e API key do Resend. 2FA nas contas (Vercel/GitHub/
Supabase/cron-job.org) e escopo do `GITHUB_DISPATCH_TOKEN` seguem só verificáveis manualmente.

## Pendências pós-cutover
2. **E-mail OTP:** mitigado (código no assunto, remetente "NEO — LM Mobilidade", OTP 1h, reenvio com cooldown no hub). Definitivo = Resend: 3 registros DNS em lmmobilidade.com.br pendentes + trocar SMTP (hoje Gmail pessoal).
3. **Rotacionar segredos que passaram pelo chat:** token Supabase `sbp_a5f2...` (2026-07-14), senha de app do Gmail, API key antiga do Resend.
4. Fase 3c: remover ramo cookie legado (`dash_session`/`DASHBOARD_PASSWORD`) das functions + `openapi.ts`.
5. ~~`.env.example` dos apps citam `VITE_HUB_URL`/`VITE_MMA_ORIGIN`~~ — limpo em 2026-07-15.
6. ~~Aplicar `20260715150000` no banco~~ — **aplicado em produção 2026-07-15** (Management API, 201); policy `sqm_write` verificada com `role<>'am'`.
7. ~~Deployar as mudanças~~ — **deployado 2026-07-15** (dpl `neo-kfnpuc6h4`, aliased `neo-lm.vercel.app`). Fluxos logados validados: Dash+dados (`/api/data` 200, ~5,77 MB / ~579 KB gzip), detalhe do time (5 abas/16 gráficos), MMA+iframe same-origin (`/dash/time/GOL?embed=1`, 0 erros CSP), Torre (senha OK → comparativo), logout → `/dash/` re-bloqueado (302). Smoke não-auth: `/` 200, `/dash/` 302, `/api/data|tower` 401, `PUT /api/trigger-sync` 405, cookie malformado sem 500, CSP completa presente. **Falta só a matriz RLS automatizada** (`rls-matrix.ts`) — destrutiva, rodar em branch Supabase.
8. ~~Push do monorepo para `origin`~~ — **feito 2026-07-15** (`origin/main` restabelecido).

## Pegadinhas

- `supabase config push` reseta `[auth]` — config SMTP/allowlist foi via Management API.
- Deploy do portal: NUNCA `npm run build` do dash no build composto (roda sync:sfmkt e exige credenciais) — o script usa `tsc -b && vite build`.
- `vercel env add NAME preview --value X --yes` está quebrado no CLI 54 (catch-22 `git_branch_required`); usar o dashboard ou API com PAT.
- Redis (Upstash) usado por `api/comments.ts`. `verifyBearer` duplicado inline nas functions de propósito (Vercel não bundleia imports entre functions).
- Sem `SESSION_SECRET` o middleware é fail-open (paridade com dev) — obrigatória em produção.

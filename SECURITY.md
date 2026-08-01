# Segurança — Portal NEO

**Owner:** Diego Caporusso · **last_verified_at:** 2026-07-27

Este arquivo lista as **propriedades de segurança que o sistema afirma ter** e, para cada uma,
**onde ela é imposta** e **qual teste a prova**. Uma propriedade sem teste está marcada como tal.

> A regra que dá sentido ao documento: **afirmação sem teste é aspiração.** O motivo de este
> arquivo existir foi um code review encontrar garantias declaradas que o código não sustentava —
> função "protegida" acionável com credencial pública, typecheck verde que não compilava a
> aplicação, dado velho rotulado como fresco. Ver
> [`docs/FULL-CODE-REVIEW-2026-07-27.md`](docs/FULL-CODE-REVIEW-2026-07-27.md).

## Como reportar uma vulnerabilidade

Diretamente ao owner acima (e-mail interno). **Não abra issue pública** e não inclua credencial no
corpo da mensagem. Se a vulnerabilidade envolver um segredo exposto, trate como incidente: rotação
primeiro, análise depois, e registre em [`SECRETS.md`](SECRETS.md) com `revogado_em`, responsável,
substituto e evidência de teste.

---

## 1. Identidade e sessão

| Propriedade | Onde é imposta | Teste que prova |
|---|---|---|
| Só quem está na allowlist NEO obtém sessão | `POST /api/session` valida Bearer do Supabase + RPC `is_neo_allowed()` | — *(depende de banco; verificado manualmente no cutover)* |
| `/dash/**` e `/maturity/**` exigem cookie `neo_session` para **tudo** (HTML e assets) | [`middleware.ts`](middleware.ts) (Edge) | `pnpm test:portal` (Playwright, exige deployment) |
| Cookies sensíveis são `HttpOnly`, `Secure`, `SameSite=Lax`, com expiração real (12h) | `api/session.ts`, `api/gate.ts` | `pnpm --filter @neo/auth test` — **96 checks** |
| Falta de `SESSION_SECRET` em produção **fecha** o gate (503), não abre | [`middleware.ts:110-118`](middleware.ts#L110-L118) | `pnpm --filter @neo/auth test` |
| Um token não serve para outro propósito | **Subchaves HKDF-SHA256** por propósito (`neo_session`/`tower`/`nero`), salt `neo-portal/token-subkey/v1` | `pnpm --filter @neo/auth test` — inclui **teste negativo de confusão de token** |

Sobre o HKDF: a proteção **não** é o campo `purpose` no payload — é a chave. Um token de sessão não
verifica no gate da Torre porque a derivação usa `info` diferente, então a assinatura simplesmente
não fecha. Antes havia uma chave só, e o teste de contrato do pacote *afirmava* que um token da
função de sessão passava no verificador do gate. Esse caso virou o teste negativo.

**Severidade honesta:** os cookies são `HttpOnly`/`Secure`/`SameSite=Lax` na mesma origem, então
explorar a confusão de token já exigia o cookie jar da vítima ou XSS. Isto é defesa em
profundidade, não porta que estava aberta.

**⚠️ Consequência operacional:** trocar a derivação **invalida todas as sessões vivas**. Avisar o
time antes de subir.

## 2. Autorização

| Propriedade | Onde é imposta | Teste que prova |
|---|---|---|
| Papéis do Maturity (SM/AM/admin, escopo por squad) são impostos no **banco**, não na UI | RLS + `is_portal_am()`, `is_portal_admin()`, `is_member(team_id)` | `pnpm --filter maturitymodel test:rls-local` — **88 checks** em Postgres efêmero |
| Todas as migrations aplicam em ordem, num banco limpo | `supabase/migrations/` | `pnpm --filter maturitymodel test:migrations` — 55 aplicadas, 2 puladas (`Schema OK`) |
| Homologação só por AM, sobre ciclo em homologação, com `cycle_id`/`dimension_id` imutáveis | policy `homolog_update` (migration `20260727150000_fix_homolog_update.sql`) | `test:rls-local` |
| O sync de âncoras exige **usuário autenticado com papel** | `sync-anchors-user` valida JWT e chama as funções SQL de papel | `test:rls-local` cobre as funções SQL; a fronteira HTTP **não tem teste automatizado** ⚠️ |
| O cron do sync exige secret exclusiva, não a anon key | `sync-anchors-cron` + `ANCHOR_SYNC_CRON_SECRET` (Vault) | *(sem teste automatizado)* ⚠️ |
| `service_role` só grava **depois** de a autorização passar | `functions/_shared/authz.ts` | revisão de código |

Este era o achado P0 do review: a função `sync-anchors` única recebia `service_role` por env e
**autorizava com ela**. O cron versionado a chamava com o JWT `anon` — que é público, e estava
hardcoded na migration. Qualquer portador da anon key disparava carga no Jira e escrita
privilegiada no banco de qualquer squad. A função foi partida em duas justamente para que a
fronteira de autorização seja diferente em cada caminho.

## 3. Integridade do dado apresentado

| Propriedade | Onde é imposta | Teste que prova |
|---|---|---|
| `Resolved` é **sempre** o `resolutiondate` do Jira — nunca inventado | `sync/metrics-calculator.ts`, `src/performance/trends.ts` | `pnpm --filter locavia-dashboard test:sync` — **32 invariantes** |
| O fallback de `/api/data` se declara (`source: 'fallback'`, `syncedAt: null`) | [`api/data.ts`](api/data.ts) | `test:sync` |
| Nenhum item é contado em dois períodos consecutivos | `src/performance/period.ts` — intervalos `[start, end)` | `pnpm --filter locavia-dashboard test:performance` |
| Um só predicado de descarte em todos os consumidores | `src/performance/discard.ts` | `test:sync` + `test:performance` |
| Previsão é determinística (PRNG com seed do dataset) | `src/performance/montecarlo.ts` | `test:sync` |
| O dataset não é publicado se o **conjunto** estiver inconsistente | `sync/dataset-contract.ts` | `test:sync` |
| Métrica que depende de changelog declara quando o histórico é parcial | `DataQuality.historyComplete` + regra `historico-parcial` | `test:sync` |
| As fórmulas das âncoras do Jira | `functions/_shared/anchor-sync.ts` | `pnpm --filter maturitymodel test:anchors` — **17 checks** |

Integridade de dado está nesta lista porque, neste produto, **número errado é um problema de
segurança de decisão**: o dashboard alimenta avaliação de squad e conversa de gestão.

## 4. IA (Nero)

| Propriedade | Onde é imposta | Teste que prova |
|---|---|---|
| Só modelos da allowlist são chamados; env inválida **aborta** em produção | `NERO_MODELS` + `isNeroModelId` em `src/lib/nero/core.ts` | `pnpm --filter nero-portal test:core` — **88 checks** |
| PII é redigida/pseudonimizada antes de sair do perímetro | `src/lib/nero/redact.ts` | `test:core` |
| Dado recuperado é delimitado como **não confiável**, com precedência explícita | `src/lib/nero/chat-slots.ts` | `test:core` |
| Tools são limitadas por rota/escopo, independente do que o modelo pede | `src/lib/nero/tool-policy.ts` | `test:core` |
| O cliente não forja mensagem `assistant` nem estoura o histórico | `src/lib/nero/chat-input.ts` | `test:core` |
| Custo é **reservado antes** do turno, sob lock, com teto global e por identidade | `src/lib/nero/usage.ts` (`pg_advisory_xact_lock`) | `pnpm --filter nero-portal test:state` (**escreve no banco** — só base descartável) |
| Toda escrita de estado gera `StateVersion` (auditoria/undo) | `src/lib/state/mutations.ts` | `test:state` |

**Trade-off consciente:** a *leitura* do gasto acumulado é fail-open — se o Postgres cair, o Nero
responde em vez de recusar. Teto é controle de custo, não de segurança. A **reserva** é fail-closed.

**Copy alinhada ao comportamento:** a página de privacidade dizia "nunca PII" enquanto o contexto
enviava `Stakeholder.nome`, `Decision.quem`, `Risk.dono` e conteúdo de documentos. A copy foi
corrigida para descrever o que o sistema faz — não o contrário.

## 5. Segredos e supply chain

| Propriedade | Onde | Teste |
|---|---|---|
| Nenhum segredo entra no bundle ou no repositório | `.gitleaks.toml` + job no CI | `.github/workflows/ci.yml` (gitleaks) |
| SAST em todo push/PR | CodeQL (js/ts), `security-and-quality` | `ci.yml` — achado **falha o job**, mas **não aparece na aba Security** (ver abaixo) |
| CVEs conhecidos são vistos | `pnpm audit` + SBOM | `ci.yml` |
| Actions fixadas por SHA | `.github/workflows/*` | revisão de código |

**Limitação do CodeQL neste repositório.** A análise roda e cobre tudo (na primeira execução
real: 290/290 arquivos TS e 10/10 JS), mas **o resultado não vai para a aba Security**: publicar
exige Code Scanning habilitado, e Code Scanning em repositório **privado** exige **GitHub
Advanced Security**, que é pago. O SARIF é então consumido pelo próprio job — achado novo **falha
o CI** e imprime regra, arquivo e linha no log, e o arquivo fica como artefato por 30 dias.

O que se perde sem GHAS: a UI de triage, o histórico entre execuções, o "dismiss" com
justificativa, e alerta em PR na linha do código. O que **não** se perde: o gate. Se o GHAS for
contratado, trocar para `upload: true` e remover o passo de checagem local (instruções no próprio
`ci.yml`). Deixar `upload: true` sem GHAS é pior que não ter o job — é vermelho permanente, que
ensina o time a ignorar CI vermelho.

**O gate falha em achado NOVO, não em achado existente.** Os 6 pré-existentes estão em
[`.codeql-baseline.json`](.codeql-baseline.json), **cada um com o motivo de ser aceito** — foram
lidos um a um e nenhum é defeito (SHA-256 para igualar comprimento antes de `timingSafeEqual`;
scripts de operador que leem `.sql` vindo de `argv`; o sync gravando a resposta do Jira em caminho
constante, com escrita atômica). Se não dá para escrever o motivo, é defeito e se corrige — não se
baselina. Quando a contagem real fica **menor** que o baseline, o CI **avisa** (não falha) para a
entrada encolher junto: baseline que nunca encolhe apodrece até virar allowlist geral.

Duas coisas que o CodeQL pegou e o resto do tooling não pegaria, e que justificam ele existir aqui:
um import morto num arquivo (`tests/` da raiz) que **não está em nenhum escopo de lint**, e outro
cujo nome aparecia num **comentário** — um guard por `grep -c` responderia "está em uso".

**Aberto por decisão, não por descuido:** `vite >=6.4.3` (dev-server only, major 5→6) e
`react-router >=8.3.0` (CSRF em RSC; o app não usa RSC, major 6→8). Reavaliar em janela de upgrade.

**Rotações pendentes** — só um operador fecha: ver a tabela em [`SECRETS.md`](SECRETS.md).

## 6. O que ainda NÃO tem garantia

Registrado aqui em vez de omitido:

- **Fronteira HTTP das Edge Functions sem teste automatizado.** A matriz de papéis está testada no
  banco; o "anon → 401, membro fora do squad → 403, SM do squad → 200, cron sem secret → 401"
  depende de deployment e não roda no CI.
- **Backup/restore nunca exercitado.** Sem RPO/RTO medido, sem retenção definida para `UsageLog`,
  `StateVersion`, reports e documentos. Bloqueado por acesso a console (Neon/Vercel).
- **Preview do Nero não é isolado** do banco de produção por branch dedicada do Neon.
- **`sync-anchors` ainda usa `expand: changelog`**, que não garante histórico completo por issue —
  o Dashboard migrou para `bulkfetch`, o Maturity não. Mitigado (a detecção de `everDone` é robusta
  a truncamento), não resolvido.
- **Comentários do Dashboard não têm autoria.** Qualquer usuário NEO escreve comentário de qualquer
  squad, e grava-se só `updatedAt` do servidor. É decisão documentada no código, mas quem confia no
  comentário como registro precisa saber.
- **`script-src 'unsafe-inline'`** no portal — eliminar exige nonce/hash no build composto.

### 6.1 O gate da Torre é de interface, não de dado (31/07/2026)

A senha da Torre (`TOWER_PASSWORD`) foi substituída pela permissão `dash.tower.view`, decidida
server-side no `/api/data`. **O ganho é identidade e offboarding, não confidencialidade.**

O comparativo entre agilistas é calculado **no cliente** (`src/performance/smComparison.ts`) a
partir dos mesmos `items` que qualquer sessão autenticada baixa do `/api/data`, cruzados com
`src/config/sm-config.ts` — que é config estática do bundle, usada também pelo `App.tsx` e pelo
`AppShell.tsx`. O plano do RBAC previa "omitir do payload os campos que alimentam o agregado";
ao medir, **não existem tais campos**: o que alimenta o agregado é o campo de time (de que o
Dash inteiro depende) mais um mapa que já está no JavaScript entregue ao browser.

Portanto: quem tem sessão no NEO e sabe abrir o DevTools consegue reconstruir o comparativo,
com ou sem a permissão. Isso já era verdade quando a trava era senha — a revisão de 31/07 é que
o disse em voz alta.

**O que fecharia de verdade:** `/api/data` devolver apenas os itens dos times que a pessoa pode
ver. É mudança do contrato de dados do Dash e altera o que TODO mundo enxerga hoje.

### DECISÃO TOMADA (Diego, 2026-07-31): fica aberto, e é intencional

Perguntado explicitamente, com as duas opções na mesa, o dono do produto **optou por manter o
Dash transparente**. Não é dívida, não é esquecimento e **não é para ser "consertado" por quem
passar por aqui**: no Performance Dash, qualquer pessoa com acesso ao NEO vê todos os times, e o
comparativo por agilista é derivável por qualquer uma delas.

Consequências que decorrem disso e que precisam ser ditas em voz alta:

- Dado de performance por time e por agilista **não é confidencial dentro da empresa**. Quem
  publicar métrica ali deve assumir audiência = todo o NEO.
- `dash.tower.view` é organização de interface (quem vê a tela pronta), não confidencialidade.
- Se um dia entrar no Dash um dado que NÃO possa ser assim, esta decisão tem de ser revista
  ANTES — não depois. O recorte por time no `/api/data` é o caminho, e o custo é mudar o que
  todo mundo enxerga hoje.

O recorte por squad **existe e funciona no MMA** (`mma.squad.read` é permissão de squad, então
SM e member só enxergam os seus). A assimetria entre as duas ferramentas é deliberada.

### 6.2 Fail-open em preview segue nos gates ANTIGOS

`middleware.ts`, `api/gate.ts` e `isNeoAuthed` fecham só quando `VERCEL_ENV === 'production'`:
em preview, env ausente **libera**. É o achado NEO-004 da revisão de 31/07 e continua aberto.

O `api/authz.ts`, criado nessa mesma rodada, **não** repete o padrão: fecha em todo ambiente e
tem uma saída de desenvolvimento (`NEO_AUTHZ_DEV_ALLOW=1`) que é impossível na Vercel, porque
exige `process.env.VERCEL` ausente. Serve de modelo para quando os outros três forem corrigidos.

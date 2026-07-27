# Code review completo — Portal NEO, Dashboard, Maturity e Nero

**Data da revisão:** 27/07/2026  
**Escopo:** monorepo `argo`, da borda do Portal NEO até cada aplicação, banco, integrações, IA, segredos, CI/CD, documentação e operação.  
**Postura desta rodada:** somente leitura, testes e produção deste relatório. Nenhuma correção foi aplicada.

---

## 0. LEIA ANTES DE CITAR QUALQUER SEÇÃO — validação de 27/07/2026

Este relatório foi **validado achado por achado contra o código** no mesmo dia, e a correção
começou logo depois. Duas consequências para quem lê:

1. **Sete achados estavam imprecisos** (§0.1). Citar as seções originais como fonte propaga erro.
2. **A maior parte do que está descrito aqui como "presente" já foi corrigida** — o estado corrente
   está em [`HARDENING-EM-ANDAMENTO.md`](HARDENING-EM-ANDAMENTO.md), não aqui. Este documento é o
   **diagnóstico** e permanece intacto abaixo de propósito, para que se possa auditar o raciocínio.

O veredito da validação é que **o review está substancialmente correto**, inclusive nos números:
os `201 erros de tipo em 43 arquivos` do Maturity foram reproduzidos exatos. As sete correções
abaixo são de precisão e de severidade — nenhuma derruba a tese central.

### 0.1 Correções ao relatório

| # | Seção | O que o review diz | O que o código mostra |
|---|---|---|---|
| 1 | §4.5 | `comments.ts` não valida tamanho; JSON malformado pode virar 500 | **Valida:** `MAX_ID_LEN=200`, `MAX_TEXT_LEN=4000` em [api/comments.ts:147-156](../api/comments.ts#L147-L156). `body \|\| {}` cobre nulo; o 500 é o catch do Redis. O achado real, menor, é **ausência de autoria**: grava-se só `updatedAt` do servidor e qualquer usuário NEO escreve comentário de qualquer squad — o que o código documenta como decisão deliberada. |
| 2 | §5.2 | `end.setUTCHours(...)` muta o argumento do chamador | **Não muta:** `parseDate` devolve um `Date` novo. A sobreposição é real, por outra causa: `previousPeriod.end === period.start` (mesmo instante) + `isInPeriod` **fechado nas duas pontas** + o `setUTCHours(23,59,59,999)` empurrando o fim do período anterior. Tudo resolvido naquele dia contava **duas vezes**. Mecanismo diferente, mesmo sintoma — e a correção (períodos `[start, end)`) resolve os dois. |
| 3 | §7.12 | O fail-open na leitura do gasto é defeito | É **decisão documentada** em [usage.ts:44-50](../nero-portal/src/lib/nero/usage.ts#L44-L50) e defensável: teto é controle de custo, não de segurança, e Postgres indisponível não deve derrubar o Nero. Os defeitos **reais** da seção — todos confirmados — são a falta de reserva atômica, a janela de 30s do cache, o buraco permanente quando o `UsageLog` falha, `generate.ts` não invalidar o cache, e não haver teto por identidade. |
| 4 | §5.6 | Trata Dashboard e `sync-anchors` no mesmo parágrafo | O [jira-client.ts](../locavia-dashboard/sync/jira-client.ts) do Dashboard **tem** retry com backoff e um teto que **lança erro em vez de truncar em silêncio** — melhor que a Edge Function, que terminava o laço após 100 páginas sem declarar truncamento. Contaminar um com a crítica do outro esconde onde está o problema. |
| 5 | §5.7 | Severidade **subestimada** | [src/data.json](../locavia-dashboard/src/data.json) é array puro **sem `syncedAt`**, e `src/data-meta.json` é commitado a cada hora pelo workflow, que **não** commita `data.json`. Logo, quando o Blob falha, `/api/data` devolve itens congelados **com o timestamp de hoje**, e o ETag também diz "fresco". O fallback não mente às vezes: **mente sempre**. É P0. |
| 6 | §7.13 | Severidade **superestimada** | O Dockerfile está quebrado nos cinco pontos, mas **nada o invoca** — `vercel-build` já é `prisma generate && next build`. O risco é a *documentação* afirmar que o container está pronto, não o container rodar `db push`. |
| 7 | §4.7 | `hourly-sync` não instala dependências, então o sync está quebrado | **Parcialmente correto — e o review acabou certo no efeito.** Ver §0.5: a correção que eu havia escrito aqui estava errada no mecanismo e ficou obsoleta em horas. |

### 0.2 O achado que o review não nomeia: a composição

§P0.2 + §5.7 + §4.7 **juntos** dizem uma coisa que nenhum deles diz sozinho: o Dashboard podia
apresentar **dado velho, com data de entrega inventada, rotulado como verdade fresca**, sem
nenhum sinal visível na UI nem no ETag. Nenhum dos três achados isolados carrega esse peso.

### 0.3 Achados novos que a validação encontrou

1. **`DataQuality.missingResolutionDate` era código morto — nunca podia ser `true`.** O fallback
   gravava `item.Resolved` antes de a flag ser calculada como `DONE && !Resolved`. O review diz
   que o fallback "mascara" a flag; ele a tornava **estruturalmente inalcançável**. O sinal de
   higiene não estava fraco: não existia. Medido: `false` em 6.345 de 6.345 itens.
2. **O `else if` de LeadTime era inalcançável** pela mesma razão.
3. **Havia uma SEGUNDA cópia do fallback de `Resolved`**, em
   [trends.ts](../locavia-dashboard/src/performance/trends.ts) (`inWeek(parseDate(item.Resolved) ?? parseDate(item.UpdatedAt))`).
   Corrigir só o `metrics-calculator.ts` — o que o review pede — deixaria a série histórica ainda
   inventando entrega. Um achado de "remova esta linha" precisa vir com a busca pelas outras cópias.
4. **A allowlist de modelos do Nero estava errada no `CLAUDE.md`** (`claude-sonnet-4-6` no doc,
   `claude-sonnet-5` no código). Entre os drifts de documentação, é o mais perigoso: é a lista de
   modelos, num arquivo que **agentes leem como instrução**.
5. **`api/**` e `middleware.ts` — a borda que autentica todo o portal — tinham ZERO typecheck.**
   Não havia `tsconfig.json` na raiz, e `pnpm -r` não inclui o projeto raiz. O review acerta ao
   apontar o typecheck vazio do Maturity e **não percebe** que a borda estava pior: no Maturity o
   comando existia e mentia; aqui não existia comando nenhum.
6. **A âncora `board.done_without_resolution_pct`** do Maturity media corretamente, do Jira cru,
   exatamente o que o fallback do Dashboard escondia. Os dois produtos divergiam **por
   construção**; com o fallback fora, passam a concordar. Isso é um argumento de validação cruzada
   que o review tinha em mãos e não usou.
7. **`pnpm audit` era executável** — o review declara que o ambiente bloqueou o envio da árvore de
   dependências. Rodou: **23 vulnerabilidades (10 altas) → 9 (2 altas)**. A mais relevante era
   `next` 16.2.9 com **"Middleware / Proxy bypass in App Router"** — e o gate inteiro do Nero é um
   proxy. Corrigido para 16.2.11. Ficaram deliberadamente em aberto `vite >=6.4.3` (dev-server
   only, major 5→6) e `react-router >=8.3.0` (CSRF em RSC; o app não usa RSC, major 6→8).
8. **Duas fórmulas de âncora estavam erradas, não só "assumidas".** "Sprint injetada" era inferida
   comparando **comprimento de string** dos campos `from`/`to`, e o timestamp era comparado ao
   início mais antigo entre **todas** as sprints do item, não à sprint adicionada.

### 0.5 A correção nº 7, corrigida — e por que ela merece um registro próprio

Eu escrevi aqui que o achado §4.7 era "**empiricamente falso**", que o workflow estava "verde a
cada execução", e expliquei o mecanismo como "o `setup-node` falha silenciosamente e o `npm ci`
acha o `node_modules` que já existe". **Duas dessas três afirmações estavam erradas**, e a
terceira envelheceu em três horas. A cronologia medida na GitHub API:

| Quando (UTC) | O quê |
|---|---|
| 2026-07-26 15:32 | `c5393c2` remove os 5 `package-lock.json` (migração para pnpm workspaces) |
| 26/07 16:06 → 27/07 11:30 | ~15 execuções do `hourly-sync`, **todas verdes** |
| 27/07 11:32 | último `data-meta.json` commitado (`a70cdf9`) |
| 27/07 14:48, 17:02, 18:57 | **três falhas consecutivas** |

Entre 11:32 e 14:48 **nenhum commit entrou na `main`**. O repositório não mudou: mudou o runner.
O log da falha mostra `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true` e o aviso de depreciação do
Node 20 — o GitHub passou a forçar as actions fixadas por SHA (`checkout`, `setup-node`, ambas
de era Node 20) a rodar sob Node 24, e o que era condição tolerada no `setup-node` virou **erro
fatal**: `Some specified paths were not resolved, unable to cache dependencies`. O job morre em
~9s, no `Set up Node.js`, antes de chegar ao install.

O que o log da última execução verde mostra, e que é a evidência que eu deveria ter buscado antes
de teorizar: `npm ci` em `locavia-dashboard` **"added 331 packages"** — sem nenhum lockfile no
repositório desde o dia anterior. Não havia `node_modules` preexistente (runner é limpo): o npm
resolveu tudo fresco no registry. Ou seja, o **install não reproduzível é fato comprovado**, não
inferência — e é uma prova mais forte do que a que eu tinha em mãos quando escrevi a correção.

Três lições, e a terceira é a que importa:

1. **Errei o mecanismo por inferir em vez de ler o log.** Já havia errado assim uma vez nesta
   mesma sessão (ver §0.4). A regra de §0.4 tem um par: *não conclua mecanismo sem ler o log do
   passo*.
2. **"Está verde" é uma medição com timestamp, não uma propriedade.** Escrever afirmação de estado
   no presente, num documento versionado, é uma dívida que vence sozinha.
3. **O review estava certo no que importa.** O texto dele — "o workflow ainda usa `npm ci` e um
   lockfile que não existe" — descreve exatamente a bomba que explodiu. Eu me apeguei ao fato de
   o job estar passando e chamei o achado de falso; o achado era sobre a **configuração**, e
   configuração errada que passa hoje é configuração que falha quando o ambiente muda. A correção
   do commit `4e199a1` (Corepack + `pnpm install --frozen-lockfile`, sem `cache-dependency-path`
   fantasma) conserta precisamente esta falha.

**Consequência operacional aberta enquanto esta branch não entrar na `main`:** o dataset do
Dashboard está congelado em **27/07 11:32 UTC** e envelhece a cada hora. Com o fallback de
`/api/data` ainda não deployado, produção rotula esse dado congelado como fresco — que é
exatamente a composição descrita em §0.2.

### 0.4 Uma armadilha de método, registrada porque custou caro

Durante a correção, verifiquei o lint com `grep -ci '\berror\b'` na saída e reportei **"0 erros"**
enquanto o eslint estava **crashando**: `\berror\b` não casa dentro de `TypeError`. A regra que
saiu disso, e que vale para qualquer verificação neste monorepo: **cheque por código de saída,
nunca por grep na saída.**

---

## 1. Parecer executivo

O conjunto tem uma base técnica melhor do que a média para o estágio atual:

- a borda do NEO fecha em produção quando faltam segredos;
- cookies sensíveis são `HttpOnly`, `Secure`, `SameSite=Lax` e têm expiração real;
- as actions do GitHub estão fixadas por SHA;
- o Maturity agora possui um modelo de papéis muito mais claro e uma matriz RLS executável;
- o Nero centraliza chamadas ao modelo, contabiliza custo e usa transações para suas mutações;
- os builds de produção do portal composto e do Nero fecham;
- há documentação arquitetural com decisões e incidentes reais, não apenas descrições genéricas.

Entretanto, **a solução ainda não deve ser tratada como pronta para uma expansão enterprise ou
para dados regulatoriamente sensíveis sem um ciclo de hardening**. Os riscos mais importantes são:

1. **Maturity — Edge Function privilegiada acionável com credencial pública.** O cron versionado
   chama `sync-anchors` com o JWT `anon`; o handler não faz autorização de usuário/papel e grava
   com `service_role`. Isso transforma uma chave pública em gatilho para carga no Jira e escrita
   privilegiada no banco.
2. **Dashboard — a data `Resolved` continua sendo inventada a partir de `UpdatedAt`.** Isso viola
   o próprio contrato documental do produto e pode alterar throughput e lead time.
3. **Segredos — o runbook ainda registra rotações pendentes de credenciais que já foram expostas.**
   Até a revogação ser confirmada, isso é risco operacional, não apenas documentação.
4. **Nero — as promessas de “toda escrita auditável e reversível” não são verdadeiras em todos os
   caminhos.** Campos de catálogo gravados inline não recebem versões próprias; desfazer uma
   versão antiga pode sobrescrever uma alteração nova.
5. **Nero — `NERO_MODEL` pode contornar a allowlist.** A env é convertida por type assertion, sem
   validação em runtime. Um valor incorreto vira o modelo padrão efetivo e pode também tornar a
   estimativa de custo insuficiente.
6. **Maturity — o typecheck do CI é um falso verde.** O script atual não inclui `src`; usando a
   configuração real da aplicação foram encontrados **201 erros em 43 arquivos**.
7. **Sincronização do Dashboard — o workflow agendado ainda usa `npm ci` e um lockfile que não
   existe depois da migração para pnpm.** A atualização automática tende a falhar.

### Classificação geral

| Dimensão | Estado | Parecer |
|---|---|---|
| Arquitetura integrada | **Boa, com dívidas localizadas** | Separação das aplicações e origem única são coerentes; há contratos duplicados e legado exposto |
| Autenticação | **Boa para piloto** | NEO OTP + HMAC funcionam; faltam propósito de token, identidade no Nero e SSO/RBAC enterprise |
| Autorização | **Mista** | Maturity evoluiu; Dashboard é all-or-nothing; Nero não tem RBAC; Edge Function escapa da matriz |
| Integridade de métricas | **Insuficiente** | `Resolved` sintético e changelog parcial comprometem a semântica de indicadores |
| Banco e migrações | **Mista** | RLS/migrations do MMA são fortes; Nero tem constraints insuficientes e Docker inseguro |
| Segurança de IA | **Insuficiente para escala** | Há custo/allowlist, mas não há fronteira confiável para RAG/estado nem aprovação de escritas |
| Segredos | **Pendente de evidência operacional** | Código atual não expõe segredo privado conhecido; rotações históricas continuam abertas |
| CI/CD | **Boa base, cobertura enganosa em pontos críticos** | CI fixado por SHA e builds; typecheck MMA falso, sync quebrado, sem SCA/SAST/secret scanning |
| Documentação | **Rica, porém contraditória** | Handoffs recentes são bons; READMEs/runbooks antigos ainda induzem procedimentos errados |

---

## 2. Mapa ponta a ponta revisado

```text
Usuário
  │
  ├─ Hub NEO / Supabase Auth (OTP + is_neo_allowed)
  │      └─ POST /api/session → neo_session, HMAC, 12h
  │
  ├─ /dash ──────────────── middleware NEO
  │      ├─ /api/data ───── Jira/Salesforce materializados em Blob/Git
  │      └─ /torre ──────── neo_tower
  │
  ├─ /maturity ──────────── middleware NEO + sessão Supabase no navegador
  │      ├─ RLS/RPCs ────── Supabase Postgres
  │      └─ sync-anchors ── Jira → service_role → anchor_readings
  │
  └─ /nero ──────────────── middleware NEO + proxy Next
         ├─ neo_session + neo_nero
         ├─ Nero Core ───── Claude API
         ├─ RAG ─────────── Document/full-text
         └─ Prisma ──────── Neon/Postgres + StateVersion
```

### Fronteiras de confiança reais

| Origem | Destino | Identidade preservada? | Autorização no destino? | Observação |
|---|---|---:|---:|---|
| Hub → `/api/session` | cookie NEO | e-mail no payload | allowlist via RPC | Bom, mas o verificador posterior só usa `exp` |
| NEO → Dashboard | HTML/API | sim, no cookie | allowlist global | Todos os permitidos recebem o dataset completo |
| NEO → Maturity | Supabase | sim, JWT Supabase | RLS | Melhor fronteira do conjunto |
| Maturity → `sync-anchors` | Edge Function | **não usada pelo handler** | **não** | Handler usa `service_role`; principal falha |
| NEO → Nero | cookie de sessão/gate | token contém e-mail, mas o app não o propaga | duas travas, sem RBAC interno | Auditoria não registra a pessoa |
| Nero → Claude | prompt completo | não aplicável | tools liberadas ao agente | Estado, biblioteca e texto do usuário compartilham a mesma zona de confiança |

---

## 3. Achados prioritários consolidados

### P0 — tratar antes de ampliar uso ou confiança nos dados

#### P0.1 — `sync-anchors` pode ser disparada com JWT público e escreve com `service_role`

**Aplicação:** Maturity  
**Evidência:** `maturitymodel/supabase/migrations/20260712190000_anchor_sync_cron.sql`,
`maturitymodel/supabase/functions/sync-anchors/index.ts`.

O cron usa explicitamente um token cujo papel é `anon`. O handler:

- não verifica `auth.uid()`;
- não verifica `role=authenticated`;
- não verifica se a pessoa é SM, AM ou admin;
- aceita body vazio e então sincroniza todos os squads mapeados;
- aceita qualquer `team_id`;
- usa `SB_SERVICE_ROLE`, contornando RLS;
- não possui rate limit, idempotency key ou limite por chamador.

O próprio frontend chama a função diretamente com `supabase.functions.invoke`. A proteção padrão
`verify_jwt` valida o JWT, mas autorização de negócio continua sendo responsabilidade do handler.
A documentação atual da Supabase recomenda autenticação de usuário explícita no handler e separa
chamadas de usuário de chamadas service-to-service.

**Impacto:** consumo abusivo da API Jira, crescimento descontrolado de `anchor_readings`, custo,
ruído de métricas, potencial exaustão de rate limit e uso indireto de uma credencial privilegiada.

**Recomendação:**

1. separar `sync-anchors-user` e `sync-anchors-cron`, ou usar um único handler com modos explícitos;
2. para usuário, validar JWT, obter claims e exigir SM daquele squad ou AM/admin;
3. para cron, usar secret key exclusiva em header, armazenada em Vault, nunca o token `anon`;
4. aplicar rate limit, idempotência por `team_id + janela`, timeout e auditoria do chamador;
5. remover URL/token hardcoded da migration e fazer rotação do mecanismo;
6. criar teste que prove `anon → 401/403`, membro fora do squad → 403 e papel correto → 200.

#### P0.2 — `Resolved` sintético corrompe a semântica do Dashboard

**Aplicação:** Dashboard  
**Evidência:** `locavia-dashboard/sync/metrics-calculator.ts:88-105`,
`locavia-dashboard/src/performance/trends.ts`.

Para item `DONE` sem `resolutiondate`, o sync grava `Resolved = UpdatedAt`. Depois, lead time usa
essa data e `Math.abs`. Isso:

- contradiz `CLAUDE.md`, que declara `Resolved` como verdade exclusiva do Jira;
- mascara `DataQuality.missingResolutionDate`;
- faz um card sem resolução parecer entregue;
- pode mover a entrega para outra semana;
- transforma data negativa/inválida em duração positiva plausível com `Math.abs`;
- cria divergência estrutural entre snapshot e tendências.

O dataset atual não expõe a divergência em toda janela porque o fallback já foi materializado.
Isso não valida a regra; apenas esconde o problema.

**Recomendação:** manter `Resolved=null`, excluir o item de métricas que exigem entrega e apresentar
separadamente “DONE sem resolutiondate” como dívida de higiene. Nunca substituir a fonte.

#### P0.3 — concluir e evidenciar as rotações de segredos já expostos

**Aplicação:** NEO como um todo  
**Evidência:** `SECRETS.md`.

O runbook registra como pendentes:

- tokens pessoais do Supabase que já foram expostos;
- senha de app do Gmail;
- chave antiga do Resend;
- revisão de escopo do token GitHub;
- 2FA das contas operacionais.

Nenhuma credencial privada atual foi impressa ou incluída neste relatório. O scan redigido do
estado atual encontrou somente um JWT público `anon` na migration do cron. No histórico, o único
match genérico de URL PostgreSQL foi a URL fictícia do CI.

**Conclusão:** a ausência de segredo atual no código não encerra o incidente histórico. É preciso
registrar `revogado_em`, responsável, substituto e evidência de teste para cada item.

---

## 4. Portal NEO — revisão integrada

### 4.1 Pontos fortes

- `middleware.ts` protege `/dash`, `/maturity` e `/nero`.
- Em produção, ausência de `SESSION_SECRET` resulta em 503, não bypass.
- O formato HMAC tem expiração real e comparação de assinatura adequada.
- `api/session.ts` revalida o Bearer e a allowlist server-side; a regra de domínio no cliente não
  é uma fronteira de segurança.
- `api/gate.ts` usa comparação segura e rate limit com TTL criado apenas na primeira tentativa.
- Cookies são emitidos com atributos defensivos.
- O CI fixa actions externas por SHA e usa lockfile congelado.
- `ARCHITECTURE.md`, `ONBOARDING.md` e `SECRETS.md` explicam decisões load-bearing e incidentes.
- Os 77 testes do contrato `@neo/auth × middleware × functions` passaram.

### 4.2 Token de sessão e tokens de gate não têm propósito criptográfico

**Severidade:** alta  
**Arquivos:** `middleware.ts`, `api/session.ts`, `api/gate.ts`, `packages/neo-auth`.

Todos os tokens são assinados com o mesmo `SESSION_SECRET` e os verificadores aceitam qualquer
payload que tenha assinatura válida e `exp`. Não há `aud`, `purpose`, `scope` nem derivação de
chave por uso. O teste inclusive confirma que um token emitido pela função de sessão passa no
verificador do gate.

Se um token válido for copiado para outro cookie, a camada verificadora não distingue sessão,
Torre ou Nero.

**Melhoria:** incluir `purpose: neo_session|tower|nero`, validar igualdade no consumidor e derivar
subchaves com HKDF, ou usar segredos separados. Adicionar testes negativos de confusão de token.

### 4.3 Deep-link para o Nero é perdido depois do login

**Severidade:** média  
**Arquivo:** `neo-hub/src/next.ts:1`.

`safeNextPath` aceita somente `/dash` e `/maturity`. O middleware preserva
`?next=/nero/...`, mas o Hub descarta esse destino. O usuário autentica e volta às portas, em vez
de retomar a rota do Nero.

### 4.4 `/api/refresh` ainda é fail-open sem configuração

**Severidade:** alta  
**Arquivo:** `api/refresh.ts`.

Ao contrário de sessão, gate e middleware, a função considera autenticado quando as envs do
Supabase não existem, inclusive sem um branch explícito de produção. O endpoint pode estar morto
na UI, mas permanece uma superfície implantável e perigosa caso o token GitHub seja configurado.

**Melhoria:** remover o endpoint se morto ou aplicar a mesma matriz fail-closed das demais APIs.

### 4.5 APIs legadas aumentam a superfície

**Severidade:** média  
**Arquivos:** `api/comments.ts`, `api/trigger-sync.ts`, `api/refresh.ts`.

- `comments.ts`: qualquer usuário NEO escreve em qualquer squad; não há autoria, ownership,
  trilha de auditoria ou validação de tamanho; JSON malformado pode virar 500.
- `trigger-sync.ts`: aceita segredo em query string, formato que vaza em logs/histórico/referrer,
  e devolve detalhes brutos do GitHub.
- `refresh.ts`: não é usado pelo frontend atual.

Superfície morta não é neutra. Remover é preferível a “manter para talvez usar”.

### 4.6 Dataset completo para qualquer pessoa permitida

**Severidade:** alta se o conteúdo for sensível; aceita por decisão atual  
**Arquivo:** `api/data.ts`.

Qualquer pessoa da allowlist recebe o JSON completo, incluindo resumo, responsável e histórico
materializado. A senha da Torre protege apenas a visualização; não cria segregação do dado.

Se essa decisão continuar, ela deve ser registrada como classificação de risco aceita, com:

- responsável executivo;
- revisão periódica;
- minimização dos campos;
- política de retenção;
- confirmação de que assignees/summaries podem ser vistos por toda a allowlist.

### 4.7 Workflow agendado incompatível com o monorepo atual

**Severidade:** alta  
**Arquivo:** `.github/workflows/hourly-sync.yml:38`.

O job ainda:

- configura cache npm para lockfile que não existe na pasta;
- executa `npm ci`;
- opera como se o Dashboard ainda tivesse lockfile próprio;
- não tem `concurrency`;
- comita diretamente em `main` a cada 30 minutos;
- mistura sincronização, validação, escrita em Blob e versionamento de artefato.

Depois da migração para um lockfile pnpm na raiz, o workflow deve usar Corepack + `pnpm install
--frozen-lockfile` e filtros do workspace. Também deve evitar commits concorrentes e separar dado
operacional de código.

### 4.8 Headers

**Severidade:** média

O portal tem CSP, HSTS, `nosniff`, frame policy e referrer policy. Contudo,
`script-src 'unsafe-inline'` reduz o valor da CSP. Avaliar nonce/hash e adicionar
`Permissions-Policy`. O Nero direto tem conjunto menor de headers; ver seção específica.

### 4.9 Divergências de documentação NEO

O `README.md` raiz está atrás da arquitetura atual:

- declara ausência de workspaces e uso de `npm ci` por app;
- cita `api/tower.ts`, já removido em favor de `api/gate.ts`;
- descreve cron externo/arquitetura antiga;
- tem texto ambíguo dizendo que sem `SESSION_SECRET` “o gate abre”, enquanto produção fecha;
- não representa corretamente o Nero no fluxo de deep-link.

**Fonte recomendada hoje:** `ARCHITECTURE.md` → `ONBOARDING.md` → `SECRETS.md` → handoff da
aplicação. O README não deve ser a porta de entrada até ser reconciliado.

---

## 5. Dashboard Locavia — revisão específica

### 5.1 Pontos fortes

- domínio analítico foi extraído para funções majoritariamente puras;
- classificação de status, descarte e story points têm módulos dedicados;
- validação Zod existe no pipeline;
- typecheck, lint, teste de performance e build passaram;
- o build usa code splitting para várias páginas;
- o dashboard deixou explícitas várias invariantes de negócio em `CLAUDE.md`;
- não há chamada direta do navegador para Jira;
- os dados de 6.345 itens e 21 times foram processados pelos scripts de auditoria sem exceção.

### 5.2 Períodos podem se sobrepor

**Severidade:** alta  
**Arquivos:** `src/hooks`, `src/performance/computeTeamPerformance.ts:49`.

Os hooks trabalham com timestamps corridos. `computeTeamPerformance` muta o fim recebido para
23:59:59.999 UTC. Dependendo de como o período anterior é calculado, o mesmo dia pode pertencer
a duas janelas. A tendência ainda alinha o início ao começo da semana e pode gerar 9 buckets para
uma seleção de 8 semanas.

**Melhoria:** adotar intervalo semiaberto `[start, end)`, não mutar argumentos e manter uma única
biblioteca de período usada por snapshot, comparação e trend.

### 5.3 Semana parcial contamina tendência e Monte Carlo

**Severidade:** alta para previsão

A semana corrente incompleta entra na série histórica. O Monte Carlo usa `Math.random`, não
possui seed nem aviso de amostra insuficiente. Duas execuções podem apresentar probabilidades
diferentes para o mesmo dado.

**Melhoria:** separar semana parcial, usar PRNG com seed/fingerprint do dataset, mostrar tamanho da
amostra e impedir previsão abaixo de um mínimo acordado.

### 5.4 Divergência no conceito de descarte

**Severidade:** média  
**Arquivos:** `src/performance/discard.ts`, `src/performance/epics.ts`.

O predicado canônico usa raízes (`CANCELAD`, `DESCARTAD`), enquanto módulos de épicos usam conjunto
exato. Variantes de status podem ser descartadas em uma métrica e contadas em outra.

**Melhoria:** nenhuma regra local; todos os consumidores usam `isDiscarded`.

### 5.5 Épicos não respeitam consistentemente o período

**Severidade:** média  
**Arquivo:** `src/hooks/useTeamPerformance.ts:64`.

O cálculo recebe itens do time fora da janela escolhida. A tela pode sugerir que todos os números
respondem ao filtro temporal quando o painel de épicos representa o histórico completo.

### 5.6 Changelog Jira incompleto

**Severidade:** alta  
**Arquivo:** `sync/jira-client.ts:81`.

O sync pede `expand: changelog` junto da busca. Para métricas de reabertura, transição e tempo por
status, é necessário garantir o histórico completo por issue. A API oficial oferece
`POST /rest/api/3/changelog/bulkfetch`, paginado e filtrável por campos, para até 1.000 issues.

**Melhoria:** buscar issues primeiro e paginar changelogs em lote; registrar `historyComplete`,
quantidade e watermark. Métrica dependente de histórico nunca deve parecer confiável quando o
histórico é parcial.

### 5.7 Publicação de dados não é atômica como produto

**Severidade:** alta

- Blob é sobrescrito sem ponteiro de versão/rollback transacional.
- O fallback local pode combinar `data.json` de um commit com `data-meta.json` mais recente,
  rotulando dado velho como novo.
- A resposta não expõe claramente `source`, `stale`, versão, hash e contagem.
- A promise do frontend fica cacheada pelo ciclo de vida do módulo; uma sincronização não força
  novo carregamento.

**Melhoria:** manifesto único `{version, hash, syncedAt, count, source}` apontando para blob
imutável; publicação por troca atômica do manifesto; cliente valida hash/versão.

### 5.8 Contrato de dados permissivo demais

**Severidade:** média

O schema do sync cobre poucos campos e aceita extras. Não há testes de:

- volume mínimo/máximo;
- desaparecimento de times;
- unicidade de chave;
- datas impossíveis;
- cardinalidade de status;
- drift de custom fields;
- consistência entre `StatusCategory`, `Resolved` e `DataQuality`.

### 5.9 Ferramentas mais críticas estão fora do lint

**Severidade:** alta  
**Arquivo:** `locavia-dashboard/eslint.config.js`.

`sync/**` e `tools/**` são excluídos. O código que autentica no Jira, classifica dados e publica
o dataset recebe menos controle estático do que a UI.

### 5.10 Acessibilidade e desempenho

**Severidade:** média

- linha `<tr>` clicável sem semântica de link/botão e sem teclado;
- explicações importantes dependem de hover/title;
- movimento deve respeitar `prefers-reduced-motion`;
- chunk principal: aproximadamente **725 kB minificado / 212 kB gzip**;
- chunk de documentação API: aproximadamente **1,4 MB / 400 kB gzip**.

### 5.11 Testes do Dashboard

Passaram:

- typecheck;
- lint;
- `test:performance`;
- `audit:performance`;
- build de produção.

Os cinco testes Playwright não chegaram a executar localmente porque o binário Chromium da versão
instalada não estava presente. A falha foi de ambiente, não de assertion. O CI instala o browser,
mas a cobertura e2e continua rasa: navegação, período e redirects. Não cobre cálculo, stale data,
Torre, teclado, erro de API ou sincronização.

---

## 6. Maturity Model — revisão específica

### 6.1 Evoluções corretas

As migrations de 26–27/07 representam uma evolução real:

- papéis globais explícitos em `portal_roles(admin|am)`;
- papéis de squad reduzidos a `sm|member`;
- remoção estrutural do vetor SM → AM;
- migração aborta se um AM antigo não tiver e-mail;
- policies de escrita administrativa foram fechadas;
- tabelas legadas deixaram de aceitar escrita pública;
- transições de ciclo agora também são guardadas no banco;
- RPCs sensíveis revogam `public` e concedem a `authenticated`;
- `restart_assessment` é admin-only;
- `officialize_cycle` impede segunda oficialização e duplicação de kaizens;
- testes locais aplicam 51 migrations e exercitam 59 cenários de RLS.

Isso é uma base muito melhor do que autorização apenas na UI.

### 6.2 O typecheck oficial não verifica a aplicação

**Severidade:** alta  
**Arquivos:** `maturitymodel/tsconfig.json`, `package.json`.

`tsc --noEmit` usa um config com `files: []` e project references sem `build`. O comando passa,
mas não verifica `src`.

Executando:

```bash
tsc -p tsconfig.app.json --noEmit
```

foram encontrados:

| Diagnóstico | Quantidade |
|---|---:|
| Total | **201** |
| Arquivos | **43** |
| TS2786 | 135 |
| TS2344 | 30 |
| TS2339 | 26 |
| Outros | 10 |

A causa dominante é colisão entre tipos React 18 do Maturity e React 19 presentes no monorepo,
mas há erros adicionais que só poderão ser classificados depois de corrigir a resolução.

**Melhoria:** `tsc -b tsconfig.app.json tsconfig.node.json` ou um config único real; fixar versões
compatíveis de `@types/react`; fazer warning de lint falhar no CI quando aplicável.

### 6.3 Policy de atualização de homologações ficou no modelo antigo

**Severidade:** alta  
**Arquivos:** migrations `20260710130000...` e `20260726120000...`.

A migration nova substitui `homolog_write` de INSERT, mas não substitui `homolog_update`.
A policy antiga permite update quando:

- o registro antigo pertence ao próprio `am_user_id`;
- o ciclo antigo está em homologação;
- o novo registro mantém apenas `am_user_id`.

O `WITH CHECK` não exige:

- `is_portal_am()`;
- ciclo destino em homologação;
- mesma `cycle_id`;
- mesma `dimension_id`.

Consequências:

- outro AM global não consegue atualizar uma homologação criada por colega via `upsert`;
- o dono antigo pode tentar mover a linha para outro ciclo/dimensão conhecido;
- a policy não representa o papel global novo.

Os testes cobrem INSERT e oficialização, não UPDATE cruzado nem mutação de chaves.

### 6.4 `portal_roles` usa e-mail como identidade durável

**Severidade:** média/alta

É uma decisão pragmática para concessão antes do primeiro login, mas:

- troca de e-mail pode deixar grants órfãos;
- offboarding depende de processo manual;
- não há FK para `auth.users`;
- não há `created_by`, `revoked_at` ou motivo estruturado;
- admin pode remover o último admin e causar lockout;
- não existe reconciliação periódica com o diretório.

**Melhoria:** preservar convite por e-mail, mas resolver para `user_id` no primeiro login e manter
estado de concessão/revogação auditável. Criar guarda para “último admin”.

### 6.5 Acesso a `profiles` do AM é amplo

**Severidade:** média, possivelmente intencional

O AM global lê todos os profiles. Isso atende a fila global, mas amplia PII. Documentar a
necessidade e reduzir seleção no frontend. “Precisa listar avaliações” não implica automaticamente
“precisa de todo o diretório”.

### 6.6 Membros podem alterar e excluir kaizens

**Severidade:** média/alta  
**Migration:** `kz_write ... for all`.

Qualquer membro do squad e AM pode fazer CRUD. Confirmar a regra de negócio, especialmente DELETE
e edição de kaizen gerado no momento da oficialização. Se o plano é artefato governado, separar
criação, update de execução e exclusão.

### 6.7 Ações destrutivas sem trilha funcional

**Severidade:** média

`restart_assessment` apaga kaizens, homologações, propostas e pré-sessão. É corretamente admin-only
e transacional, mas não mantém histórico de quem reiniciou, motivo ou snapshot. A autorização está
certa; governança e recuperação ainda não.

### 6.8 `supabase/config.toml` aponta para deployment antigo

**Severidade:** alta operacional

`site_url` e redirect URLs continuam em `maturitymodel-ashen.vercel.app`. O código e os handoffs
dizem que a origem oficial é o NEO. Um futuro `supabase config push` pode reintroduzir redirects
quebrados.

### 6.9 Métricas de âncora podem estar incorretas mesmo sem ataque

**Severidade:** alta para confiança analítica  
**Arquivo:** `supabase/functions/sync-anchors/index.ts`.

- `expand: changelog` não garante histórico completo.
- “sprint injetada” é inferida comparando o comprimento de strings `to` e `from`.
- o timestamp é comparado ao início mais antigo entre todas as sprints do item, não à sprint
  específica que foi adicionada.
- a janela é `updated >= -90d`, que não é equivalente a “evento ocorrido na janela”.
- não há timeout, retry/backoff ou tratamento de 429 do Jira.
- depois de 100 páginas, o loop termina sem declarar truncamento.
- JQL/mapeamento por nome de oito squads é hardcoded; squad fora do mapa é silenciosamente pulado.
- erros do Jira podem ser devolvidos com body bruto.

### 6.10 Kaizen e completude da homologação

`officialize_cycle` compara contagem de homologações com contagem de dimensões. A PK
`(cycle_id, dimension_id)` evita duplicata por dimensão, o que torna a checagem razoável. Ainda
é recomendável usar `count(distinct dimension_id)` e garantir que não existam dimensões
inativas/fora do modelo que alterem o denominador.

### 6.11 Tratamento de erro no frontend

Vários hooks convertem erro de RLS/rede em array vazio. Isso é fail-closed em privilégio, mas
fail-silent em operação: “sem dados”, “sem papel” e “banco indisponível” ficam visualmente
parecidos. O usuário pode tomar decisão com tela vazia sem saber que houve falha.

### 6.12 Documentação do Maturity

Os documentos mais confiáveis são:

- `HANDOFF.md` da raiz;
- `maturitymodel/docs/PAPEIS.md`;
- migrations novas e testes.

`maturitymodel/README.md`, `ARCHITECTURE.md` e `STATUS.md` ainda descrevem Node/npm, login próprio,
deploy separado e papéis antigos. A própria arquitetura admite que trechos estão defasados.

---

## 7. Nero — revisão como aplicação e como agente de IA

### 7.1 Impressão arquitetural

O Nero tem uma direção conceitual forte:

- um único ponto de chamada ao modelo (`core.ts`);
- separação entre kit estável, estado vivo e contexto escopado;
- distinção explícita entre teoria, hipótese, confirmação e lacuna;
- tools pequenas e orientadas ao domínio;
- transação entre estado e versão na maioria das mutações;
- RAG simples antes de introduzir embeddings prematuramente;
- fallback determinístico para o report;
- teto mensal e medição por tokens;
- isolamento explícito do cliente LM.

Como **agente**, porém, ele ainda combina três níveis de confiança dentro do mesmo contexto:

1. instruções controladas do kit;
2. estado/biblioteca editáveis;
3. texto livre enviado pelo usuário.

E permite que o modelo execute tools de escrita sem aprovação humana. Para piloto pequeno isso é
operável; para escala, é necessário separar confiança, identidade e aprovação.

### 7.2 Env `NERO_MODEL` contorna a allowlist

**Severidade:** alta  
**Arquivo:** `src/lib/nero/core.ts:35-42`.

```ts
const DEFAULT_MODEL =
  (process.env.NERO_MODEL as NeroModelId) ?? NERO_MODELS.haiku;
```

`as NeroModelId` não valida runtime. Se a env contiver um ID fora da lista:

- `DEFAULT_MODEL` se torna inválido;
- requisição sem modelo ou com modelo inválido usa esse valor;
- a chamada ao SDK deixa a allowlist;
- `pricing.ts` usa fallback Sonnet, que pode subestimar modelo mais caro;
- o teste atual não detecta porque importa o módulo antes de testar envs.

**Melhoria:** validar a env com o mesmo predicado da allowlist, logar/abortar startup em produção e
testar em processo separado com env inválida.

### 7.3 Custo do Sonnet está superestimado durante a promoção

**Severidade:** média, conservadora  
**Arquivo:** `src/lib/nero/pricing.ts:18-20`.

O comentário reconhece preço promocional de US$ 2/10 até 31/08/2026, mas a tabela calcula
US$ 3/15. Isso não aumenta a fatura; faz o dashboard e o freio acreditarem em custo 50% maior.
O teto fecha antes do necessário e as projeções não representam gasto real.

Além disso, Sonnet 5 usa adaptive thinking por padrão e novo tokenizer. O código não fixa
`effort` nem desabilita thinking. Com `maxDuration=60`, `MAX_TURNS=8` e 16k tokens por turno,
latência/custo devem ser medidos novamente.

### 7.4 Auditoria não identifica a pessoa

**Severidade:** alta

O token NEO contém e-mail, mas o Nero só verifica booleanamente a assinatura. Mutações gravam
`actor = nero|analista`, não o usuário. Duas pessoas diferentes ficam indistinguíveis.

Isso contradiz a linguagem de “quem/quando” presente nos documentos. Há “tipo de ator”, não
identidade individual.

**Melhoria:** extrair claims validadas no proxy/servidor, propagar `actorUserId/emailHash`,
registrar request/turn ID e separar autoria humana de execução do agente.

### 7.5 Campos inline do catálogo não são auditados nem desfeitos

**Severidade:** alta  
**Arquivo:** `src/lib/state/mutations.ts:675-771`.

`upsertCatalogAsset` cria/atualiza vários `DataField`, mas grava uma única `StateVersion` do
`CatalogAsset`; o snapshot nem inclui `campos`.

- criar ativo e desfazer remove campos por cascade: funciona;
- **atualizar ativo com campos inline e desfazer restaura somente o ativo**;
- alterações nos campos permanecem;
- a UI afirma reversibilidade que esse caminho não entrega.

O teste cobre `undo(create)`, não `undo(update com campos inline)`.

### 7.6 Undo pode apagar trabalho posterior

**Severidade:** alta  
**Arquivo:** `src/lib/state/mutations.ts:881-907`.

O undo aplica cegamente o snapshot `before`. Não verifica:

- se o estado atual ainda é igual ao `after` da versão;
- se existe versão posterior não desfeita;
- se children foram alterados depois;
- lock/versão otimista.

Desfazer uma versão antiga depois de uma edição nova restaura o snapshot antigo e perde a edição
mais recente. Desfazer criação de parent faz cascade e deixa versões de children órfãs.

**Melhoria:** optimistic concurrency (`updatedAt`/version), grafo de dependências, evento de undo
próprio e bloqueio de undo fora de ordem sem resolução explícita.

### 7.7 Invariante `modelOf × ENTITY_DATE_FIELDS` não é a única fragilidade

**Severidade:** média/alta

O QA já registra a necessidade de um guarda. Além disso:

- `reviveDates` usa `ENTITY_DATE_FIELDS[entity] ?? []`, portanto entidade esquecida falha
  silenciosamente;
- muitos pseudo-enums são `String` sem constraint no Postgres;
- server actions aceitam status/string sem validação de domínio;
- IDs/códigos de Dependency, Risk e Feature não são únicos no banco;
- idempotência `findFirst → create` pode duplicar sob concorrência;
- número do Report é `max + 1`; duas gerações simultâneas competem pela unique constraint.

### 7.8 Prompt injection persistente pelo estado e Biblioteca

**Severidade:** alta antes de abrir escrita/upload a mais usuários

O risco não se limita a `Document`. Textos controláveis em ProjectNote, decisões, riscos,
stakeholders, catálogo e contexto de fase entram em blocos de sistema. Um texto malicioso pode se
tornar instrução persistente para turnos futuros.

O agente possui tools de escrita. Undo reduz impacto, mas:

- pode não cobrir child writes;
- não evita exfiltração para o modelo;
- não impede gasto;
- não impede várias mutações antes da revisão humana.

**Melhoria:**

- delimitar dados recuperados como conteúdo não confiável;
- nunca concatenar sem tags e instrução de precedência;
- adicionar política de tool independente do modelo;
- exigir confirmação humana para escrita sensível;
- limitar tools por rota/escopo;
- criar evals adversariais com documentos e estado injetados.

### 7.9 Regra de PII contradiz o contexto realmente enviado

**Severidade:** alta de compliance

A UI afirma “nunca envie nomes/e-mails/PII”, mas `buildMemoriaContext` envia ao modelo:

- `Stakeholder.nome`;
- `Decision.quem`;
- `Risk.dono`;
- owner, steward e validador do catálogo;
- proveniência livre;
- conteúdo integral/trechos de documentos;
- um ponto focal nomeado no próprio kit.

O modal é educação, não DLP. Não existe detecção, mascaramento ou bloqueio server-side.

**Melhoria:** classificar quais campos podem sair do perímetro, pseudonimizar nomes, redigir
e-mail/telefone/CPF antes da API, registrar base legal/DPA/ZDR e alinhar a copy ao comportamento.

### 7.10 Entrada do chat é validada apenas superficialmente

**Severidade:** alta de custo/integridade  
**Arquivo:** `src/app/api/chat/route.ts:28-35`.

Só se verifica que `messages` é array não vazio. Não há:

- schema por mensagem;
- limite de quantidade, caracteres ou bytes;
- obrigação de última role `user`;
- rejeição de role `assistant` forjada pelo cliente;
- limite por usuário/IP;
- controle de concorrência;
- idempotency key.

Um usuário autorizado pode enviar histórico enorme, queimar o orçamento global e forjar mensagens
de assistant que influenciem tool use.

### 7.11 Erro interno é devolvido ao cliente/modelo

**Severidade:** média

- a rota transmite `[Erro do Nero: ${err.message}]`;
- `runNeroTool` devolve a mensagem original de Prisma;
- erros Jira/DB podem revelar nomes de tabela, constraints, provider ou request detail.

O cliente deve receber código e mensagem estável; detalhe vai para log correlacionado.

### 7.12 Budget é útil, mas não é uma reserva atômica

**Severidade:** média/alta financeira

O teto melhorou muito. Restam:

- requests concorrentes leem o mesmo saldo e passam juntos;
- falha no `UsageLog` abre espaço permanente no orçamento;
- leitura do gasto é fail-open;
- cache de 30s cria janela;
- o report não invalida o cache depois do log;
- não há teto por usuário, conversa ou request;
- 8 turnos mais fechamento podem exceder a duração de 60s, deixando mutações parciais.

Usar reserva atômica de custo máximo/estimado e reconciliar depois. Pelo menos, um semaphore e
limite por identidade.

### 7.13 Dockerfile está quebrado e reintroduz `db push`

**Severidade:** alta operacional  
**Arquivo:** `nero-portal/Dockerfile`.

O arquivo:

- copia `package-lock.json`, que não existe;
- executa `npm ci` em um workspace pnpm;
- não leva a raiz/workspace necessário a `@neo/auth`;
- copia `public/`, diretório inexistente;
- no `CMD`, roda `prisma db push` antes de iniciar.

O último item contradiz diretamente a correção do incidente em que deploy de preview tocou
produção. A arquitetura enterprise afirma que o container já está preparado; hoje essa afirmação
não é válida.

### 7.14 Preview e produção compartilham banco

**Severidade:** alta

Remover `db push` do build eliminou mutação automática de schema, mas preview ainda lê e escreve o
mesmo banco de produção, conforme `QA-REVIEW.md`. Preview deve apontar para branch isolada do Neon.

### 7.15 Banco Nero sem RBAC/tenant boundary

**Severidade:** alta para expansão enterprise

O banco confia integralmente no servidor Prisma. Não há RLS, tenant ID, papel, escopo por domínio
ou auditoria de leitura. Isso é aceitável para um único projeto e backend fechado; não escala para
vários domínios/áreas sem risco de acesso lateral.

### 7.16 Headers do Nero

**Severidade:** média

O `vercel.json` do Nero define `nosniff`, referrer policy e `SAMEORIGIN`, mas não CSP, HSTS ou
Permissions-Policy. A origem NEO tem CSP, porém o deployment direto deve ser defensivo por si.

### 7.17 Documentação do Nero

**Boas fontes:** `HANDOFF.md`, `docs/QA-REVIEW.md`, `docs/ARQUITETURA-ENTERPRISE.md`.  
**Divergências:**

- `README.md` e `CLAUDE.md` ainda dizem que `vercel-build` roda `prisma db push`;
- ainda citam `APP_PASSWORD`, removida do fluxo;
- comandos usam npm e `db:push`, incompatíveis com o runbook atual;
- `DEPLOY.md` começa correto, mas suas seções históricas voltam a instruir `npm run db:push`;
- o modal PII comenta que não existe identidade individual, embora o NEO já tenha e-mail;
- a arquitetura enterprise declara Docker pronto, mas o Dockerfile não builda no workspace.

---

## 8. Banco de dados e segredos — visão transversal

### 8.1 Supabase/Maturity

**Validações positivas:**

- RLS habilitada nas tabelas vivas;
- policies novas têm papéis nomeados;
- SECURITY DEFINER usa `search_path=public`;
- grants de RPC foram reduzidos;
- matriz local cobre personas;
- migrations são transacionais e a principal migration é idempotente.

**Pendências:**

- autorizar Edge Function antes de usar service role;
- remover JWT público hardcoded do cron;
- reconciliar e-mail com `auth.users`;
- auditar role grants/revocations;
- proteger último admin;
- versionar/resetar assessment com histórico;
- corrigir `homolog_update`;
- validar produção contra migration/schema, não só PGlite.

### 8.2 Neon/Nero

**Validações positivas:**

- Prisma usa URL pooled em runtime e direta para migration;
- deploy Vercel não executa mais migration;
- baseline existe;
- transações incluem `StateVersion` na maioria dos caminhos.

**Pendências:**

- preview isolado;
- backup/restore testado, não apenas branch criada;
- RPO/RTO com exercício;
- constraints de domínio e unicidade;
- ator individual;
- retenção de UsageLog, StateVersion, reports e documentos;
- criptografia/classificação de conteúdo;
- corrigir Docker/migrations.

### 8.3 Segredos

Não foram lidos nem reproduzidos valores de arquivos locais não versionados. A revisão verificou
nomes, fluxos e padrões de exposição.

Recomendações transversais:

- secret scanning no CI e pre-commit;
- rotação com evidência e owner;
- ambientes Preview/Prod com credenciais diferentes;
- contas de serviço, não tokens pessoais;
- escopo mínimo em Jira/GitHub/Supabase;
- nenhuma credencial em query string;
- Vault para cron e integrações;
- alerta por uso anômalo e expiração.

---

## 9. CI/CD, dependências e supply chain

### O que está bom

- actions fixadas por SHA;
- `pnpm install --frozen-lockfile`;
- builds das quatro superfícies no CI;
- contrato HMAC;
- testes de performance;
- migrations/RLS locais;
- teste de modelos/preço do Nero;
- e2e de porta fechada agendado.

### Lacunas

1. typecheck Maturity falso;
2. pipeline de sync fora do lint e quebrado por npm/pnpm;
3. sem CodeQL/Semgrep equivalente;
4. sem gitleaks/trufflehog equivalente;
5. sem auditoria de dependências/SBOM;
6. sem Dependabot/Renovate observado;
7. sem teste Docker;
8. sem teste de migration Nero em banco efêmero;
9. sem teste de Edge Function/autorização;
10. e2e autenticado não roda continuamente;
11. teste de estado Nero é destrutivo e fica fora do CI;
12. nenhum eval do agente mede factualidade, tool safety, injection ou regressão de prompt.

A consulta automática de CVEs via `pnpm audit` **não foi executada**: o ambiente bloqueou o envio
da árvore de dependências ao registry externo sem autorização explícita. Portanto, este relatório
não afirma ausência de vulnerabilidades conhecidas.

---

## 10. Documentação — cobre o necessário para uma nova pessoa?

### Resposta curta

**Ainda não de forma segura.** Há informação suficiente, mas não há uma trilha única e coerente.
Uma pessoa experiente consegue reconstruir a verdade comparando código, handoffs e migrations; uma
pessoa nova pode seguir README/runbook antigo e:

- usar npm num workspace pnpm;
- procurar endpoint removido;
- executar `db push`;
- configurar redirect antigo;
- acreditar que o typecheck do Maturity verifica `src`;
- acreditar que toda escrita do Nero é reversível;
- considerar Docker pronto;
- não perceber o risco da Edge Function.

### Cobertura por tema

| Tema | Cobertura | Fonte mais confiável | Gap |
|---|---|---|---|
| Arquitetura NEO | Boa | `ARCHITECTURE.md` | README contradiz |
| Setup local | Boa parcial | `ONBOARDING.md` | faltam troubleshooting e versões por app |
| Segredos | Boa | `SECRETS.md` | rotações sem fechamento/evidência |
| Dashboard | Boa conceitualmente | `CLAUDE.md` + README | invariantes divergem do código |
| Maturity papéis | Muito boa | `docs/PAPEIS.md` + migrations | README/ARCH/STATUS antigos |
| Nero arquitetura | Muito boa | HANDOFF + QA + enterprise | README/CLAUDE/DEPLOY/Docker contradizem |
| Banco/restore | Média | DEPLOY Nero | não há prova de restore/DR |
| Operação/incidentes | Média/boa | handoffs | sem owners/SLOs acionáveis centralizados |
| Testes | Média | CI + docs por app | falso verde MMA e gaps não explicitados |
| Segurança | Fragmentada | SECRETS + QA docs | falta threat model único |

### Estrutura documental recomendada

```text
README.md                 # 10 minutos: produto, apps, comandos, link para próximos docs
ARCHITECTURE.md           # arquitetura atual e ADRs
ONBOARDING.md             # zero → ambiente local → testes → deploy
SECURITY.md               # threat model, authn/authz, segredos, incidentes e rotação
OPERATIONS.md             # sync, observabilidade, SLO, restore, rollback, owners
docs/apps/
  dashboard.md
  maturity.md
  nero.md
docs/adr/
  ...
docs/archive/             # textos históricos, marcados como NÃO OPERACIONAIS
```

Todo documento operacional deve ter `owner`, `last_verified_at`, versão da aplicação e link para
o teste que comprova a afirmação.

---

## 11. Backlog recomendado

### 0–48 horas

1. fechar invocação anônima de `sync-anchors`;
2. rotacionar/remover mecanismo do token `anon` no cron;
3. confirmar e fechar as rotações de `SECRETS.md`;
4. remover fallback `Resolved=UpdatedAt`;
5. corrigir workflow agendado para pnpm ou desativá-lo até corrigir;
6. validar `NERO_MODEL` em runtime;
7. marcar Docker Nero como não operacional ou remover `db push` imediatamente.

### Primeira semana

1. corrigir typecheck real do Maturity;
2. substituir `homolog_update`;
3. alinhar `supabase/config.toml` à origem NEO;
4. separar propósito/chave dos tokens HMAC;
5. validar schema/limites da rota de chat;
6. rate limit e teto por identidade no Nero;
7. corrigir versionamento de fields inline e undo fora de ordem;
8. atualizar READMEs/runbooks perigosos;
9. tornar sync/tools do Dashboard parte do lint/typecheck;
10. publicar manifesto versionado de dados.

### 30 dias

1. SSO/RBAC do Nero ou, no mínimo, identidade individual/auditoria;
2. PII redaction/DLP e revisão do DPA/ZDR;
3. aprovação humana para tools sensíveis;
4. evals do Nero: factualidade, provenance, tool selection, injection, custo;
5. changelog completo via bulk fetch;
6. períodos semiabertos e forecast determinístico;
7. Preview com bancos isolados;
8. SAST, secret scan, SCA/SBOM;
9. observabilidade com correlação por usuário/request/sync;
10. teste de restore e de disaster recovery.

### Antes de escala enterprise

- Entra ID/OIDC e RBAC por função DAMA;
- dados e LLM dentro do perímetro aprovado pelo LM;
- RLS/tenant boundary para múltiplos domínios;
- retenção e auditoria de leitura;
- workflow de aprovação para dado regulatório;
- fila assíncrona para jobs longos;
- traces/replay sem PII;
- política formal de incidentes e offboarding;
- SLO/RPO/RTO exercitados;
- ownership do kit e processo de mudança com avaliação.

---

## 12. Validações executadas

| Validação | Resultado |
|---|---|
| Inventário de código/config/docs | concluído |
| Status do git | somente `.claude/` preexistente não versionado; preservado |
| Scan redigido de segredos atuais | nenhum segredo privado conhecido; JWT `anon` público encontrado |
| Scan redigido de padrões no histórico | somente URL PostgreSQL fictícia do CI |
| Contrato `@neo/auth` | **77/77 passaram** |
| Dashboard `typecheck` | passou |
| Dashboard lint | passou |
| Dashboard teste de performance | passou |
| Dashboard auditoria de dataset | passou — 6.345 itens, 21 times |
| Dashboard build | passou, com alerta de chunks grandes |
| Dashboard Playwright | não executou assertions: browser local ausente |
| Maturity script `typecheck` oficial | passou, mas não inclui `src` |
| Maturity typecheck real | **falhou: 201 erros em 43 arquivos** |
| Maturity contrato jornada | **21/21 passaram** |
| Maturity migrations PGlite | **51 aplicadas; migration cron pulada por limitação do PGlite** |
| Maturity RLS local | **59/59 passaram** |
| Maturity build | passou, com alerta de chunk Recharts >500 kB |
| Nero typecheck | passou |
| Nero lint | passou |
| Nero core/preço | **30/30 passaram** |
| Nero build Next | passou |
| Build portal composto | passou |
| Auditoria CVE via registry | não autorizada pelo ambiente; resultado desconhecido |
| Teste destrutivo de estado Nero | não executado contra banco real, por segurança |
| Teste de produção autenticado | não executado; exigiria segredos e afetaria estado/rate limit |

---

## 13. Limitações desta revisão

- Não houve acesso administrativo aos dashboards Vercel, Neon, Supabase, Jira ou Anthropic.
- Env vars foram avaliadas por contrato/documentação, não por leitura de valores.
- Não foi feito pentest ativo contra produção.
- Não foi alterado dado, role, migration ou deployment.
- O histórico Git foi examinado com saída redigida; não foi usado um scanner especializado.
- CVEs de dependências não foram consultadas externamente.
- Métricas Jira foram avaliadas pelo algoritmo local, sem reconciliação item a item com o Jira.
- O teste do estado Nero exige banco descartável e foi corretamente mantido fora de produção.

Essas limitações significam que “não encontrado” não equivale a “inexistente”. Os achados acima
são os que podem ser demonstrados pelo repositório e pelos testes seguros executados.

---

## 14. Referências oficiais usadas para validar comportamento externo

- Supabase — autenticação de Edge Functions:
  https://supabase.com/docs/guides/functions/auth
- Supabase — headers e `verify_jwt`:
  https://supabase.com/docs/guides/functions/auth-headers
- Atlassian Jira — bulk fetch paginado de changelogs:
  https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-changelog-bulkfetch-post
- Anthropic — Claude Sonnet 5, tokenizer, adaptive thinking e preço:
  https://platform.claude.com/docs/en/about-claude/models/whats-new-sonnet-5
- Anthropic — modelos e preços:
  https://platform.claude.com/docs/en/about-claude/models/overview

---

## 15. Conclusão

O NEO já tem **fundação suficiente para ser endurecido**, e os trabalhos recentes no Maturity e
no gate mostram boa capacidade de corrigir problemas na camada certa. O próximo ciclo não deveria
priorizar novas features antes de resolver as fronteiras que hoje produzem falsa confiança:

- dado analítico com data inferida;
- função “protegida” que aceita credencial pública e usa `service_role`;
- typecheck verde que não compila a aplicação;
- auditoria que não cobre todos os filhos;
- undo que pode perder atualização nova;
- documentação que ainda ensina comandos removidos.

Corrigidos esses pontos, o desenho deixa de depender tanto de disciplina humana e passa a tornar
as garantias declaradas — segurança, rastreabilidade, verdade do dado e reversibilidade —
propriedades efetivas do sistema.

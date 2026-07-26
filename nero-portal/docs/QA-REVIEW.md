# QA / Code review — Portal Nero

> Primeira revisão do Nero. O `argo` já tinha `docs/QA-PLAN.md` e `docs/SECURITY-PLAN.md`
> com "Status final" no topo; o Nero nunca passou por isso. Mesmo formato: o que foi
> **corrigido**, o que foi **avaliado e aceito**, e o que segue **pendente** — com quem
> decide.

## Status final (2026-07-26)

| # | Achado | Severidade | Estado |
|---|---|---|---|
| 1 | `NERO_MONTHLY_BUDGET_USD` era medidor, não freio | **Crítico (financeiro)** | ✅ Corrigido |
| 2 | Allowlist de modelos uma geração atrás | Médio | ✅ Corrigido |
| 3 | Entrada de preço inalcançável (`claude-opus-4-8`) | Baixo | ✅ Corrigido |
| 4 | `FALLBACK` de preço quebrável em silêncio | **Alto (financeiro)** | ✅ Corrigido (erro de compilação) |
| 5 | Login por senha única, cookie de 30 dias sem expiração real | **Crítico (segurança)** | ✅ Corrigido na Fase 4 |
| 6 | `vercel-build` roda `prisma db push` a cada deploy | Alto | ⬜ Pendente — decisão do Diego |
| 7 | Invariante de `mutations.ts` só em comentário | Médio | ⬜ Pendente |
| 8 | Prompt injection pela Biblioteca | Médio | ⬜ Pendente — avaliar |
| 9 | Gate fecha se o Upstash cair | Médio | ⬜ Aceito por ora — confirmar |
| 10 | Sanitização do full-text (`to_tsquery`) | A verificar | ⬜ Pendente |
| 11 | `DEMO_SEED_ALLOWED` | Baixo | ⬜ Pendente |

---

## Corrigidos

### 1. O orçamento não freava nada (crítico, financeiro)

`getMonthUsage()` calculava `pct` para o `BudgetMeter` do header e **nada** impedia a chamada
seguinte. Um laço agêntico com até 8 turnos × 16k `max_tokens` podia passar do teto sem
obstáculo nenhum. Era o risco financeiro nº 1 do produto: o medidor mostrava 180% e o Nero
continuava gastando.

**Correção:** `assertWithinBudget()` em `src/lib/nero/usage.ts`, chamado por `streamTurn` —
o **único ponto de IA do portal**. Isso importa: o chat (`api/chat/route.ts`) e a geração
do report (`lib/nero/generate.ts`) passam os dois por `streamTurn`, então um guarda cobre
todas as chamadas ao modelo. A rota de chat também checa antes de abrir o stream, para o
estouro virar **429 legível** em vez de texto de erro dentro de um 200.

Duas decisões conscientes registradas no código:

- **Memo de 30s do gasto do mês.** Sem isso seriam 8 agregações por conversa. O TTL limita a
  carga no banco *e* o quanto o gasto pode passar do teto antes do freio perceber; a rota
  invalida o memo depois de gravar cada `UsageLog`.
- **Fail-OPEN se a leitura do gasto falhar.** O oposto transformaria uma indisponibilidade do
  Postgres em "o Nero parou". O teto é controle de **custo**, não de segurança — diferente do
  gate de acesso, que fecha. A falha é logada em nível de erro.

### 2 e 3. Allowlist de modelos e entrada morta

A allowlist liberava `claude-sonnet-4-6`, sucedido por `claude-sonnet-5` — mesmo preço de
tabela ($3/$15 por 1M) com qualidade bem maior em tarefa densa, e em **preço promocional
($2/$10) até 2026-08-31**. E `claude-opus-4-8` estava na tabela de preços sem nunca ser
alcançável (`resolveModel` aceita só haiku|sonnet): entrada morta.

**Atenção ao operar:** o Sonnet 5 usa tokenizer novo — **~30% mais tokens para o mesmo
texto**. O preço por token é igual, então o custo por turno sobe mesmo sem mudança de tabela.
É exatamente o tipo de surpresa que o freio do item 1 existe para conter.

### 4. `FALLBACK` de preço quebrável em silêncio (alto, financeiro)

Ao trocar o Sonnet, `FALLBACK = PRICES["claude-sonnet-4-6"]` virou `undefined` e `costOfTurn`
passou a lançar `TypeError`. **Eu cometi esse bug durante esta própria revisão** — o que é o
melhor argumento para a correção: `Record<string, Rates>` faz o TypeScript tipar
`PRICES["chave-inexistente"]` como `Rates` (e não `Rates | undefined`), então o compilador
não vê nada e o erro só aparece em runtime. Pior: se tivesse virado `NaN` em vez de lançar,
o custo iria a lixo **silenciosamente** e afrouxaria o freio — e custo errado não quebra
nada visível, só aparece na fatura.

**Correção em duas camadas:**

- `PRICES` passa a ser `as const satisfies Record<string, Rates>`. Chave errada agora é
  **erro de compilação** (`TS2551: Property 'claude-sonnet-4-6' does not exist. Did you mean
  'claude-sonnet-5'?`), verificado empiricamente.
- `scripts/test-nero-core.ts` (novo, 30 asserções, no CI) guarda o que o compilador não
  pega: a lista de modelos vive em **três** lugares que precisam concordar — a allowlist
  (`core.ts`), a tabela de preços (`pricing.ts`) e o seletor do cliente (`nero-chat.tsx`,
  separado de propósito para não arrastar o SDK da Anthropic para o bundle do browser). O
  teste também cobre a aritmética de cache (0,1× leitura / 1,25× escrita) e env de orçamento
  malformada (`""`, `"abc"`, `"0"`, `"-5"`, `"NaN"` → teto padrão finito, nunca infinito).

### 5. Login próprio (crítico, segurança) — corrigido na Fase 4

Era senha única compartilhada (`APP_PASSWORD`), cookie de **30 dias**, e o token era o
HMAC de uma **constante** — sem payload nem `exp`, então **não expirava de fato**; e sem
rate-limit. Substituído pelo gate do portal: identidade do NEO (`neo_session`, com e-mail
para auditoria) + senha própria do Nero com TTL 12h, rate-limit no Redis e log de quem
entrou. Detalhes em `argo/HANDOFF.md`.

---

## Pendentes

### 6. `prisma db push` a cada deploy (alto) — decisão do Diego

`vercel-build` é `prisma generate && prisma db push && next build`. Isso aplica schema
**sem trilha de migração**: drift silencioso, sem histórico do que mudou, sem rollback a não
ser restaurar backup. O `DEPLOY.md` compensa com ritual manual (branch Neon + `pg_dump` +
revisar `migrate diff`), o que é frágil por depender de disciplina — e a Fase 7 já removeu o
`db:reset` justamente porque foot-gun documentado não protege ninguém.

**Recomendação:** migrar para `prisma migrate deploy` com migrations versionadas no repo.
É a mudança que mais reduz risco operacional no handoff — mas **não** deve ser feita sem
janela e backup, e é decisão sua.

### 7. Invariante de `mutations.ts` (médio)

Entidade nova exige registro em `modelOf()` **e** em `ENTITY_DATE_FIELDS` no mesmo commit,
senão o **undo quebra**. Hoje isso é só um comentário. O sintoma seria auditoria que não
desfaz — descoberto em produção, no pior momento.
**Recomendação:** guarda em runtime (`modelOf` lança se a entidade não estiver nos dois
mapas) + caso em `scripts/test-state.ts`.

### 8. Prompt injection pela Biblioteca (médio)

`consultar_biblioteca` e `ler_documento` injetam conteúdo da tabela `Document` no contexto —
e o Nero tem **16 tools que escrevem estado**. Um documento com instruções embutidas é lido
como dado pelo modelo. O risco é limitado hoje porque quem popula a Biblioteca é a própria
equipe (não é upload de terceiro) e toda escrita é auditável/undoable via `StateVersion`.
**Recomendação:** delimitar o conteúdo recuperado com marcação explícita de "isto é dado,
não instrução" no prompt, e reavaliar antes de abrir upload para o cliente.

### 9. Gate fecha se o Upstash cair (médio) — confirmar

`api/gate.ts` devolve **503** quando o rate-limit não está disponível, em vez de validar
senha sem proteção anti-brute-force. Comportamento herdado do `api/tower.ts`. Medido nesta
revisão: com Upstash ausente, `POST /api/gate?scope=nero` → `503 {"error":"Proteção contra
tentativas indisponível"}`.

É defensável (não abrir mão do anti-brute-force), mas o efeito prático é que **uma queda do
Upstash tranca o Nero e a Torre**. Disponibilidade trocada por segurança — vale sua
confirmação explícita, e vale monitorar.

### 10. Sanitização do full-text (a verificar)

`lib/biblioteca/search.ts` monta busca full-text `portuguese` do Postgres. Confirmar como a
entrada do usuário chega ao `to_tsquery` (query malformada derruba a busca; `plainto_tsquery`
ou `websearch_to_tsquery` são as formas seguras).

### 11. `DEMO_SEED_ALLOWED` (baixo)

`prisma/seed-demo.ts` aborta sem a flag. Confirmar que a env não está setada em produção.

---

## Como rodar os gates

```bash
pnpm typecheck                         # 7 pacotes
pnpm lint
pnpm --filter @neo/auth test           # contrato de sessão (77 asserções)
pnpm --filter nero-portal test:core    # modelos, preços, orçamento (30 asserções)
npx tsx scripts/test-state.ts          # versionamento + undo — EXIGE branch Neon, não produção
```

Os quatro primeiros rodam no CI (`.github/workflows/ci.yml`). O `test-state.ts` é destrutivo
e fica de fora de propósito.

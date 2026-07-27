# Nero enterprise — arquitetura, custo e incorporação

**Para:** LM Mobilidade · **De:** Blite / Venice Tech · **Data:** 2026-07-26

Este documento descreve o que é necessário para o Nero deixar de ser uma ferramenta operada
pela Blite e passar a ser **um ativo do LM**, rodando na infraestrutura do LM, sob a governança
do LM, em escala de banco/empresa de grande porte.

Os números de custo aqui **não são estimativa de fornecedor**: saem de 198 turnos reais
medidos em produção. Onde há projeção, a premissa está escrita.

---

## 1. Sumário executivo

O Nero hoje já funciona: catálogo vivo, radar de maturidade DAMA, report quinzenal, academia,
tudo com trilha de auditoria e undo. O que muda ao levar para o domínio do LM não é a
capacidade — é **quem responde pelo dado, pela identidade e pela conta**.

| Dimensão | Hoje (operado pela Blite) | Enterprise (ativo do LM) |
|---|---|---|
| Identidade | Sessão do portal NEO + senha compartilhada | SSO corporativo (Entra ID/OIDC) + RBAC por papel de governança |
| Dado | Postgres gerenciado (Neon), fora do perímetro do LM | Postgres no perímetro do LM, com retenção e classificação próprias |
| Modelo | Claude API direto | Claude API, Bedrock ou Azure — decisão de compliance, não técnica |
| Custo | ~US$ 0,086/turno, teto de US$ 20/mês | Modelo por porte, com FinOps e teto por área |
| Conhecimento | Kit DAMA + full-text | Kit + RAG vetorial **quando o recall exigir**, não antes |
| Sustentação | Blite | LM, com transição assistida |

**O que o LM compra:** um advisor de governança que já entende o método (DAMA-DMBOK2), já tem o
catálogo do LM dentro, e um caminho de incorporação em 3 fases sem reescrever nada.

**O que o LM assume:** identidade, perímetro de dado, conta de LLM e sustentação.

---

## 2. Arquitetura alvo, ponta a ponta

```
   IDENTIDADE                    ORQUESTRAÇÃO                      MODELO
  ┌───────────┐          ┌──────────────────────┐         ┌──────────────────┐
  │ Entra ID  │─ OIDC ──▶│  Nero Core            │────────▶│ Claude           │
  │ (SSO LM)  │          │  ÚNICO ponto de IA    │         │ (API/Bedrock/    │
  └───────────┘          │  · monta contexto     │◀────────│  Azure)          │
        │                │  · laço agêntico      │         └──────────────────┘
        ▼                │  · 16 tools de escrita│                 ▲
  ┌───────────┐          └───────┬──────────┬────┘                 │
  │ RBAC      │                  │          │              ┌───────┴────────┐
  │ (papéis   │       ┌──────────▼──┐  ┌────▼──────────┐   │  GUARDRAILS    │
  │  DAMA)    │       │ ESTADO VIVO │  │ CONHECIMENTO  │   │ · LGPD/PII     │
  └───────────┘       │ Postgres    │  │ · kit DAMA    │   │ · status de    │
                      │ + Version   │  │ · Biblioteca  │   │   verdade      │
                      │  (auditoria │  │ · RAG         │   │ · injection    │
                      │   e undo)   │  └───────────────┘   │ · aprovação    │
                      └─────────────┘                      │   humana       │
                             │                             └────────────────┘
                             ▼
              SUPERFÍCIES: chat · catálogo · radar · report · academia
```

Três propriedades desta arquitetura merecem destaque, porque são o que a torna auditável:

1. **Ponto único de IA.** Toda chamada ao modelo passa por um só lugar. É o que permite
   instrumentar custo, aplicar teto, e no futuro trocar de provedor sem tocar em feature.
2. **Toda escrita é versionada.** Estado muda por transação + snapshot, na mesma transação.
   Existe undo e existe trilha de quem/quando.
3. **Todo fato carrega status de verdade.** `template` / `assumido` / `confirmado` / `lacuna` +
   proveniência. O sistema não confunde o ideal do método com a realidade do LM.

---

## 3. Base de conhecimento e RAG — e quando NÃO adotar vetores

**Hoje:** busca full-text `portuguese` do Postgres, sem embeddings. O Nero consulta a Biblioteca
sob demanda por tool e **cita** o que usou.

Isso é adequado para o corpus atual (dezenas de documentos, vocabulário controlado de
governança). Vetores custam indexação, reindexação, e uma dependência a mais.

**Critério objetivo para migrar para pgvector + embeddings + reranking** — adotar quando
qualquer um se confirmar, medido e não sentido:

| Sinal | Como medir |
|---|---|
| Recall insuficiente | Conjunto de 30–50 perguntas reais com resposta conhecida; taxa de recuperação do documento correto abaixo de ~85% |
| Vocabulário divergente | Usuários buscam por sinônimo/paráfrase que o full-text não alcança (mensurável nos logs de busca sem resultado) |
| Escala do corpus | Acima de ~1.000 documentos, ou documentos longos onde o trecho relevante se perde |

**Custo de adotar:** indexação inicial + reindexação a cada mudança. Para 1.000 documentos de
~2.000 tokens, embeddings ficam na casa de **dólares únicos**, não centenas — o custo real é de
engenharia e manutenção, não de API.

**Recomendação:** não adotar agora. Instrumentar as três métricas acima e revisar por trimestre.

---

## 4. Orquestração (harness)

O laço agêntico já tem os limites que importam: teto de turnos, fechamento garantido quando o
trabalho excede o teto, e continuação quando a resposta é cortada por limite de tokens.

Para escala enterprise, três acréscimos:

| Item | Por quê |
|---|---|
| **Fila para geração longa** | O report roda dentro do teto de 60s da função. Com mais dados isso aperta: mover para trabalho assíncrono com status |
| **Idempotência nas tools** | Retry não pode duplicar entrada de catálogo. Parte já é idempotente; padronizar |
| **Traces com replay** | Poder reexecutar um turno com o mesmo contexto é o que torna incidente de IA investigável |

---

## 5. Guardrails

O que já existe, e é o alicerce:

| Guardrail | Implementação |
|---|---|
| **Status de verdade** | `provenance.ts` — código, não convenção |
| **LGPD/PII** | Kit 06 + gate de consentimento na UI + página `/privacidade` |
| **Allowlist de modelos** | Só modelos aprovados; entrada do cliente validada |
| **Saída auditável** | `StateVersion` em toda escrita, com undo |
| **Teto de custo** | Freio real em `streamTurn`, não medidor |

O que precisa endurecer para escala:

- **Prompt injection pela Biblioteca.** Conteúdo recuperado entra no contexto de um agente com
  16 tools de escrita. Hoje o risco é contido porque **quem popula a Biblioteca é a equipe**.
  No momento em que o LM abrir upload para as áreas, isto passa a ser a superfície de ataque
  principal: delimitar o conteúdo recuperado como dado (nunca instrução), e considerar
  aprovação humana para escrita disparada a partir de documento recuperado.
- **Aprovação humana em escrita sensível.** Hoje o Nero escreve e o humano desfaz. Para
  catálogo que alimenta decisão regulatória, inverter em pontos específicos: propõe → humano
  aprova → grava.
- **Classificação de saída.** Marcar no artefato gerado quais campos vieram de fato confirmado
  e quais de inferência — o dado já existe no modelo, falta expor no PDF/markdown.

---

## 6. Identidade e acesso

**Hoje:** sessão do portal NEO (OTP + allowlist) + senha compartilhada do Nero. Adequado para
uma equipe pequena de governança; **não** adequado para uma empresa de grande porte.

**Alvo:**

| Camada | Alvo |
|---|---|
| Autenticação | **Entra ID / OIDC** — sem senha compartilhada, com MFA da política do LM |
| Autorização | **RBAC por papel de governança**: Data Owner, Steward, Custodian, leitor. Já existe precedente no portal (papéis do MMA em RLS) |
| Auditoria | Quem leu o quê, não só quem escreveu. Hoje a escrita é auditada; a leitura de catálogo sensível também deveria ser |
| Retenção | Política de retenção de conversas e artefatos, alinhada à do LM |
| Offboarding | Saída no IdP revoga acesso em minutos — hoje depende de trocar senha compartilhada |

A troca de senha compartilhada por SSO é a **primeira** coisa a fazer na incorporação: é o item
que mais reduz risco por unidade de esforço.

---

## 7. Modelo e tuning — a recomendação honesta

**Não faça fine-tune.** Ordem de investimento, da maior para a menor relação
benefício/esforço:

1. **Kit de conhecimento** — melhorar o método escrito é o que mais move a qualidade
2. **RAG** — dar acesso ao dado certo na hora certa
3. **Evals** — conjunto de casos de governança com resposta esperada, para medir regressão
4. **Prompt/effort tuning** — barato, reversível
5. **Fine-tune** — só se 1–4 estiverem esgotados

**Quando fine-tune se justificaria:** quando existir volume grande de exemplos de saída
*aprovada pelo LM* em formato muito específico e o prompt não conseguir mais garantir aderência
— e ainda assim, comparar contra RAG com exemplos antes de decidir. Fine-tune congela
conhecimento e cria dívida de manutenção a cada versão de modelo.

**O que já está feito e é o maior ganho de custo:** prompt caching. O prefixo do kit é cacheado
e leitura de cache custa ~10% do input. Ver a aritmética na §9.

**Seleção de modelo:** hoje Haiku (padrão, rápido e barato) e Sonnet (tarefa densa). O
roteamento entre eles é a alavanca de custo mais direta. Atenção ao trocar de geração: modelos
novos podem usar **mais tokens para o mesmo texto**, então custo por turno sobe mesmo com preço
por token igual — motivo pelo qual o teto de orçamento existe.

---

## 8. Hospedagem — três cenários

| | (a) Gerenciado (hoje) | (b) Cloud do LM | (c) VPC isolada |
|---|---|---|---|
| Compute | Vercel | Container (ECS/Container Apps/GKE) | idem, sem egress público |
| Banco | Neon | Postgres gerenciado do LM | Postgres no VPC |
| LLM | Claude API | Bedrock ou Azure (rede do LM) | idem, via endpoint privado |
| Identidade | portal NEO | Entra ID | Entra ID |
| Quem opera | Blite | LM | LM |
| Esforço | — | médio | alto |

**(b) e (c) estão parcialmente preparados.** O que é verdade hoje: `next.config.ts` usa
`output: "standalone"`, e existe um `Dockerfile`. O que NÃO é verdade: o container não
builda. A versão anterior deste parágrafo dizia "não é promessa — é o que já existe",
enquanto o `Dockerfile` copiava um `package-lock.json` inexistente, rodava `npm ci` num
workspace pnpm, copiava um `public/` que não existe e aplicava `prisma db push` no start do
container. Foi corrigido estruturalmente em 2026-07-27 e **continua sem build de validação**
— ver o cabeçalho do próprio `Dockerfile`.

**Antes de vender (b) como pronto:** `docker build -f nero-portal/Dockerfile .` da raiz do
monorepo tem de passar, a imagem tem de subir, e a migration tem de rodar como passo
separado do start. Até então, (b) é um caminho projetado, não um caminho testado.

**Recomendação:** ir para **(b)**. O cenário (c) só se a classificação do catálogo exigir
isolamento de rede — decisão de segurança do LM, não técnica.

---

## 9. Custo — medido e projetado

### Base real (produção, 2026-07-26)

| Métrica | Valor |
|---|---|
| Registros de consumo | 198 turnos |
| Mês corrente | **US$ 6,91** em 80 turnos |
| **Custo por turno** | **~US$ 0,086** |

Preços vigentes (por 1M de tokens): Haiku 4.5 US$ 1 / US$ 5 · Sonnet US$ 3 / US$ 15. Leitura de
cache ~0,1× do input; escrita de cache ~1,25×.

### Projeção por porte

**Premissas, explícitas:** US$ 0,10/turno (o medido, arredondado para cima); 22 dias úteis;
mistura Haiku/Sonnet semelhante à atual; prompt caching ativo. São **faixas**, não orçamento.

| Cenário | Usuários ativos | Turnos/usuário/dia | LLM/mês | Infra/mês | Total/mês |
|---|---|---|---|---|---|
| **Piloto** (hoje) | 2–3 | ~2 | US$ 10–30 | US$ 0–20 | **US$ 10–50** |
| **1 domínio de dados** | 10–15 | 5 | US$ 110–165 | US$ 50–150 | **US$ 160–315** |
| **Enterprise** (multi-domínio) | 50–80 | 5 | US$ 550–880 | US$ 300–800 | **US$ 850–1.700** |

O custo de LLM é **modesto e previsível**. O custo dominante em escala não é token: é
**pessoas** (§10).

### Alavancas de FinOps, em ordem de eficácia

1. **Prompt caching** — já ativo. É a maior alavanca: o prefixo do kit é grande e estável, e
   leitura de cache custa ~10% do input.
2. **Roteamento de modelo** — Haiku para rotina, Sonnet só para tarefa densa.
3. **Teto por escopo** — hoje há teto global; para múltiplas áreas, teto por área.
4. **Effort/verbosidade** — resposta mais curta em tarefa rotineira.

### O que NÃO fazer

Desligar o teto "para não travar o usuário". Ele existe porque, antes dele, o medidor mostrava
180% e o sistema continuava gastando. Custo errado não quebra nada visível — aparece na fatura.

---

## 10. Sustentação e SLO

| Item | Recomendação |
|---|---|
| Disponibilidade | 99,5% em horário comercial. Não é sistema transacional |
| RPO / RTO | RPO 24h / RTO 4h. Branch de banco antes de mudança de schema já é prática |
| Monitoramento | Erro de tool, taxa de refusal, custo/dia contra teto, latência do turno |
| Alertas | Teto em 80%; falha de persistência de consumo (hoje só loga) |
| On-call | Não precisa 24×7. Horário comercial com escalonamento |
| Gestão do kit | O kit é o cérebro: versionado, com revisão por par. Mudança nele muda o comportamento mais que mudança de código |
| Ciclo de reavaliação | Trimestral: métricas de recall (§3), evals de governança, revisão de custo |

**Equipe mínima em regime:** 0,5 FTE de engenharia (sustentação e evolução) + 1 FTE de
governança de dados (dono do kit e do método). O segundo é o papel que o LM precisa assumir —
não é terceirizável, porque é o dono do conteúdo.

---

## 11. Plano de incorporação

### Fase 1 — Identidade e perímetro (4–6 semanas)

- SSO Entra ID substituindo a senha compartilhada
- RBAC por papel de governança
- Migração do banco para o perímetro do LM, com política de retenção
- **Entregável:** Nero rodando com identidade do LM, dado no perímetro do LM
- **Fica com a Blite:** condução técnica

### Fase 2 — Infraestrutura e operação (4–6 semanas)

- Deploy no cenário (b): container na cloud do LM
- LLM via Bedrock/Azure, se compliance exigir
- Monitoramento, alertas e runbooks no padrão do LM
- Evals de governança automatizados
- **Entregável:** Nero operável pelo time do LM
- **Fica com a Blite:** transferência de conhecimento e plantão assistido

### Fase 3 — Autonomia (4 semanas)

- Time do LM assume sustentação, com a Blite em consultoria
- Dono do kit designado no LM
- Revisão trimestral estabelecida
- **Entregável:** Nero como ativo do LM
- **Fica com a Blite:** evolução de produto, sob demanda

### Riscos da incorporação

| Risco | Mitigação |
|---|---|
| Ninguém no LM assume o kit | Definir o dono **na Fase 1**, não na 3. Sem dono, o Nero congela |
| SSO atrasa por fila de TI | Começar a conversa antes da Fase 1; é o caminho crítico |
| Custo de LLM surpreende | Teto por área desde a Fase 1 + revisão mensal nos 3 primeiros meses |
| Catálogo envelhece | O status de verdade expõe isso: `assumido` que não vira `confirmado` é dívida visível |

---

## 12. Decisões abertas

Precisam do LM, não da Blite:

1. **Provedor de LLM** — Claude API direto (mais simples, mesmo preço) ou Bedrock/Azure (rede e
   contrato do LM)? Decisão de compliance.
2. **Isolamento de rede** — cenário (b) ou (c)? Depende da classificação do catálogo.
3. **Retenção de conversas** — quanto tempo guardar? Afeta LGPD e custo de armazenamento.
4. **Aprovação humana** — quais escritas passam a exigir aprovação em vez de undo?
5. **Escopo de upload da Biblioteca** — abrir para as áreas exige o hardening de injection da §5
   **antes**.
6. **Dono do kit no LM** — a decisão mais importante e a menos técnica.

---

### Anexos

- Achados técnicos abertos: [`QA-REVIEW.md`](QA-REVIEW.md)
- Arquitetura do portal e restrições de plataforma: [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md)
- Handoff da ferramenta: [`../HANDOFF.md`](../HANDOFF.md)
- Runbook de banco: [`../DEPLOY.md`](../DEPLOY.md)

# 07 — CADÊNCIA, RITUAIS DE MEMÓRIA E ESCALONAMENTO

Modelo operacional que faz o Nero funcionar na prática. Sem o ritual, a memória não se sustenta.

---

## 1. Ritual de memória (auto retroalimentação na prática)
A "auto retroalimentação" tem humano no meio — o Claude não reescreve sozinho o conhecimento do Projeto.
Dono primário da atualização: **Analista de GOV** (backup: você).

> Regra de ouro: **um dono por vez.** O backup só edita se o primário estiver indisponível, e sempre com timestamp, para não gerar versões conflitantes.

**Fluxo por sessão:**
1. **Início:** o Nero lê o `01_MEMORIA_PROJETO.md` (estado atual = verdade).
2. **Durante:** decisões, pendências e riscos vão sendo discutidos.
3. **Fim:** o Nero gera o bloco **📌 DELTA DE MEMÓRIA** (só o que mudou).
4. **Atualização:** o dono primário aplica o delta na cópia canônica do `01_MEMORIA` e re-sobe ao Projeto do Nero.
5. **Timestamp:** atualizar "Última atualização: AAAA-MM-DD / por: ____" no topo do arquivo.

**Frequência:** ao fim de toda sessão relevante; no mínimo 1x por dia de trabalho ativo.
**Backup (não é fonte da verdade):** o recurso de memória / "buscar conversas anteriores" do Claude pode ficar ligado como rede de segurança. O estado oficial é sempre o `01_MEMORIA`.

## 2. Disciplina de tokens (ligada ao ritual)
- Conhecimento-base do Projeto = os arquivos `00`–`07` + glossário. Nada além disso fixo.
- Catálogo completo, DDLs, material de treinamento = anexos **sob demanda**, não ficam no contexto base.
- Report e status saem do `01_MEMORIA`, nunca de releitura de conversas.
- Se o contexto inchar, o Nero avisa e propõe o que arquivar.

## 3. Calendário de reports (quinzenal)

| Report | Quinzena | Data-alvo | Responsável |
|---|---|---|---|
| #1 (Q1) | Semanas 1–2 | AAAA-MM-DD | |
| #2 (Q2) | Semanas 3–4 | | |
| #3 (Q3) | Semanas 5–6 | | |
| … | … | | |
| #12 (Q12) | Semanas 23–24 | | |

- Ancorar as datas ao kickoff assim que ele for definido.
- Destinatários: sponsor LM + liderança Blite. Definir lista.
- Gerar sempre a partir do template `04` + estado do `01_MEMORIA`.

## 4. Escada de escalonamento de dependências do LM
Princípio: a responsabilidade da entrega é nossa. Tolerância de espera = 1 dia. O trilho paralelo roda sempre, em paralelo a qualquer cobrança.

| Momento | Ação | Quem |
|---|---|---|
| Dia 0 | Solicitar à Priscila (ponto focal) + iniciar trilho paralelo | Analista de GOV / você |
| Dia 1 | Cobrar de novo + oferecer fazer sem o cliente / propor workaround | Analista de GOV / você |
| Dia 2+ | Marcar bloqueio vermelho no report e escalar acima da Priscila | você |

> Nuance importante: cobrança nossa é diária e implacável; escalonamento formal acima da Priscila é graduado. Escalar todo dia desgasta o ponto focal e aumenta a fricção do cliente. A Priscila é o canal; usá-la bem é o que destrava o LM.

## 5. Papéis

| Papel | Quem | Responsabilidade |
|---|---|---|
| Condutor do Nero (project driver) | ____ | Conduz sessões, pede report |
| Dono primário da memória | Analista de GOV | Atualiza e re-sobe o `01_MEMORIA` |
| Backup da memória | Você | Atualiza na ausência do primário |
| Ponto focal no LM | Priscila | Destrava informações/acessos |
| Escalonamento acima da Priscila | ____ (definir no LM) | Decisão quando a Priscila não destrava |

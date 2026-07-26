# Roteiro da demo — checkpoint LM (~15 min)

> **Preparação (antes da reunião):**
> 1. Ambiente de demo apontando para a branch Neon `demo` (NUNCA produção).
>    Rodar `DEMO_SEED_ALLOWED=true npm run db:seed:demo` na branch de demo.
> 2. Rodar o seed base antes (`npm run db:seed`) se a branch estiver vazia.
> 3. Gerar 1 report em `/report` na véspera (para existir um Q1 no histórico).
> 4. Testar o "Exportar PDF" no Chrome/Edge da máquina que vai apresentar.
> 5. Abas abertas, nesta ordem: `/` (chat), `/catalogo`, `/academia`, `/report`.
>
> **Mensagem-mãe da demo:** *"PPT mente por omissão; o Nero não consegue."*
> Tudo que aparecer na tela vem do estado real, com selo de verdade
> (confirmado / assumido / lacuna) e trilha de auditoria.

---

## 1. Abertura com a dor, não com a feature (2 min)

Fala: *"Hoje, saber o status real deste projeto exige montar um PPT. Saber quem
é dono de um dado exige e-mail e dias de espera. Nos próximos 12 minutos vocês
vão ver as duas coisas acontecerem em segundos — a partir da operação real, não
de slides."*

## 2. Pergunta ao vivo (3 min) — aba `/`

Convide alguém da plateia a perguntar. Se ninguém topar, use:
- *"O que está travando a fase atual e há quantos dias?"*
- *"Qual o risco mais alto do projeto hoje?"*

**Apontar na resposta:** o Nero cita o aging em dias úteis e o status de verdade
de cada fato. Fala: *"Reparem: ele diz o que é confirmado e o que ainda é
lacuna. Ele não tem como maquiar — a auditoria de toda escrita fica no portal."*

## 3. Documentação assistida ao vivo (4 min) — aba `/` → `/catalogo`

Peça ao Nero algo como: *"Documente a tabela silver.logistica.entregas: 1 linha =
1 entrega, atualizada de hora em hora, owner Gerente de Logística, campos
id_entrega (string, PK), id_pedido (string, FK), data_prevista (date),
data_real (date), status (no_prazo|atrasado|extraviado). Contém id_cliente,
dado pessoal."*

Abra `/catalogo` → a entrada está lá, no padrão Golden Example, com selo de
sensibilidade e % de completude. **Apontar o alerta LGPD** (dado pessoal sem base
legal registrada — "o portal sinaliza, o DPO decide").

Fala: *"Cada sessão de discovery com uma área produz ISTO — permanente,
pesquisável, com dono. A informação que a área dá volta como serviço para ela."*

## 4. O Nero dá aula (3 min) — aba `/academia`

Abra a trilha "Como encontrar e usar dados governados no LM", passo 2. Convide
alguém a clicar em *"Me guie por este passo do começo"* no chat do tutor.

Fala: *"Isto não é um portal de documentos. É um consultor que treina o time de
vocês — no contexto, na hora da dúvida, usando as tabelas reais de vocês como
exemplo. Um Confluence não faz pergunta de volta."*

## 5. Report em 1 clique (2 min) — aba `/report`

Clique em **"Gerar report da quinzena"** na frente deles. Abra o report: sumário
executivo, radar de maturidade DAMA (1–2 → meta 3), aging das dependências,
riscos. Clique **"Exportar PDF"**.

Fala: *"Isto se produz sozinho, toda quinzena, a partir da operação real. E quem
vive no Confluence continua recebendo lá"* — mostre o **"Copiar como markdown"**.

## 6. Fechamento com a troca (2 min)

Mostre o radar de novo. Fala: *"Este radar está quase todo em 'assumido' e
'lacuna' — de propósito: nós não fingimos saber. Para ele virar 'confirmado',
precisamos de X horas com as áreas A e B. Cada hora investida vira resposta
permanente no portal e conteúdo que o Nero usa para treinar o time de vocês.
Esse é o acordo que estamos propondo hoje."*

> **Se perguntarem "quanto custa / o que vem depois":** Fase 2 — acesso
> self-service para usuários do LM, trilhas por área, publicação automática no
> Confluence e RAG sobre os documentos pesados do LM. Proposta comercial a
> construir com o sponsor.

---

## Plano B (falhas ao vivo)

- **API da Anthropic fora / budget estourado:** o report ainda gera (narrativa
  determinística de fallback). Para o chat, tenha um vídeo curto gravado da
  interação como reserva.
- **Ninguém quer interagir:** siga o roteiro você mesmo — as falas acima cobrem.
- **Pergunta hostil ("isso substitui a gente?"):** *"Não — isso tira de vocês o
  trabalho de responder a mesma pergunta pela quinta vez. Quem conhece o dado
  vira owner visível, não help desk."*

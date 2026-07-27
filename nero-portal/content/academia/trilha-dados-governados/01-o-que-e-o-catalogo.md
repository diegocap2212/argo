---
titulo: O que é o catálogo (e por que ele te economiza tempo)
objetivo: Entender o que é o catálogo de dados, o que ele responde e quando consultá-lo antes de pedir ajuda por e-mail.
---

## O problema que você já viveu

Você precisa de um número para a reunião de amanhã. Sabe que o dado "existe em
algum lugar", mas:

- não sabe **em qual tabela** está;
- não sabe **quem é o dono** para perguntar;
- e quando acha algo, não sabe **se pode confiar** naquele campo.

Resultado: e-mail para três pessoas, dois dias de espera, e um número que ninguém
garante.

## O que é o catálogo

O **catálogo de dados** é o inventário das tabelas do Data Lake — como o catálogo
de uma biblioteca. Para cada tabela ele responde, numa página só:

| Pergunta | Campo do catálogo |
|---|---|
| O que tem aqui dentro? | Descrição e **grão** ("1 linha = 1 pedido") |
| Está atualizado? | Frequência de atualização |
| Quem responde por isso? | **Owner** do domínio |
| Posso usar livremente? | Classificação de **sensibilidade (LGPD)** |
| De onde vem esse dado? | **Lineage** (origem → destino) |

> **Regra prática:** antes de perguntar por e-mail "onde acho X?", pergunte ao
> catálogo — ou ao Nero, aqui do lado, que consulta o catálogo por você.

## Teoria × realidade

Cada informação do catálogo carrega um selo de **status de verdade**:
**confirmado** (validado pelo owner), **assumido** (registrado, mas ainda não
validado) ou **lacuna** (ainda não sabemos). Isso é proposital: o catálogo nunca
finge saber o que não sabe — diferente de uma planilha solta.

---

**Experimente agora:** pergunte ao Nero, no chat ao lado, *"o que o catálogo já
tem documentado?"* — e depois *"o que significa o grão de uma tabela?"*.

---
titulo: Lendo uma entrada do catálogo (o Golden Example)
objetivo: Aprender a ler as 5 seções de uma tabela documentada — catálogo, dicionário, lineage, LGPD e qualidade — e saber o que checar antes de usar o dado.
---

## As 5 seções de uma tabela documentada

Toda tabela documentada no portal segue o mesmo padrão (o "Golden Example").
Abra qualquer entrada em **Catálogo** e você verá:

### A. Entrada de catálogo — "o RG da tabela"
Camada, domínio, owner, grão, atualização. **Primeira checagem:** o grão. Se
"1 linha = 1 item de pedido" e você somar o campo `valor` achando que é 1 linha
por pedido, seu número vai sair inflado.

### B. Dicionário de dados — "o manual de cada campo"
Para cada coluna: tipo, descrição, regra de cálculo e **domínio de valores**
(ex.: `status ∈ ATIVO | CANCELADO`). **Segunda checagem:** a regra do campo que
você vai usar. "Receita líquida" líquida de quê?

### C. Lineage — "de onde vem"
O caminho do dado: sistema de origem → transformações → tabela final. Serve para
responder "por que esse número difere do sistema X?".

### D. Classificação LGPD — "posso usar?"
`público`, `interno`, `pessoal` ou `pessoal sensível`. Se for **pessoal**, o uso
tem regras (base legal, minimização) — na dúvida, envolva o owner antes de
exportar qualquer coisa.

### E. Notas de qualidade — "as pegadinhas conhecidas"
Regras e ressalvas que quem usa a tabela todo dia já sabe ("valores antes de
2023 estão em outra moeda").

## O selo de completude

Cada entrada mostra um **% de completude** (checklist de 6 itens). 100% =
documentação validada pelo owner. Abaixo disso, use com o senso crítico
correspondente — o portal mostra exatamente **o que falta**.

---

**Experimente agora:** peça ao Nero — *"me guie pela leitura de uma tabela do
catálogo, seção por seção"*. Se o catálogo ainda estiver vazio, ele usa o
exemplo-padrão `gold.vendas.fato_pedidos`.

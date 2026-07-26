# 09 — GOLDEN EXAMPLE: tabela bem documentada (padrão a replicar)

Este é o padrão de "pronto" para documentar uma tabela. O Nero replica e cobra este formato para toda tabela priorizada. O exemplo abaixo é **fictício/ilustrativo** — substituir por tabelas reais do LM.
Lembrete: só metadados/schema entram aqui; exemplos de valor são fictícios (ver `06`).

---

## A. Entrada de CATÁLOGO (nível tabela)

| Campo | Valor (exemplo fictício) |
|---|---|
| Nome do ativo | `gold.vendas.fato_pedidos` |
| Camada/zona | Gold |
| Domínio | Vendas |
| Descrição funcional | Um registro por pedido finalizado; base de receita e volume de vendas |
| Owner do domínio | Gerente de Vendas (definir) |
| Steward (mantém doc) | Analista de GOV |
| Grão (granularidade) | 1 linha = 1 pedido |
| Atualização | Diária (D-1), via pipeline `ingest_pedidos` |
| Volume aproximado | ~2,5M linhas |
| Classificação de sensibilidade | Interno; contém dado pessoal (`id_cliente`) → ver coluna |
| Sistemas de origem | ERP de vendas |
| Tabelas relacionadas | `dim_cliente`, `dim_produto`, `dim_loja`, `dim_tempo` |
| Status da doc | ✅ Validada pelo owner em AAAA-MM-DD |

## B. DICIONÁRIO (nível campo)

| Campo | Tipo | Descrição / regra de negócio | Domínio de valores | Nulo? | Sensibilidade |
|---|---|---|---|---|---|
| id_pedido | string | Identificador único do pedido (PK) | — | Não | Interno |
| id_cliente | string | FK para `dim_cliente`; identifica o cliente | — | Não | Pessoal (LGPD) |
| id_produto | string | FK para `dim_produto` | — | Não | Interno |
| id_loja | string | FK para `dim_loja` | — | Não | Interno |
| data_pedido | date | Data de finalização do pedido | — | Não | Interno |
| valor_bruto | decimal(12,2) | Valor antes de descontos, em BRL | ≥ 0 | Não | Interno |
| valor_desconto | decimal(12,2) | Soma dos descontos aplicados | ≥ 0 | Sim | Interno |
| valor_liquido | decimal(12,2) | `valor_bruto - valor_desconto`; base de receita líquida | ≥ 0 | Não | Interno |
| status_pedido | string | Situação do pedido | {finalizado, cancelado, devolvido} | Não | Interno |
| canal | string | Canal de venda | {loja, ecommerce, app} | Não | Interno |

## C. RELACIONAMENTOS (lineage simplificado)

```
fato_pedidos.id_cliente  → dim_cliente.id_cliente
fato_pedidos.id_produto  → dim_produto.id_produto
fato_pedidos.id_loja     → dim_loja.id_loja
fato_pedidos.data_pedido → dim_tempo.data
```

## D. CLASSIFICAÇÃO LGPD (ver `06`)
- Contém **dado pessoal** (`id_cliente`) → tabela exige controle de acesso e base legal documentada.
- Não contém dado sensível (saúde, biometria, etc.).
- Base legal do uso de `id_cliente`: (a definir com DPO/jurídico do LM).
- Em exemplos de query/treinamento, não expor `id_cliente` sem necessidade (minimização).

## E. QUALIDADE (notas)
- Regra esperada: `valor_liquido = valor_bruto - valor_desconto` (candidata a check de qualidade).
- Pedidos `cancelado`/`devolvido` não entram no cálculo de receita — alerta para analistas (erro comum).

---

## Checklist "definição de pronto" para documentar uma tabela
- [ ] Entrada de catálogo completa, com owner e grão
- [ ] Todos os campos no dicionário com tipo, regra e domínio de valores
- [ ] Sensibilidade marcada por campo + classificação LGPD da tabela
- [ ] Relacionamentos/FKs mapeados
- [ ] Pelo menos uma regra de qualidade e uma "pegadinha" para analistas
- [ ] Validada por um owner do domínio (com data)

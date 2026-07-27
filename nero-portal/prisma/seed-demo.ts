import { PrismaClient } from "@prisma/client";
import { DAMA_AREAS } from "../src/lib/state/dama";

/**
 * Seed do MODO DEMO — popula uma cópia ISOLADA do banco (branch Neon `demo`
 * ou Postgres local) com dados de demonstração: Golden Example completo no
 * catálogo, radar de maturidade plausível, stack parcialmente confirmado,
 * decisões e baseline. NUNCA rodar contra produção.
 *
 * Uso: DEMO_SEED_ALLOWED=true npm run db:seed:demo
 */

if (process.env.DEMO_SEED_ALLOWED !== "true") {
  console.error(
    "ABORTADO: seed-demo só roda com DEMO_SEED_ALLOWED=true — e apenas contra a " +
      "branch/banco de demo, nunca produção. (Proteção contra contaminar dados reais.)",
  );
  process.exit(1);
}

const prisma = new PrismaClient();

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

async function main() {
  // ---- Radar de maturidade: LM em 1–2, meta 3 (kit 08 §5) ----
  const niveis: Record<string, { atual: number; meta: number; just: string }> = {
    "Data Governance": { atual: 1, meta: 3, just: "Sem papéis formais de governança; decisões ad hoc." },
    "Data Architecture": { atual: 2, meta: 3, just: "Data Lake em camadas existe, mas blueprint não documentado." },
    "Data Modeling & Design": { atual: 2, meta: 3, just: "Modelos existem no BI, sem padrão corporativo." },
    "Data Storage & Operations": { atual: 2, meta: 3, just: "Operação estável; sem guias de consumo/otimização." },
    "Data Security": { atual: 2, meta: 3, just: "Acesso controlado, mas sem classificação sistemática." },
    "Data Integration & Interoperability": { atual: 2, meta: 3, just: "Pipelines funcionam; documentação dispersa." },
    "Document & Content Management": { atual: 1, meta: 3, just: "Sem portal central; conhecimento em planilhas e cabeças." },
    "Reference & Master Data": { atual: 1, meta: 2, just: "Dados-mestre sem dono definido (lacuna consciente do MVP)." },
    "Data Warehousing & BI": { atual: 2, meta: 3, just: "BI consolidado, mas métricas sem glossário único." },
    Metadata: { atual: 1, meta: 3, just: "Sem catálogo/dicionário formais — foco central do projeto." },
    "Data Quality": { atual: 1, meta: 2, just: "Sem checks formais (entra no roadmap de maturidade, F6.4)." },
  };
  for (let i = 0; i < DAMA_AREAS.length; i++) {
    const area = DAMA_AREAS[i];
    const n = niveis[area];
    await prisma.maturityAssessment.upsert({
      where: { area },
      update: {
        nivelAtual: n.atual,
        nivelMeta: n.meta,
        justificativa: n.just,
        statusVerdade: "assumido",
        proveniencia: "Avaliação inicial Blite (demo) — validar com LM",
        avaliadoEm: daysAgo(2),
        ordem: i,
      },
      create: {
        area,
        nivelAtual: n.atual,
        nivelMeta: n.meta,
        justificativa: n.just,
        statusVerdade: "assumido",
        proveniencia: "Avaliação inicial Blite (demo) — validar com LM",
        avaliadoEm: daysAgo(2),
        ordem: i,
      },
    });
  }
  console.log("Radar de maturidade populado (11 áreas).");

  // ---- Catálogo: Golden Example completo (kit 09) ----
  const campos = [
    { nome: "id_pedido", tipo: "string", descricao: "Identificador único do pedido (PK)", regra: null, dominioValores: null, nullable: false, sensibilidade: "interno" },
    { nome: "id_cliente", tipo: "string", descricao: "FK para dim_cliente; identifica o cliente", regra: "Não expor sem necessidade (minimização LGPD)", dominioValores: null, nullable: false, sensibilidade: "pessoal" },
    { nome: "id_produto", tipo: "string", descricao: "FK para dim_produto", regra: null, dominioValores: null, nullable: false, sensibilidade: "interno" },
    { nome: "id_loja", tipo: "string", descricao: "FK para dim_loja", regra: null, dominioValores: null, nullable: false, sensibilidade: "interno" },
    { nome: "data_pedido", tipo: "date", descricao: "Data de finalização do pedido", regra: null, dominioValores: null, nullable: false, sensibilidade: "interno" },
    { nome: "valor_bruto", tipo: "decimal(12,2)", descricao: "Valor antes de descontos, em BRL", regra: "≥ 0", dominioValores: null, nullable: false, sensibilidade: "interno" },
    { nome: "valor_desconto", tipo: "decimal(12,2)", descricao: "Soma dos descontos aplicados", regra: "≥ 0", dominioValores: null, nullable: true, sensibilidade: "interno" },
    { nome: "valor_liquido", tipo: "decimal(12,2)", descricao: "valor_bruto - valor_desconto; base de receita líquida", regra: "≥ 0", dominioValores: null, nullable: false, sensibilidade: "interno" },
    { nome: "status_pedido", tipo: "string", descricao: "Situação do pedido", regra: "Cancelado/devolvido não entram em receita", dominioValores: "finalizado | cancelado | devolvido", nullable: false, sensibilidade: "interno" },
    { nome: "canal", tipo: "string", descricao: "Canal de venda", regra: null, dominioValores: "loja | ecommerce | app", nullable: false, sensibilidade: "interno" },
  ];

  const asset = await prisma.catalogAsset.upsert({
    where: { nome: "gold.vendas.fato_pedidos" },
    update: {},
    create: {
      nome: "gold.vendas.fato_pedidos",
      camada: "gold",
      dominio: "Vendas",
      descricao: "Um registro por pedido finalizado; base de receita e volume de vendas.",
      owner: "Gerente de Vendas (a confirmar)",
      steward: "Analista de GOV (Blite)",
      grao: "1 linha = 1 pedido",
      atualizacao: "Diária (D-1), via pipeline ingest_pedidos",
      volumeAprox: "~2,5M linhas",
      sensibilidade: "pessoal",
      baseLegal: null, // proposital: dispara o alerta LGPD na demo
      sistemasOrigem: "ERP de vendas",
      tabelasRelacionadas: "dim_cliente, dim_produto, dim_loja, dim_tempo",
      lineage: [
        "fato_pedidos.id_cliente  → dim_cliente.id_cliente",
        "fato_pedidos.id_produto  → dim_produto.id_produto",
        "fato_pedidos.id_loja     → dim_loja.id_loja",
        "fato_pedidos.data_pedido → dim_tempo.data",
      ].join("\n"),
      notasQualidade:
        "Regra esperada: valor_liquido = valor_bruto - valor_desconto (candidata a check). " +
        "Pegadinha: pedidos cancelado/devolvido não entram no cálculo de receita.",
      statusVerdade: "template",
      proveniencia: "Golden Example (kit 09) — exemplo-padrão, substituir por tabela real do LM",
      ordem: 0,
      campos: { create: campos.map((c, i) => ({ ...c, ordem: i })) },
    },
  });
  console.log(`Catálogo: ${asset.nome} com ${campos.length} campos.`);

  // ---- Stack parcialmente confirmado (mostra a transição lacuna → confirmado) ----
  const stackDemo: Record<string, string> = {
    "Plataforma do Data Lake": "Databricks sobre Azure (demo)",
    "Engine de consulta / dialeto SQL": "Spark SQL (demo)",
  };
  for (const [item, resposta] of Object.entries(stackDemo)) {
    const existing = await prisma.stackItem.findFirst({ where: { item } });
    if (existing) {
      await prisma.stackItem.update({
        where: { id: existing.id },
        data: { resposta, statusVerdade: "confirmado", proveniencia: "Reunião de discovery (demo)" },
      });
    }
  }
  console.log("Stack: 2 itens confirmados (demo).");

  // ---- Decisões e baseline (dão vida ao /estado e ao report) ----
  if ((await prisma.decision.count()) === 0) {
    await prisma.decision.createMany({
      data: [
        { decisao: "Priorizar o domínio de Vendas como piloto do catálogo", porque: "Maior dor reportada e owner engajado", quem: "Comitê (demo)", data: daysAgo(5) },
        { decisao: "Adotar o padrão Golden Example para toda tabela priorizada", porque: "Uniformiza a documentação e o checklist de pronto", quem: "Blite + Priscila (demo)", data: daysAgo(3) },
      ],
    });
  }
  const baselineDemo: Record<string, { inicial: string; atual: string }> = {
    "Nº de usuários ativos no Data Lake": { inicial: "18", atual: "18" },
    "Volume de queries / semana": { inicial: "~340", atual: "~360" },
    "Nº de tickets/dúvidas de dados": { inicial: "12/semana", atual: "9/semana" },
    "Tabelas documentadas": { inicial: "0", atual: "1" },
  };
  for (const [metrica, v] of Object.entries(baselineDemo)) {
    const existing = await prisma.baselineMetric.findFirst({ where: { metrica } });
    if (existing) {
      await prisma.baselineMetric.update({
        where: { id: existing.id },
        data: { valorInicial: v.inicial, atual: v.atual, data: daysAgo(1), fonte: "Plataforma (demo)" },
      });
    }
  }
  console.log("Decisões e baseline de demo aplicados.");

  console.log("\nSeed de DEMO concluído. Gere um report em /report para completar o roteiro.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

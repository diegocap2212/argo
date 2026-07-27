import { PrismaClient } from "@prisma/client";
import { DAMA_AREAS } from "../src/lib/state/dama";

const prisma = new PrismaClient();

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

// Seções de texto livre da memória (§0/§1/§5/§9/§11). Idempotente por seção:
// cria só se ausente, NUNCA sobrescreve o que o Nero já editou.
async function seedProjectNotes() {
  const notes: { secao: string; conteudo: string }[] = [
    {
      secao: "metadados",
      conteudo: [
        "| Campo | Valor |",
        "|---|---|",
        "| Projeto | Habilitação, Governança e Aculturamento — Data Lake LM |",
        "| Cliente | LM |",
        "| Executora | Blite/Venice Tech |",
        "| Duração | 6 meses |",
      ].join("\n"),
    },
    {
      secao: "resumo",
      conteudo:
        "Apoiar a habilitação e o aculturamento das áreas de negócio do cliente LM no uso do Data Lake, com foco em autonomia no consumo de dados, governança/documentação dos ativos (catálogo, dicionário, glossário, ownership), boas práticas de consulta e cultura data-driven, deixando ao final um operating model sustentável e um roadmap de maturidade.",
    },
    {
      secao: "glossario",
      conteudo: [
        "| Termo | Definição |",
        "|---|---|",
        "| Owner de domínio | Responsável por validar e manter os ativos de um domínio de dados |",
        "| Trilho paralelo | Trabalho que avança sem depender do cliente |",
      ].join("\n"),
    },
  ];
  for (const n of notes) {
    const exists = await prisma.projectNote.findUnique({ where: { secao: n.secao } });
    if (!exists) await prisma.projectNote.create({ data: n });
  }
  console.log(`ProjectNotes garantidas (${notes.length} seções base).`);
}

// 11 áreas da Roda DAMA como avaliações de maturidade "lacuna". Idempotente por
// área: cria só se ausente, NUNCA sobrescreve avaliação existente.
async function seedMaturityAreas() {
  let created = 0;
  for (let i = 0; i < DAMA_AREAS.length; i++) {
    const area = DAMA_AREAS[i];
    const exists = await prisma.maturityAssessment.findUnique({ where: { area } });
    if (!exists) {
      await prisma.maturityAssessment.create({
        data: { area, statusVerdade: "lacuna", ordem: i },
      });
      created++;
    }
  }
  console.log(`Maturidade DAMA garantida (${created} áreas criadas, ${DAMA_AREAS.length} total).`);
}

async function main() {
  await seedProjectNotes();
  await seedMaturityAreas();

  // Idempotente: pula se já existem features (evita destruir dados reais).
  const featureCount = await prisma.feature.count();
  if (featureCount > 0) {
    console.log(`Seed pulado: já existem ${featureCount} features.`);
    return;
  }

  // NÃO incluir prisma.usageLog.deleteMany() aqui: UsageLog é dado operacional/
  // financeiro (histórico de consumo), não fixture de seed. Apagá-lo aqui zerava
  // o consumo a cada deploy que rodasse o seed.
  await prisma.$transaction([
    prisma.stateVersion.deleteMany(),
    prisma.stackItem.deleteMany(),
    prisma.dependency.deleteMany(),
    prisma.decision.deleteMany(),
    prisma.risk.deleteMany(),
    prisma.phaseStatus.deleteMany(),
    prisma.stakeholder.deleteMany(),
    prisma.baselineMetric.deleteMany(),
  ]);

  await prisma.stackItem.createMany({
    data: [
      { item: "Plataforma do Data Lake", statusVerdade: "lacuna", ordem: 1 },
      { item: "Engine de consulta / dialeto SQL", statusVerdade: "lacuna", ordem: 2 },
      { item: "Formato de armazenamento", statusVerdade: "lacuna", ordem: 3 },
      { item: "Estratégia de particionamento", statusVerdade: "lacuna", ordem: 4 },
      { item: "Ferramenta de catálogo existente", statusVerdade: "lacuna", ordem: 5 },
      { item: "Portal escolhido", statusVerdade: "lacuna", ordem: 6 },
      { item: "BI / ferramenta de consumo", statusVerdade: "lacuna", ordem: 7 },
      { item: "Como medir uso (baseline)", statusVerdade: "lacuna", ordem: 8 },
    ],
  });

  // ---- Fases com features aninhadas ----

  const fase0 = await prisma.phaseStatus.create({
    data: {
      fase: "Fase 0 — Mobilização & Discovery",
      slug: "fase-0",
      gate: "G0",
      janela: "Semanas 1–2",
      foco: "Destravar pré-requisitos: stack, acessos, baseline e RACI.",
      rag: "amarelo",
      pct: 0,
      comentario: "Em andamento",
      ordem: 0,
      features: {
        create: [
          {
            codigo: "F0.1",
            titulo: "Confirmação de stack & ambiente",
            descricao: "Documentar plataforma, engine/dialeto, formato e particionamento no 01_MEMORIA.",
            status: "em_andamento",
            dependeLM: false,
            areaDama: "Metadata Management",
            ordem: 0,
            checklist: {
              create: [
                { texto: "Plataforma do Data Lake identificada e registrada", done: false, ordem: 0 },
                { texto: "Engine/dialeto SQL confirmado com a equipe LM", done: false, ordem: 1 },
                { texto: "Formato de armazenamento registrado (Parquet, ORC, etc.)", done: false, ordem: 2 },
                { texto: "Estratégia de particionamento documentada", done: false, ordem: 3 },
              ],
            },
          },
          {
            codigo: "F0.2",
            titulo: "Acessos & segurança",
            descricao: "Acesso de leitura ao Data Lake obtido para a equipe.",
            status: "nao_iniciada",
            dependeLM: true,
            trilhoParalelo: "Estruturar guias com placeholders enquanto acesso não sai.",
            areaDama: "Data Security",
            ordem: 1,
            checklist: {
              create: [
                { texto: "Acesso de leitura ao Data Lake solicitado à Priscila", done: false, ordem: 0 },
                { texto: "Credenciais recebidas e testadas", done: false, ordem: 1 },
                { texto: "Política de segurança e acesso documentada", done: false, ordem: 2 },
              ],
            },
          },
          {
            codigo: "F0.3",
            titulo: "Baseline de adoção",
            descricao: "Capturar usuários ativos, volume de queries e tickets para medir evolução depois.",
            status: "nao_iniciada",
            dependeLM: false,
            areaDama: "Data Governance",
            ordem: 2,
            checklist: {
              create: [
                { texto: "Nº de usuários ativos no Data Lake registrado", done: false, ordem: 0 },
                { texto: "Volume de queries/semana registrado", done: false, ordem: 1 },
                { texto: "Nº de tickets/dúvidas de dados registrado", done: false, ordem: 2 },
                { texto: "Baseline salvo no 01_MEMORIA (seção 10)", done: false, ordem: 3 },
              ],
            },
          },
          {
            codigo: "F0.4",
            titulo: "Priorização de ativos & RACI",
            descricao: "Lista priorizada de tabelas e owners candidatos definidos.",
            status: "nao_iniciada",
            dependeLM: true,
            trilhoParalelo: "Definir critério de priorização e template enquanto lista não chega.",
            areaDama: "Data Governance",
            ordem: 3,
            checklist: {
              create: [
                { texto: "Critério de priorização de tabelas definido", done: false, ordem: 0 },
                { texto: "Lista de tabelas priorizadas recebida do LM", done: false, ordem: 1 },
                { texto: "Domínios candidatos mapeados", done: false, ordem: 2 },
                { texto: "RACI preliminar rascunhado e validado", done: false, ordem: 3 },
              ],
            },
          },
        ],
      },
    },
  });

  const fase1 = await prisma.phaseStatus.create({
    data: {
      fase: "Fase 1 — Base de Conhecimento",
      slug: "fase-1",
      gate: "G1",
      janela: "Semanas 3–6",
      foco: "Portal central no ar com guias, FAQ e estrutura de docs.",
      rag: "cinza",
      pct: 0,
      ordem: 1,
      features: {
        create: [
          {
            codigo: "F1.1",
            titulo: "Estrutura padronizada de documentação",
            descricao: "Template e taxonomia aprovados.",
            status: "nao_iniciada",
            dependeLM: false,
            areaDama: "Document & Content Management",
            ordem: 0,
            checklist: {
              create: [
                { texto: "Template de documentação de tabela criado", done: false, ordem: 0 },
                { texto: "Taxonomia de pastas/tags definida", done: false, ordem: 1 },
                { texto: "Padrão validado com a equipe", done: false, ordem: 2 },
              ],
            },
          },
          {
            codigo: "F1.2",
            titulo: "Portal central",
            descricao: "Portal (SharePoint/Confluence) publicado e acessível.",
            status: "nao_iniciada",
            dependeLM: true,
            trilhoParalelo: "Preparar estrutura e conteúdo antes do portal ser definido.",
            areaDama: "Document & Content Management",
            ordem: 1,
            checklist: {
              create: [
                { texto: "Ferramenta de portal escolhida com LM", done: false, ordem: 0 },
                { texto: "Estrutura de navegação criada", done: false, ordem: 1 },
                { texto: "Portal publicado e acessível para a equipe LM", done: false, ordem: 2 },
              ],
            },
          },
          {
            codigo: "F1.3",
            titulo: "Guia de acesso ao Data Lake",
            descricao: "Passo a passo de acesso ao ambiente.",
            status: "nao_iniciada",
            dependeLM: true,
            trilhoParalelo: "Escrever guia com placeholders enquanto acesso não sai.",
            areaDama: "Data Storage & Operations",
            ordem: 2,
            checklist: {
              create: [
                { texto: "Guia de acesso escrito (com ou sem placeholders)", done: false, ordem: 0 },
                { texto: "Publicado no portal", done: false, ordem: 1 },
              ],
            },
          },
          {
            codigo: "F1.4",
            titulo: "Guia de navegação/utilização",
            descricao: "Passo a passo do ambiente do Data Lake.",
            status: "nao_iniciada",
            dependeLM: false,
            areaDama: "Data Storage & Operations",
            ordem: 3,
            checklist: {
              create: [
                { texto: "Guia de navegação escrito", done: false, ordem: 0 },
                { texto: "Publicado no portal", done: false, ordem: 1 },
              ],
            },
          },
          {
            codigo: "F1.5",
            titulo: "FAQ inicial",
            descricao: "≥ 15 perguntas-semente respondidas.",
            status: "nao_iniciada",
            dependeLM: false,
            areaDama: "Document & Content Management",
            ordem: 4,
            checklist: {
              create: [
                { texto: "≥ 15 perguntas levantadas e respondidas", done: false, ordem: 0 },
                { texto: "FAQ publicado no portal", done: false, ordem: 1 },
              ],
            },
          },
        ],
      },
    },
  });

  const fase2 = await prisma.phaseStatus.create({
    data: {
      fase: "Fase 2 — Governança & Metadados",
      slug: "fase-2",
      gate: "G2",
      janela: "Semanas 7–10",
      foco: "Catálogo, dicionário, glossário, ownership e lineage inicial.",
      rag: "cinza",
      pct: 0,
      ordem: 2,
      features: {
        create: [
          { codigo: "F2.1", titulo: "Catálogo de dados v1", descricao: "Tabelas priorizadas inventariadas (nome, local, dono, descrição, sensibilidade).", status: "nao_iniciada", dependeLM: true, trilhoParalelo: "Estruturar template do catálogo.", areaDama: "Metadata Management", ordem: 0, checklist: { create: [{ texto: "Template do catálogo definido", done: false, ordem: 0 }, { texto: "Tabelas priorizadas inventariadas", done: false, ordem: 1 }, { texto: "Catálogo v1 validado por owner de pelo menos 1 domínio", done: false, ordem: 2 }] } },
          { codigo: "F2.2", titulo: "Dicionário de dados v1", descricao: "Campos das tabelas priorizadas (tipo, regra, domínio, nulabilidade).", status: "nao_iniciada", dependeLM: true, areaDama: "Metadata Management", ordem: 1, checklist: { create: [{ texto: "Campos das tabelas priorizadas documentados", done: false, ordem: 0 }, { texto: "Dicionário v1 validado", done: false, ordem: 1 }] } },
          { codigo: "F2.3", titulo: "Glossário de negócio (recomendado)", descricao: "Termos e métricas-chave definidos e aprovados.", status: "nao_iniciada", dependeLM: true, areaDama: "Data Governance", ordem: 2, checklist: { create: [{ texto: "Termos/métricas-chave levantados", done: false, ordem: 0 }, { texto: "Glossário aprovado pela área de negócio", done: false, ordem: 1 }] } },
          { codigo: "F2.4", titulo: "Lineage / relacionamentos iniciais", descricao: "Mapa de relacionamentos das tabelas core.", status: "nao_iniciada", dependeLM: false, areaDama: "Metadata Management", ordem: 3, checklist: { create: [{ texto: "Relacionamentos das tabelas core mapeados", done: false, ordem: 0 }, { texto: "Lineage publicado no portal", done: false, ordem: 1 }] } },
          { codigo: "F2.5", titulo: "Ownership & operating model embrionário", descricao: "Dono por domínio definido e aceito.", status: "nao_iniciada", dependeLM: true, areaDama: "Data Governance", ordem: 4, checklist: { create: [{ texto: "Owners por domínio mapeados", done: false, ordem: 0 }, { texto: "Operating model embrionário documentado", done: false, ordem: 1 }] } },
        ],
      },
    },
  });

  const fase3 = await prisma.phaseStatus.create({
    data: {
      fase: "Fase 3 — Boas Práticas & Performance",
      slug: "fase-3",
      gate: "G3",
      janela: "Semanas 11–14",
      foco: "Guias SQL/otimização e biblioteca de queries (bloqueado por G0).",
      rag: "cinza",
      pct: 0,
      comentario: "Bloqueado por confirmação de stack (G0)",
      ordem: 3,
      features: {
        create: [
          { codigo: "F3.1", titulo: "Guia de boas práticas de SQL", descricao: "No dialeto real do engine.", status: "nao_iniciada", dependeLM: false, areaDama: "Data Storage & Operations", ordem: 0, checklist: { create: [{ texto: "Guia de boas práticas escrito no dialeto confirmado", done: false, ordem: 0 }, { texto: "Revisado e publicado", done: false, ordem: 1 }] } },
          { codigo: "F3.2", titulo: "Guia de otimização", descricao: "Filtros, partições, joins e custo de consulta.", status: "nao_iniciada", dependeLM: false, areaDama: "Data Storage & Operations", ordem: 1, checklist: { create: [{ texto: "Guia de otimização escrito", done: false, ordem: 0 }] } },
          { codigo: "F3.3", titulo: "Biblioteca de queries modelo", descricao: "Versionada no portal/repo.", status: "nao_iniciada", dependeLM: false, areaDama: "Data Storage & Operations", ordem: 2, checklist: { create: [{ texto: "≥ 10 queries modelo documentadas", done: false, ordem: 0 }] } },
          { codigo: "F3.4", titulo: "Templates de análises recorrentes", descricao: "Usuário roda análise a partir de template.", status: "nao_iniciada", dependeLM: false, areaDama: "Data Storage & Operations", ordem: 3, checklist: { create: [{ texto: "Templates criados e publicados", done: false, ordem: 0 }] } },
        ],
      },
    },
  });

  const fase4 = await prisma.phaseStatus.create({
    data: {
      fase: "Fase 4 — Capacitação & Aculturamento",
      slug: "fase-4",
      gate: "G4",
      janela: "Semanas 15–18",
      foco: "Plano de aculturamento e 1ª rodada de workshops.",
      rag: "cinza",
      pct: 0,
      ordem: 4,
      features: {
        create: [
          { codigo: "F4.1", titulo: "Plano de aculturamento", descricao: "Por persona de área.", status: "nao_iniciada", dependeLM: false, areaDama: "Data Governance", ordem: 0, checklist: { create: [{ texto: "Personas mapeadas", done: false, ordem: 0 }, { texto: "Plano por persona elaborado", done: false, ordem: 1 }] } },
          { codigo: "F4.2", titulo: "Trilha estruturada", descricao: "Níveis: iniciante → autônomo.", status: "nao_iniciada", dependeLM: false, areaDama: "Data Governance", ordem: 1, checklist: { create: [{ texto: "Trilha de aprendizado estruturada", done: false, ordem: 0 }] } },
          { codigo: "F4.3", titulo: "Material de treinamento", descricao: "Slides e exercícios.", status: "nao_iniciada", dependeLM: false, areaDama: "Data Governance", ordem: 2, checklist: { create: [{ texto: "Material de treinamento produzido", done: false, ordem: 0 }] } },
          { codigo: "F4.4", titulo: "Calendário de workshops", status: "nao_iniciada", dependeLM: true, areaDama: "Data Governance", ordem: 3, checklist: { create: [{ texto: "Calendário alinhado com o LM", done: false, ordem: 0 }] } },
          { codigo: "F4.5", titulo: "1ª rodada de workshops", descricao: "≥ 1 turma por área prioritária + feedback coletado.", status: "nao_iniciada", dependeLM: true, areaDama: "Data Governance", ordem: 4, checklist: { create: [{ texto: "Workshop realizado com ≥ 1 turma", done: false, ordem: 0 }, { texto: "Feedback coletado e analisado", done: false, ordem: 1 }] } },
        ],
      },
    },
  });

  const fase5 = await prisma.phaseStatus.create({
    data: {
      fase: "Fase 5 — Adoção & Evolução",
      slug: "fase-5",
      gate: "G5",
      janela: "Semanas 19–22",
      foco: "Casos de uso por área e relatório intermediário de adoção.",
      rag: "cinza",
      pct: 0,
      ordem: 5,
      features: {
        create: [
          { codigo: "F5.1", titulo: "Biblioteca de casos de uso", descricao: "Por área de negócio.", status: "nao_iniciada", dependeLM: false, areaDama: "Data Governance", ordem: 0, checklist: { create: [{ texto: "Casos de uso por área documentados", done: false, ordem: 0 }] } },
          { codigo: "F5.2", titulo: "Consolidação de FAQ recorrente", status: "nao_iniciada", dependeLM: false, areaDama: "Document & Content Management", ordem: 1, checklist: { create: [{ texto: "FAQ atualizado com dúvidas recorrentes do período", done: false, ordem: 0 }] } },
          { codigo: "F5.3", titulo: "Evolução de catálogo/dicionário", descricao: "Novas tabelas e regras.", status: "nao_iniciada", dependeLM: true, areaDama: "Metadata Management", ordem: 2, checklist: { create: [{ texto: "Catálogo e dicionário evoluídos", done: false, ordem: 0 }] } },
          { codigo: "F5.4", titulo: "Evolução da biblioteca de queries", status: "nao_iniciada", dependeLM: false, areaDama: "Data Storage & Operations", ordem: 3, checklist: { create: [{ texto: "Biblioteca de queries atualizada", done: false, ordem: 0 }] } },
          { codigo: "F5.5", titulo: "Relatório intermediário de adoção", descricao: "Métricas comparadas ao baseline.", status: "nao_iniciada", dependeLM: false, areaDama: "Data Governance", ordem: 4, checklist: { create: [{ texto: "Métricas coletadas e comparadas ao baseline", done: false, ordem: 0 }, { texto: "Relatório elaborado e enviado", done: false, ordem: 1 }] } },
        ],
      },
    },
  });

  const fase6 = await prisma.phaseStatus.create({
    data: {
      fase: "Fase 6 — Consolidação & Sustentação",
      slug: "fase-6",
      gate: "G6",
      janela: "Semanas 23–24",
      foco: "Versões finais, operating model e handover para equipe interna.",
      rag: "cinza",
      pct: 0,
      ordem: 6,
      features: {
        create: [
          { codigo: "F6.1", titulo: "Versões finais", descricao: "Portal, catálogo e dicionário.", status: "nao_iniciada", dependeLM: false, areaDama: "Document & Content Management", ordem: 0, checklist: { create: [{ texto: "Portal v-final publicado", done: false, ordem: 0 }, { texto: "Catálogo e dicionário v-final validados", done: false, ordem: 1 }] } },
          { codigo: "F6.2", titulo: "Relatório executivo consolidado", descricao: "Indicadores e análise do projeto.", status: "nao_iniciada", dependeLM: false, areaDama: "Data Governance", ordem: 1, checklist: { create: [{ texto: "Relatório consolidado elaborado", done: false, ordem: 0 }] } },
          { codigo: "F6.3", titulo: "Plano de sustentação pós-projeto", descricao: "Operating model e papéis de stewardship.", status: "nao_iniciada", dependeLM: true, areaDama: "Data Governance", ordem: 2, checklist: { create: [{ texto: "Operating model documentado", done: false, ordem: 0 }, { texto: "Papéis de stewardship definidos e aceitos pelo LM", done: false, ordem: 1 }] } },
          { codigo: "F6.4", titulo: "Roadmap de maturidade", descricao: "Lacunas nomeadas: Data Quality, Master/Reference Data, Data Security.", status: "nao_iniciada", dependeLM: false, areaDama: "Data Governance", ordem: 3, checklist: { create: [{ texto: "Roadmap de maturidade elaborado (com lacunas nomeadas)", done: false, ordem: 0 }] } },
          { codigo: "F6.5", titulo: "Handover para equipe interna", descricao: "Equipe LM assume manutenção documentada.", status: "nao_iniciada", dependeLM: true, areaDama: "Data Governance", ordem: 4, checklist: { create: [{ texto: "Sessão de handover realizada", done: false, ordem: 0 }, { texto: "Handover aceito e documentado pelo LM", done: false, ordem: 1 }] } },
        ],
      },
    },
  });

  // ---- Dependências ligadas à Fase 0 ----
  await prisma.dependency.createMany({
    data: [
      {
        codigo: "D1",
        descricao: "Acesso ao Data Lake para a equipe",
        solicitadoEm: daysAgo(7),
        status: "aguardando",
        trilhoParalelo: "Montar estrutura do dicionário com placeholders",
        faseId: fase0.id,
        ordem: 1,
      },
      {
        codigo: "D2",
        descricao: "Lista priorizada de tabelas",
        solicitadoEm: daysAgo(3),
        status: "aguardando",
        trilhoParalelo: "Definir critério de priorização e template",
        faseId: fase0.id,
        ordem: 2,
      },
      {
        codigo: "D3",
        descricao: "Nomes dos owners por domínio",
        solicitadoEm: daysAgo(1),
        status: "aguardando",
        trilhoParalelo: "Rascunhar matriz de domínios candidatos",
        faseId: fase0.id,
        ordem: 3,
      },
    ],
  });

  // ---- Riscos ligados à Fase 0 ----
  await prisma.risk.createMany({
    data: [
      { codigo: "R1", descricao: "Fricção do cliente atrasa acessos", severidade: "Alta", mitigacao: "Trilho paralelo + escalonamento quinzenal", faseId: fase0.id },
      { codigo: "R2", descricao: "Stack desconhecido trava Fase 3", severidade: "Alta", mitigacao: "Discovery na Semana 1 (gate G0)", faseId: fase0.id },
      { codigo: "R3", descricao: "Documentação sem ownership apodrece", severidade: "Média", mitigacao: "Operating model na Fase 6", faseId: fase6.id },
    ],
  });

  await prisma.stakeholder.createMany({
    data: [
      { papel: "Sponsor", lado: "LM", responsabilidade: "Aprova escopo, destrava acessos", ordem: 0 },
      { papel: "Analista de GOV", lado: "Blite", responsabilidade: "Documentação, governança", ordem: 1 },
      { nome: "Priscila", papel: "Ponto focal (Gerente da Área)", lado: "LM", responsabilidade: "Destrava informações/acessos", ordem: 2 },
      { papel: "Eng. de dados / plataforma", lado: "LM", responsabilidade: "Acessos, info de stack", ordem: 3 },
    ],
  });

  await prisma.baselineMetric.createMany({
    data: [
      { metrica: "Nº de usuários ativos no Data Lake", ordem: 0 },
      { metrica: "Volume de queries / semana", ordem: 1 },
      { metrica: "Nº de tickets/dúvidas de dados", ordem: 2 },
      { metrica: "Tabelas documentadas", valorInicial: "0", atual: "0", ordem: 3 },
    ],
  });

  console.log(`Seed concluído. Fases criadas: fase-0 (${fase0.id}), fase-1 (${fase1.id}), ...`);
  // Referencia as variáveis para evitar aviso de linting
  void [fase2, fase3, fase4, fase5];
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

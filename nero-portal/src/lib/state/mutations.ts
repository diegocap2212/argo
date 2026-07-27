import { prisma } from "@/lib/db";
import type { Prisma, PrismaClient } from "@prisma/client";
import { DAMA_AREAS, isDamaArea, isNivelMaturidade } from "./dama";

/**
 * Mutações do estado vivo. TODA alteração grava uma StateVersion (snapshot
 * before/after) na MESMA transação — isso dá auditoria e undo.
 */

export type Actor = "nero" | "analista";

type Tx = Prisma.TransactionClient | PrismaClient;

const ENTITY_DATE_FIELDS: Record<string, string[]> = {
  Decision: ["data", "createdAt"],
  StackItem: ["createdAt", "updatedAt"],
  Dependency: ["solicitadoEm", "resolvidoEm", "createdAt", "updatedAt"],
  Risk: ["createdAt", "updatedAt"],
  PhaseStatus: ["updatedAt"],
  Feature: ["createdAt", "updatedAt"],
  ChecklistItem: [],
  Stakeholder: [],
  BaselineMetric: ["data"],
  ProjectNote: ["updatedAt"],
  Report: ["periodoInicio", "periodoFim", "geradoEm", "createdAt", "updatedAt"],
  MaturityAssessment: ["avaliadoEm", "createdAt", "updatedAt"],
  CatalogAsset: ["validadoEm", "createdAt", "updatedAt"],
  DataField: ["createdAt", "updatedAt"],
};

function modelOf(tx: Tx, entity: string) {
  switch (entity) {
    case "Decision":      return tx.decision;
    case "StackItem":     return tx.stackItem;
    case "Dependency":    return tx.dependency;
    case "Risk":          return tx.risk;
    case "PhaseStatus":   return tx.phaseStatus;
    case "Feature":       return tx.feature;
    case "ChecklistItem": return tx.checklistItem;
    case "Stakeholder":   return tx.stakeholder;
    case "BaselineMetric": return tx.baselineMetric;
    case "ProjectNote":   return tx.projectNote;
    case "Report":        return tx.report;
    case "MaturityAssessment": return tx.maturityAssessment;
    case "CatalogAsset":  return tx.catalogAsset;
    case "DataField":     return tx.dataField;
    default: throw new Error(`Entidade desconhecida: ${entity}`);
  }
}

function snapshot(row: unknown): string {
  return JSON.stringify(row);
}

function reviveDates(entity: string, obj: Record<string, unknown>): Record<string, unknown> {
  const fields = ENTITY_DATE_FIELDS[entity] ?? [];
  const copy = { ...obj };
  for (const f of fields) {
    if (typeof copy[f] === "string") copy[f] = new Date(copy[f] as string);
  }
  return copy;
}

async function recordVersion(
  tx: Tx,
  args: {
    entity: string;
    entityId: string;
    operation: "create" | "update" | "delete";
    before: unknown;
    after: unknown;
    actor: Actor;
    resumo: string;
  },
) {
  await tx.stateVersion.create({
    data: {
      entity: args.entity,
      entityId: args.entityId,
      operation: args.operation,
      before: args.before ? snapshot(args.before) : null,
      after: args.after ? snapshot(args.after) : null,
      actor: args.actor,
      resumo: args.resumo,
    },
  });
}

// ---- Helper: resolve faseId a partir de slug ----

async function resolvePhaseId(tx: Tx, faseSlug?: string): Promise<string | undefined> {
  if (!faseSlug) return undefined;
  const phase = await tx.phaseStatus.findFirst({ where: { slug: faseSlug } });
  return phase?.id ?? undefined;
}

// ---- Mutações de alto nível ----

export async function recordDecision(
  input: { decisao: string; porque?: string; quem?: string; faseSlug?: string },
  actor: Actor = "nero",
) {
  return prisma.$transaction(async (tx) => {
    // Idempotente: se uma decisão com o MESMO texto já existe, devolve a existente
    // em vez de duplicar (o log de decisões era append-only e acumulava repetições
    // quando o Nero reprocessava o contexto).
    const dup = await tx.decision.findFirst({ where: { decisao: input.decisao } });
    if (dup) return dup;

    const faseId = await resolvePhaseId(tx, input.faseSlug);
    const created = await tx.decision.create({
      data: { decisao: input.decisao, porque: input.porque, quem: input.quem, faseId },
    });
    await recordVersion(tx, {
      entity: "Decision",
      entityId: created.id,
      operation: "create",
      before: null,
      after: created,
      actor,
      resumo: `Decisão registrada: ${input.decisao}`,
    });
    return created;
  });
}

export async function setStackItem(
  input: { item: string; resposta?: string; statusVerdade?: string; proveniencia?: string },
  actor: Actor = "nero",
) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.stackItem.findFirst({ where: { item: input.item } });
    const data = {
      resposta: input.resposta,
      statusVerdade: input.statusVerdade ?? before?.statusVerdade ?? "lacuna",
      proveniencia: input.proveniencia,
    };
    const after = before
      ? await tx.stackItem.update({ where: { id: before.id }, data })
      : await tx.stackItem.create({ data: { item: input.item, ...data } });
    await recordVersion(tx, {
      entity: "StackItem",
      entityId: after.id,
      operation: before ? "update" : "create",
      before,
      after,
      actor,
      resumo: `Stack "${input.item}" → ${data.statusVerdade}${input.resposta ? `: ${input.resposta}` : ""}`,
    });
    return after;
  });
}

export async function upsertDependency(
  input: {
    codigo: string;
    descricao?: string;
    solicitadoEm?: string;
    status?: string;
    trilhoParalelo?: string;
    decisaoPedida?: string;
    faseSlug?: string;
  },
  actor: Actor = "nero",
) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.dependency.findFirst({ where: { codigo: input.codigo } });
    const faseId = await resolvePhaseId(tx, input.faseSlug) ?? before?.faseId ?? undefined;
    const data = {
      descricao: input.descricao ?? before?.descricao ?? input.codigo,
      solicitadoEm: input.solicitadoEm ? new Date(input.solicitadoEm) : before?.solicitadoEm,
      status: input.status ?? before?.status ?? "aguardando",
      trilhoParalelo: input.trilhoParalelo ?? before?.trilhoParalelo,
      decisaoPedida: input.decisaoPedida ?? before?.decisaoPedida,
      faseId: faseId ?? null,
    };
    const after = before
      ? await tx.dependency.update({ where: { id: before.id }, data })
      : await tx.dependency.create({ data: { codigo: input.codigo, ...data } });
    await recordVersion(tx, {
      entity: "Dependency",
      entityId: after.id,
      operation: before ? "update" : "create",
      before,
      after,
      actor,
      resumo: `Dependência ${input.codigo} (${data.status})`,
    });
    return after;
  });
}

export async function addRisk(
  input: {
    codigo: string;
    descricao: string;
    severidade?: string;
    mitigacao?: string;
    dono?: string;
    faseSlug?: string;
    featureCodigo?: string;
  },
  actor: Actor = "nero",
) {
  return prisma.$transaction(async (tx) => {
    // Se vier ligado a um epic, deriva a fase do próprio epic (mantém o risco visível na fase).
    let featureId: string | null = null;
    let faseId = (await resolvePhaseId(tx, input.faseSlug)) ?? null;
    if (input.featureCodigo) {
      const feature = await tx.feature.findFirst({ where: { codigo: input.featureCodigo } });
      if (!feature)
        throw new Error(
          `Feature ${input.featureCodigo} não existe — crie com criar_feature ou omita featureCodigo para um risco da fase.`,
        );
      featureId = feature.id;
      faseId = feature.faseId;
    }
    // Idempotente por código (espelha upsertDependency): se o risco já existe,
    // atualiza em vez de criar de novo — evita R5/R6/... duplicados quando o Nero
    // reprocessa o contexto em sessões diferentes.
    const before = await tx.risk.findFirst({ where: { codigo: input.codigo } });
    const data = {
      descricao: input.descricao,
      severidade: input.severidade ?? before?.severidade ?? "Média",
      mitigacao: input.mitigacao ?? before?.mitigacao ?? null,
      dono: input.dono ?? before?.dono ?? null,
      faseId: faseId ?? before?.faseId ?? null,
      featureId: featureId ?? before?.featureId ?? null,
      ativo: true,
    };
    const after = before
      ? await tx.risk.update({ where: { id: before.id }, data })
      : await tx.risk.create({ data: { codigo: input.codigo, ...data } });
    await recordVersion(tx, {
      entity: "Risk",
      entityId: after.id,
      operation: before ? "update" : "create",
      before,
      after,
      actor,
      resumo: `Risco ${input.codigo}: ${input.descricao}`,
    });
    return after;
  });
}

export async function setPhase(
  input: { fase: string; rag?: string; pct?: number; comentario?: string },
  actor: Actor = "nero",
) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.phaseStatus.findFirst({ where: { fase: input.fase } });
    if (!before) throw new Error(`Fase não encontrada: ${input.fase}`);
    const after = await tx.phaseStatus.update({
      where: { id: before.id },
      data: {
        rag: input.rag ?? before.rag,
        pct: input.pct ?? before.pct,
        comentario: input.comentario ?? before.comentario,
      },
    });
    await recordVersion(tx, {
      entity: "PhaseStatus",
      entityId: after.id,
      operation: "update",
      before,
      after,
      actor,
      resumo: `Fase "${input.fase}" → ${after.rag} ${after.pct}%`,
    });
    return after;
  });
}

export async function setFeatureStatus(
  input: { codigo: string; status: string },
  actor: Actor = "nero",
) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.feature.findFirst({ where: { codigo: input.codigo } });
    if (!before)
      throw new Error(
        `Feature ${input.codigo} não existe — crie com criar_feature antes de atualizar o status.`,
      );
    const after = await tx.feature.update({
      where: { id: before.id },
      data: { status: input.status },
    });
    await recordVersion(tx, {
      entity: "Feature",
      entityId: after.id,
      operation: "update",
      before,
      after,
      actor,
      resumo: `Feature ${input.codigo} → ${input.status}`,
    });
    return after;
  });
}

/**
 * Cria uma feature NOVA sob uma fase (com checklist inline opcional). Use quando o
 * roadmap evoluir — não para mudar status (isso é setFeatureStatus).
 */
export async function createFeature(
  input: {
    codigo: string;
    titulo: string;
    faseSlug: string;
    descricao?: string;
    dependeLM?: boolean;
    areaDama?: string;
    status?: string;
    checklist?: string[];
  },
  actor: Actor = "nero",
) {
  return prisma.$transaction(async (tx) => {
    const faseId = await resolvePhaseId(tx, input.faseSlug);
    if (!faseId)
      throw new Error(
        `Fase não encontrada para slug "${input.faseSlug}". Slugs válidos: fase-0..fase-6.`,
      );

    const dup = await tx.feature.findFirst({ where: { codigo: input.codigo } });
    if (dup)
      throw new Error(
        `Feature ${input.codigo} já existe — use editar_feature ou definir_feature.`,
      );

    const last = await tx.feature.findFirst({
      where: { faseId },
      orderBy: { ordem: "desc" },
    });
    const ordem = (last?.ordem ?? -1) + 1;

    const itens = (input.checklist ?? []).filter((t) => t.trim().length > 0);
    const after = await tx.feature.create({
      data: {
        codigo: input.codigo,
        titulo: input.titulo,
        descricao: input.descricao,
        status: input.status ?? "nao_iniciada",
        dependeLM: input.dependeLM ?? false,
        areaDama: input.areaDama,
        ordem,
        faseId,
        checklist: itens.length
          ? { create: itens.map((texto, i) => ({ texto, ordem: i })) }
          : undefined,
      },
    });
    await recordVersion(tx, {
      entity: "Feature",
      entityId: after.id,
      operation: "create",
      before: null,
      after,
      actor,
      resumo: `Feature ${input.codigo} criada: ${input.titulo}`,
    });
    return after;
  });
}

/** Adiciona um item de checklist (entregável) a uma feature existente. */
export async function addChecklistItem(
  input: { featureCodigo: string; itemTexto: string; done?: boolean },
  actor: Actor = "nero",
) {
  return prisma.$transaction(async (tx) => {
    const feature = await tx.feature.findFirst({
      where: { codigo: input.featureCodigo },
      include: { checklist: { orderBy: { ordem: "desc" }, take: 1 } },
    });
    if (!feature)
      throw new Error(
        `Feature ${input.featureCodigo} não existe — crie com criar_feature antes de adicionar itens.`,
      );

    // Idempotente: se já existe item com o mesmo texto nessa feature, devolve o
    // existente em vez de duplicar (espelha o dup-check de createFeature). A
    // constraint @@unique([featureId, texto]) é a rede final contra corrida.
    const existing = await tx.checklistItem.findFirst({
      where: { featureId: feature.id, texto: input.itemTexto },
    });
    if (existing) return existing;

    const ordem = (feature.checklist[0]?.ordem ?? -1) + 1;
    const after = await tx.checklistItem.create({
      data: {
        texto: input.itemTexto,
        done: input.done ?? false,
        ordem,
        featureId: feature.id,
      },
    });
    await recordVersion(tx, {
      entity: "ChecklistItem",
      entityId: after.id,
      operation: "create",
      before: null,
      after,
      actor,
      resumo: `Checklist "${input.itemTexto.slice(0, 40)}" adicionado a ${input.featureCodigo}`,
    });
    return after;
  });
}

/** Edita metadados de uma feature existente (título, descrição, dependeLM, área, ou renomeia o código). */
export async function editFeature(
  input: {
    codigo: string;
    novoCodigo?: string;
    titulo?: string;
    descricao?: string;
    dependeLM?: boolean;
    areaDama?: string;
  },
  actor: Actor = "nero",
) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.feature.findFirst({ where: { codigo: input.codigo } });
    if (!before)
      throw new Error(
        `Feature ${input.codigo} não existe — crie com criar_feature antes de editar.`,
      );

    if (input.novoCodigo && input.novoCodigo !== input.codigo) {
      const clash = await tx.feature.findFirst({ where: { codigo: input.novoCodigo } });
      if (clash)
        throw new Error(`Já existe uma feature com o código ${input.novoCodigo}.`);
    }

    const after = await tx.feature.update({
      where: { id: before.id },
      data: {
        codigo: input.novoCodigo ?? before.codigo,
        titulo: input.titulo ?? before.titulo,
        descricao: input.descricao ?? before.descricao,
        dependeLM: input.dependeLM ?? before.dependeLM,
        areaDama: input.areaDama ?? before.areaDama,
      },
    });
    await recordVersion(tx, {
      entity: "Feature",
      entityId: after.id,
      operation: "update",
      before,
      after,
      actor,
      resumo: `Feature ${input.codigo} editada${input.novoCodigo && input.novoCodigo !== input.codigo ? ` → ${input.novoCodigo}` : ""}`,
    });
    return after;
  });
}

/** Cria/atualiza um stakeholder (RACI). Chave: nome+papel. */
export async function upsertStakeholder(
  input: { nome?: string; papel: string; lado?: string; responsabilidade?: string },
  actor: Actor = "nero",
) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.stakeholder.findFirst({
      where: { papel: input.papel, nome: input.nome ?? null },
    });
    const data = {
      nome: input.nome ?? before?.nome ?? null,
      papel: input.papel,
      lado: input.lado ?? before?.lado ?? null,
      responsabilidade: input.responsabilidade ?? before?.responsabilidade ?? null,
    };
    const after = before
      ? await tx.stakeholder.update({ where: { id: before.id }, data })
      : await tx.stakeholder.create({ data });
    await recordVersion(tx, {
      entity: "Stakeholder",
      entityId: after.id,
      operation: before ? "update" : "create",
      before,
      after,
      actor,
      resumo: `Stakeholder ${input.nome ? `${input.nome} ` : ""}(${input.papel})`,
    });
    return after;
  });
}

/** Cria/atualiza uma métrica de baseline de adoção. Chave: metrica. */
export async function upsertBaselineMetric(
  input: { metrica: string; valorInicial?: string; atual?: string; data?: string; fonte?: string },
  actor: Actor = "nero",
) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.baselineMetric.findFirst({ where: { metrica: input.metrica } });
    const data = {
      metrica: input.metrica,
      valorInicial: input.valorInicial ?? before?.valorInicial ?? null,
      atual: input.atual ?? before?.atual ?? null,
      data: input.data ? new Date(input.data) : before?.data ?? null,
      fonte: input.fonte ?? before?.fonte ?? null,
    };
    const after = before
      ? await tx.baselineMetric.update({ where: { id: before.id }, data })
      : await tx.baselineMetric.create({ data });
    await recordVersion(tx, {
      entity: "BaselineMetric",
      entityId: after.id,
      operation: before ? "update" : "create",
      before,
      after,
      actor,
      resumo: `Baseline "${input.metrica}"${input.atual ? ` → ${input.atual}` : ""}`,
    });
    return after;
  });
}

/** Seções de texto livre da memória. Chave: secao. */
export const MEMORIA_SECOES = [
  "metadados",
  "resumo",
  "premissas",
  "proximas_acoes",
  "glossario",
] as const;

export async function upsertProjectNote(
  input: { secao: string; conteudo: string },
  actor: Actor = "nero",
) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.projectNote.findUnique({ where: { secao: input.secao } });
    const after = await tx.projectNote.upsert({
      where: { secao: input.secao },
      update: { conteudo: input.conteudo },
      create: { secao: input.secao, conteudo: input.conteudo },
    });
    await recordVersion(tx, {
      entity: "ProjectNote",
      entityId: after.id,
      operation: before ? "update" : "create",
      before,
      after,
      actor,
      resumo: `Memória "${input.secao}" atualizada`,
    });
    return after;
  });
}

export async function toggleChecklistItem(
  input: { id: string; done: boolean },
  actor: Actor = "nero",
) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.checklistItem.findUnique({ where: { id: input.id } });
    if (!before) throw new Error(`ChecklistItem não encontrado: ${input.id}`);
    const after = await tx.checklistItem.update({
      where: { id: input.id },
      data: { done: input.done },
    });
    await recordVersion(tx, {
      entity: "ChecklistItem",
      entityId: after.id,
      operation: "update",
      before,
      after,
      actor,
      resumo: `Checklist "${before.texto.slice(0, 40)}" → ${input.done ? "✓ concluído" : "pendente"}`,
    });
    return after;
  });
}

/** Alterna checklist pelo texto (para uso pelo Nero via tool). */
export async function toggleChecklistItemByText(
  input: { featureCodigo: string; itemTexto: string; done: boolean },
  actor: Actor = "nero",
) {
  // Tudo numa transação só: busca + match + update + versão. Antes a busca ficava
  // fora de trava, abrindo janela de corrida (o item podia mudar/sumir entre a
  // leitura e a escrita) quando dois usuários mexiam no mesmo checklist.
  return prisma.$transaction(async (tx) => {
    const feature = await tx.feature.findFirst({
      where: { codigo: input.featureCodigo },
      include: { checklist: true },
    });
    if (!feature)
      throw new Error(
        `Feature ${input.featureCodigo} não existe — crie com criar_feature antes de marcar o checklist.`,
      );

    const item = feature.checklist.find((c) =>
      c.texto.toLowerCase().includes(input.itemTexto.toLowerCase()),
    );
    if (!item)
      throw new Error(
        `Item de checklist "${input.itemTexto}" não encontrado em ${input.featureCodigo} — adicione com adicionar_item_checklist.`,
      );

    const after = await tx.checklistItem.update({
      where: { id: item.id },
      data: { done: input.done },
    });
    await recordVersion(tx, {
      entity: "ChecklistItem",
      entityId: after.id,
      operation: "update",
      before: item,
      after,
      actor,
      resumo: `Checklist "${item.texto.slice(0, 40)}" → ${input.done ? "✓ concluído" : "pendente"}`,
    });
    return after;
  });
}

/** Cria/atualiza a avaliação de maturidade DAMA de uma área. Chave: area. */
export async function upsertMaturityAssessment(
  input: {
    area: string;
    nivelAtual?: number;
    nivelMeta?: number;
    justificativa?: string;
    statusVerdade?: string;
    proveniencia?: string;
  },
  actor: Actor = "nero",
) {
  if (!isDamaArea(input.area))
    throw new Error(
      `Área DAMA inválida: "${input.area}". Áreas válidas: ${DAMA_AREAS.join(", ")}.`,
    );
  for (const n of [input.nivelAtual, input.nivelMeta]) {
    if (n !== undefined && !isNivelMaturidade(n))
      throw new Error(`Nível de maturidade inválido: ${n}. Use inteiros de 1 a 5.`);
  }
  return prisma.$transaction(async (tx) => {
    const before = await tx.maturityAssessment.findUnique({ where: { area: input.area } });
    const ordem = before?.ordem ?? DAMA_AREAS.indexOf(input.area as (typeof DAMA_AREAS)[number]);
    const data = {
      nivelAtual: input.nivelAtual ?? before?.nivelAtual ?? null,
      nivelMeta: input.nivelMeta ?? before?.nivelMeta ?? null,
      justificativa: input.justificativa ?? before?.justificativa ?? null,
      statusVerdade: input.statusVerdade ?? before?.statusVerdade ?? "lacuna",
      proveniencia: input.proveniencia ?? before?.proveniencia ?? null,
      avaliadoEm: input.nivelAtual !== undefined ? new Date() : before?.avaliadoEm ?? null,
      ordem,
    };
    const after = before
      ? await tx.maturityAssessment.update({ where: { id: before.id }, data })
      : await tx.maturityAssessment.create({ data: { area: input.area, ...data } });
    await recordVersion(tx, {
      entity: "MaturityAssessment",
      entityId: after.id,
      operation: before ? "update" : "create",
      before,
      after,
      actor,
      resumo: `Maturidade "${input.area}" → nível ${after.nivelAtual ?? "?"}/meta ${after.nivelMeta ?? "?"} (${after.statusVerdade})`,
    });
    return after;
  });
}

/**
 * Cria/atualiza uma entrada do catálogo (nível tabela, padrão Golden Example).
 * Chave: nome. Aceita o dicionário inline via `campos` (documenta a tabela
 * inteira em 1 chamada — espelha o checklist inline de createFeature: uma
 * StateVersion só, do ativo).
 */
export async function upsertCatalogAsset(
  input: {
    nome: string;
    camada?: string;
    dominio?: string;
    descricao?: string;
    owner?: string;
    steward?: string;
    grao?: string;
    atualizacao?: string;
    volumeAprox?: string;
    sensibilidade?: string;
    baseLegal?: string;
    sistemasOrigem?: string;
    tabelasRelacionadas?: string;
    lineage?: string;
    notasQualidade?: string;
    validadoPor?: string;
    validadoEm?: string;
    statusVerdade?: string;
    proveniencia?: string;
    campos?: Array<{
      nome: string;
      tipo?: string;
      descricao?: string;
      regra?: string;
      dominioValores?: string;
      nullable?: boolean;
      sensibilidade?: string;
    }>;
  },
  actor: Actor = "nero",
) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.catalogAsset.findUnique({ where: { nome: input.nome } });
    let ordem = before?.ordem;
    if (ordem === undefined) {
      const last = await tx.catalogAsset.findFirst({ orderBy: { ordem: "desc" } });
      ordem = (last?.ordem ?? -1) + 1;
    }
    const data = {
      camada: input.camada ?? before?.camada ?? null,
      dominio: input.dominio ?? before?.dominio ?? null,
      descricao: input.descricao ?? before?.descricao ?? null,
      owner: input.owner ?? before?.owner ?? null,
      steward: input.steward ?? before?.steward ?? null,
      grao: input.grao ?? before?.grao ?? null,
      atualizacao: input.atualizacao ?? before?.atualizacao ?? null,
      volumeAprox: input.volumeAprox ?? before?.volumeAprox ?? null,
      sensibilidade: input.sensibilidade ?? before?.sensibilidade ?? null,
      baseLegal: input.baseLegal ?? before?.baseLegal ?? null,
      sistemasOrigem: input.sistemasOrigem ?? before?.sistemasOrigem ?? null,
      tabelasRelacionadas: input.tabelasRelacionadas ?? before?.tabelasRelacionadas ?? null,
      lineage: input.lineage ?? before?.lineage ?? null,
      notasQualidade: input.notasQualidade ?? before?.notasQualidade ?? null,
      validadoPor: input.validadoPor ?? before?.validadoPor ?? null,
      validadoEm: input.validadoEm ? new Date(input.validadoEm) : before?.validadoEm ?? null,
      statusVerdade: input.statusVerdade ?? before?.statusVerdade ?? "lacuna",
      proveniencia: input.proveniencia ?? before?.proveniencia ?? null,
      ordem,
    };
    const after = before
      ? await tx.catalogAsset.update({ where: { id: before.id }, data })
      : await tx.catalogAsset.create({ data: { nome: input.nome, ...data } });

    const campos = (input.campos ?? []).filter((c) => c.nome?.trim());
    for (let i = 0; i < campos.length; i++) {
      const c = campos[i];
      const existing = await tx.dataField.findUnique({
        where: { assetId_nome: { assetId: after.id, nome: c.nome } },
      });
      const fieldData = {
        tipo: c.tipo ?? existing?.tipo ?? null,
        descricao: c.descricao ?? existing?.descricao ?? null,
        regra: c.regra ?? existing?.regra ?? null,
        dominioValores: c.dominioValores ?? existing?.dominioValores ?? null,
        nullable: c.nullable ?? existing?.nullable ?? null,
        sensibilidade: c.sensibilidade ?? existing?.sensibilidade ?? null,
        ordem: existing?.ordem ?? i,
      };
      if (existing) {
        await tx.dataField.update({ where: { id: existing.id }, data: fieldData });
      } else {
        await tx.dataField.create({
          data: { nome: c.nome, assetId: after.id, ...fieldData },
        });
      }
    }

    await recordVersion(tx, {
      entity: "CatalogAsset",
      entityId: after.id,
      operation: before ? "update" : "create",
      before,
      after,
      actor,
      resumo: `Catálogo "${input.nome}" ${before ? "atualizado" : "documentado"}${campos.length ? ` (+${campos.length} campos)` : ""} — ${data.statusVerdade}`,
    });
    return after;
  });
}

/** Cria/atualiza UM campo do dicionário de um ativo já catalogado. Chave: assetNome+nome. */
export async function upsertDataField(
  input: {
    assetNome: string;
    nome: string;
    tipo?: string;
    descricao?: string;
    regra?: string;
    dominioValores?: string;
    nullable?: boolean;
    sensibilidade?: string;
  },
  actor: Actor = "nero",
) {
  return prisma.$transaction(async (tx) => {
    const asset = await tx.catalogAsset.findUnique({ where: { nome: input.assetNome } });
    if (!asset)
      throw new Error(
        `Ativo "${input.assetNome}" não está no catálogo — documente a tabela antes com documentar_ativo.`,
      );
    const before = await tx.dataField.findUnique({
      where: { assetId_nome: { assetId: asset.id, nome: input.nome } },
    });
    let ordem = before?.ordem;
    if (ordem === undefined) {
      const last = await tx.dataField.findFirst({
        where: { assetId: asset.id },
        orderBy: { ordem: "desc" },
      });
      ordem = (last?.ordem ?? -1) + 1;
    }
    const data = {
      tipo: input.tipo ?? before?.tipo ?? null,
      descricao: input.descricao ?? before?.descricao ?? null,
      regra: input.regra ?? before?.regra ?? null,
      dominioValores: input.dominioValores ?? before?.dominioValores ?? null,
      nullable: input.nullable ?? before?.nullable ?? null,
      sensibilidade: input.sensibilidade ?? before?.sensibilidade ?? null,
      ordem,
    };
    const after = before
      ? await tx.dataField.update({ where: { id: before.id }, data })
      : await tx.dataField.create({ data: { nome: input.nome, assetId: asset.id, ...data } });
    await recordVersion(tx, {
      entity: "DataField",
      entityId: after.id,
      operation: before ? "update" : "create",
      before,
      after,
      actor,
      resumo: `Campo ${input.assetNome}.${input.nome} documentado`,
    });
    return after;
  });
}

/** Persiste um report quinzenal gerado (snapshot congelado + narrativas do Nero). */
export async function createReport(
  input: {
    statusGeral: string;
    snapshot: unknown;
    sumarioExecutivo?: string;
    notaAdvisor?: string;
    saudeFrentes?: unknown;
  },
  actor: Actor = "nero",
) {
  return prisma.$transaction(async (tx) => {
    const prev = await tx.report.findFirst({ orderBy: { numero: "desc" } });
    const numero = (prev?.numero ?? 0) + 1;
    const periodoFim = new Date();
    const periodoInicio =
      prev?.periodoFim ?? new Date(periodoFim.getTime() - 14 * 24 * 60 * 60 * 1000);
    const created = await tx.report.create({
      data: {
        numero,
        periodoInicio,
        periodoFim,
        statusGeral: input.statusGeral,
        snapshot: JSON.stringify(input.snapshot),
        sumarioExecutivo: input.sumarioExecutivo ?? null,
        notaAdvisor: input.notaAdvisor ?? null,
        saudeFrentes: input.saudeFrentes ? JSON.stringify(input.saudeFrentes) : null,
      },
    });
    await recordVersion(tx, {
      entity: "Report",
      entityId: created.id,
      operation: "create",
      before: null,
      after: created,
      actor,
      resumo: `Report Q${numero} gerado (${input.statusGeral})`,
    });
    return created;
  });
}

// ---- Histórico & undo ----

export async function listVersions(limit = 30) {
  return prisma.stateVersion.findMany({ orderBy: { createdAt: "desc" }, take: limit });
}

export async function undoVersion(versionId: string) {
  return prisma.$transaction(async (tx) => {
    const v = await tx.stateVersion.findUnique({ where: { id: versionId } });
    if (!v) throw new Error("Versão não encontrada.");
    if (v.desfeito) throw new Error("Esta versão já foi desfeita.");

    const m = modelOf(tx, v.entity) as {
      delete: (a: unknown) => Promise<unknown>;
      update: (a: unknown) => Promise<unknown>;
      create: (a: unknown) => Promise<unknown>;
      findUnique: (a: unknown) => Promise<unknown>;
    };

    if (v.operation === "create") {
      const exists = await m.findUnique({ where: { id: v.entityId } });
      if (exists) await m.delete({ where: { id: v.entityId } });
    } else if (v.operation === "update" && v.before) {
      const data = reviveDates(v.entity, JSON.parse(v.before));
      delete (data as { id?: string }).id;
      await m.update({ where: { id: v.entityId }, data });
    } else if (v.operation === "delete" && v.before) {
      const data = reviveDates(v.entity, JSON.parse(v.before));
      await m.create({ data });
    }

    await tx.stateVersion.update({ where: { id: versionId }, data: { desfeito: true } });
    return { undone: v.entity, operation: v.operation };
  });
}

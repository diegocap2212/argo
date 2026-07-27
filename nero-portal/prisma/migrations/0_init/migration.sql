-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "StackItem" (
    "id" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "resposta" TEXT,
    "statusVerdade" TEXT NOT NULL DEFAULT 'lacuna',
    "proveniencia" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StackItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dependency" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "solicitadoEm" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'aguardando',
    "trilhoParalelo" TEXT,
    "decisaoPedida" TEXT,
    "resolvidoEm" TIMESTAMP(3),
    "faseId" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Decision" (
    "id" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decisao" TEXT NOT NULL,
    "porque" TEXT,
    "quem" TEXT,
    "faseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Risk" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "severidade" TEXT NOT NULL DEFAULT 'Média',
    "mitigacao" TEXT,
    "dono" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "faseId" TEXT,
    "featureId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Risk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhaseStatus" (
    "id" TEXT NOT NULL,
    "fase" TEXT NOT NULL,
    "slug" TEXT,
    "gate" TEXT,
    "janela" TEXT,
    "foco" TEXT,
    "rag" TEXT NOT NULL DEFAULT 'cinza',
    "pct" INTEGER NOT NULL DEFAULT 0,
    "comentario" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhaseStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feature" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "status" TEXT NOT NULL DEFAULT 'nao_iniciada',
    "dependeLM" BOOLEAN NOT NULL DEFAULT false,
    "trilhoParalelo" TEXT,
    "areaDama" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "faseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Feature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistItem" (
    "id" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "featureId" TEXT NOT NULL,

    CONSTRAINT "ChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stakeholder" (
    "id" TEXT NOT NULL,
    "nome" TEXT,
    "papel" TEXT NOT NULL,
    "lado" TEXT,
    "responsabilidade" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Stakeholder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BaselineMetric" (
    "id" TEXT NOT NULL,
    "metrica" TEXT NOT NULL,
    "valorInicial" TEXT,
    "atual" TEXT,
    "data" TIMESTAMP(3),
    "fonte" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BaselineMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectNote" (
    "id" TEXT NOT NULL,
    "secao" TEXT NOT NULL,
    "conteudo" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageLog" (
    "id" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "periodoInicio" TIMESTAMP(3) NOT NULL,
    "periodoFim" TIMESTAMP(3) NOT NULL,
    "statusGeral" TEXT NOT NULL DEFAULT 'amarelo',
    "snapshot" TEXT NOT NULL,
    "sumarioExecutivo" TEXT,
    "notaAdvisor" TEXT,
    "saudeFrentes" TEXT,
    "geradoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaturityAssessment" (
    "id" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "nivelAtual" INTEGER,
    "nivelMeta" INTEGER,
    "justificativa" TEXT,
    "statusVerdade" TEXT NOT NULL DEFAULT 'lacuna',
    "proveniencia" TEXT,
    "avaliadoEm" TIMESTAMP(3),
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaturityAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogAsset" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "camada" TEXT,
    "dominio" TEXT,
    "descricao" TEXT,
    "owner" TEXT,
    "steward" TEXT,
    "grao" TEXT,
    "atualizacao" TEXT,
    "volumeAprox" TEXT,
    "sensibilidade" TEXT,
    "baseLegal" TEXT,
    "sistemasOrigem" TEXT,
    "tabelasRelacionadas" TEXT,
    "lineage" TEXT,
    "notasQualidade" TEXT,
    "validadoPor" TEXT,
    "validadoEm" TIMESTAMP(3),
    "statusVerdade" TEXT NOT NULL DEFAULT 'lacuna',
    "proveniencia" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataField" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT,
    "descricao" TEXT,
    "regra" TEXT,
    "dominioValores" TEXT,
    "nullable" BOOLEAN,
    "sensibilidade" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "assetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'documento',
    "conteudo" TEXT NOT NULL,
    "resumo" TEXT,
    "statusVerdade" TEXT NOT NULL DEFAULT 'template',
    "faseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StateVersion" (
    "id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "before" TEXT,
    "after" TEXT,
    "actor" TEXT NOT NULL DEFAULT 'nero',
    "resumo" TEXT,
    "desfeito" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistItem_featureId_texto_key" ON "ChecklistItem"("featureId", "texto");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectNote_secao_key" ON "ProjectNote"("secao");

-- CreateIndex
CREATE INDEX "UsageLog_createdAt_idx" ON "UsageLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Report_numero_key" ON "Report"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "MaturityAssessment_area_key" ON "MaturityAssessment"("area");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogAsset_nome_key" ON "CatalogAsset"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "DataField_assetId_nome_key" ON "DataField"("assetId", "nome");

-- CreateIndex
CREATE INDEX "Document_createdAt_idx" ON "Document"("createdAt");

-- AddForeignKey
ALTER TABLE "Feature" ADD CONSTRAINT "Feature_faseId_fkey" FOREIGN KEY ("faseId") REFERENCES "PhaseStatus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataField" ADD CONSTRAINT "DataField_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "CatalogAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;


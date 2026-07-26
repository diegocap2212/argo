import { prisma } from "@/lib/db";

/**
 * Biblioteca — base de conhecimento do portal. Lê a tabela `Document` (conteúdo
 * markdown real que o Analista produziu: atas, guias, políticas, mapeamentos).
 * Read-only: a tabela é legada (não escrita pelas tools atuais), só exibida.
 */

export const TIPO_LABEL: Record<string, string> = {
  ata: "Ata",
  documento: "Documento",
  catalogo: "Catálogo",
  dicionario: "Dicionário",
  glossario: "Glossário",
  politica: "Política",
};

export function tipoLabel(tipo: string): string {
  return TIPO_LABEL[tipo] ?? tipo.charAt(0).toUpperCase() + tipo.slice(1);
}

export async function loadDocuments() {
  return prisma.document.findMany({
    orderBy: [{ createdAt: "asc" }],
    select: {
      id: true,
      titulo: true,
      tipo: true,
      resumo: true,
      statusVerdade: true,
      createdAt: true,
    },
  });
}

export async function loadDocument(id: string) {
  return prisma.document.findUnique({ where: { id } });
}

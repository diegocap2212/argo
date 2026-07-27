import { prisma } from "@/lib/db";

/**
 * Recuperação (RAG agêntico) sobre a Biblioteca — o Nero busca e lê os documentos
 * da tabela `Document` sob demanda, via tools. Usa full-text search nativo do
 * Postgres (config 'portuguese'), sem embeddings/pgvector: para a escala atual
 * (dezenas de docs) é preciso, barato e sem dependência externa. Se o corpus
 * crescer muito ou exigir recall semântico, migrar para vetores (Voyage) — o
 * contrato das tools não muda.
 */

export type BibliotecaHit = {
  id: string;
  titulo: string;
  tipo: string;
  statusVerdade: string;
  trecho: string;
  rank: number;
};

const clean = (s: string) =>
  s.replace(/<\/?b>/g, "").replace(/\s+/g, " ").trim();

export async function searchBiblioteca(query: string, limit = 4): Promise<BibliotecaHit[]> {
  const q = query.trim();
  if (!q) return [];
  const lim = Math.min(Math.max(1, limit), 8);

  // 1) Full-text ranqueado, com snippet destacado do trecho relevante.
  try {
    const rows = await prisma.$queryRaw<
      Array<{ id: string; titulo: string; tipo: string; statusVerdade: string; trecho: string; rank: number }>
    >`
      SELECT id, titulo, tipo, "statusVerdade",
        ts_headline('portuguese', conteudo, websearch_to_tsquery('portuguese', ${q}),
          'MaxWords=55, MinWords=25, MaxFragments=2, FragmentDelimiter= … ') AS trecho,
        ts_rank(
          to_tsvector('portuguese', titulo || ' ' || coalesce(resumo,'') || ' ' || conteudo),
          websearch_to_tsquery('portuguese', ${q})
        ) AS rank
      FROM "Document"
      WHERE to_tsvector('portuguese', titulo || ' ' || coalesce(resumo,'') || ' ' || conteudo)
            @@ websearch_to_tsquery('portuguese', ${q})
      ORDER BY rank DESC
      LIMIT ${lim}
    `;
    if (rows.length > 0) {
      return rows.map((r) => ({ ...r, trecho: clean(r.trecho), rank: Number(r.rank) }));
    }
  } catch (e) {
    console.error("[Biblioteca] FTS falhou, caindo para ILIKE:", e);
  }

  // 2) Fallback por substring (robusto p/ queries curtas ou sem match de FTS).
  const like = `%${q}%`;
  const rows2 = await prisma.$queryRaw<
    Array<{ id: string; titulo: string; tipo: string; statusVerdade: string; trecho: string }>
  >`
    SELECT id, titulo, tipo, "statusVerdade", left(conteudo, 300) AS trecho
    FROM "Document"
    WHERE titulo ILIKE ${like} OR coalesce(resumo,'') ILIKE ${like} OR conteudo ILIKE ${like}
    ORDER BY "createdAt" ASC
    LIMIT ${lim}
  `;
  return rows2.map((r) => ({ ...r, trecho: clean(r.trecho), rank: 0 }));
}

/** Lê um documento da Biblioteca por id (preferido) ou por título (match parcial). */
export async function readDocumentForNero(input: { id?: string; titulo?: string }) {
  if (input.id) {
    const byId = await prisma.document.findUnique({ where: { id: input.id } });
    if (byId) return byId;
  }
  if (input.titulo) {
    return prisma.document.findFirst({
      where: { titulo: { contains: input.titulo, mode: "insensitive" } },
      orderBy: { createdAt: "asc" },
    });
  }
  return null;
}

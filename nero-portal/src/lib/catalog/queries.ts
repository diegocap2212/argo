import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { assetCompleteness, type Completeness } from "./completeness";

export type CatalogAssetWithFields = Prisma.CatalogAssetGetPayload<{
  include: { campos: true };
}>;

export type CatalogEntry = CatalogAssetWithFields & { completeness: Completeness };

export type CatalogFilters = {
  q?: string;
  dominio?: string;
  camada?: string;
  sensibilidade?: string;
};

/** Lista o catálogo com busca/filtros server-side + % de completude calculado. */
export async function loadCatalog(filters: CatalogFilters = {}): Promise<CatalogEntry[]> {
  const where: Prisma.CatalogAssetWhereInput = {};
  if (filters.q) {
    where.OR = [
      { nome: { contains: filters.q, mode: "insensitive" } },
      { descricao: { contains: filters.q, mode: "insensitive" } },
      { dominio: { contains: filters.q, mode: "insensitive" } },
      { owner: { contains: filters.q, mode: "insensitive" } },
      { campos: { some: { nome: { contains: filters.q, mode: "insensitive" } } } },
    ];
  }
  if (filters.dominio) where.dominio = filters.dominio;
  if (filters.camada) where.camada = filters.camada;
  if (filters.sensibilidade) where.sensibilidade = filters.sensibilidade;

  const assets = await prisma.catalogAsset.findMany({
    where,
    orderBy: { ordem: "asc" },
    include: { campos: { orderBy: { ordem: "asc" } } },
  });
  return assets.map((a) => ({ ...a, completeness: assetCompleteness(a, a.campos) }));
}

/** Valores distintos para os filtros do catálogo. */
export async function loadCatalogFacets() {
  const rows = await prisma.catalogAsset.findMany({
    select: { dominio: true, camada: true, sensibilidade: true },
  });
  const distinct = (vals: (string | null)[]) =>
    [...new Set(vals.filter((v): v is string => Boolean(v)))].sort();
  return {
    dominios: distinct(rows.map((r) => r.dominio)),
    camadas: distinct(rows.map((r) => r.camada)),
    sensibilidades: distinct(rows.map((r) => r.sensibilidade)),
  };
}

/** Detalhe de um ativo (página Golden Example). */
export async function loadAsset(id: string): Promise<CatalogEntry | null> {
  const asset = await prisma.catalogAsset.findUnique({
    where: { id },
    include: { campos: { orderBy: { ordem: "asc" } } },
  });
  if (!asset) return null;
  return { ...asset, completeness: assetCompleteness(asset, asset.campos) };
}

import Link from "next/link";
import { Database, Search } from "lucide-react";
import { loadCatalog, loadCatalogFacets } from "@/lib/catalog/queries";
import {
  SENSIBILIDADE_CLASS,
  SENSIBILIDADE_LABEL,
  isSensibilidade,
} from "@/lib/catalog/sensibilidade";
import {
  STATUS_VERDADE_CLASS,
  STATUS_VERDADE_LABEL,
  isStatusVerdade,
} from "@/lib/state/provenance";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

const first = (v: string | string[] | undefined) =>
  Array.isArray(v) ? v[0] : v || undefined;

export default async function CatalogoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const filters = {
    q: first(sp.q),
    dominio: first(sp.dominio),
    camada: first(sp.camada),
    sensibilidade: first(sp.sensibilidade),
  };
  const [entries, facets] = await Promise.all([loadCatalog(filters), loadCatalogFacets()]);

  const selectClass =
    "h-9 rounded-md border bg-background px-2 text-sm text-foreground";

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 overflow-y-auto px-4 py-6">
      <div className="mb-5">
        <h1 className="font-serif text-xl font-semibold tracking-tight">Catálogo vivo</h1>
        <p className="text-sm text-muted-foreground">
          Cada tabela documentada no padrão Golden Example (kit 09) vira resposta permanente:
          onde acho o dado, o que significa cada campo, quem é o dono, é sensível? Documente
          conversando com o Nero — ele registra aqui, com proveniência e auditoria.
        </p>
      </div>

      {/* Busca + filtros (GET — estado na URL) */}
      <form method="GET" className="mb-5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            name="q"
            defaultValue={filters.q ?? ""}
            placeholder="Buscar por tabela, campo, domínio ou owner…"
            className="h-9 w-full rounded-md border bg-background pl-8 pr-3 text-sm"
          />
        </div>
        <select name="dominio" defaultValue={filters.dominio ?? ""} className={selectClass}>
          <option value="">Domínio: todos</option>
          {facets.dominios.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select name="camada" defaultValue={filters.camada ?? ""} className={selectClass}>
          <option value="">Camada: todas</option>
          {facets.camadas.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          name="sensibilidade"
          defaultValue={filters.sensibilidade ?? ""}
          className={selectClass}
        >
          <option value="">Sensibilidade: todas</option>
          {facets.sensibilidades.map((s) => (
            <option key={s} value={s}>
              {isSensibilidade(s) ? SENSIBILIDADE_LABEL[s] : s}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
        >
          Filtrar
        </button>
      </form>

      {entries.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <Database className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {filters.q || filters.dominio || filters.camada || filters.sensibilidade
                ? "Nenhum ativo encontrado com esses filtros."
                : "O catálogo ainda está vazio. Peça ao Nero no chat: “documente a tabela X” — cada sessão de discovery produz uma entrada permanente aqui."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {entries.map((a) => {
            const sv = isStatusVerdade(a.statusVerdade) ? a.statusVerdade : "lacuna";
            return (
              <Link key={a.id} href={`/catalogo/${a.id}`}>
                <Card className="h-full transition-colors hover:border-brand/50">
                  <CardContent className="space-y-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-mono text-sm font-semibold">{a.nome}</div>
                        <div className="text-xs text-muted-foreground">
                          {[a.camada, a.dominio, a.owner ? `owner: ${a.owner}` : null]
                            .filter(Boolean)
                            .join(" · ") || "sem metadados básicos"}
                        </div>
                      </div>
                      <span
                        className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${STATUS_VERDADE_CLASS[sv]}`}
                      >
                        {STATUS_VERDADE_LABEL[sv]}
                      </span>
                    </div>
                    {a.descricao && (
                      <p className="line-clamp-2 text-xs text-muted-foreground">{a.descricao}</p>
                    )}
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <div className="flex items-center gap-2">
                        {a.sensibilidade && isSensibilidade(a.sensibilidade) && (
                          <span
                            className={`rounded px-2 py-0.5 text-xs font-medium ${SENSIBILIDADE_CLASS[a.sensibilidade]}`}
                          >
                            {SENSIBILIDADE_LABEL[a.sensibilidade]}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {a.campos.length} campo(s)
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="h-1.5 w-16 rounded-full bg-muted">
                          <div
                            className="h-1.5 rounded-full bg-brand"
                            style={{ width: `${a.completeness.pct}%` }}
                          />
                        </div>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {a.completeness.pct}%
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Check,
  CircleDashed,
  GitBranch,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { loadAsset } from "@/lib/catalog/queries";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

const fmt = (d: Date | null) =>
  d
    ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
    : null;

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value ?? "—"}</dd>
    </div>
  );
}

const th = "py-1.5 pr-4 text-left text-xs font-medium text-muted-foreground";
const td = "py-1.5 pr-4 align-top";

export default async function CatalogoAssetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const asset = await loadAsset(id);
  if (!asset) notFound();

  const sv = isStatusVerdade(asset.statusVerdade) ? asset.statusVerdade : "lacuna";
  const sens =
    asset.sensibilidade && isSensibilidade(asset.sensibilidade) ? asset.sensibilidade : null;
  const pessoalSemBase =
    (sens === "pessoal" || sens === "pessoal_sensivel") && !asset.baseLegal;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 overflow-y-auto px-4 py-6">
      <div className="mb-4">
        <Link
          href="/catalogo"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Catálogo
        </Link>
      </div>

      <header className="mb-5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-mono text-lg font-semibold tracking-tight">{asset.nome}</h1>
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_VERDADE_CLASS[sv]}`}
          >
            {STATUS_VERDADE_LABEL[sv]}
          </span>
          {sens && (
            <span
              className={`rounded px-2 py-0.5 text-xs font-medium ${SENSIBILIDADE_CLASS[sens]}`}
            >
              {SENSIBILIDADE_LABEL[sens]}
            </span>
          )}
        </div>
        {asset.descricao && <p className="mt-1 text-sm text-muted-foreground">{asset.descricao}</p>}
        {asset.proveniencia && (
          <p className="mt-1 text-xs text-muted-foreground">Proveniência: {asset.proveniencia}</p>
        )}
      </header>

      <div className="space-y-4">
        {/* A. Entrada de catálogo */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="h-4 w-4 text-brand" />
              A. Entrada de catálogo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 sm:grid-cols-3">
              <Meta label="Camada" value={asset.camada} />
              <Meta label="Domínio" value={asset.dominio} />
              <Meta label="Owner" value={asset.owner} />
              <Meta label="Steward" value={asset.steward} />
              <Meta label="Grão (1 linha =)" value={asset.grao} />
              <Meta label="Atualização" value={asset.atualizacao} />
              <Meta label="Volume aprox." value={asset.volumeAprox} />
              <Meta label="Sistemas de origem" value={asset.sistemasOrigem} />
              <Meta label="Tabelas relacionadas" value={asset.tabelasRelacionadas} />
            </dl>
          </CardContent>
        </Card>

        {/* B. Dicionário */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="h-4 w-4 text-brand" />
              B. Dicionário de dados ({asset.campos.length} campos)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {asset.campos.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum campo documentado ainda — peça ao Nero: &ldquo;documente os campos de{" "}
                {asset.nome}&rdquo;.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className={th}>Campo</th>
                      <th className={th}>Tipo</th>
                      <th className={th}>Descrição / regra</th>
                      <th className={th}>Domínio de valores</th>
                      <th className={th}>Nulo?</th>
                      <th className={th}>Sensibilidade</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {asset.campos.map((c) => {
                      const cs =
                        c.sensibilidade && isSensibilidade(c.sensibilidade)
                          ? c.sensibilidade
                          : null;
                      return (
                        <tr key={c.id}>
                          <td className={`${td} font-mono font-medium`}>{c.nome}</td>
                          <td className={td}>{c.tipo ?? "—"}</td>
                          <td className={td}>
                            {c.descricao ?? "—"}
                            {c.regra && (
                              <div className="text-xs text-muted-foreground">↳ {c.regra}</div>
                            )}
                          </td>
                          <td className={td}>{c.dominioValores ?? "—"}</td>
                          <td className={td}>
                            {c.nullable === null ? "—" : c.nullable ? "sim" : "não"}
                          </td>
                          <td className={td}>
                            {cs ? (
                              <span
                                className={`rounded px-1.5 py-0.5 text-xs font-medium ${SENSIBILIDADE_CLASS[cs]}`}
                              >
                                {SENSIBILIDADE_LABEL[cs]}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* C. Lineage */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <GitBranch className="h-4 w-4 text-brand" />
              C. Lineage
            </CardTitle>
          </CardHeader>
          <CardContent>
            {asset.lineage ? (
              <pre className="whitespace-pre-wrap rounded-lg bg-muted p-3 font-mono text-xs">
                {asset.lineage}
              </pre>
            ) : (
              <p className="text-sm text-muted-foreground">Lineage ainda não mapeado.</p>
            )}
          </CardContent>
        </Card>

        {/* D. LGPD */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-brand" />
              D. Classificação LGPD
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <dl className="grid gap-3 sm:grid-cols-2">
              <Meta
                label="Sensibilidade da tabela"
                value={sens ? SENSIBILIDADE_LABEL[sens] : "não classificada"}
              />
              <Meta label="Base legal" value={asset.baseLegal} />
            </dl>
            {pessoalSemBase && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Tabela classificada como dado pessoal <strong>sem base legal registrada</strong>{" "}
                  (kit 06 §3). Sinalizar ao DPO/jurídico do LM — o Nero sinaliza, não decide.
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* E. Qualidade */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-brand" />
              E. Notas de qualidade
            </CardTitle>
          </CardHeader>
          <CardContent>
            {asset.notasQualidade ? (
              <p className="whitespace-pre-wrap text-sm">{asset.notasQualidade}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nenhuma regra/nota de qualidade registrada.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Checklist de pronto */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span>Definição de pronto (Golden Example)</span>
              <span className="text-sm font-normal tabular-nums text-muted-foreground">
                {asset.completeness.done}/{asset.completeness.total} ·{" "}
                {asset.completeness.pct}%
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-3 h-2 w-full rounded-full bg-muted">
              <div
                className="h-2 rounded-full bg-brand"
                style={{ width: `${asset.completeness.pct}%` }}
              />
            </div>
            <ul className="space-y-1.5">
              {asset.completeness.checks.map((c) => (
                <li key={c.label} className="flex items-center gap-2 text-sm">
                  {c.done ? (
                    <Check className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
                  ) : (
                    <CircleDashed className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className={c.done ? "" : "text-muted-foreground"}>{c.label}</span>
                </li>
              ))}
            </ul>
            {asset.validadoPor && (
              <p className="mt-3 text-xs text-muted-foreground">
                Validado por {asset.validadoPor}
                {fmt(asset.validadoEm) ? ` em ${fmt(asset.validadoEm)}` : ""}.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

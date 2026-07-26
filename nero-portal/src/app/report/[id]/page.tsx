import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import type { ReportData, SaudeFrente } from "@/lib/report/build";
import { reportToMarkdown } from "@/lib/report/markdown";
import { ReportToolbar } from "@/components/report-toolbar";
import { DamaRadar } from "@/components/dama-radar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

const RAG_BADGE: Record<string, string> = {
  verde: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  amarelo: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  vermelho: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

const AGING_BADGE: Record<string, string> = {
  ok: "bg-muted text-muted-foreground",
  atencao: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  vermelho: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

const fmt = (d: Date) =>
  new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="print:break-inside-avoid print:border-0 print:shadow-none">
      <CardHeader className="print:px-0">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="print:px-0">{children}</CardContent>
    </Card>
  );
}

const th = "py-1.5 pr-4 text-left text-xs font-medium text-muted-foreground";
const td = "py-1.5 pr-4 align-top";

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const report = await prisma.report.findUnique({ where: { id } });
  if (!report) notFound();

  let data: ReportData;
  try {
    data = JSON.parse(report.snapshot) as ReportData;
  } catch {
    notFound();
  }

  const saude: SaudeFrente[] = report.saudeFrentes
    ? (JSON.parse(report.saudeFrentes) as SaudeFrente[])
    : data.saudeFrentes;

  // Comparação com o report anterior (Δ dos indicadores).
  const prev = await prisma.report.findUnique({ where: { numero: report.numero - 1 } });
  let prevIndicadores: ReportData["indicadores"] = [];
  if (prev) {
    try {
      prevIndicadores = (JSON.parse(prev.snapshot) as ReportData).indicadores ?? [];
    } catch {
      prevIndicadores = [];
    }
  }

  const markdown = reportToMarkdown(report, data);
  const avaliadas = data.maturidade.filter(
    (m) => m.nivelAtual !== null || m.nivelMeta !== null,
  );

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 overflow-y-auto px-4 py-6 print:max-w-none print:overflow-visible print:px-0 print:py-0">
      <div className="mb-4 print:hidden">
        <Link
          href="/report"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Todos os reports
        </Link>
      </div>

      {/* Cabeçalho executivo */}
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-xl font-semibold tracking-tight">
            Report Quinzenal #{report.numero} · Projeto Data Lake LM
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Período {fmt(report.periodoInicio)} a {fmt(report.periodoFim)} · Fase atual:{" "}
            {data.faseAtual} ·{" "}
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${RAG_BADGE[report.statusGeral] ?? RAG_BADGE.amarelo}`}
            >
              status geral: {report.statusGeral}
            </span>
          </p>
        </div>
        <ReportToolbar markdown={markdown} />
      </header>

      <div className="space-y-4">
        <Section title="1. Sumário executivo">
          <blockquote className="border-l-2 border-brand pl-3 text-sm leading-relaxed">
            {report.sumarioExecutivo ?? "—"}
          </blockquote>
        </Section>

        <Section title="2. Entregas concluídas na quinzena">
          {data.entregas.length ? (
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className={th}>Entrega</th>
                  <th className={th}>Epic/Feature</th>
                  <th className={th}>Área DAMA</th>
                  <th className={th}>Data</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.entregas.map((e, i) => (
                  <tr key={i}>
                    <td className={td}>{e.titulo}</td>
                    <td className={td}>{e.origem}</td>
                    <td className={td}>{e.areaDama ?? "—"}</td>
                    <td className={td}>{e.data}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted-foreground">Sem entregas concluídas no período.</p>
          )}
        </Section>

        <Section title="3. Em andamento">
          {data.emAndamento.length ? (
            <ul className="space-y-2">
              {data.emAndamento.map((f) => (
                <li key={f.codigo} className="text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span>
                      <span className="font-medium">{f.codigo}</span> — {f.titulo}
                      {f.dependeLM && (
                        <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                          depende do LM
                        </span>
                      )}
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">{f.pct}%</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-muted">
                    <div
                      className="h-1.5 rounded-full bg-brand"
                      style={{ width: `${f.pct}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nada em andamento registrado.</p>
          )}
        </Section>

        <Section title="4. Indicadores de adoção (vs baseline)">
          {data.indicadores.length ? (
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className={th}>Métrica</th>
                  <th className={th}>Baseline</th>
                  {prev && <th className={th}>Q{report.numero - 1}</th>}
                  <th className={th}>Atual</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.indicadores.map((m, i) => (
                  <tr key={i}>
                    <td className={td}>{m.metrica}</td>
                    <td className={td}>{m.baseline ?? "—"}</td>
                    {prev && (
                      <td className={td}>
                        {prevIndicadores.find((p) => p.metrica === m.metrica)?.atual ?? "—"}
                      </td>
                    )}
                    <td className={`${td} font-medium`}>{m.atual ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted-foreground">Baseline não capturada.</p>
          )}
        </Section>

        <Section title="5. Maturidade DAMA (radar)">
          {avaliadas.length ? (
            <div className="grid items-start gap-4 sm:grid-cols-2">
              <DamaRadar points={data.maturidade} />
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className={th}>Área</th>
                    <th className={th}>Atual</th>
                    <th className={th}>Meta</th>
                    <th className={th}>Verdade</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {avaliadas.map((m) => (
                    <tr key={m.area}>
                      <td className={td}>{m.area}</td>
                      <td className={`${td} tabular-nums`}>{m.nivelAtual ?? "—"}</td>
                      <td className={`${td} tabular-nums`}>{m.nivelMeta ?? "—"}</td>
                      <td className={td}>{m.statusVerdade}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Maturidade ainda não avaliada — lacuna a fechar no discovery.
            </p>
          )}
        </Section>

        <Section title="6. Riscos">
          {data.riscos.length ? (
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className={th}>Risco</th>
                  <th className={th}>Sev</th>
                  <th className={th}>Tendência</th>
                  <th className={th}>Mitigação</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.riscos.map((r) => (
                  <tr key={r.codigo}>
                    <td className={td}>
                      <span className="font-medium">{r.codigo}</span> — {r.descricao}
                    </td>
                    <td className={td}>{r.severidade}</td>
                    <td className={`${td} text-center`}>{r.tendencia}</td>
                    <td className={td}>{r.mitigacao ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted-foreground">Sem riscos ativos.</p>
          )}
        </Section>

        <Section title="7. Blockers & dependências do cliente LM (aging)">
          {data.blockers.length ? (
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className={th}>#</th>
                  <th className={th}>O que precisamos do LM</th>
                  <th className={th}>Solicitado</th>
                  <th className={th}>Aging</th>
                  <th className={th}>Trilho paralelo</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.blockers.map((b) => (
                  <tr key={b.codigo}>
                    <td className={`${td} font-medium`}>{b.codigo}</td>
                    <td className={td}>{b.descricao}</td>
                    <td className={td}>{b.solicitadoEm ?? "—"}</td>
                    <td className={td}>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${AGING_BADGE[b.agingNivel]}`}
                      >
                        {b.agingDias === null ? "—" : `${b.agingDias} d.u.`}
                      </span>
                    </td>
                    <td className={td}>{b.trilhoParalelo ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted-foreground">Sem dependências abertas.</p>
          )}
        </Section>

        <Section title="8. Decisões necessárias do cliente/sponsor">
          {data.decisoesPendentes.length ? (
            <ul className="list-inside list-disc space-y-1 text-sm">
              {data.decisoesPendentes.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma decisão pendente registrada.</p>
          )}
        </Section>

        <Section title="9. Saúde do projeto (RAG por frente)">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={th}>Frente</th>
                <th className={th}>Status</th>
                <th className={th}>Comentário</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {saude.map((f) => (
                <tr key={f.frente}>
                  <td className={td}>{f.frente}</td>
                  <td className={td}>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${RAG_BADGE[f.rag] ?? RAG_BADGE.amarelo}`}
                    >
                      {f.rag}
                    </span>
                  </td>
                  <td className={td}>{f.comentario}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title="10. Nota do advisor (Nero)">
          <blockquote className="border-l-2 border-brand pl-3 text-sm leading-relaxed">
            {report.notaAdvisor ?? "—"}
          </blockquote>
        </Section>
      </div>

      <footer className="mt-6 text-xs text-muted-foreground">
        Gerado a partir do estado vivo do portal em {fmt(report.geradoEm)} — snapshot
        congelado e auditável; não é editável retroativamente.
      </footer>
    </main>
  );
}

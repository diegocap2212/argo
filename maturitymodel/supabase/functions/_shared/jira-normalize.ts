// ============================================================================
// supabase/functions/_shared/jira-normalize.ts
// Normalização de issue do Jira → `Item`. LÓGICA PURA: sem Deno, sem Supabase, sem rede.
//
// POR QUE ESTÁ SEPARADO: isto vivia dentro de `anchor-sync.ts`, que tem
// `createClient(Deno.env.get(...))` no topo do módulo. Qualquer teste que importasse aquele
// arquivo quebrava na carga, então as fórmulas das âncoras — inclusive a de "sprint injetada",
// que estava ERRADA — nunca foram testadas. Aqui roda sob tsx a partir de `tests/`.
// ============================================================================

export type StatusCategory = "TODO" | "IN_PROGRESS" | "DONE";

export interface Item {
  key: string;
  type: string;
  isSubtask: boolean;
  statusCategory: StatusCategory;
  created: string | null;
  resolved: string | null;
  updated: string | null;
  labels: string[];
  commitmentDate: string | null; // cf10102 (Data de Comprometimento)
  sprintCount: number;           // nº de sprints em que o item esteve (cf10020)
  sprintInjected: boolean;       // entrou numa sprint depois que ela começou
  everDone: boolean;             // já esteve em status concluído (agora ou no changelog)
  reopened: boolean;             // saiu de concluído e voltou a um status ativo
  leadTimeDays: number | null;
}

// ── Classificação de status (porta de status-classification.ts do Dashboard) ──
const DISCARD = ["DESCARTADO", "CANCELADO"];
const DONE_CAT = ["CONCLU", "DONE", "COMPLETE", "RESOLV"];
const DONE_NAME = ["CONCLU", "DONE", "PRONTO", "FINALIZ", "ENCERR", "RESOLV", "FECHAD", "ENTREGUE"];
const PROGRESS_CAT = ["ANDAMENTO", "PROGRESS", "EXECU"];

export const isDoneName = (s?: string) => !!s && DONE_NAME.some((k) => s.toUpperCase().includes(k));
export const isDiscardName = (s?: string) => !!s && DISCARD.some((k) => s.toUpperCase().includes(k));

export function classifyStatus(
  statusName: string,
  categoryName: string,
  hasResolution: boolean,
): StatusCategory {
  const name = (statusName || "").toUpperCase();
  const cat = (categoryName || "").toUpperCase();
  if (DISCARD.some((s) => name.includes(s))) return "TODO";
  if (hasResolution || DONE_CAT.some((k) => cat.includes(k))) return "DONE";
  if (PROGRESS_CAT.some((k) => cat.includes(k))) return "IN_PROGRESS";
  return "TODO";
}

/** Ids de sprint de um lado da transição do changelog (`"1, 2"` → `{"1","2"}`). */
function sprintIds(value: unknown): Set<string> {
  return new Set(
    String(value ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any -- fronteira: JSON dinâmico do Jira. */
export function normalize(issue: any): Item {
  const f = issue.fields ?? {};
  const created = f.created ?? null;
  const resolved = f.resolutiondate ?? null;
  const leadTimeDays =
    created && resolved
      ? Math.ceil((new Date(resolved).getTime() - new Date(created).getTime()) / 86_400_000)
      : null;
  const statusCategory = classifyStatus(
    f.status?.name ?? "",
    f.status?.statusCategory?.name ?? "",
    !!resolved,
  );

  // Sprint (cf10020): array de { id, name, state, startDate, ... }.
  // Índice id → início, para saber o start da sprint ESPECÍFICA que foi adicionada.
  const sprintObjs: any[] = Array.isArray(f.customfield_10020) ? f.customfield_10020 : [];
  const startById = new Map<string, number>();
  for (const s of sprintObjs) {
    const id = s?.id != null ? String(s.id) : null;
    const start = s?.startDate ? new Date(s.startDate).getTime() : NaN;
    if (id && Number.isFinite(start)) startById.set(id, start);
  }

  let everDone = statusCategory === "DONE";
  let reopened = false;
  let sprintInjected = false;

  for (const h of issue.changelog?.histories ?? []) {
    const ts = new Date(h.created).getTime();
    for (const it of h.items ?? []) {
      if (it.field === "status") {
        // `everDone` a partir dos DOIS lados da transição. Só `toString` era frágil: se a
        // entrada "→ CONCLUÍDO" tiver sido truncada do changelog (o `expand: changelog` da
        // busca do Jira devolve histórico LIMITADO — ver o achado do changelog parcial) e só
        // a saída "CONCLUÍDO → ativo" estiver visível, o item era classificado como nunca
        // concluído. Ele saía do DENOMINADOR de `quality.return_rate_pct` junto com o
        // numerador, então a taxa de reabertura ficava SUBESTIMADA — o erro na direção que
        // faz o time parecer melhor do que é.
        if (isDoneName(it.toString) || isDoneName(it.fromString)) everDone = true;
        if (isDoneName(it.fromString) && !isDoneName(it.toString) && !isDiscardName(it.toString)) {
          reopened = true;
        }
      }

      if (it.field === "Sprint" || it.fieldId === "customfield_10020") {
        /**
         * "Item INJETADO na sprint" = entrou numa sprint que JÁ HAVIA COMEÇADO.
         *
         * A versão anterior inferia a adição comparando o COMPRIMENTO das strings
         * (`it.to.length > it.from.length`) e comparava o timestamp com o início MAIS ANTIGO
         * entre TODAS as sprints do item. Errava nas duas direções:
         *
         *   · trocar a sprint 5 pela 10 (`"5"` → `"10"`) alonga a string sem adicionar nada,
         *     e virava "injetado" (falso positivo);
         *   · sair de `"1,2"` para `"10"` encurta a string, e a adição real de uma sprint nova
         *     passava batido (falso negativo);
         *   · comparar com o início mais antigo marcava como injetado um item que entrou na
         *     sprint 2 ANTES dela começar, só porque a sprint 1 já tinha começado.
         *
         * Agora: diferença de CONJUNTOS de ids, e cada id adicionado comparado com o início
         * DAQUELA sprint. Sprint sem `startDate` (futura) não pode receber injeção.
         */
        const from = sprintIds(it.from);
        for (const addedId of sprintIds(it.to)) {
          if (from.has(addedId)) continue; // já estava — não é adição
          const start = startById.get(addedId);
          if (start != null && ts > start) sprintInjected = true;
        }
      }
    }
  }

  return {
    key: issue.key,
    type: f.issuetype?.name ?? "Task",
    isSubtask: !!f.issuetype?.subtask,
    statusCategory,
    created,
    resolved,
    updated: f.updated ?? created,
    labels: f.labels ?? [],
    commitmentDate: f.customfield_10102 ?? null,
    sprintCount: sprintObjs.length,
    sprintInjected,
    everDone,
    reopened,
    leadTimeDays,
  };
}

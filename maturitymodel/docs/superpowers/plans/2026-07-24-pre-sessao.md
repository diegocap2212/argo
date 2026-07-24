# Pré-sessão do SM — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar a etapa de pré-sessão ao ciclo do MMA: o SM registra estágio provisório (1–4) + argumento por dimensão, com indicadores à vista, antes de iniciar a sessão com o time; a pré congela ao iniciar a sessão.

**Architecture:** Novo estado `pre_session` antes de `session` na máquina de estados do ciclo. Nova tabela `pre_session_assessments` (espelha `proposals`), com RLS que só permite escrita enquanto o ciclo está em `pre_session` (freeze server-side). UI renderizada na aba Sessão quando `status === 'pre_session'`, num componente dedicado; lógica do gate "10/10" isolada em função pura.

**Tech Stack:** React 18 + TypeScript strict, @tanstack/react-query, Supabase (Postgres + RLS), Vite. Componentes UI em `src/components/ui/*`. Sem framework de teste no projeto.

## Global Constraints

- TypeScript strict; `noUnusedLocals`/`noUnusedParameters`: zero erros (`tsc --noEmit`).
- Regras de negócio são funções puras e testáveis, fora de componentes React (CLAUDE.md).
- Não há framework de teste: a verificação de cada task é `npx tsc --noEmit`, `npm run lint` e `npx vite build`, mais teste manual do fluxo na task final. A lógica não-trivial (gate 10/10) vai para função pura para ser inspecionável.
- Migrations: timestamp real `YYYYMMDDHHMMSS` maior que a última aplicada. Aplicar no projeto `cvkcngrmnfwupstyrpsd`.
- Helpers de RLS já existentes: `is_member(team)`, `is_sm(team)`, `is_am(team)`, `is_portal_admin()`.
- O client Supabase é tipado por `src/integrations/supabase/types.ts` (gerado). Tabela nova exige regenerar esse arquivo antes que as queries compilem.
- Escopo: SÓ a captura da pré-sessão. Comparação pré×time, rename Homologação→Validação e votação interna do time ficam fora.

---

### Task 1: Migration — estado `pre_session`, tabela e RLS

**Files:**
- Create: `supabase/migrations/20260724130000_pre_session.sql`
- Modify (regenerado): `src/integrations/supabase/types.ts`

**Interfaces:**
- Produces: tabela `pre_session_assessments (cycle_id uuid, dimension_id uuid, sm_stage int, rationale text, created_by uuid, updated_at timestamptz)`, PK `(cycle_id, dimension_id)`; valor de status `pre_session` aceito e default.

- [ ] **Step 1: Escrever a migration**

Criar `supabase/migrations/20260724130000_pre_session.sql`:

```sql
-- Pré-sessão do SM: novo estado + tabela + RLS (freeze via status).
begin;

-- 1. Aceitar 'pre_session' no CHECK de status e torná-lo o default (ciclo nasce nele).
alter table assessment_cycles drop constraint assessment_cycles_status_check;
alter table assessment_cycles
  add constraint assessment_cycles_status_check
  check (status in ('pre_session','session','homologation','official','archived'));
alter table assessment_cycles alter column status set default 'pre_session';

-- 2. Artefato da pré-sessão (espelha proposals: 1 linha por dimensão do ciclo).
create table if not exists pre_session_assessments (
  cycle_id     uuid not null references assessment_cycles(id) on delete cascade,
  dimension_id uuid not null references dimensions(id),
  sm_stage     int  not null check (sm_stage between 1 and 4),
  rationale    text not null,
  created_by   uuid references auth.users(id),
  updated_at   timestamptz not null default now(),
  primary key (cycle_id, dimension_id)
);

alter table pre_session_assessments enable row level security;

-- 3. RLS espelhando proposals. Leitura: membro do squad ou portal admin.
create policy presession_read on pre_session_assessments for select to authenticated
  using (exists (select 1 from assessment_cycles c
                 where c.id = cycle_id and (is_member(c.team_id) or is_portal_admin())));

-- Escrita: SM/AM do squad, e SÓ enquanto o ciclo está em pre_session (freeze).
create policy presession_write on pre_session_assessments for all to authenticated
  using (exists (select 1 from assessment_cycles c
                 where c.id = cycle_id
                   and (is_sm(c.team_id) or is_am(c.team_id))
                   and c.status = 'pre_session'))
  with check (exists (select 1 from assessment_cycles c
                 where c.id = cycle_id
                   and (is_sm(c.team_id) or is_am(c.team_id))
                   and c.status = 'pre_session'));

commit;
```

- [ ] **Step 2: Aplicar a migration**

Preferencialmente via MCP Supabase `apply_migration` (name: `pre_session`), ou `supabase db push`.
**Atenção:** existe `20260723120000_qualidade_software.sql` no repo que foi aplicada via REST e NÃO consta no histórico. Se usar `supabase db push`, ele tentará aplicá-la também — é idempotente (guarda `[QSW]`), então roda sem efeito colateral; alternativamente rode antes `supabase migration repair --status applied 20260723120000`.

- [ ] **Step 3: Verificar no banco**

Rodar (MCP `execute_sql` ou psql):
```sql
select conname, pg_get_constraintdef(oid) from pg_constraint where conname = 'assessment_cycles_status_check';
select count(*) from pre_session_assessments;
```
Esperado: o CHECK inclui `pre_session`; a tabela existe (count 0).

- [ ] **Step 4: Regenerar os tipos**

Via MCP Supabase `generate_typescript_types` (ou `supabase gen types typescript --project-id cvkcngrmnfwupstyrpsd`), salvando o resultado em `src/integrations/supabase/types.ts`. Confirmar que `pre_session_assessments` aparece no arquivo:
```bash
grep -c "pre_session_assessments" src/integrations/supabase/types.ts   # esperado: > 0
```

- [ ] **Step 5: Typecheck e commit**

```bash
npx tsc --noEmit
git add supabase/migrations/20260724130000_pre_session.sql src/integrations/supabase/types.ts
git commit -m "feat(mma): migration da pré-sessão (estado pre_session + tabela + RLS)"
```
Esperado: `tsc` sem erros.

---

### Task 2: Máquina de estados, início do ciclo e gate puro

**Files:**
- Modify: `src/types/mma.ts` (CycleStatus, CYCLE_TRANSITIONS)
- Modify: `src/hooks/useCycleData.ts` (useStartCycle)
- Create: `src/lib/preSession.ts`

**Interfaces:**
- Consumes: `CycleStatus` de mma.ts.
- Produces: `isPreSessionComplete(dimensionIds: string[], assessments: {dimension_id:string; sm_stage:number; rationale:string}[]): boolean`.

- [ ] **Step 1: Adicionar `pre_session` ao tipo e às transições**

Em `src/types/mma.ts`, na união `CycleStatus` adicionar o primeiro membro:
```ts
export type CycleStatus =
  | "pre_session"   // SM prepara a análise prévia (nota provisória + argumento) antes da sessão
  | "session"       // sessão colaborativa: SM apresenta e registra a nota de consenso por dimensão
  | "homologation"  // pacote na fila do AM
  | "official"      // homologado — imutável, gera kaizens e marco no comparativo
  | "archived";
```
E em `CYCLE_TRANSITIONS` adicionar a primeira entrada (as demais ficam iguais):
```ts
export const CYCLE_TRANSITIONS: Record<CycleStatus, CycleStatus[]> = {
  pre_session:  ["session"],               // SM fecha as 10 pré-avaliações e inicia a sessão
  session:      ["homologation"],
  homologation: ["official", "session"],
  official:     ["archived"],
  archived:     [],
};
```

- [ ] **Step 2: Ciclo nasce em `pre_session`**

Em `src/hooks/useCycleData.ts`, dentro de `useStartCycle`, trocar o insert de `status: "session"` para `status: "pre_session"`:
```ts
        .insert({
          team_id: teamId,
          quarter: currentQuarter(),
          status: "pre_session",
          workshop_at: new Date().toISOString(),
        })
```

- [ ] **Step 3: Função pura do gate**

Criar `src/lib/preSession.ts`:
```ts
// Regra do gate da pré-sessão: só habilita iniciar a sessão quando TODAS as
// dimensões têm estágio válido (1–4) E argumento não-vazio. Função pura.
export interface PreSessionRow {
  dimension_id: string;
  sm_stage: number;
  rationale: string;
}

export function isPreSessionComplete(
  dimensionIds: readonly string[],
  assessments: readonly PreSessionRow[],
): boolean {
  if (dimensionIds.length === 0) return false;
  const byDim = new Map(assessments.map((a) => [a.dimension_id, a]));
  return dimensionIds.every((id) => {
    const a = byDim.get(id);
    return !!a && a.sm_stage >= 1 && a.sm_stage <= 4 && a.rationale.trim().length > 0;
  });
}

export function preSessionProgress(
  dimensionIds: readonly string[],
  assessments: readonly PreSessionRow[],
): { done: number; total: number } {
  const byDim = new Map(assessments.map((a) => [a.dimension_id, a]));
  const done = dimensionIds.filter((id) => {
    const a = byDim.get(id);
    return !!a && a.sm_stage >= 1 && a.sm_stage <= 4 && a.rationale.trim().length > 0;
  }).length;
  return { done, total: dimensionIds.length };
}
```

- [ ] **Step 4: Typecheck e commit**

```bash
npx tsc --noEmit
git add src/types/mma.ts src/hooks/useCycleData.ts src/lib/preSession.ts
git commit -m "feat(mma): estado pre_session, ciclo nasce nele e gate puro da pré-sessão"
```
Esperado: `tsc` sem erros.

---

### Task 3: Hook `usePreSession`

**Files:**
- Create: `src/hooks/usePreSession.ts`

**Interfaces:**
- Consumes: `supabase` client (tabela `pre_session_assessments` já nos types após Task 1), `useAuth`.
- Produces: `usePreSessionAssessments(cycleId?: string)` → query de `PreSessionAssessment[]`; `useSavePreSessionAssessment(cycleId: string)` → mutation `{ dimensionId, smStage, rationale }`.

- [ ] **Step 1: Escrever o hook**

Criar `src/hooks/usePreSession.ts` (espelha `useProposals`/`useSaveProposal` de useCycleData.ts):
```ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface PreSessionAssessment {
  cycle_id: string;
  dimension_id: string;
  sm_stage: number;
  rationale: string;
}

/** Pré-avaliações do SM para o ciclo (1 por dimensão). */
export function usePreSessionAssessments(cycleId: string | undefined) {
  return useQuery({
    queryKey: ["pre-session", cycleId],
    enabled: Boolean(cycleId),
    staleTime: 5_000,
    queryFn: async (): Promise<PreSessionAssessment[]> => {
      const { data, error } = await supabase
        .from("pre_session_assessments")
        .select("cycle_id, dimension_id, sm_stage, rationale")
        .eq("cycle_id", cycleId!);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Upsert de uma pré-avaliação. A RLS só permite escrita enquanto o ciclo está em pre_session. */
export function useSavePreSessionAssessment(cycleId: string) {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { dimensionId: string; smStage: number; rationale: string }) => {
      const { error } = await supabase.from("pre_session_assessments").upsert(
        {
          cycle_id: cycleId,
          dimension_id: p.dimensionId,
          sm_stage: p.smStage,
          rationale: p.rationale,
          created_by: user!.id,
        },
        { onConflict: "cycle_id,dimension_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pre-session", cycleId] }),
  });
}
```

- [ ] **Step 2: Typecheck, lint e commit**

```bash
npx tsc --noEmit && npm run lint
git add src/hooks/usePreSession.ts
git commit -m "feat(mma): hook usePreSession (leitura + upsert)"
```
Esperado: sem erros de tipo/lint.

---

### Task 4: Componente `PreSessionEditor`

**Files:**
- Create: `src/components/mma/PreSessionEditor.tsx`

**Interfaces:**
- Consumes: `useDimensions`, `useStageDescriptions` (useCycleData), `useTeamAnchors` (useAnchors), `usePreSessionAssessments`/`useSavePreSessionAssessment` (usePreSession), `useTransitionCycle` (useCycleData), `isPreSessionComplete`/`preSessionProgress` (lib/preSession).
- Produces: componente `PreSessionEditor({ teamId, cycleId, facilitator }: { teamId: string; cycleId: string; facilitator: boolean })`.

- [ ] **Step 1: Escrever o componente**

Criar `src/components/mma/PreSessionEditor.tsx`:
```tsx
import { useMemo, useState } from "react";
import { useDimensions, useStageDescriptions, useTransitionCycle } from "@/hooks/useCycleData";
import { useTeamAnchors } from "@/hooks/useAnchors";
import { usePreSessionAssessments, useSavePreSessionAssessment } from "@/hooks/usePreSession";
import { isPreSessionComplete, preSessionProgress } from "@/lib/preSession";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ChevronDown, Check } from "lucide-react";

export default function PreSessionEditor({
  teamId,
  cycleId,
  facilitator,
}: {
  teamId: string;
  cycleId: string;
  facilitator: boolean;
}) {
  const { data: dimensions = [] } = useDimensions();
  const { data: descriptions = [] } = useStageDescriptions();
  const { data: anchors = [] } = useTeamAnchors(teamId);
  const { data: saved = [] } = usePreSessionAssessments(cycleId);
  const save = useSavePreSessionAssessment(cycleId);
  const transition = useTransitionCycle(teamId, cycleId);

  const [expanded, setExpanded] = useState<string | null>(null);
  const [draftStage, setDraftStage] = useState<Record<string, number>>({});
  const [draftRationale, setDraftRationale] = useState<Record<string, string>>({});

  const savedByDim = useMemo(() => new Map(saved.map((a) => [a.dimension_id, a])), [saved]);
  const stagesByDim = useMemo(() => {
    const m = new Map<string, typeof descriptions>();
    for (const d of descriptions) {
      const arr = m.get(d.dimension_id) ?? [];
      arr.push(d);
      m.set(d.dimension_id, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.stage_number - b.stage_number);
    return m;
  }, [descriptions]);
  const anchorsByDim = useMemo(() => {
    const m = new Map<string, typeof anchors>();
    for (const a of anchors) {
      const arr = m.get(a.dimension_id) ?? [];
      arr.push(a);
      m.set(a.dimension_id, arr);
    }
    return m;
  }, [anchors]);

  const dimensionIds = useMemo(() => dimensions.map((d) => d.id), [dimensions]);
  const { done, total } = preSessionProgress(dimensionIds, saved);
  const complete = isPreSessionComplete(dimensionIds, saved);

  const stageOf = (dimId: string) => draftStage[dimId] ?? savedByDim.get(dimId)?.sm_stage ?? null;
  const rationaleOf = (dimId: string) =>
    draftRationale[dimId] ?? savedByDim.get(dimId)?.rationale ?? "";

  const canSaveDim = (dimId: string) => {
    const s = stageOf(dimId);
    return facilitator && s != null && s >= 1 && s <= 4 && rationaleOf(dimId).trim().length > 0;
  };

  if (!facilitator) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-venice-textTertiary">
        Pré-sessão em preparação pelo facilitador. Aguarde o início da sessão.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Pré-sessão</h2>
          <p className="text-xs text-venice-textTertiary">
            Sua análise prévia por dimensão (estágio + argumento). Congela ao iniciar a sessão.
          </p>
        </div>
        <span className="font-mono text-xs text-venice-textSecondary">{done}/{total}</span>
      </div>

      <div className="space-y-2">
        {dimensions.map((dim) => {
          const stages = stagesByDim.get(dim.id) ?? [];
          const dimAnchors = anchorsByDim.get(dim.id) ?? [];
          const isOpen = expanded === dim.id;
          const activeStage = stageOf(dim.id);
          const isSaved = !!savedByDim.get(dim.id);

          return (
            <div key={dim.id} className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <button
                className="flex w-full items-center gap-3 p-4 text-left"
                onClick={() => setExpanded(isOpen ? null : dim.id)}
              >
                <span className="text-xs text-venice-textTertiary">{dim.axis_name}</span>
                <b className="min-w-0 flex-1 text-sm">{dim.name}</b>
                {isSaved ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-venice-okBg px-3 py-1 text-xs font-medium text-venice-okFg">
                    <Check className="h-3 w-3" /> {Number(savedByDim.get(dim.id)!.sm_stage)}
                  </span>
                ) : (
                  <span className="text-xs text-venice-textTertiary">pendente</span>
                )}
                <ChevronDown className={cn("h-4 w-4 text-venice-textTertiary transition-transform", isOpen && "rotate-180")} />
              </button>

              {isOpen && (
                <div className="space-y-4 border-t border-border p-4">
                  {dimAnchors.length > 0 && (
                    <div className="rounded-lg bg-venice-surface p-3">
                      <p className="mb-2 text-xs font-medium text-venice-textSecondary">Indicadores</p>
                      <ul className="space-y-1">
                        {dimAnchors.map((a) => (
                          <li key={a.id} className="flex items-center justify-between text-xs">
                            <span className="text-venice-textSecondary">{a.name}</span>
                            <span className="font-mono">
                              {a.value ?? "—"}{a.unit ? ` ${a.unit}` : ""} · {a.verdict}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {stages.map((s) => {
                      const selected = activeStage != null && activeStage === s.stage_number;
                      return (
                        <button
                          key={s.id}
                          onClick={() => setDraftStage((d) => ({ ...d, [dim.id]: s.stage_number }))}
                          className={cn(
                            "rounded-xl border-[1.5px] p-4 text-left transition-all",
                            selected ? "border-venice-accent bg-venice-okBg" : "border-border bg-card hover:border-venice-textTertiary",
                          )}
                        >
                          <b className="text-sm">Estágio {s.stage_number} — {s.short_text}</b>
                          <p className="mt-1 text-xs leading-relaxed text-venice-textSecondary">{s.description}</p>
                        </button>
                      );
                    })}
                  </div>

                  <Textarea
                    placeholder="Argumento: por que este estágio, com base nos indicadores…"
                    value={rationaleOf(dim.id)}
                    onChange={(e) => setDraftRationale((d) => ({ ...d, [dim.id]: e.target.value }))}
                    rows={3}
                  />

                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      disabled={!canSaveDim(dim.id) || save.isPending}
                      onClick={() =>
                        save.mutate({
                          dimensionId: dim.id,
                          smStage: stageOf(dim.id)!,
                          rationale: rationaleOf(dim.id).trim(),
                        })
                      }
                    >
                      Salvar dimensão
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
        {!complete && (
          <span className="text-xs text-venice-textTertiary">Preencha as {total} dimensões para iniciar a sessão.</span>
        )}
        <Button
          disabled={!complete || transition.isPending}
          onClick={() => transition.mutate("session")}
        >
          Iniciar sessão com o time
        </Button>
      </div>
    </div>
  );
}
```

Nota: se as classes `venice-surface`/`venice-okBg`/`venice-accent` não existirem, reusar as que a Sessao.tsx já usa (conferir em `src/pages/squad/Sessao.tsx`). Ajustar sem inventar tokens novos.

- [ ] **Step 2: Typecheck, lint e commit**

```bash
npx tsc --noEmit && npm run lint
git add src/components/mma/PreSessionEditor.tsx
git commit -m "feat(mma): componente PreSessionEditor (estágio + argumento + indicadores + gate 10/10)"
```
Esperado: sem erros.

---

### Task 5: Amarração na aba Sessão + Jornada + README

**Files:**
- Modify: `src/pages/squad/Sessao.tsx`
- Modify: `src/pages/squad/Jornada.tsx`
- Modify: `README.md`

**Interfaces:**
- Consumes: `PreSessionEditor` da Task 4.

- [ ] **Step 1: Renderizar o editor quando `status === 'pre_session'`**

Em `src/pages/squad/Sessao.tsx`:
1. Adicionar o import no topo:
```tsx
import PreSessionEditor from "@/components/mma/PreSessionEditor";
```
2. Logo após o guard `if (!cycle) { … }` (e ANTES do `if (cycle.status !== "session")`), inserir:
```tsx
  if (cycle.status === "pre_session") {
    return <PreSessionEditor teamId={teamId!} cycleId={cycle.id} facilitator={facilitator} />;
  }
```
Isso garante que, em `pre_session`, mostra o editor; nos demais estados, o fluxo atual (consenso / mensagens) segue inalterado.

- [ ] **Step 2: Ajustar a cópia da Jornada**

Em `src/pages/squad/Jornada.tsx`, localizar o texto que descreve o início do ciclo/sessão e refletir que a primeira etapa agora é a **Pré-sessão** (ex.: onde diz "Inicie a sessão", passar a "Inicie a pré-sessão"). Não alterar lógica — só a cópia visível. Se a Jornada listar as etapas do ciclo, incluir "Pré-sessão" antes de "Sessão".

- [ ] **Step 3: Atualizar o README**

Em `README.md`, na descrição do fluxo/rotas do squad, documentar a nova etapa: ciclo nasce em `pre_session`; o SM registra estágio provisório + argumento por dimensão (com indicadores) e transiciona para `session`; a pré congela nesse momento (RLS). Manter a governança do CLAUDE.md (toda mudança estrutural atualiza o README).

- [ ] **Step 4: Typecheck, lint, build e commit**

```bash
npx tsc --noEmit && npm run lint && npx vite build
git add src/pages/squad/Sessao.tsx src/pages/squad/Jornada.tsx README.md
git commit -m "feat(mma): amarra a pré-sessão na aba Sessão e atualiza Jornada/README"
```
Esperado: build limpo.

---

### Task 6: Verificação manual do fluxo (E2E)

**Files:** nenhum (validação).

- [ ] **Step 1: Rodar o app**

```bash
npm run dev
```
Logar como SM/AM de um squad de teste.

- [ ] **Step 2: Percorrer o fluxo**

1. Na Jornada, iniciar um ciclo → confirmar que ele nasce em `pre_session` (a aba Sessão mostra o editor de pré-sessão, não o de consenso).
2. Abrir dimensões: confirmar que aparecem indicadores/âncoras + as 4 descrições de estágio; escolher estágio e escrever argumento; "Salvar dimensão" fica habilitado só com estágio + argumento.
3. Confirmar o contador X/10 subir; "Iniciar sessão com o time" só habilita em 10/10.
4. Clicar "Iniciar sessão com o time" → o ciclo vai para `session` e a aba passa a mostrar a tela de consenso atual (inalterada).
5. **Freeze:** confirmar (via banco/MCP) que uma tentativa de UPDATE em `pre_session_assessments` com o ciclo em `session` é barrada pela RLS.

- [ ] **Step 3: Regressão**

- Membro não-facilitador em `pre_session` vê "Pré-sessão em preparação…", sem edição.
- Ciclos antigos (criados antes, em `session`/`homologation`/etc.) continuam funcionando normalmente.

- [ ] **Step 4: Deploy (quando aprovado)**

Lembrar: o `neo-lm` NÃO tem auto-deploy no push. Após merge na `main`, rodar deploy manual: `npx vercel --prod --yes` na raiz do monorepo. (A migration já foi aplicada na Task 1, independente do deploy do front.)

import type { DashboardItem } from '../types/jira';
import { isDiscardedStatus } from './discard';

// Visão de épicos: agrega os itens (histórias/bugs/tarefas) pelo épico pai (campo Epic, vindo
// do parent no Jira). Funções puras, como o resto de src/performance/.

const DAY_MS = 86_400_000;
// O predicado de descarte vive SÓ em discard.ts. Aqui havia
// `new Set(['CANCELADO', 'DESCARTADO'])` com match EXATO, enquanto o canônico usa raízes por
// substring (`CANCELAD`, `DESCARTAD`) para pegar as variantes reais do Jira. Consequência:
// "DESCARTADOS" (plural) e "CANCELADO ❌" saíam das métricas de fluxo e CONTINUAVAM contados
// nos épicos — o mesmo item, descartado numa tela e ativo na outra.
const DONE_EPIC_STATUS = /(CONCLU|DONE|FECHAD|FINALIZ|ENCERR)/i;

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const normalized = value.trim().replace(' ', 'T').replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export interface EpicSummary {
  key: string;
  name: string;
  status: string;
  epicDone: boolean;   // o épico está num status concluído?
  total: number;       // itens filhos (fora descartados)
  done: number;        // filhos concluídos
  progress: number;    // % concluído (0–100)
  points: number;      // story points somados
  ageDays: number;     // idade desde o filho mais antigo
  wip: number;         // filhos em andamento
  teams: string[];     // times envolvidos
}

export interface EpicsView {
  epics: EpicSummary[];      // ordenados: em andamento e mais volumosos primeiro
  withEpic: number;          // itens (não descartados) ligados a um épico
  withoutEpic: number;       // itens avulsos
  coverage: number;          // % dos itens que estão sob um épico
}

export function computeEpics(items: readonly DashboardItem[], now: Date): EpicsView {
  const active = items.filter(i => !isDiscardedStatus(i.Status));
  let withEpic = 0;
  let withoutEpic = 0;
  const byEpic = new Map<string, DashboardItem[]>();

  for (const item of active) {
    if (item.Epic) {
      withEpic++;
      const list = byEpic.get(item.Epic) ?? [];
      list.push(item);
      byEpic.set(item.Epic, list);
    } else {
      withoutEpic++;
    }
  }

  const epics: EpicSummary[] = [];
  for (const [key, children] of byEpic) {
    const done = children.filter(c => c.StatusCategory === 'DONE').length;
    const wip = children.filter(c => c.StatusCategory === 'IN_PROGRESS').length;
    const points = children.reduce((s, c) => s + (c.StoryPoints ?? 0), 0);
    const oldest = children
      .map(c => parseDate(c.Created))
      .filter((d): d is Date => d !== null)
      .sort((a, b) => a.getTime() - b.getTime())[0];
    const ageDays = oldest ? Math.floor((now.getTime() - oldest.getTime()) / DAY_MS) : 0;
    const teams = [...new Set(children.map(c => c.Team.trim()).filter(Boolean))];
    const status = children.find(c => c.EpicStatus)?.EpicStatus ?? '—';
    const name = children.find(c => c.EpicName)?.EpicName ?? key;

    epics.push({
      key, name, status,
      epicDone: DONE_EPIC_STATUS.test(status),
      total: children.length,
      done,
      progress: children.length ? Math.round((done / children.length) * 100) : 0,
      points,
      ageDays,
      wip,
      teams,
    });
  }

  // Épicos ainda não concluídos primeiro (foco em andamento), depois por volume.
  epics.sort((a, b) => Number(a.epicDone) - Number(b.epicDone) || b.total - a.total);

  const totalItems = withEpic + withoutEpic;
  return {
    epics,
    withEpic,
    withoutEpic,
    coverage: totalItems ? Math.round((withEpic / totalItems) * 100) : 0,
  };
}

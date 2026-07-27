import { promises as fs } from "fs";
import path from "path";

/**
 * O "kit" 00–09 é o cérebro do Nero (ver content/kit/). Carregado do disco no
 * servidor e mantido em cache de módulo — é a base de conhecimento enxuta que
 * alimenta o contexto do motor (disciplina de tokens, kit 00 §6 / 07).
 */

const KIT_DIR = path.join(process.cwd(), "content", "kit");

// NB: o "01" (memória do projeto) NÃO é mais carregado de arquivo — o estado vivo é
// gerado do banco por buildMemoriaContext() (ver src/lib/state/queries.ts). O arquivo
// content/kit/01_MEMORIA_PROJETO.md fica só como doc histórico.
export const KIT_FILES = {
  "00": "00_INSTRUCOES_AGENTE.md",
  "02": "02_ROADMAP_MACRO.md",
  "03": "03_EPICS_E_TASKS.md",
  "04": "04_REPORT_QUINZENAL_TEMPLATE.md",
  "05": "05_ONBOARDING_DISCOVERY.md",
  "06": "06_GUARDRAILS_LGPD.md",
  "07": "07_CADENCIA_RITUAIS.md",
  "08": "08_ANCORA_DAMA.md",
  "09": "09_GOLDEN_EXAMPLE.md",
} as const;

export type KitKey = keyof typeof KIT_FILES;
export type Kit = Record<KitKey, string>;

let cache: Kit | null = null;

export async function loadKit(): Promise<Kit> {
  if (cache) return cache;
  const entries = await Promise.all(
    (Object.entries(KIT_FILES) as [KitKey, string][]).map(
      async ([key, file]) => {
        const text = await fs.readFile(path.join(KIT_DIR, file), "utf8");
        return [key, text] as const;
      },
    ),
  );
  cache = Object.fromEntries(entries) as Kit;
  return cache;
}

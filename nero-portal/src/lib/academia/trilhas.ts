import { promises as fs } from "fs";
import path from "path";

/**
 * Academia — trilhas guiadas em que o Nero atua como tutor. Conteúdo em
 * markdown com frontmatter simples (content/academia/<trilha>/NN-passo.md),
 * carregado do disco com cache de módulo (mesmo padrão do kit).
 */

const ACADEMIA_DIR = path.join(process.cwd(), "content", "academia");
const KIT_TUTOR = path.join(process.cwd(), "content", "kit", "10_MODO_TUTOR.md");

// Registro das trilhas (v1: uma). O diretório é a chave da rota /academia/[trilha].
export const TRILHAS = [
  {
    slug: "trilha-dados-governados",
    titulo: "Como encontrar e usar dados governados no LM",
    descricao:
      "Do zero ao autônomo: o que é o catálogo, como ler uma tabela documentada, LGPD na prática e como pedir (e contribuir com) dados do jeito certo.",
    publico: "Áreas de negócio do LM — sem pré-requisito técnico",
    duracao: "~40 min (4 passos)",
  },
] as const;

export type TrilhaMeta = (typeof TRILHAS)[number];

export type TrilhaStep = {
  slug: string; // nome do arquivo sem extensão (ex.: "01-o-que-e-o-catalogo")
  ordem: number;
  titulo: string;
  objetivo: string;
  body: string; // markdown sem o frontmatter
};

export type Trilha = TrilhaMeta & { steps: TrilhaStep[] };

/** Parser mínimo de frontmatter (--- chave: valor ---). Sem dependência nova. */
function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { meta: {}, body: raw };
  const meta: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx > 0) meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return { meta, body: raw.slice(m[0].length) };
}

const cache = new Map<string, Trilha>();

export async function loadTrilha(slug: string): Promise<Trilha | null> {
  const meta = TRILHAS.find((t) => t.slug === slug);
  if (!meta) return null;
  const cached = cache.get(slug);
  if (cached) return cached;

  const dir = path.join(ACADEMIA_DIR, slug);
  let files: string[];
  try {
    files = (await fs.readdir(dir)).filter((f) => f.endsWith(".md")).sort();
  } catch {
    return null;
  }

  const steps: TrilhaStep[] = [];
  for (let i = 0; i < files.length; i++) {
    const raw = await fs.readFile(path.join(dir, files[i]), "utf8");
    const { meta: fm, body } = parseFrontmatter(raw);
    steps.push({
      slug: files[i].replace(/\.md$/, ""),
      ordem: i,
      titulo: fm.titulo ?? files[i],
      objetivo: fm.objetivo ?? "",
      body,
    });
  }

  const trilha: Trilha = { ...meta, steps };
  cache.set(slug, trilha);
  return trilha;
}

let tutorRules: string | null = null;

/**
 * Bloco de contexto do chat tutor (injetado como scopeContext, NÃO cacheado):
 * regras de conduta didática (kit 10) + trilha + conteúdo do passo atual.
 * O kit 10 fica FORA do prompt global de propósito — só aulas o recebem.
 */
export async function buildTutorContext(trilha: Trilha, step: TrilhaStep): Promise<string> {
  if (tutorRules === null) tutorRules = await fs.readFile(KIT_TUTOR, "utf8");

  return [
    tutorRules,
    "",
    `## Aula em andamento`,
    `Trilha: ${trilha.titulo} (${trilha.publico})`,
    `Passo atual: ${step.ordem + 1}/${trilha.steps.length} — ${step.titulo}`,
    `Objetivo do passo: ${step.objetivo}`,
    "",
    "### Conteúdo do passo (o aluno está lendo isto ao lado do chat)",
    step.body,
    "",
    "Você está em MODO TUTOR: siga as regras acima. Conduza o aluno pelo objetivo " +
      "deste passo; reconduza com gentileza se ele sair do tema.",
  ].join("\n");
}

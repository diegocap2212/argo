import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { put } from '@vercel/blob';
import { JiraClient } from './jira-client';
import { mapJiraIssueToDashboardItem } from './field-mapper';
import { calculateMetrics } from './metrics-calculator';
import { baselineFrom, checkDatasetContract, type DatasetBaseline } from './dataset-contract';
import type { StatusTransition } from '../src/types/jira';

// Pathname fixo do dataset no Vercel Blob (privado). /api/data lê por este mesmo nome.
const BLOB_PATHNAME = 'jira-data.json';

// Schema mínimo de sanidade do item normalizado — barra gravar lixo por cima de dado bom.
const ItemSchema = z.object({
  Key: z.string().min(1),
  Type: z.string(),
  Status: z.string(),
  StatusCategory: z.enum(['TODO', 'IN_PROGRESS', 'DONE']),
  Team: z.string(),
  Created: z.string(),
  Release: z.string(),
}).passthrough();

// Escrita atômica: grava em tmp e renomeia (rename é atômico no mesmo FS).
async function writeAtomic(filePath: string, content: string) {
  const tmp = `${filePath}.tmp-${process.pid}`;
  await fs.writeFile(tmp, content, 'utf-8');
  await fs.rename(tmp, filePath);
}

async function main() {
  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_USER_EMAIL;
  const token = process.env.JIRA_API_TOKEN;

  if (!baseUrl || !email || !token) {
    console.error("❌ ERRO: Faltam variáveis de ambiente do Jira.");
    if (!baseUrl) console.error("- JIRA_BASE_URL não definida.");
    if (!email) console.error("- JIRA_USER_EMAIL não definida.");
    if (!token) console.error("- JIRA_API_TOKEN não definida.");
    console.log("Dica: No GitHub, verifique Settings > Secrets and variables > Actions");
    process.exit(1);
  }

  const client = new JiraClient(baseUrl, email, token);
  
  // JQL filtrando pelas labels e campos de time, ao invés de limitar por Release
  const teamsToFetch = [
    '"OPTIMUS"', '"NIVUS"', '"TAOS"', '"GOL"', '"FUSCA"', '"JETTA"', '"SCANIA"', '"PARATI"',
    '"WHATSAPP"', '"SEMINOVOS"', '"TERA"', '"PLATAFORMA"', '"PRICING"', '"SANTANA"', '"AMAROK"', 
    '"TIGUAN"', '"UP"', '"CONTRATOS"', '"MANUTENÇÃO"', '"MULTAS"', '"RESSARCIMENTO"', '"SALES_FORCE"',
    '"D.LAKE DOMINIO"', '"DATA LAKE ESTRUTURANTE"', '"COMPRAS"', '"ESTOQUE"', '"MOB"', '"LAKE-DOMINIO"'
  ];

  // Filtro dos times LM (labels/campos de time) + saneamentos específicos da LM.
  const teamClause = `(labels in (${teamsToFetch.join(',')}) or cf[11795] in (${teamsToFetch.join(',')}) or cf[12386] in (${teamsToFetch.join(',')}))`;
  const commonExclusions = `type not in (Epic, "Épico", subTaskIssueTypes()) and cf[13065] is EMPTY and (cf[12683] not in ("TESTES-LOCAVIA") or cf[12683] is EMPTY)`;
  const lmFilter = `${teamClause} and ${commonExclusions}`;
  // SFMKT (Salesforce Marketplace) é projeto próprio: traz tudo do projeto, só excluindo épicos/subtarefas.
  // Não aplicar cf[13065]/cf[12683] (filtros específicos dos projetos LM) para não descartar issues do SFMKT.
  const sfmktFilter = `project = SFMKT and type not in (Epic, "Épico", subTaskIssueTypes())`;
  // SFV (Salesforce Vendas) — projeto próprio (time da Gabriela): traz tudo do projeto,
  // sem os filtros específicos dos projetos LM, só excluindo épicos/subtarefas.
  const sfvFilter = `project = SFV and type not in (Epic, "Épico", subTaskIssueTypes())`;
  const simpleJql = `(${lmFilter}) OR (${sfmktFilter}) OR (${sfvFilter}) ORDER BY created DESC`;

  console.log(`Iniciando sincronização Jira... JQL: ${simpleJql}`);

  try {
    const issues = await client.searchIssues(simpleJql);
    console.log(`Foram retornadas ${issues.length} issues da API.`);

    if (issues.length === 0) {
      console.error("❌ ERRO CRÍTICO: A API do Jira retornou 0 itens.");
      console.error("Isso pode indicar um problema de autenticação ou mudança nos filtros JQL.");
      console.error("A sincronização foi ABORTADA para evitar limpar o dashboard.");
      process.exit(1);
    }

    /**
     * CHANGELOG COMPLETO antes de calcular métricas (achado 5.6).
     *
     * `searchIssues` traz `expand: 'changelog'`, que devolve histórico PARCIAL por issue e não
     * avisa que cortou. E é desse histórico que saem `TimeInStatus` (cycle time por etapa) e
     * `TimeInTodo` — reconstruídos transição por transição. Com histórico truncado, os dois
     * saem errados parecendo certos.
     *
     * O bulkfetch substitui o changelog de cada issue pelo completo. Se a busca falhar, o sync
     * NÃO aborta: segue com o parcial e MARCA os itens, porque métrica marcada como incerta é
     * melhor que sync sem dado nenhum — e muito melhor que métrica errada sem marca.
     */
    let changelogs = new Map<string, { histories: StatusTransition[]; total: number; complete: boolean }>();
    let changelogCompleto = true;
    try {
      console.log(`Buscando changelog completo de ${issues.length} issues (bulkfetch)...`);
      changelogs = await client.bulkFetchChangelogs(issues.map(i => i.id).filter(Boolean));
      console.log(`Changelog completo obtido para ${changelogs.size} issues.`);
    } catch (e) {
      changelogCompleto = false;
      console.error(
        '⚠️  bulkfetch de changelog falhou — seguindo com o histórico PARCIAL da busca. ' +
          'TimeInStatus e TimeInTodo ficam marcados como incertos:',
        e instanceof Error ? e.message : String(e),
      );
    }

    const dashboardItems = issues.map(issue => {
      const completo = changelogs.get(issue.id);
      // Substitui o changelog parcial pelo completo ANTES de calcular as métricas.
      const enriquecido = completo
        ? { ...issue, changelog: { histories: completo.histories } }
        : issue;
      const item = calculateMetrics(mapJiraIssueToDashboardItem(enriquecido), enriquecido);
      // Marca a procedência do histórico: a métrica derivada dele deixa de parecer confiável
      // quando não é.
      item.DataQuality.historyComplete = changelogCompleto && (completo?.complete ?? false);
      return item;
    });

    // Validação de schema: se os itens normalizados não baterem, ABORTA (não sobrescreve dado bom).
    const parsed = z.array(ItemSchema).safeParse(dashboardItems);
    if (!parsed.success) {
      console.error("❌ ERRO: dados normalizados inválidos — sync abortado para não corromper o dataset.");
      console.error(parsed.error.issues.slice(0, 5));
      process.exit(1);
    }

    /**
     * CONTRATO DO CONJUNTO — o schema acima valida item por item; isto valida o dataset.
     *
     * Os erros que machucam não são estruturais, são de conjunto: volume que despencou porque
     * a credencial mudou, time que desapareceu porque o campo foi renomeado no Jira, Key
     * duplicada por paginação repetida, custom field que virou `undefined` e levou 100% dos
     * Releases com ele. Nenhum desses viola o schema — todos publicam um dataset "válido" que
     * descreve uma realidade falsa, sobrescrevem o Blob e ninguém tem como saber.
     *
     * Comparar com o dataset ANTERIOR é o que dá sentido a "despencou": sem baseline, queda de
     * 90% é indistinguível de trimestre fraco.
     */
    const baselinePath = path.resolve(process.cwd(), 'src/data-baseline.json');
    let baseline: DatasetBaseline | null = null;
    try {
      baseline = JSON.parse(await fs.readFile(baselinePath, 'utf-8')) as DatasetBaseline;
    } catch {
      console.warn('⚠️  Sem baseline anterior — as regras comparativas ficam de fora neste sync.');
    }

    const violacoes = checkDatasetContract(dashboardItems, baseline);
    const bloqueios = violacoes.filter((v) => v.severidade === 'bloqueia');
    for (const v of violacoes) {
      const marca = v.severidade === 'bloqueia' ? '❌' : '⚠️ ';
      console.error(`${marca} [${v.regra}] ${v.detalhe}`);
    }
    if (bloqueios.length) {
      console.error(
        `\n❌ Contrato do dataset violado (${bloqueios.length} bloqueio(s)) — sync ABORTADO.\n` +
          `   O Blob NÃO foi tocado: o dashboard segue com o último dataset bom.\n` +
          `   Se a mudança for legítima (time novo, JQL ampliado), atualize src/data-baseline.json.`,
      );
      process.exit(1);
    }

    const syncedAt = new Date().toISOString();

    // SYNC_LOCAL_ONLY=1 → grava o dataset no fallback local (src/data.json) e PULA o Blob.
    // Usado em desenvolvimento para testar sem tocar o dataset de produção (nem colidir com o cron).
    if (process.env.SYNC_LOCAL_ONLY === '1') {
      const dataPath = path.resolve(process.cwd(), 'src/data.json');
      await writeAtomic(dataPath, JSON.stringify(dashboardItems));
      console.log(`💾 [LOCAL] Dataset gravado em src/data.json: ${dashboardItems.length} itens (Blob NÃO tocado).`);
    } else {
      // ── Nível 3: o dataset (≈5MB) vive no Vercel Blob (privado), não mais no git. ──
      // /api/data lê este blob server-side e entrega só com sessão. Sem churn de 5MB no repo.
      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        console.error("❌ ERRO: BLOB_READ_WRITE_TOKEN ausente — não dá para gravar o dataset no Blob.");
        process.exit(1);
      }
      // `count` e `hash` fazem parte do envelope para o /api/data poder DECLARAR o que está
      // servindo (source/stale/hash/count) em vez de o cliente inferir. Antes, quando o Blob
      // falhava, o endpoint devolvia o `src/data.json` congelado com o `syncedAt` do
      // heartbeat — dado velho rotulado como fresco, ETag incluído.
      const itemsJson = JSON.stringify(dashboardItems);
      const hash = createHash('sha256').update(itemsJson).digest('hex').slice(0, 16);
      await put(
        BLOB_PATHNAME,
        JSON.stringify({ items: dashboardItems, syncedAt, count: dashboardItems.length, hash }),
        {
          access: 'private',
          addRandomSuffix: false,
          allowOverwrite: true,
          contentType: 'application/json',
        },
      );
      console.log(`☁️  Dataset gravado no Blob (${BLOB_PATHNAME}): ${dashboardItems.length} itens, hash ${hash}.`);
    }

    // Timestamp do sync (tiny) — mantém o header dos SMs e serve de heartbeat.
    const metaPath = path.resolve(process.cwd(), 'src/data-meta.json');
    await writeAtomic(metaPath, JSON.stringify({ syncedAt }, null, 2));

    // Baseline para o PRÓXIMO sync comparar. Gravado só depois de tudo dar certo: se este sync
    // abortou, o baseline continua sendo o do último dataset bom — senão um sync ruim viraria a
    // nova referência e legitimaria a queda que ele mesmo causou.
    await writeAtomic(baselinePath, JSON.stringify(baselineFrom(dashboardItems), null, 2));

    console.log(`✅ Sucesso! ${dashboardItems.length} itens sincronizados.`);
    
  } catch (error) {
    console.error("ERRO durante a sincronização:", error);
    process.exit(1);
  }
}

main();

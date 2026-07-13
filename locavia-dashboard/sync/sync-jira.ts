import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import { put } from '@vercel/blob';
import { JiraClient } from './jira-client';
import { mapJiraIssueToDashboardItem } from './field-mapper';
import { calculateMetrics } from './metrics-calculator';

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
  const commonExclusions = `type not in (Epic, subTaskIssueTypes()) and cf[13065] is EMPTY and (cf[12683] not in ("TESTES-LOCAVIA") or cf[12683] is EMPTY)`;
  const lmFilter = `${teamClause} and ${commonExclusions}`;
  // SFMKT (Salesforce Marketplace) é projeto próprio: traz tudo do projeto, só excluindo épicos/subtarefas.
  // Não aplicar cf[13065]/cf[12683] (filtros específicos dos projetos LM) para não descartar issues do SFMKT.
  const sfmktFilter = `project = SFMKT and type not in (Epic, subTaskIssueTypes())`;
  // SFV (Salesforce Vendas) — projeto próprio (time da Gabriela): traz tudo do projeto,
  // sem os filtros específicos dos projetos LM, só excluindo épicos/subtarefas.
  const sfvFilter = `project = SFV and type not in (Epic, subTaskIssueTypes())`;
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

    const dashboardItems = issues.map(issue => calculateMetrics(mapJiraIssueToDashboardItem(issue), issue));

    // Validação de schema: se os itens normalizados não baterem, ABORTA (não sobrescreve dado bom).
    const parsed = z.array(ItemSchema).safeParse(dashboardItems);
    if (!parsed.success) {
      console.error("❌ ERRO: dados normalizados inválidos — sync abortado para não corromper o dataset.");
      console.error(parsed.error.issues.slice(0, 5));
      process.exit(1);
    }

    const syncedAt = new Date().toISOString();

    // ── Nível 3: o dataset (≈5MB) vive no Vercel Blob (privado), não mais no git. ──
    // /api/data lê este blob server-side e entrega só com sessão. Sem churn de 5MB no repo.
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      console.error("❌ ERRO: BLOB_READ_WRITE_TOKEN ausente — não dá para gravar o dataset no Blob.");
      process.exit(1);
    }
    await put(BLOB_PATHNAME, JSON.stringify({ items: dashboardItems, syncedAt }), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
    });
    console.log(`☁️  Dataset gravado no Blob (${BLOB_PATHNAME}): ${dashboardItems.length} itens.`);

    // Timestamp do sync (tiny) — mantém o header dos SMs e serve de heartbeat.
    const metaPath = path.resolve(process.cwd(), 'src/data-meta.json');
    await writeAtomic(metaPath, JSON.stringify({ syncedAt }, null, 2));

    console.log(`✅ Sucesso! ${dashboardItems.length} itens sincronizados.`);
    
  } catch (error) {
    console.error("ERRO durante a sincronização:", error);
    process.exit(1);
  }
}

main();

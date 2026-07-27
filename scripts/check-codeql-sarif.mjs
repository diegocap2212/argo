#!/usr/bin/env node
/**
 * Consome o SARIF do CodeQL DO ARQUIVO e falha quando aparece achado novo.
 *
 * POR QUE NÃO É A ABA SECURITY: publicar no Code Scanning exige o produto habilitado, e em
 * repositório PRIVADO isso exige GitHub Advanced Security (pago). Sem GHAS o upload responde
 * 403 e derruba a `main` mesmo com a análise passando. Então o resultado é lido daqui.
 *
 * POR QUE COM BASELINE: o gate falha em achado NOVO, não em achado existente. Ligar SAST num
 * código que já existe produz uma lista de pré-existentes; falhar em todos deixa a `main`
 * vermelha para sempre, e vermelho permanente ensina o time a ignorar vermelho. Cada
 * pré-existente está em `.codeql-baseline.json` COM MOTIVO — se não dá para escrever o motivo,
 * é porque é defeito e deve ser corrigido, não baselinado.
 *
 * Uso: node scripts/check-codeql-sarif.mjs <diretório-com-sarif> [baseline.json]
 * Saída: 0 = nada novo · 1 = achado novo, SARIF ausente, ou baseline desatualizado.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? 'codeql-results';
const baselinePath = process.argv[3] ?? '.codeql-baseline.json';

if (!existsSync(dir)) {
  console.error(`::error::diretório '${dir}' não existe — a análise não rodou.`);
  process.exit(1);
}
const sarifs = readdirSync(dir).filter((f) => f.endsWith('.sarif'));
if (sarifs.length === 0) {
  // Um job de SAST que não analisou nada não pode passar: seria o "verde falso" que este
  // esforço inteiro existe para eliminar.
  console.error(`::error::nenhum .sarif em '${dir}' — a análise não produziu resultado.`);
  process.exit(1);
}

const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, 'utf8')) : {};

/** `ruleId|arquivo` → lista de achados. Sem linha: linha muda a cada edição. */
const encontrados = new Map();
for (const nome of sarifs) {
  const sarif = JSON.parse(readFileSync(join(dir, nome), 'utf8'));
  for (const run of sarif.runs ?? []) {
    for (const r of run.results ?? []) {
      const loc = r.locations?.[0]?.physicalLocation;
      const arquivo = loc?.artifactLocation?.uri ?? '(sem arquivo)';
      const linha = loc?.region?.startLine ?? 0;
      const chave = `${r.ruleId}|${arquivo}`;
      if (!encontrados.has(chave)) encontrados.set(chave, []);
      encontrados.get(chave).push({ linha, nivel: r.level ?? 'warning', msg: r.message?.text ?? '' });
    }
  }
}

const novos = [];
const encolheram = [];

for (const [chave, achados] of encontrados) {
  const esperado = baseline[chave]?.qtd ?? 0;
  if (achados.length > esperado) {
    novos.push({ chave, achados, esperado });
  }
}
// Baseline que nunca encolhe apodrece até virar allowlist geral.
for (const [chave, entrada] of Object.entries(baseline)) {
  if (chave.startsWith('_')) continue;
  const real = encontrados.get(chave)?.length ?? 0;
  if (real < (entrada.qtd ?? 0)) encolheram.push({ chave, real, esperado: entrada.qtd });
}

const total = [...encontrados.values()].reduce((n, a) => n + a.length, 0);
console.log(`CodeQL: ${total} achado(s) em ${sarifs.length} arquivo(s) SARIF; ` +
  `${Object.keys(baseline).filter((k) => !k.startsWith('_')).length} entrada(s) no baseline.`);

if (novos.length) {
  console.log('');
  for (const { chave, achados, esperado } of novos) {
    const [regra, arquivo] = chave.split('|');
    console.log(`── ${regra}`);
    console.log(`   ${arquivo} — ${achados.length} achado(s), baseline esperava ${esperado}`);
    for (const a of achados) console.log(`     [${a.nivel}] linha ${a.linha}: ${a.msg}`);
  }
  console.log('');
  console.error(
    `::error::CodeQL: ${novos.length} regra/arquivo com achado NOVO. ` +
      `Corrija, ou — se não for defeito — acrescente em ${baselinePath} COM MOTIVO. ` +
      `Sem aba Security aqui (repo privado sem GHAS): o detalhe é o log acima e o artefato codeql-sarif.`,
  );
  process.exit(1);
}

if (encolheram.length) {
  // Aviso, não falha: quem corrigiu não deve ser punido com CI vermelho.
  for (const { chave, real, esperado } of encolheram) {
    console.log(`::warning::baseline desatualizado em '${chave}': esperava ${esperado}, achou ${real}. ` +
      `Alguém corrigiu — reduza a entrada (ou remova, se zerou) para o baseline não apodrecer.`);
  }
}

console.log('✅ nenhum achado novo.');

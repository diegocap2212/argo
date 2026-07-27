/* Verificação do versionamento + undo (sem API key). Roda: npx tsx scripts/test-state.ts */
import { prisma } from "../src/lib/db";
import {
  listVersions,
  recordDecision,
  setStackItem,
  undoVersion,
  upsertCatalogAsset,
  upsertDataField,
  upsertMaturityAssessment,
} from "../src/lib/state/mutations";
import { assetCompleteness } from "../src/lib/catalog/completeness";

async function main() {
  let pass = 0;
  let fail = 0;
  const check = (ok: boolean, label: string) => {
    console.log(`${ok ? "PASS" : "FAIL"} — ${label}`);
    if (ok) pass++;
    else fail++;
  };

  // 1) create + version
  const dec = await recordDecision({ decisao: "TESTE: decisão de verificação", quem: "script" }, "nero");
  const vList1 = await listVersions(5);
  const vDec = vList1.find((v) => v.entityId === dec.id && v.operation === "create");
  check(!!vDec, "recordDecision cria Decision + StateVersion(create)");
  check((await prisma.decision.findUnique({ where: { id: dec.id } })) !== null, "Decision existe após criar");

  // 2) undo do create → entidade some, versão marcada desfeita
  if (vDec) await undoVersion(vDec.id);
  check((await prisma.decision.findUnique({ where: { id: dec.id } })) === null, "undo(create) removeu a Decision");
  const vDecAfter = await prisma.stateVersion.findUnique({ where: { id: vDec!.id } });
  check(vDecAfter?.desfeito === true, "versão marcada como desfeito");

  // 3) update path: setStackItem altera item existente; undo restaura o 'before'
  const before = await prisma.stackItem.findFirst({ where: { item: "Plataforma do Data Lake" } });
  const updated = await setStackItem(
    { item: "Plataforma do Data Lake", resposta: "Databricks", statusVerdade: "confirmado", proveniencia: "script" },
    "nero",
  );
  check(updated.statusVerdade === "confirmado" && updated.resposta === "Databricks", "setStackItem aplicou update");
  const vUpd = (await listVersions(5)).find((v) => v.entityId === updated.id && v.operation === "update");
  check(!!vUpd, "setStackItem gravou StateVersion(update)");
  if (vUpd) await undoVersion(vUpd.id);
  const reverted = await prisma.stackItem.findUnique({ where: { id: updated.id } });
  check(
    reverted?.statusVerdade === (before?.statusVerdade ?? "lacuna") && (reverted?.resposta ?? null) === (before?.resposta ?? null),
    "undo(update) restaurou o estado anterior do StackItem",
  );

  // 4) maturidade: upsert + validação de área + undo
  const mat = await upsertMaturityAssessment(
    { area: "Metadata", nivelAtual: 1, nivelMeta: 3, statusVerdade: "assumido", proveniencia: "script" },
    "nero",
  );
  check(mat.nivelAtual === 1 && mat.nivelMeta === 3, "upsertMaturityAssessment aplicou níveis");
  let areaInvalida = false;
  try {
    await upsertMaturityAssessment({ area: "Área Inexistente" }, "nero");
  } catch {
    areaInvalida = true;
  }
  check(areaInvalida, "área DAMA inválida é rejeitada");
  const vMat = (await listVersions(5)).find((v) => v.entity === "MaturityAssessment" && v.entityId === mat.id);
  check(!!vMat, "avaliação gravou StateVersion");
  if (vMat) await undoVersion(vMat.id);

  // 5) catálogo: ativo com campos inline + completude + undo(create) cascateia campos
  const asset = await upsertCatalogAsset(
    {
      nome: "teste.script.tabela_undo",
      descricao: "Tabela de verificação",
      owner: "script",
      grao: "1 linha = 1 teste",
      atualizacao: "n/a",
      sensibilidade: "interno",
      lineage: "a → b",
      notasQualidade: "nota",
      statusVerdade: "assumido",
      campos: [
        { nome: "id", tipo: "string", descricao: "PK", sensibilidade: "interno" },
        { nome: "valor", tipo: "int", descricao: "medida", sensibilidade: "interno" },
      ],
    },
    "nero",
  );
  const camposDb = await prisma.dataField.findMany({ where: { assetId: asset.id } });
  check(camposDb.length === 2, "documentar_ativo criou os campos inline");
  const comp = assetCompleteness(asset, camposDb);
  check(comp.pct > 0 && comp.pct < 100, `completude calculada (${comp.pct}%) sem validação do owner`);

  const campo = await upsertDataField(
    { assetNome: asset.nome, nome: "novo_campo", tipo: "date", descricao: "campo incremental" },
    "nero",
  );
  check(campo.nome === "novo_campo", "documentar_campo adicionou campo incremental");
  let semAtivo = false;
  try {
    await upsertDataField({ assetNome: "nao.existe", nome: "x" }, "nero");
  } catch {
    semAtivo = true;
  }
  check(semAtivo, "documentar_campo exige ativo existente");

  const vAsset = (await listVersions(10)).find(
    (v) => v.entity === "CatalogAsset" && v.entityId === asset.id && v.operation === "create",
  );
  check(!!vAsset, "ativo gravou StateVersion(create)");
  if (vAsset) await undoVersion(vAsset.id);
  check(
    (await prisma.catalogAsset.findUnique({ where: { id: asset.id } })) === null,
    "undo(create) removeu o ativo (cascade nos campos)",
  );
  check(
    (await prisma.dataField.count({ where: { assetId: asset.id } })) === 0,
    "campos removidos em cascata",
  );
  // Limpa as versões do campo criado avulso (entidade some com o cascade acima).
  await prisma.stateVersion.deleteMany({ where: { entity: "DataField", entityId: campo.id } });

  console.log(`\n${pass} pass, ${fail} fail`);
  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

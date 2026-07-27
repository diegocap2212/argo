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

  // ══════════════════════════════════════════════════════════════════════════
  // 6) undo(UPDATE com campos inline) — achado 7.5
  //
  // O teste acima cobria só `undo(create)`, que funcionava porque o cascade apagava os
  // campos. O caminho de UPDATE estava quebrado: `upsertCatalogAsset` gravava N `DataField`
  // mas UMA StateVersion do CatalogAsset cujo snapshot nem incluía `campos`. Desfazer
  // restaurava o ativo e DEIXAVA as alterações nos campos — a UI prometendo uma
  // reversibilidade que este caminho não entregava.
  // ══════════════════════════════════════════════════════════════════════════
  const NOME_UPD = "teste.script.tabela_undo_update";
  await upsertCatalogAsset(
    { nome: NOME_UPD, camada: "bronze", campos: [{ nome: "col_a", tipo: "text" }] },
    "nero",
  );
  const assetUpd = await prisma.catalogAsset.findUnique({ where: { nome: NOME_UPD } });
  check(!!assetUpd, "ativo de teste do undo(update) criado");

  // UPDATE que mexe no ativo E nos campos ao mesmo tempo.
  await upsertCatalogAsset(
    {
      nome: NOME_UPD,
      camada: "silver",
      campos: [
        { nome: "col_a", tipo: "integer" }, // tipo alterado
        { nome: "col_b", tipo: "text" }, // campo novo
      ],
    },
    "nero",
  );
  const vUpdAsset = (await listVersions(10)).find(
    (v) => v.entity === "CatalogAsset" && v.entityId === assetUpd!.id && v.operation === "update",
  );
  check(!!vUpdAsset, "update com campos inline gravou StateVersion(update)");
  check(
    !!vUpdAsset?.before && vUpdAsset.before.includes("campos"),
    "snapshot `before` do update INCLUI os campos (era o que faltava)",
  );

  if (vUpdAsset) await undoVersion(vUpdAsset.id);
  const assetDepois = await prisma.catalogAsset.findUnique({ where: { id: assetUpd!.id } });
  check(assetDepois?.camada === "bronze", "undo(update) restaurou o ativo");
  const camposDepois = await prisma.dataField.findMany({
    where: { assetId: assetUpd!.id },
    orderBy: { nome: "asc" },
  });
  check(camposDepois.length === 1, `undo(update) restaurou o CONJUNTO de campos (${camposDepois.length} ≠ 2)`);
  check(camposDepois[0]?.nome === "col_a", "campo novo (col_b) foi removido pelo undo");
  check(camposDepois[0]?.tipo === "text", "tipo do col_a voltou ao valor anterior");

  // ══════════════════════════════════════════════════════════════════════════
  // 7) undo fora de ordem e concorrência otimista — achado 7.6
  //
  // Antes, o undo aplicava o `before` CEGAMENTE: o único guarda era `desfeito`. Desfazer uma
  // versão antiga depois de uma edição nova restaurava o snapshot antigo e PERDIA a edição
  // recente, em silêncio.
  // ══════════════════════════════════════════════════════════════════════════
  const NOME_ORD = "teste.script.tabela_undo_ordem";
  await upsertCatalogAsset({ nome: NOME_ORD, camada: "v1" }, "nero");
  const assetOrd = (await prisma.catalogAsset.findUnique({ where: { nome: NOME_ORD } }))!;
  await upsertCatalogAsset({ nome: NOME_ORD, camada: "v2" }, "nero"); // versão N
  await upsertCatalogAsset({ nome: NOME_ORD, camada: "v3" }, "nero"); // versão N+1

  const versoesOrd = (await listVersions(20)).filter(
    (v) => v.entity === "CatalogAsset" && v.entityId === assetOrd.id && v.operation === "update",
  );
  check(versoesOrd.length >= 2, `duas versões de update registradas (${versoesOrd.length})`);
  const maisAntiga = versoesOrd[versoesOrd.length - 1]!;
  const maisNova = versoesOrd[0]!;

  let bloqueou = false;
  let mensagem = "";
  try {
    await undoVersion(maisAntiga.id); // fora de ordem: existe N+1 pendente
  } catch (e) {
    bloqueou = true;
    mensagem = e instanceof Error ? e.message : String(e);
  }
  check(bloqueou, "undo FORA DE ORDEM é bloqueado (antes perdia a edição mais nova)");
  check(mensagem.includes("mais recente"), `erro explica o motivo: ${mensagem.slice(0, 70)}`);
  check(
    (await prisma.catalogAsset.findUnique({ where: { id: assetOrd.id } }))?.camada === "v3",
    "estado permaneceu em v3 — o undo bloqueado NÃO tocou o dado",
  );

  // Na ordem correta funciona: desfaz N+1, depois N.
  await undoVersion(maisNova.id);
  check(
    (await prisma.catalogAsset.findUnique({ where: { id: assetOrd.id } }))?.camada === "v2",
    "undo da versão mais nova volta para v2",
  );

  // Concorrência otimista: mexe no dado POR FORA (sem gerar versão) e tenta desfazer.
  await prisma.catalogAsset.update({ where: { id: assetOrd.id }, data: { camada: "mexido_por_fora" } });
  let abortouPorDivergencia = false;
  try {
    await undoVersion(maisAntiga.id);
  } catch {
    abortouPorDivergencia = true;
  }
  check(abortouPorDivergencia, "undo aborta quando o estado atual divergiu do `after` da versão");
  check(
    (await prisma.catalogAsset.findUnique({ where: { id: assetOrd.id } }))?.camada === "mexido_por_fora",
    "alteração externa preservada — undo não sobrescreveu",
  );

  // Limpeza dos ativos de teste.
  for (const nome of [NOME_UPD, NOME_ORD]) {
    const a = await prisma.catalogAsset.findUnique({ where: { nome } });
    if (a) {
      await prisma.stateVersion.deleteMany({ where: { entity: "CatalogAsset", entityId: a.id } });
      await prisma.catalogAsset.delete({ where: { id: a.id } });
    }
  }

  console.log(`\n${pass} pass, ${fail} fail`);
  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { formatFidelityResult, verifyFidelity } from "../test/fidelity/verify.ts";
import { ETL_ROOT } from "./config.ts";
import { loadAllSources } from "./sources/index.ts";
import { inventoryBible, inventoryCatechism } from "./sources/inventory.ts";
import { BY_CHAPTER_FILE, runCatechism } from "./catechism/index.ts";
import { runVersification } from "./versification/index.ts";

const REPORTS_DIR = resolve(ETL_ROOT, "reports");

// [1] Leitura das fontes (sem alterar textos) + inventário.
// As etapas [2]–[6] (seção 10 da spec) entram nas fases seguintes.
const src = loadAllSources();
const bibles = [src.bibles.matos_soares, src.bibles.ave_maria].map(inventoryBible);
const catechism = inventoryCatechism(src.catechism);

mkdirSync(REPORTS_DIR, { recursive: true });
const reportPath = resolve(REPORTS_DIR, "inventory.json");
writeFileSync(reportPath, JSON.stringify({ generated_at: new Date().toISOString(), bibles, catechism }, null, 2) + "\n", "utf8");

console.log("[1] Leitura das fontes");
for (const b of bibles) {
  const t = b.totals;
  console.log(
    `  ${b.id.padEnd(13)} livros ${t.books} · capítulos ${t.chapters}` + // fidelity-ok: formata o id no console
      ` · registros ${t.verseRecords} · distintos ${t.distinctVerses}` +
      ` · repetidos +${t.repeatedExtraRecords} · vazios ${t.emptyTexts} · só-espaço ${t.whitespaceOnlyTexts}` +
      ` · lacunas ${b.anomalies.verseNumberGaps.length} · fora de ordem ${b.anomalies.outOfOrder.length}`,
  );
}
const c = catechism.outsidePrologue;
console.log(
  `  catecismo     declarado ${catechism.declaredTotal} · ocorrências ${catechism.occurrences} (Prólogo ${catechism.prologueOccurrences})` +
    ` · únicos §${c.min}–§${c.max}: ${c.uniqueParagraphs} · faltando ${c.missingIn26to2865.length} · repetidos ${c.duplicates.map((d) => `§${d.paragraph}×${d.occurrences}`).join(" ")}`,
);
console.log(`Relatório: ${reportPath}`);

// [2] Alinhamento de versificação + conferência automática.
const vers = runVersification(src);
const versPath = resolve(REPORTS_DIR, "versification.json");
writeFileSync(versPath, JSON.stringify({ generated_at: new Date().toISOString(), tableIrregular: vers.tableIrregular, translations: vers.conference }, null, 2) + "\n", "utf8");
console.log("[2] Alinhamento de versificação");
for (const c of vers.conference) {
  const t = c.totals;
  console.log(
    `  ${c.translation}: posicionados ${t.placed} (regras ${t.viaRules}) · colisões ${t.collisions} (declaradas ${t.declaredAdditional}) · fora do canônico ${t.outOfCanon}` +
      ` · canônicos sem texto ${t.missingCanonical} · suspeitas lexicais ${t.lexicalFlags}/${t.lexicalChecked}` +
      ` · livros com tabela≠fonte ${c.tableVsSource.length} · capítulos com pendência ${c.chapters.length}` +
      (t.absentBooks.length ? ` · livros ausentes ${t.absentBooks.length}` : "") + (t.unusedRules ? ` · regras sem uso ${t.unusedRules}` : ""),
  );
}
console.log(`Relatório: ${versPath}`);

// [3] Catecismo: filtros (seção 7), citações bíblicas (seção 8) e índice por capítulo.
const cic = runCatechism(src, vers.canonical);
const OUTPUT_DIR = resolve(ETL_ROOT, "output");
// output/ é só do ETL: recriado a cada build para não sobrar arquivo antigo sem proveniência.
rmSync(OUTPUT_DIR, { recursive: true, force: true });
mkdirSync(OUTPUT_DIR, { recursive: true });
const byChapterPath = resolve(OUTPUT_DIR, BY_CHAPTER_FILE);
writeFileSync(byChapterPath, JSON.stringify(cic.byChapter, null, 2) + "\n", "utf8");
const manifestPath = resolve(REPORTS_DIR, "provenance.json");
writeFileSync(manifestPath, JSON.stringify({ entries: cic.manifest }, null, 2) + "\n", "utf8");
const cicReportPath = resolve(REPORTS_DIR, "catechism_citations.json");
writeFileSync(cicReportPath, JSON.stringify({ generated_at: new Date().toISOString(), ...cic.report }, null, 2) + "\n", "utf8");
const r = cic.report;
console.log("[3] Catecismo por referência bíblica");
console.log(
  `  parágrafos ${r.paragraphs} (só nota ${r.noteOnly.length} · com bloco de notas ${r.withNoteBlock.length})` +
    ` · citações ${r.citations} em ${r.paragraphsWithCitations} parágrafos · capítulos ${r.chapters} em ${r.books} livros` +
    ` · irregulares ${r.irregular.length} · correções ${r.fixesApplied.length} · não resolvidas ${r.unresolved.length}`,
);
console.log(`Saída: ${byChapterPath}`);
console.log(`Relatório: ${cicReportPath}`);

// [4] Teste de fidelidade (spec 2.1) sobre tudo o que está em output/, com o verificador
// independente (relê as fontes sozinho). Divergência = build falha.
// Saída parcial: só os parágrafos citados, repetidos por capítulo → sem exigência de cobertura.
const fidelity = verifyFidelity({
  sources: src.config,
  outputDir: OUTPUT_DIR,
  manifest: { entries: cic.manifest },
  requiredViews: { matos_soares: [], ave_maria: [], catechism: [] },
});
console.log("[4] " + formatFidelityResult(fidelity));
if (!fidelity.ok || fidelity.checked !== cic.manifest.length) {
  console.error("Build interrompido: a saída não passou no teste de fidelidade.");
  process.exit(1);
}

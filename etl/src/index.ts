import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ETL_ROOT } from "./config.ts";
import { loadAllSources } from "./sources/index.ts";
import { inventoryBible, inventoryCatechism } from "./sources/inventory.ts";
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

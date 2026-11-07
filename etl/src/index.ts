import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { formatFidelityResult, verifyFidelity } from "../test/fidelity/verify.ts";
import { ETL_ROOT } from "./config.ts";
import { loadAllSources } from "./sources/index.ts";
import { inventoryCatechism } from "./sources/inventory.ts";
import { BY_CHAPTER_FILE, runCatechism } from "./catechism/index.ts";
import { loadCanonical } from "./versification/canonical.ts";

const REPORTS_DIR = resolve(ETL_ROOT, "reports");
const OUTPUT_DIR = resolve(ETL_ROOT, "output");

// [1] Leitura da fonte (sem alterar textos) + inventário.
const src = loadAllSources();
const catechism = inventoryCatechism(src.catechism);
mkdirSync(REPORTS_DIR, { recursive: true });
const reportPath = resolve(REPORTS_DIR, "inventory.json");
writeFileSync(reportPath, JSON.stringify({ generated_at: new Date().toISOString(), catechism }, null, 2) + "\n", "utf8");
const c = catechism.outsidePrologue;
console.log("[1] Leitura do Catecismo");
console.log(
  `  declarado ${catechism.declaredTotal} · ocorrências ${catechism.occurrences} (Prólogo ${catechism.prologueOccurrences})` +
    ` · únicos §${c.min}–§${c.max}: ${c.uniqueParagraphs} · faltando ${c.missingIn26to2865.length} · repetidos ${c.duplicates.map((d) => `§${d.paragraph}×${d.occurrences}`).join(" ")}`,
);
console.log(`Relatório: ${reportPath}`);

// [2] Catecismo: filtros (seção 7), citações bíblicas (seção 8) e índice por capítulo.
const cic = runCatechism(src, loadCanonical(src.books.books.map((b) => b.usfm)));
// output/ é só do ETL: recriado a cada build para não sobrar arquivo antigo sem proveniência.
rmSync(OUTPUT_DIR, { recursive: true, force: true });
mkdirSync(OUTPUT_DIR, { recursive: true });
const byChapterPath = resolve(OUTPUT_DIR, BY_CHAPTER_FILE);
writeFileSync(byChapterPath, JSON.stringify(cic.byChapter, null, 2) + "\n", "utf8");
writeFileSync(resolve(REPORTS_DIR, "provenance.json"), JSON.stringify({ entries: cic.manifest }, null, 2) + "\n", "utf8");
const cicReportPath = resolve(REPORTS_DIR, "catechism_citations.json");
writeFileSync(cicReportPath, JSON.stringify({ generated_at: new Date().toISOString(), ...cic.report }, null, 2) + "\n", "utf8");
const r = cic.report;
console.log("[2] Catecismo por referência bíblica");
console.log(
  `  parágrafos ${r.paragraphs} (só nota ${r.noteOnly.length} · com bloco de notas ${r.withNoteBlock.length})` +
    ` · citações ${r.citations} em ${r.paragraphsWithCitations} parágrafos · capítulos ${r.chapters} em ${r.books} livros` +
    ` · irregulares ${r.irregular.length} · correções de sigla ${r.fixesApplied.length} · de versículo ${r.verseFixesApplied.length}` +
    ` · não resolvidas ${r.unresolved.length}`,
);
console.log(`Saída: ${byChapterPath}`);
console.log(`Relatório: ${cicReportPath}`);

// [3] Teste de fidelidade (spec 2.1) sobre tudo o que está em output/, com o verificador
// independente (relê a fonte sozinho). Divergência = build falha.
const fidelity = verifyFidelity({ sources: src.config, outputDir: OUTPUT_DIR, manifest: { entries: cic.manifest } });
console.log("[3] " + formatFidelityResult(fidelity));
if (!fidelity.ok || fidelity.checked !== cic.manifest.length) {
  console.error("Build interrompido: a saída não passou no teste de fidelidade.");
  process.exit(1);
}

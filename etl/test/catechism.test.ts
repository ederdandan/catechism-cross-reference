import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CitationParser } from "../src/catechism/citations.ts";
import { BY_CHAPTER_FILE, formatRef, loadCatechismConfig, runCatechism } from "../src/catechism/index.ts";
import { RawSources } from "./fidelity/rawSources.ts";
import { formatFidelityResult, verifyFidelity } from "./fidelity/verify.ts";
import type { CatechismParagraph } from "../src/catechism/paragraphs.ts";
import { loadAllSources } from "../src/sources/index.ts";
import type { CatechismOccurrence } from "../src/sources/types.ts";
import { loadCanonical } from "../src/versification/canonical.ts";

const BOOKS = [
  { usfm: "GEN", cic_abbreviations: ["Gn"] },
  { usfm: "MAT", cic_abbreviations: ["Mt"] },
  { usfm: "1KI", cic_abbreviations: ["1 Rs"] },
  { usfm: "JHN", cic_abbreviations: ["Jo"] },
  { usfm: "1JN", cic_abbreviations: ["1 Jo"] },
  { usfm: "PSA", cic_abbreviations: ["Sl"] },
  { usfm: "HEB", cic_abbreviations: ["Heb"] },
];
const CANON: Record<string, number[]> = {
  GEN: Array(50).fill(40),
  MAT: Array(28).fill(50),
  "1KI": Array(22).fill(60),
  JHN: Array(21).fill(60),
  "1JN": Array(5).fill(30),
  PSA: Array(150).fill(30),
  HEB: Array(13).fill(40),
};
const parser = new CitationParser(BOOKS, [{ paragraph: 7, abbreviation: "Ga", usfm: "GEN", note: "teste" }], { chapters: (u) => CANON[u] });

const para = (text: string, paragraph = 1): CatechismParagraph => ({ paragraph, text, bodyEnd: text.length, occurrence: {} as CatechismOccurrence });
const refs = (text: string, paragraph = 1) =>
  parser.parse(para(text, paragraph)).citations.map((c) => `${c.usfm} ${c.chapter}${c.verses.length ? `:${c.verses.join(",")}` : ""}`);

test("citações: formatos da spec (seção 8.2)", () => {
  assert.deepEqual(refs("texto (Mt 16, 18) texto"), ["MAT 16:18"]);
  assert.deepEqual(refs("(Mt 6, 9-13)"), ["MAT 6:9,10,11,12,13"]);
  assert.deepEqual(refs("(Gn 2, 7.22)"), ["GEN 2:7,22"]);
  assert.deepEqual(refs("(Mt 6, 7; 1 Rs 18, 26-29)"), ["MAT 6:7", "1KI 18:26,27,28,29"]);
  assert.deepEqual(refs("(Mt 1, 20; 2, 13)"), ["MAT 1:20", "MAT 2:13"]);
  assert.deepEqual(refs("(Mt 23, 37a)"), ["MAT 23:37"]);
  assert.deepEqual(refs("(1 Jo 4, 8, 16)"), ["1JN 4:8,16"]);
  assert.deepEqual(refs("(«citação»: Gn 1, 4. 10. 12)"), ["GEN 1:4,10,12"]);
  assert.deepEqual(refs("(Gn 3)"), ["GEN 3"]);
  assert.deepEqual(refs("(Heb 10, 5-7, citando o Sl 40. 7-9, segundo os LXX)"), ["HEB 10:5,6,7", "PSA 40:7,8,9"]);
});

test("citações: só entre parênteses, sigla da whitelist e sensível a maiúsculas", () => {
  assert.deepEqual(refs("Mt 16, 18 fora de parênteses"), []);
  assert.deepEqual(refs("(PL 32, 659-661) (jo 3, 16) (Sermão 5, 2)"), []);
  assert.deepEqual(refs("(Jo 3, 16) (1 Jo 3, 16)"), ["JHN 3:16", "1JN 3:16"]);
});

test("citações: irregularidades da fonte são aceitas no capítulo e registradas", () => {
  const r = parser.parse(para("(I Jo 4, 9) (Jo14, 16-17) (Mt 5 , 21) (Heb 5, l0; 6, 20)")).citations;
  assert.deepEqual(r.map((c) => `${c.usfm} ${c.chapter}`), ["1JN 4", "JHN 14", "MAT 5", "HEB 5", "HEB 6"]);
  assert.match(r[0]!.irregular.join(), /numeral romano/u);
  assert.match(r[1]!.irregular.join(), /colada/u);
  assert.match(r[2]!.irregular.join(), /espaço antes da vírgula/u);
  assert.match(r[3]!.irregular.join(), /não interpretada/u);
  assert.deepEqual(r[4]!.irregular, []);
});

test("citações: correção de sigla vale só no parágrafo configurado; capítulo inexistente é pendência", () => {
  assert.deepEqual(refs("(Ga 2, 23)", 7), ["GEN 2:23"]);
  assert.deepEqual(refs("(Ga 2, 23)", 8), []);
  const r = parser.parse(para("(Jo 22, 1)"));
  assert.deepEqual(r.citations, []);
  assert.match(r.issues[0]!.issue, /capítulo inexistente: JHN 22/u);
});

test("catecismo por capítulo: dados reais", () => {
  const src = loadAllSources();
  const cic = runCatechism(src, loadCanonical(src.books.books.map((b) => b.usfm)));
  const r = cic.report;
  assert.equal(r.paragraphs, 2840);
  // spec 7.5: 28 parágrafos com bloco de notas; 179 e 827 também são "só nota" (7.4).
  assert.deepEqual(r.withNoteBlock, [49, 141, 184, 197, 421, 682, 1065, 1075, 1134, 1209, 1419, 1532, 1666, 1690, 1698, 1876, 1948, 2051, 2082, 2195, 2557, 2565, 2649, 2696, 2758, 2865]);
  assert.deepEqual(r.unresolved, []);
  assert.deepEqual(r.fixesApplied.map((f) => `${f.paragraph} ${f.usfm} ${f.chapter}`), ["320 HEB 1", "371 GEN 2", "455 1CO 12"]);

  // Correções de versículo: todas aplicadas; nenhum versículo inexistente na saída.
  assert.equal(r.verseFixesApplied.length, 12);
  assert.deepEqual(r.invalidVerses, []);

  const find = (u: string, c: number) => cic.byChapter.find((e) => e.usfm === u && e.chapter === c)!;
  const brief = (u: string, c: number) => find(u, c).catechism_paragraphs.map((p) => `${p.paragraph} ${p.ref}`);
  const mt16 = find("MAT", 16);
  assert.deepEqual({ ...mt16, catechism_paragraphs: mt16.catechism_paragraphs.map((p) => p.paragraph) },
    { book: "Mateus", abbreviation: "Mt", usfm: "MAT", chapter: 16, catechism_paragraphs: [153, 424, 442, 552, 553, 554, 1444] });
  assert.deepEqual(brief("MAT", 16), ["153 Mt 16, 17", "424 Mt 16, 16", "442 Mt 16, 17", "552 Mt 16, 16.18", "553 Mt 16, 19", "554 Mt 16, 21", "1444 Mt 16, 19"]);
  assert.deepEqual(brief("1TI", 3), ["171 1 Tm 3, 15", "463 1 Tm 3, 16", "1590 1 Tm 3, 1", "2032 1 Tm 3, 15"]);
  // Capítulo inteiro → verses vazio.
  assert.deepEqual(find("GEN", 3).catechism_paragraphs.find((p) => p.paragraph === 390)!.verses, []);
  // Correções: OCR (Act 4, l2), digitação (Gn 9, 5-61; Mt 5, 47) e Vulgata (2 Mac 12, 46).
  const ref = (u: string, c: number, n: number) => find(u, c).catechism_paragraphs.find((p) => p.paragraph === n)!.ref;
  assert.equal(ref("ACT", 4, 432), "Act 4, 12");
  assert.equal(ref("GEN", 9, 2260), "Gn 9, 5-6");
  assert.equal(ref("MAT", 5, 1693), "Mt 5, 48");
  assert.equal(ref("2MA", 12, 958), "2 Mac 12, 45");
  // Correção de sigla usa a sigla padrão do livro no rótulo.
  assert.equal(ref("HEB", 1, 320), "Heb 1, 3");

  // Chaves fixas, parágrafos ordenados e únicos, ordem dos livros/capítulos.
  const order = src.books.books.map((b) => b.usfm);
  let prev = -1;
  for (const e of cic.byChapter) {
    assert.deepEqual(Object.keys(e), ["book", "abbreviation", "usfm", "chapter", "catechism_paragraphs"]);
    const pos = order.indexOf(e.usfm) * 1000 + e.chapter;
    assert.ok(pos > prev, `${e.usfm} ${e.chapter} fora de ordem`);
    prev = pos;
    assert.ok(e.catechism_paragraphs.length > 0);
    const nums = e.catechism_paragraphs.map((p) => p.paragraph);
    assert.deepEqual(nums, [...new Set(nums)].sort((a, b) => a - b));
    for (const p of e.catechism_paragraphs) {
      assert.deepEqual(Object.keys(p), ["paragraph", "verses", "ref", "text"]);
      assert.ok(p.paragraph >= 26 && p.paragraph <= 2865);
      assert.deepEqual(p.verses, [...new Set(p.verses)].sort((a, b) => a - b));
      assert.equal(p.ref, formatRef(e.abbreviation, e.chapter, p.verses));
    }
  }
});

test("formatRef: rótulo no estilo do CIC com intervalos compactados", () => {
  assert.equal(formatRef("Gn", 3, []), "Gn 3");
  assert.equal(formatRef("1 Tm", 3, [15]), "1 Tm 3, 15");
  assert.equal(formatRef("Mt", 6, [9, 10, 11, 12, 13]), "Mt 6, 9-13");
  assert.equal(formatRef("Gn", 2, [7, 22]), "Gn 2, 7.22");
  assert.equal(formatRef("Mt", 5, [33, 34, 37]), "Mt 5, 33-34.37");
});

test("correção de versículo que não casa com a fonte interrompe o build", () => {
  const src = loadAllSources();
  const canonical = loadCanonical(src.books.books.map((b) => b.usfm));
  const cfg = loadCatechismConfig();
  const bad = { ...cfg, verse_fixes: [{ paragraph: 432, usfm: "ACT", chapter: 4, from: [99], verses: [12], note: "teste" }] };
  assert.throws(() => runCatechism(src, canonical, bad), /casou com 0 citações/u);
});

test("catecismo por capítulo: fidelidade dos textos (verificador independente)", () => {
  const src = loadAllSources();
  const cic = runCatechism(src, loadCanonical(src.books.books.map((b) => b.usfm)));
  const dir = mkdtempSync(join(tmpdir(), "cic-by-chapter-"));
  try {
    writeFileSync(join(dir, BY_CHAPTER_FILE), JSON.stringify(cic.byChapter), "utf8");
    const raw = new RawSources(src.config);
    const res = verifyFidelity({ sources: raw, outputDir: dir, manifest: { entries: cic.manifest } });
    assert.ok(res.ok, formatFidelityResult(res));
    assert.equal(res.checked, cic.byChapter.reduce((s, e) => s + e.catechism_paragraphs.length, 0));
    // O número do parágrafo ao lado do texto é o da fonte (conferido pelo leitor independente).
    for (const m of cic.manifest) {
      const [, i, , j] = m.pointer.split("/");
      assert.equal(raw.resolve("catechism", m.locator, "numero"), cic.byChapter[Number(i)]!.catechism_paragraphs[Number(j)]!.paragraph);
    }
    // Uma alteração mínima (espaço no fim) é pega.
    const tampered = structuredClone(cic.byChapter);
    tampered[0]!.catechism_paragraphs[0]!.text += " ";
    writeFileSync(join(dir, BY_CHAPTER_FILE), JSON.stringify(tampered), "utf8");
    const bad = verifyFidelity({ sources: raw, outputDir: dir, manifest: { entries: cic.manifest } });
    assert.equal(bad.ok, false);
    assert.equal(bad.divergences.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadAllSources } from "../src/sources/index.ts";
import { inventoryBible, inventoryCatechism } from "../src/sources/inventory.ts";
import type { SourceBible } from "../src/sources/types.ts";

const src = loadAllSources();

function verse(bible: SourceBible, usfm: string, chapter: number, v: number): string {
  const book = bible.books.find((b) => b.usfm === usfm);
  const found = book?.chapters.find((c) => c.chapter === chapter)?.verses.filter((x) => x.verse === v) ?? [];
  assert.equal(found.length, 1, `${bible.id} ${usfm} ${chapter}:${v} deveria existir uma vez`);
  return found[0]!.text;
}

// ---------- Contagens da spec, seção 3 ----------

test("Matos Soares: 73 livros, 35.602 versículos + 22 números repetidos", () => {
  const t = inventoryBible(src.bibles.matos_soares).totals;
  assert.equal(t.books, 73);
  assert.equal(t.verseRecords, 35_624);
  assert.equal(t.distinctVerses, 35_602);
  assert.equal(t.repeatedExtraRecords, 22);
});

test("Ave-Maria: 73 livros, 35.450 versículos", () => {
  const t = inventoryBible(src.bibles.ave_maria).totals;
  assert.equal(t.books, 73);
  assert.equal(t.verseRecords, 35_450);
});

test("CIC: 2.865 parágrafos; §26–§2865 completos fora do Prólogo; 6 repetidos com texto idêntico", () => {
  const inv = inventoryCatechism(src.catechism);
  assert.equal(inv.declaredTotal, 2865);
  assert.equal(inv.outsidePrologue.uniqueParagraphs, 2840);
  assert.equal(inv.outsidePrologue.min, 26);
  assert.equal(inv.outsidePrologue.max, 2865);
  assert.deepEqual(inv.outsidePrologue.missingIn26to2865, []);
  assert.deepEqual(inv.outsidePrologue.outsideRange, []);
  assert.deepEqual(inv.outsidePrologue.duplicates.map((d) => d.paragraph), [1699, 1895, 2217, 2236, 2439, 2759]);
  assert.ok(inv.outsidePrologue.duplicates.every((d) => d.identicalText));
});

// ---------- Mapeamento por ordem fixa (spec, seção 9) ----------

test("livros mapeados para USFM na ordem esperada de cada fonte", () => {
  const ms = src.bibles.matos_soares.books.map((b) => b.usfm);
  const am = src.bibles.ave_maria.books.map((b) => b.usfm);
  // Ave-Maria coloca Jó e Salmos antes de 1–2 Macabeus.
  assert.deepEqual(ms.slice(19, 23), ["1MA", "2MA", "JOB", "PSA"]);
  assert.deepEqual(am.slice(19, 23), ["JOB", "PSA", "1MA", "2MA"]);
  assert.equal(src.bibles.matos_soares.books[21]!.sourceName, "Livro de Job (Jó)");
  assert.equal(src.bibles.matos_soares.books[49]!.usfm, "JHN");
});

// ---------- Fidelidade na leitura: marcações e caracteres invisíveis preservados (spec, seção 2) ----------

test("Ave-Maria preserva asterisco (Gn 1,8) e hífen suave U+00AD (Gn 1,6)", () => {
  assert.ok(verse(src.bibles.ave_maria, "GEN", 1, 8).endsWith("dia.*"));
  assert.ok(verse(src.bibles.ave_maria, "GEN", 1, 6).includes("ou\u00ADtras"));
});

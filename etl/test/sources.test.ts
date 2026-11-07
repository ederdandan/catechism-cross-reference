import { test } from "node:test";
import assert from "node:assert/strict";
import { loadAllSources } from "../src/sources/index.ts";
import { inventoryCatechism } from "../src/sources/inventory.ts";

const src = loadAllSources();

// ---------- Contagens da spec, seção 3 ----------

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

test("books.json: 73 livros, cada um com sigla do CIC; evangelhos sem «São»", () => {
  const books = src.books.books;
  assert.equal(books.length, 73);
  assert.deepEqual(books.filter((b) => ["MAT", "MRK", "LUK", "JHN"].includes(b.usfm)).map((b) => b.name), ["Mateus", "Marcos", "Lucas", "João"]);
  assert.equal(books.find((b) => b.usfm === "1TI")!.cic_abbreviations[0], "1 Tm");
});

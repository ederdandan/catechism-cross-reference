// Testa o próprio teste de fidelidade (spec 2.1) com fontes sintéticas: uma saída
// correta passa; qualquer alteração de caractere, perda, duplicação ou texto sem
// proveniência faz falhar.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { RawSources, type RawSourcePaths } from "./fidelity/rawSources.ts";
import { verifyFidelity, type Manifest, type ManifestEntry } from "./fidelity/verify.ts";

// ---------- Fontes sintéticas ----------

const root = mkdtempSync(join(tmpdir(), "etl-fidelity-"));
const srcDir = join(root, "src");
mkdirSync(srcDir);

const MS_TEXT_1 = "No princípio criou Deus o céu e a terra.";
const MS_TEXT_2 = "e separou as águas das ou\u00ADtras. Foi o segundo dia.*";
const MS_TEXT_2B = "Segunda ocorrência do número 2 (repetido na fonte).";
const AM_TEXT = "Texto  com  espaços duplos e no fim ";
const CIC_26 = "Quando professamos a nossa fé (Mt 16, 18). CAPÍTULO PRIMEIRO";
const CIC_27 = "O desejo de Deus está inscrito no coração do homem. 1. Cf. Gn 1, 1.";
const PART_TITLE = "Primeira Parte — A Profissão da Fé";
const CHAPTER_TITLE = "O homem é «capaz» de Deus";

writeFileSync(join(srcDir, "ms.json"), JSON.stringify([
  { livro: "Gênesis", capitulos: [{ capitulo: 1, versiculos: [
    { numero: 1, texto: MS_TEXT_1 }, { numero: 2, texto: MS_TEXT_2 }, { numero: 2, texto: MS_TEXT_2B },
  ] }] },
]));
// Ave-Maria com BOM no arquivo (deve ser removido só do arquivo).
writeFileSync(join(srcDir, "am.json"), "\uFEFF" + JSON.stringify({
  antigoTestamento: [{ nome: "Gênesis", capitulos: [{ capitulo: 1, versiculos: [{ versiculo: 1, texto: AM_TEXT }] }] }],
  novoTestamento: [],
}));
writeFileSync(join(srcDir, "cic.json"), JSON.stringify({
  titulo: "Catecismo", subtitulo: "", fonte: "", totalParagrafos: 2,
  partes: [
    { numero: 0, titulo: "Prólogo", capitulos: [{ titulo: "Prólogo", paragrafos: [{ numero: 1, texto: "corrompido" }] }] },
    { numero: 1, titulo: PART_TITLE, capitulos: [{ titulo: CHAPTER_TITLE, paragrafos: [
      { numero: 26, texto: CIC_26 }, { numero: 27, texto: CIC_27 }, { numero: 26, texto: CIC_26 }, // §26 repetido
    ] }] },
  ],
}));

const paths: RawSourcePaths = {
  matos_soares: join(srcDir, "ms.json"),
  ave_maria: join(srcDir, "am.json"),
  catechism: join(srcDir, "cic.json"),
};
const raw = new RawSources(paths);

// ---------- Saída correta + manifesto ----------

const MS_LOC = (vi: number) => [0, "capitulos", 0, "versiculos", vi];
const AM_LOC = ["antigoTestamento", 0, "capitulos", 0, "versiculos", 0];
const CIC_LOC = (gi: number) => ["partes", 1, "capitulos", 0, "paragrafos", gi];

interface Fixture { files: Record<string, unknown>; entries: ManifestEntry[] }

function paragraphDoc(n: number, text: string) {
  return { paragraph: n, part: 1, part_title: PART_TITLE, chapter_title: CHAPTER_TITLE, text, bible_references: [] };
}

function paragraphEntries(file: string, base: string, gi: number): ManifestEntry[] {
  return [
    { source: "catechism", locator: CIC_LOC(gi), field: "texto", file, pointer: `${base}/text` },
    { source: "catechism", locator: ["partes", 1], field: "titulo", file, pointer: `${base}/part_title` },
    { source: "catechism", locator: ["partes", 1, "capitulos", 0], field: "titulo", file, pointer: `${base}/chapter_title` },
  ];
}

function goodFixture(): Fixture {
  const tr = (ave: unknown, ms: unknown) => ({ ave_maria: ave, matos_soares: ms });
  return {
    files: {
      "bible/GEN/1.json": {
        book: "Gênesis", usfm: "GEN", chapter: 1,
        verses: [
          { verse: 1, translations: tr({ text: AM_TEXT }, { text: MS_TEXT_1 }), catechism_paragraphs: [] },
          // As duas ocorrências do número repetido ficam na saída (aqui, como 2 e 3).
          { verse: 2, translations: tr(null, { ref: "Gn 1,2", text: MS_TEXT_2 }), catechism_paragraphs: [] },
          { verse: 3, translations: tr(null, { ref: "Gn 1,2", text: MS_TEXT_2B }), catechism_paragraphs: [] },
        ],
      },
      "catechism/26.json": paragraphDoc(26, CIC_26),
      "catechism/27.json": paragraphDoc(27, CIC_27),
      "catechism/full.json": { paragraphs: [paragraphDoc(26, CIC_26), paragraphDoc(27, CIC_27)] },
      "books.json": { books: [{ usfm: "GEN", name: "Gênesis" }] },
    },
    entries: [
      { source: "ave_maria", locator: AM_LOC, field: "texto", file: "bible/GEN/1.json", pointer: "/verses/0/translations/ave_maria/text" },
      { source: "matos_soares", locator: MS_LOC(0), field: "texto", file: "bible/GEN/1.json", pointer: "/verses/0/translations/matos_soares/text" },
      { source: "matos_soares", locator: MS_LOC(1), field: "texto", file: "bible/GEN/1.json", pointer: "/verses/1/translations/matos_soares/text" },
      { source: "matos_soares", locator: MS_LOC(2), field: "texto", file: "bible/GEN/1.json", pointer: "/verses/2/translations/matos_soares/text" },
      ...paragraphEntries("catechism/26.json", "", 0),
      ...paragraphEntries("catechism/27.json", "", 1),
      ...paragraphEntries("catechism/full.json", "/paragraphs/0", 2), // usa a cópia repetida do §26: texto idêntico
      ...paragraphEntries("catechism/full.json", "/paragraphs/1", 1),
    ],
  };
}

let run = 0;
function check(fx: Fixture) {
  const dir = join(root, `out-${run++}`);
  for (const [file, doc] of Object.entries(fx.files)) {
    const p = join(dir, file);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(doc, null, 2), "utf8");
  }
  const manifest: Manifest = { entries: fx.entries };
  const r = verifyFidelity({ sources: raw, outputDir: dir, manifest });
  rmSync(dir, { recursive: true, force: true });
  return r;
}

/** Aplica `mutate` ao texto do Matos Soares v2 na saída. */
function withMsText(mutate: (s: string) => string): Fixture {
  const fx = goodFixture();
  const v = (fx.files["bible/GEN/1.json"] as { verses: { translations: { matos_soares: { text: string } } }[] }).verses[1]!;
  v.translations.matos_soares.text = mutate(v.translations.matos_soares.text);
  return fx;
}

// ---------- Casos ----------

test("saída fiel passa", () => {
  const r = check(goodFixture());
  assert.ok(r.ok, JSON.stringify(r, null, 2));
  assert.equal(r.checked, 16);
});

test("o leitor independente remove o BOM do arquivo, mas não toca no texto", () => {
  assert.equal(raw.resolve("ave_maria", AM_LOC, "texto"), AM_TEXT);
});

for (const [name, mutate] of [
  ["remover hífen suave U+00AD", (s: string) => s.split("\u00AD").join("")],
  ["remover asterisco", (s: string) => s.slice(0, -1)],
  ["trocar um caractere", (s: string) => "E" + s.slice(1)],
  ["acrescentar espaço no fim", (s: string) => s + " "],
  ["decompor acentos (NFD)", (s: string) => s.normalize("NFD")],
  ["trocar por espaço não separável", (s: string) => s.split(" ").join("\u00A0")],
] as const) {
  test(`falha ao ${name}`, () => {
    const r = check(withMsText(mutate));
    assert.equal(r.ok, false);
    assert.equal(r.divergences.length, 1);
    assert.match(r.divergences[0]!.reason, /primeira diferença/);
  });
}

test("falha se aparecer texto de uma tradução que não é fonte (ex.: cnbb, retirada na revisão 3)", () => {
  const fx = goodFixture();
  const v = (fx.files["bible/GEN/1.json"] as { verses: { translations: Record<string, unknown> }[] }).verses[0]!;
  v.translations.cnbb = { text: MS_TEXT_1 };
  const r = check(fx);
  assert.equal(r.ok, false);
  assert.deepEqual(r.unmanifested.map((u) => u.pointer), ["/verses/0/translations/cnbb/text"]);
});

test("falha se o espaço no fim do texto da Ave-Maria for aparado", () => {
  const fx = goodFixture();
  const v = (fx.files["bible/GEN/1.json"] as { verses: { translations: { ave_maria: { text: string } } }[] }).verses[0]!;
  v.translations.ave_maria.text = AM_TEXT.slice(0, -1);
  assert.equal(check(fx).ok, false);
});

test("falha se uma das ocorrências de número repetido for descartada", () => {
  const fx = goodFixture();
  const doc = fx.files["bible/GEN/1.json"] as { verses: unknown[] };
  doc.verses.pop();
  fx.entries = fx.entries.filter((e) => e.pointer !== "/verses/2/translations/matos_soares/text");
  const r = check(fx);
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing.map((m) => m.key), [`matos_soares@${JSON.stringify(MS_LOC(2))}`]);
});

test("falha se um texto da saída não tiver proveniência", () => {
  const fx = goodFixture();
  fx.entries = fx.entries.filter((e) => e.pointer !== "/verses/0/translations/ave_maria/text");
  const r = check(fx);
  assert.equal(r.ok, false);
  assert.equal(r.unmanifested.length, 1);
  assert.equal(r.missing.length, 1);
});

test("falha se um texto da fonte aparecer duas vezes na Bíblia", () => {
  const fx = goodFixture();
  const doc = fx.files["bible/GEN/1.json"] as { verses: { translations: Record<string, unknown> }[] };
  doc.verses[2]!.translations.ave_maria = { text: AM_TEXT };
  fx.entries.push({ source: "ave_maria", locator: AM_LOC, field: "texto", file: "bible/GEN/1.json", pointer: "/verses/2/translations/ave_maria/text" });
  const r = check(fx);
  assert.equal(r.ok, false);
  assert.equal(r.duplicated.length, 1);
});

test("falha se o manifesto apontar para registro inexistente na fonte", () => {
  const fx = goodFixture();
  fx.entries[2] = { ...fx.entries[2]!, locator: MS_LOC(99) };
  const r = check(fx);
  assert.equal(r.ok, false);
  assert.match(r.divergences[0]!.reason, /inexistente na fonte/);
});

test("falha se o texto vier do Prólogo", () => {
  const fx = goodFixture();
  (fx.files["catechism/27.json"] as { text: string }).text = "corrompido";
  fx.entries = fx.entries.map((e) => e.file === "catechism/27.json" && e.pointer === "/text"
    ? { ...e, locator: ["partes", 0, "capitulos", 0, "paragrafos", 0] } : e);
  const r = check(fx);
  assert.equal(r.ok, false);
  assert.ok(r.divergences.some((d) => /Prólogo/.test(d.reason)));
});

test("falha se faltar o catechism/full.json", () => {
  const fx = goodFixture();
  delete fx.files["catechism/full.json"];
  fx.entries = fx.entries.filter((e) => e.file !== "catechism/full.json");
  const r = check(fx);
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing.map((m) => m.view), ["catechism/full.json", "catechism/full.json"]);
});

test("falha se o título do capítulo for alterado", () => {
  const fx = goodFixture();
  (fx.files["catechism/26.json"] as { chapter_title: string }).chapter_title = "O homem é \"capaz\" de Deus";
  assert.equal(check(fx).ok, false);
});

test("o leitor independente não considera a CNBB uma fonte", () => {
  assert.deepEqual([...new Set(raw.coverage.map((c) => c.source))].sort(), ["ave_maria", "catechism", "matos_soares"]);
});

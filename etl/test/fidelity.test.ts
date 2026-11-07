// Testa o próprio teste de fidelidade (spec 2.1) com uma fonte sintética do CIC: uma saída
// correta passa; qualquer alteração de caractere, texto sem proveniência, caminho inválido,
// texto do Prólogo ou falta/duplicação numa visão exigida faz falhar.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { RawSources } from "./fidelity/rawSources.ts";
import { verifyFidelity, type ManifestEntry } from "./fidelity/verify.ts";

// Caracteres invisíveis montados por código (o arquivo não pode ter literais nem escapes decodificáveis).
const SHY = String.fromCharCode(0xad); // hífen suave
const NBSP = String.fromCharCode(0xa0);
const BOM = String.fromCharCode(0xfeff);

// ---------- Fonte sintética ----------

const root = mkdtempSync(join(tmpdir(), "etl-fidelity-"));
const CIC_26 = `Quando professamos a nossa fé, começamos por dizer «creio» (Mt 16, 18). Ou${SHY}tras palavras *`;
const CIC_27 = "O desejo de Deus está inscrito no coração do homem  (Gn 1, 27). 1. Cf. Gn 1, 1.";
const PART_TITLE = "Primeira Parte — A Profissão da Fé";
const CHAPTER_TITLE = "O homem é «capaz» de Deus";

const cicPath = join(root, "cic.json");
// BOM no início do arquivo: deve ser descartado só do arquivo.
writeFileSync(cicPath, BOM + JSON.stringify({
  titulo: "Catecismo", subtitulo: "", fonte: "", totalParagrafos: 2,
  partes: [
    { numero: 0, titulo: "Prólogo", capitulos: [{ titulo: "Prólogo", paragrafos: [{ numero: 1, texto: "corrompido" }] }] },
    { numero: 1, titulo: PART_TITLE, capitulos: [{ titulo: CHAPTER_TITLE, paragrafos: [
      { numero: 26, texto: CIC_26 }, { numero: 27, texto: CIC_27 }, { numero: 26, texto: CIC_26 }, // §26 repetido
    ] }] },
  ],
}));
const raw = new RawSources({ catechism: cicPath });

// ---------- Saída correta + manifesto ----------

const LOC = (gi: number) => ["partes", 1, "capitulos", 0, "paragrafos", gi];
const FILE = "catechism_by_chapter.json";

interface Fixture { files: Record<string, unknown>; entries: ManifestEntry[] }

function goodFixture(): Fixture {
  return {
    files: {
      [FILE]: [
        { book: "Gênesis", usfm: "GEN", chapter: 1, catechism_paragraphs: [{ paragraph: 27, verses: [27], ref: "Gn 1, 27", text: CIC_27 }] },
        { book: "Mateus", usfm: "MAT", chapter: 16, catechism_paragraphs: [{ paragraph: 26, verses: [18], ref: "Mt 16, 18", text: CIC_26 }] },
      ],
      "meta/part.json": { part_title: PART_TITLE, chapter_title: CHAPTER_TITLE },
    },
    entries: [
      { source: "catechism", locator: LOC(1), field: "texto", file: FILE, pointer: "/0/catechism_paragraphs/0/text" },
      // Usa a cópia repetida do §26: o texto é idêntico.
      { source: "catechism", locator: LOC(2), field: "texto", file: FILE, pointer: "/1/catechism_paragraphs/0/text" },
      { source: "catechism", locator: ["partes", 1], field: "titulo", file: "meta/part.json", pointer: "/part_title" },
      { source: "catechism", locator: ["partes", 1, "capitulos", 0], field: "titulo", file: "meta/part.json", pointer: "/chapter_title" },
    ],
  };
}

let run = 0;
function check(fx: Fixture, requiredViews?: string[]) {
  const dir = join(root, `out-${run++}`);
  for (const [file, doc] of Object.entries(fx.files)) {
    const p = join(dir, file);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(doc, null, 2), "utf8");
  }
  const r = verifyFidelity({ sources: raw, outputDir: dir, manifest: { entries: fx.entries }, ...(requiredViews ? { requiredViews } : {}) });
  rmSync(dir, { recursive: true, force: true });
  return r;
}

/** Aplica `mutate` ao texto do §26 na saída. */
function with26(mutate: (s: string) => string): Fixture {
  const fx = goodFixture();
  const p = (fx.files[FILE] as { catechism_paragraphs: { text: string }[] }[])[1]!.catechism_paragraphs[0]!;
  p.text = mutate(p.text);
  return fx;
}

// ---------- Casos ----------

test("saída fiel passa", () => {
  const r = check(goodFixture());
  assert.ok(r.ok, JSON.stringify(r, null, 2));
  assert.equal(r.checked, 4);
});

test("o leitor independente remove o BOM do arquivo, mas não toca no texto", () => {
  assert.equal(raw.resolve("catechism", LOC(0), "texto"), CIC_26);
});

for (const [name, mutate] of [
  ["remover hífen suave U+00AD", (s: string) => s.split(SHY).join("")],
  ["remover asterisco", (s: string) => s.slice(0, -1)],
  ["trocar um caractere", (s: string) => "q" + s.slice(1)],
  ["acrescentar espaço no fim", (s: string) => s + " "],
  ["decompor acentos (NFD)", (s: string) => s.normalize("NFD")],
  ["trocar por espaço não separável", (s: string) => s.split(" ").join(NBSP)],
] as const) {
  test(`falha ao ${name}`, () => {
    const r = check(with26(mutate));
    assert.equal(r.ok, false);
    assert.equal(r.divergences.length, 1);
    assert.match(r.divergences[0]!.reason, /primeira diferença/);
  });
}

test("falha se o espaço duplo do texto for colapsado", () => {
  const fx = goodFixture();
  const p = (fx.files[FILE] as { catechism_paragraphs: { text: string }[] }[])[0]!.catechism_paragraphs[0]!;
  p.text = CIC_27.split("  ").join(" ");
  assert.equal(check(fx).ok, false);
});

test("falha se um texto da saída não tiver proveniência", () => {
  const fx = goodFixture();
  fx.entries = fx.entries.filter((e) => e.pointer !== "/0/catechism_paragraphs/0/text");
  const r = check(fx);
  assert.equal(r.ok, false);
  assert.deepEqual(r.unmanifested, [{ file: FILE, pointer: "/0/catechism_paragraphs/0/text" }]);
});

test("falha se o manifesto apontar para registro inexistente na fonte", () => {
  const fx = goodFixture();
  fx.entries[0] = { ...fx.entries[0]!, locator: LOC(99) };
  const r = check(fx);
  assert.equal(r.ok, false);
  assert.match(r.divergences[0]!.reason, /inexistente na fonte/);
});

test("falha se o manifesto apontar para caminho inexistente na saída", () => {
  const fx = goodFixture();
  fx.entries.push({ source: "catechism", locator: LOC(1), field: "texto", file: FILE, pointer: "/9/catechism_paragraphs/0/text" });
  const r = check(fx);
  assert.equal(r.ok, false);
  assert.match(r.divergences[0]!.reason, /não aponta para uma string/);
});

test("falha se o texto vier do Prólogo", () => {
  const fx = goodFixture();
  (fx.files[FILE] as { catechism_paragraphs: { text: string }[] }[])[0]!.catechism_paragraphs[0]!.text = "corrompido";
  fx.entries[0] = { ...fx.entries[0]!, locator: ["partes", 0, "capitulos", 0, "paragrafos", 0] };
  const r = check(fx);
  assert.equal(r.ok, false);
  assert.ok(r.divergences.some((d) => /Prólogo/.test(d.reason)));
});

test("falha se o título do capítulo for alterado", () => {
  const fx = goodFixture();
  (fx.files["meta/part.json"] as { chapter_title: string }).chapter_title = "O homem é \"capaz\" de Deus";
  assert.equal(check(fx).ok, false);
});

test("visão exigida: aponta parágrafo ausente e parágrafo duplicado", () => {
  // Sem exigência (padrão), repetir o mesmo parágrafo em vários capítulos é válido.
  const fx = goodFixture();
  const doc = fx.files[FILE] as { catechism_paragraphs: unknown[] }[];
  doc[0]!.catechism_paragraphs.push({ paragraph: 26, verses: [], ref: "Gn 1", text: CIC_26 });
  fx.entries.push({ source: "catechism", locator: LOC(0), field: "texto", file: FILE, pointer: "/0/catechism_paragraphs/1/text" });
  assert.ok(check(fx).ok);
  // Com a visão exigida, §26 aparece duas vezes.
  const r = check(fx, [FILE]);
  assert.equal(r.ok, false);
  assert.deepEqual(r.duplicated.map((d) => d.key), ["catechism#26"]);
  // E, sem o §27, ele falta.
  const fx2 = goodFixture();
  (fx2.files[FILE] as unknown[]).shift();
  fx2.entries = fx2.entries.filter((e) => e.pointer !== "/0/catechism_paragraphs/0/text").map((e) => e.file === FILE ? { ...e, pointer: "/0/catechism_paragraphs/0/text" } : e);
  const r2 = check(fx2, [FILE]);
  assert.deepEqual(r2.missing.map((m) => m.key), ["catechism#27"]);
});

test("o leitor independente só conhece o Catecismo e ignora o Prólogo na cobertura", () => {
  assert.deepEqual(raw.coverage.map((c) => c.key), ["catechism#26", "catechism#27"]);
});

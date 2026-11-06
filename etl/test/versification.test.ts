import { test } from "node:test";
import assert from "node:assert/strict";
import { align, indexTable, type TranslationVersification } from "../src/versification/align.ts";
import { Canonical, canonKey, loadVrs } from "../src/versification/canonical.ts";
import { parseVrs } from "../src/versification/vrs.ts";
import { similarity, tokens } from "../src/versification/lexical.ts";
import type { SourceBible } from "../src/sources/types.ts";
import { loadBooksConfig } from "../src/books.ts";

// ---------- Parser .vrs ----------

test("parseVrs lê livros, mapeamentos com intervalo, versículo 0 e sufixo de letra", () => {
  const v = parseVrs([
    "# comentário", "#! &ACT 19:40-41 = ACT 19:40", "",
    "PSA 1:6 2:13", "5EZ 1:40 2:48 ",
    "PSA 50:0-2 = PSA 51:0-2", "PSA 2:13 = PSA 2:12", "ESG 1:1 = ESG 1:1a\r",
  ].join("\n"), "t");
  assert.deepEqual(v.books.get("PSA"), [6, 13]);
  assert.deepEqual(v.books.get("5EZ"), [40, 48]);
  assert.equal(v.mappings.length, 3);
  assert.deepEqual(v.mappings[0]!.from.map((r) => r.verse), [0, 1, 2]);
  assert.equal(v.mappings[2]!.to[0]!.part, "a");
});

test("parseVrs registra (sem abortar) livro com capítulos fora de sequência", () => {
  const v = parseVrs("6EZ 1:63 12:78\nGEN 1:31", "t");
  assert.equal(v.books.has("6EZ"), false);
  assert.equal(v.irregular.length, 1);
  assert.deepEqual(v.books.get("GEN"), [31]);
});

test("parseVrs falha em linha desconhecida", () => {
  assert.throws(() => parseVrs("isto não é vrs", "t"), /não reconhecida/);
});

test("os .vrs incorporados são lidos (org/vul/eng)", () => {
  const org = loadVrs("org");
  assert.deepEqual(org.books.get("JOL"), [20, 27, 5, 21]);
  assert.equal(loadVrs("vul").books.get("PSA")!.length, 150);
  assert.ok(loadVrs("eng").mappings.length > 200);
});

// ---------- Tabela indexada ----------

test("indexTable: pares, um-para-muitos, muitos-para-um e versículo 0 descartado no destino", () => {
  const t = indexTable(parseVrs([
    "PSA 9:22 = PSA 10:0", "PSA 9:22-23 = PSA 10:1-2", "PSA 14:3 = PSA 15:2", "PSA 14:3 = PSA 15:3", "PSA 2:12-13 = PSA 2:12",
  ].join("\n"), "t"));
  assert.deepEqual(t.map.get("PSA 9:22")!.map(canonKey), ["PSA.10.1"]);
  assert.deepEqual(t.map.get("PSA 14:3")!.map(canonKey), ["PSA.15.2", "PSA.15.3"]);
  assert.deepEqual(t.map.get("PSA 2:13")!.map(canonKey), ["PSA.2.12"]);
});

// ---------- Canônico ----------

const usfms = loadBooksConfig().books.map((b) => b.usfm);
const canonical = new Canonical(loadVrs("org"), usfms);

test("canônico: Daniel com 14 capítulos e Dn 3 com 100 versículos; Ester com 16; Baruc com 6", () => {
  assert.equal(canonical.books.get("DAN")!.length, 14);
  assert.equal(canonical.books.get("DAN")![2], 100);
  assert.equal(canonical.books.get("EST")!.length, 16);
  assert.equal(canonical.books.get("BAR")!.length, 6);
  assert.equal(canonical.books.get("PSA")![50], 21); // Sl 51 hebraico: 21 versículos
});

test("canônico: conversões org → canônico (Dn 3 hebraico, S3Y, SUS, BEL, LJE)", () => {
  const c = (usfm: string, chapter: number, verse: number) => canonKey(canonical.toCanonical({ usfm, chapter, verse }));
  assert.equal(c("DAN", 3, 24), "DAN.3.91");
  assert.equal(c("DAN", 3, 33), "DAN.3.100");
  assert.equal(c("DAN", 3, 23), "DAN.3.23");
  assert.equal(c("S3Y", 1, 1), "DAN.3.24");
  assert.equal(c("SUS", 1, 64), "DAN.13.64");
  assert.equal(c("BEL", 1, 1), "DAN.14.1");
  assert.equal(c("LJE", 1, 72), "BAR.6.72");
  assert.equal(c("GEN", 1, 1), "GEN.1.1");
});

// ---------- Alinhamento ----------

function bible(verses: [string, number, number, string][]): SourceBible {
  const books = new Map<string, Map<number, { verse: number; text: string; locator: number[] }[]>>();
  verses.forEach(([usfm, ch, v, text], i) => {
    const b = books.get(usfm) ?? books.set(usfm, new Map()).get(usfm)!;
    (b.get(ch) ?? b.set(ch, []).get(ch)!).push({ verse: v, text, locator: [i] });
  });
  return {
    id: "matos_soares",
    books: [...books].map(([usfm, chs]) => ({ usfm, sourceName: usfm, chapters: [...chs].map(([chapter, vs]) => ({ chapter, verses: vs })) })),
  };
}

const tables = { vul: indexTable(loadVrs("vul")), eng: indexTable(loadVrs("eng")) };

test("align: base vul leva Sl 50,3 (Vulgata) a PSA.51.3 e Jl 3,1 a JOL.4.1", () => {
  const cfg: TranslationVersification = { base: { default: "vul" }, rules: [] };
  const al = align(bible([["PSA", 50, 3, "Tem piedade"], ["JOL", 3, 1, "Naqueles dias"]]), cfg, canonical, tables);
  assert.deepEqual(al.placements.map((p) => p.targets.map(canonKey)), [["PSA.51.3"], ["JOL.4.1"]]);
});

test("align: base org converte Dn 3,24 hebraico para DAN.3.91; base canonical mantém DAN.3.24", () => {
  const b = bible([["DAN", 3, 24, "x"]]);
  assert.equal(canonKey(align(b, { base: { default: "org" }, rules: [] }, canonical, tables).placements[0]!.targets[0]!), "DAN.3.91");
  assert.equal(canonKey(align(b, { base: { default: "canonical" }, rules: [] }, canonical, tables).placements[0]!.targets[0]!), "DAN.3.24");
});

test("align: regra de intervalo, versículo juntado, ocorrência repetida com precedência e regra sem uso", () => {
  const cfg: TranslationVersification = {
    base: { default: "org" },
    rules: [
      { book: "EXO", from: "1:9-10", to: "1:16-17", note: "deslocado" },
      { book: "JOS", from: "12:8", to: "12:8-24", note: "juntado" },
      { book: "JOS", from: "8:9", to: "8:9", note: "simples" },
      { book: "JOS", from: "8:9#2", to: "8:10", note: "segunda ocorrência" },
      { book: "GEN", from: "50:1", to: "50:1", note: "não usada" },
    ],
  };
  const al = align(bible([
    ["EXO", 1, 9, "a"], ["EXO", 1, 10, "b"], ["JOS", 12, 8, "lista"], ["JOS", 8, 9, "um"], ["JOS", 8, 9, "dois"], ["JOS", 8, 11, ""],
  ]), cfg, canonical, tables);
  assert.deepEqual(al.placements.map((p) => p.targets.map(canonKey).join("+")), [
    "EXO.1.16", "EXO.1.17", [...Array(17)].map((_, i) => `JOS.12.${8 + i}`).join("+"), "JOS.8.9", "JOS.8.10",
  ]);
  assert.equal(al.placements[4]!.via, "rule:3");
  assert.equal(al.emptySkipped, 1);
  assert.deepEqual(al.issues.unusedRules, [4]);
  assert.deepEqual(al.issues.collisions, []);
});

test("align: aponta colisões e referências fora do canônico", () => {
  const al = align(bible([["GEN", 1, 1, "a"], ["GEN", 1, 1, "b"], ["GEN", 1, 99, "c"]]), { base: { default: "org" }, rules: [] }, canonical, tables);
  assert.deepEqual(al.issues.collisions.map((c) => c.key), ["GEN.1.1"]);
  assert.deepEqual(al.issues.outOfCanon.map((o) => canonKey(o.ref)), ["GEN.1.99"]);
});

test("align: regra com tamanhos incompatíveis é rejeitada", () => {
  assert.throws(() => align(bible([["GEN", 1, 1, "a"]]), { base: { default: "org" }, rules: [{ book: "GEN", from: "1:1-3", to: "1:1-2", note: "" }] }, canonical, tables), /incompatíveis/);
});

// ---------- Similaridade (só análise) ----------

test("tokens/similarity ignoram acento e caixa e não alteram o texto original", () => {
  const original = "Então o Faraó deu esta ordem às parteiras";
  const copy = original;
  assert.ok(similarity(tokens(original), tokens("ENTAO O FARAO falou as PARTEIRAS")) > 0.5);
  assert.equal(original, copy);
});

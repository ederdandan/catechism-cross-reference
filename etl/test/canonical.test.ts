import { test } from "node:test";
import assert from "node:assert/strict";
import { loadBooksConfig } from "../src/books.ts";
import { loadCanonical, loadOrgVrs } from "../src/versification/canonical.ts";
import { parseVrs } from "../src/versification/vrs.ts";

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

// ---------- Numeração canônica (spec, seção 4) ----------

test("org.vrs incorporado é lido (Joel com 4 capítulos, numeração hebraica)", () => {
  assert.deepEqual(loadOrgVrs().books.get("JOL"), [20, 27, 5, 21]);
});

test("canônico: 73 livros; Daniel com 14 capítulos e Dn 3 com 100 versículos; Ester com 16; Baruc com 6", () => {
  const c = loadCanonical(loadBooksConfig().books.map((b) => b.usfm));
  assert.equal(c.books.size, 73);
  assert.equal(c.books.get("DAN")!.length, 14);
  assert.equal(c.books.get("DAN")![2], 100);
  assert.equal(c.books.get("EST")!.length, 16);
  assert.equal(c.books.get("BAR")!.length, 6);
  assert.equal(c.books.get("PSA")!.length, 150);
  assert.equal(c.books.get("2MA")![11], 45); // 2 Mac 12 tem 45 versículos (o CIC cita 12, 46 na Vulgata)
});

test("canônico: livro ausente do org.vrs e de canonical.json é erro", () => {
  assert.throws(() => loadCanonical(["XYZ"]), /ausente/);
});

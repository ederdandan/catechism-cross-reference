import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expectRecord, readSourceJson } from "../src/sources/read.ts";

const dir = mkdtempSync(join(tmpdir(), "etl-read-"));

test("remove apenas o BOM do arquivo; texto com U+00AD e espaços nas pontas fica intacto", () => {
  const p = join(dir, "bom.json");
  const text = "  ou\u00ADtras\u00A0 ";
  writeFileSync(p, "\uFEFF" + JSON.stringify({ t: text }), "utf8");
  assert.deepEqual(readSourceJson(p), { t: text });
});

test("um BOM dentro do texto (não no início do arquivo) é preservado", () => {
  const p = join(dir, "inner-bom.json");
  writeFileSync(p, JSON.stringify({ t: "a\uFEFFb" }), "utf8");
  assert.deepEqual(readSourceJson(p), { t: "a\uFEFFb" });
});

test("UTF-8 inválido falha em vez de virar U+FFFD", () => {
  const p = join(dir, "bad.json");
  writeFileSync(p, Buffer.from([0x7b, 0x22, 0x74, 0x22, 0x3a, 0x22, 0xc3, 0x28, 0x22, 0x7d])); // {"t":"\xC3("}
  assert.throws(() => readSourceJson(p));
});

test("expectRecord exige exatamente as chaves esperadas", () => {
  assert.doesNotThrow(() => expectRecord({ a: 1, b: 2 }, ["b", "a"], "x"));
  assert.throws(() => expectRecord({ a: 1 }, ["a", "b"], "x"));
  assert.throws(() => expectRecord({ a: 1, b: 2, c: 3 }, ["a", "b"], "x"));
});

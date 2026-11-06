// Guardas estáticas da regra de fidelidade (spec, seção 2) sobre o código-fonte.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ETL = join(dirname(fileURLToPath(import.meta.url)), "..");

function tsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? tsFiles(join(dir, e.name)) : e.name.endsWith(".ts") ? [join(dir, e.name)] : [],
  );
}

/**
 * Métodos que transformam strings. Proibidos em `src/` para não haver caminho em que
 * um texto da fonte seja alterado. Uso legítimo (ex.: em chaves ou siglas, nunca em
 * textos) precisa do comentário `fidelity-ok: <motivo>` na mesma linha.
 */
const FORBIDDEN = /\.(trim|trimStart|trimEnd|trimLeft|trimRight|normalize|replace|replaceAll|toLowerCase|toUpperCase|toLocaleLowerCase|toLocaleUpperCase|padStart|padEnd)\s*\(/u;
const ALLOW = /\/\/\s*fidelity-ok:\s*\S/u;

test("src/ não usa métodos que transformam strings (sem `fidelity-ok`)", () => {
  const violations: string[] = [];
  for (const file of tsFiles(join(ETL, "src"))) {
    readFileSync(file, "utf8").split("\n").forEach((line, i) => {
      if (FORBIDDEN.test(line) && !ALLOW.test(line)) violations.push(`${relative(ETL, file)}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(violations, []);
});

test("src/ e test/ não contêm caracteres invisíveis literais (usar escapes \\uXXXX)", () => {
  const INVISIBLE = /[\u00AD\u00A0\uFEFF\u200B-\u200F\u2028\u2029]/u;
  const violations: string[] = [];
  for (const file of [...tsFiles(join(ETL, "src")), ...tsFiles(join(ETL, "test"))]) {
    readFileSync(file, "utf8").split("\n").forEach((line, i) => {
      if (INVISIBLE.test(line)) violations.push(`${relative(ETL, file)}:${i + 1}`);
    });
  }
  assert.deepEqual(violations, []);
});

test("o teste de fidelidade (test/fidelity/) não importa nada de src/", () => {
  const violations: string[] = [];
  for (const file of tsFiles(join(ETL, "test", "fidelity"))) {
    for (const m of readFileSync(file, "utf8").matchAll(/from\s+["']([^"']+)["']/gu)) {
      const spec = m[1]!;
      if (!(spec.startsWith("node:") || spec.startsWith("./"))) violations.push(`${relative(ETL, file)}: ${spec}`);
    }
  }
  assert.deepEqual(violations, []);
});

// Teste de fidelidade (spec 2.1): compara cada texto gerado com a fonte, caractere por
// caractere. Não importa nada de `src/` (garantido por test/static.test.ts).
//
// Entradas:
//  * as fontes originais (relidas por `RawSources`, leitor independente);
//  * `etl/output/` (JSONs gerados);
//  * o manifesto de proveniência gravado pelo ETL (fora de `output/`), que diz de qual
//    registro da fonte veio cada texto da saída.
//
// Falha quando:
//  1. um texto da saída difere da fonte (comparação exata de string — sem trim/normalize);
//  2. um campo de texto da saída não tem entrada no manifesto (texto de origem desconhecida);
//  3. um texto não vazio da fonte não aparece na saída, ou aparece mais de uma vez na mesma visão;
//  4. o manifesto aponta para algo inexistente (registro da fonte, arquivo ou caminho na saída).

import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { RawSources, readJsonStrict, type Locator, type RawSourceId, type RawSourcePaths } from "./rawSources.ts";

/** Campos da saída que carregam texto da fonte e por isso precisam de proveniência. */
export const SOURCE_TEXT_KEYS: ReadonlySet<string> = new Set(["text", "part_title", "chapter_title"]);

/** Visões da saída em que cada texto da fonte deve aparecer exatamente uma vez (saída completa da spec). */
export const REQUIRED_VIEWS: Record<RawSourceId, readonly string[]> = {
  matos_soares: ["bible"],
  ave_maria: ["bible"],
  catechism: ["catechism", "catechism/full.json"],
};

export interface ManifestEntry {
  source: RawSourceId;
  locator: Locator;
  /** Campo na fonte: `texto` ou `titulo`. */
  field: string;
  /** Arquivo relativo a `output/`, com `/`. */
  file: string;
  /** JSON Pointer (RFC 6901) até a string dentro do arquivo. */
  pointer: string;
}

export interface Manifest {
  entries: ManifestEntry[];
}

export interface Divergence {
  entry: ManifestEntry;
  reason: string;
}

export interface FidelityResult {
  ok: boolean;
  checked: number;
  divergences: Divergence[];
  /** Strings em campos de texto da saída sem entrada no manifesto. */
  unmanifested: { file: string; pointer: string }[];
  /** Textos da fonte ausentes numa visão obrigatória. */
  missing: { key: string; view: string }[];
  /** Textos da fonte repetidos numa mesma visão. */
  duplicated: { key: string; view: string; count: number }[];
}

export function viewOf(file: string): string {
  return file === "catechism/full.json" ? file : file.split("/")[0]!;
}

function parsePointer(pointer: string): string[] {
  if (pointer === "") return [];
  if (!pointer.startsWith("/")) throw new Error(`JSON Pointer inválido: ${pointer}`);
  return pointer.slice(1).split("/").map((s) => s.split("~1").join("/").split("~0").join("~"));
}

export function encodePointer(steps: readonly (string | number)[]): string {
  return steps.map((s) => "/" + String(s).split("~").join("~0").split("/").join("~1")).join("");
}

function getAt(doc: unknown, pointer: string): unknown {
  let node = doc;
  for (const step of parsePointer(pointer)) {
    if (typeof node !== "object" || node === null || !Object.hasOwn(node, step)) return undefined;
    node = (node as Record<string, unknown>)[step];
  }
  return node;
}

function codePoints(s: string, at: number): string {
  return [...s.slice(Math.max(0, at - 3), at + 4)].map((c) => "U+" + c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")).join(" ");
}

/** Descreve a primeira diferença entre duas strings, com code points ao redor. */
export function describeDifference(expected: string, actual: string): string {
  let i = 0;
  while (i < expected.length && i < actual.length && expected[i] === actual[i]) i++;
  return `primeira diferença no índice ${i} (fonte ${expected.length} × saída ${actual.length} unidades UTF-16); ` +
    `fonte [${codePoints(expected, i)}] × saída [${codePoints(actual, i)}]`;
}

function listJsonFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...listJsonFiles(p));
    else if (e.name.endsWith(".json")) out.push(p);
  }
  return out;
}

/** Todas as strings da saída em chaves de `SOURCE_TEXT_KEYS`, com seus JSON Pointers. */
function collectTextFields(doc: unknown, path: (string | number)[] = [], out: string[] = []): string[] {
  if (Array.isArray(doc)) doc.forEach((v, i) => collectTextFields(v, [...path, i], out));
  else if (typeof doc === "object" && doc !== null) {
    for (const [k, v] of Object.entries(doc)) {
      if (SOURCE_TEXT_KEYS.has(k) && typeof v === "string") out.push(encodePointer([...path, k]));
      else collectTextFields(v, [...path, k], out);
    }
  }
  return out;
}

/**
 * `requiredViews` troca a exigência de cobertura (3) para saídas parciais — por exemplo, o
 * índice por capítulo, que só traz os parágrafos citados e repete um parágrafo em cada
 * capítulo que ele cita. As verificações 1, 2 e 4 valem sempre.
 */
export function verifyFidelity(opts: {
  sources: RawSourcePaths | RawSources;
  outputDir: string;
  manifest: Manifest;
  requiredViews?: Record<RawSourceId, readonly string[]>;
}): FidelityResult {
  const requiredViews = opts.requiredViews ?? REQUIRED_VIEWS;
  const raw = opts.sources instanceof RawSources ? opts.sources : new RawSources(opts.sources);
  const result: FidelityResult = { ok: false, checked: 0, divergences: [], unmanifested: [], missing: [], duplicated: [] };

  // Carrega a saída inteira (UTF-8 estrito).
  const docs = new Map<string, unknown>();
  for (const abs of listJsonFiles(opts.outputDir)) {
    docs.set(relative(opts.outputDir, abs).split(sep).join("/"), readJsonStrict(abs));
  }

  const manifested = new Set<string>();
  const seenPerView = new Map<string, Map<string, number>>();

  for (const entry of opts.manifest.entries) {
    const fail = (reason: string) => result.divergences.push({ entry, reason });
    const locId = `${entry.file}#${entry.pointer}`;
    if (manifested.has(locId)) { fail("caminho da saída repetido no manifesto"); continue; }
    manifested.add(locId);

    const doc = docs.get(entry.file);
    if (doc === undefined) { fail("arquivo inexistente na saída"); continue; }
    const actual = getAt(doc, entry.pointer);
    if (typeof actual !== "string") { fail("caminho não aponta para uma string na saída"); continue; }
    const expected = raw.resolve(entry.source, entry.locator, entry.field);
    if (typeof expected !== "string") { fail("registro inexistente na fonte"); continue; }
    if (entry.source === "catechism" && raw.isPrologue(entry.locator)) { fail("texto vindo do Prólogo (spec 7.1)"); continue; }

    result.checked++;
    if (actual !== expected) { fail(describeDifference(expected, actual)); continue; }

    // Cobertura: só os textos principais (não os títulos, que se repetem por parágrafo).
    if (entry.field === "texto") {
      const view = viewOf(entry.file);
      const key = raw.coverageKey(entry.source, entry.locator);
      let m = seenPerView.get(view);
      if (!m) seenPerView.set(view, (m = new Map()));
      m.set(key, (m.get(key) ?? 0) + 1);
    }
  }

  // Todo campo de texto da saída precisa ter proveniência.
  for (const [file, doc] of docs) {
    for (const pointer of collectTextFields(doc)) {
      if (!manifested.has(`${file}#${pointer}`)) result.unmanifested.push({ file, pointer });
    }
  }

  // Todo texto não vazio da fonte aparece exatamente uma vez em cada visão obrigatória.
  for (const rec of raw.coverage) {
    for (const view of requiredViews[rec.source]) {
      const n = seenPerView.get(view)?.get(rec.key) ?? 0;
      if (n === 0) result.missing.push({ key: rec.key, view });
      else if (n > 1) result.duplicated.push({ key: rec.key, view, count: n });
    }
  }

  result.ok = result.divergences.length === 0 && result.unmanifested.length === 0 && result.missing.length === 0 && result.duplicated.length === 0;
  return result;
}

export function formatFidelityResult(r: FidelityResult, limit = 20): string {
  const lines = [
    `Teste de fidelidade: ${r.ok ? "OK" : "FALHOU"} — ${r.checked} textos comparados; ` +
      `${r.divergences.length} divergências, ${r.unmanifested.length} sem proveniência, ${r.missing.length} ausentes, ${r.duplicated.length} duplicados`,
  ];
  for (const d of r.divergences.slice(0, limit)) lines.push(`  DIVERGÊNCIA ${d.entry.source} ${JSON.stringify(d.entry.locator)} → ${d.entry.file}${d.entry.pointer}: ${d.reason}`);
  for (const u of r.unmanifested.slice(0, limit)) lines.push(`  SEM PROVENIÊNCIA ${u.file}${u.pointer}`);
  for (const m of r.missing.slice(0, limit)) lines.push(`  AUSENTE ${m.key} na visão ${m.view}`);
  for (const d of r.duplicated.slice(0, limit)) lines.push(`  DUPLICADO ${d.key} ×${d.count} na visão ${d.view}`);
  return lines.join("\n");
}

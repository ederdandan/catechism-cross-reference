import { readFileSync } from "node:fs";

/**
 * Decodificador UTF-8 estrito: `fatal` faz bytes inválidos lançarem erro em vez de
 * virarem U+FFFD em silêncio; `ignoreBOM` mantém o BOM para removê-lo explicitamente.
 */
const UTF8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/**
 * Lê um arquivo JSON de fonte. Única intervenção permitida (spec 10.1): remover o
 * BOM do *arquivo*, se existir. O conteúdo dos textos não é tocado.
 */
export function readSourceJson(path: string): unknown {
  let content = UTF8.decode(readFileSync(path));
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
  return JSON.parse(content);
}

// ---------- Validação estrita de estrutura ----------

/** Exige um objeto com exatamente estas chaves (nem a mais, nem a menos). */
export function expectRecord(v: unknown, keys: readonly string[], where: string): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) {
    throw new Error(`${where}: esperado objeto`);
  }
  const actual = Object.keys(v).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((k, i) => k !== expected[i])) {
    throw new Error(`${where}: chaves [${actual.join(", ")}], esperado [${expected.join(", ")}]`);
  }
  return v as Record<string, unknown>;
}

export function expectArray(v: unknown, where: string): unknown[] {
  if (!Array.isArray(v)) throw new Error(`${where}: esperado array`);
  return v;
}

export function expectInt(v: unknown, where: string): number {
  if (typeof v !== "number" || !Number.isInteger(v)) throw new Error(`${where}: esperado inteiro`);
  return v;
}

export function expectString(v: unknown, where: string): string {
  if (typeof v !== "string") throw new Error(`${where}: esperado string`);
  return v;
}

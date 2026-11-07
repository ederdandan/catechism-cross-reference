import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Raiz da pasta `etl/`. */
export const ETL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export interface SourcesConfig {
  catechism: string;
}

/** Lê `config/sources.json` e valida que o caminho do Catecismo é uma string. */
export function loadSourcesConfig(path = resolve(ETL_ROOT, "config", "sources.json")): SourcesConfig {
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`${path}: esperado um objeto JSON`);
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.catechism !== "string") {
    throw new Error(`${path}: chave "catechism" ausente ou não é string`);
  }
  return { catechism: obj.catechism };
}

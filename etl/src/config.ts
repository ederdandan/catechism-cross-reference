import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Raiz da pasta `etl/`. */
export const ETL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export interface SourcesConfig {
  matos_soares: string;
  ave_maria: string;
  catechism: string;
}

const SOURCE_KEYS = ["matos_soares", "ave_maria", "catechism"] as const;

/** Lê `config/sources.json` e valida que todas as chaves esperadas são strings. */
export function loadSourcesConfig(path = resolve(ETL_ROOT, "config", "sources.json")): SourcesConfig {
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`${path}: esperado um objeto JSON`);
  }
  const obj = raw as Record<string, unknown>;
  for (const key of SOURCE_KEYS) {
    if (typeof obj[key] !== "string") {
      throw new Error(`${path}: chave "${key}" ausente ou não é string`);
    }
  }
  return obj as unknown as SourcesConfig;
}

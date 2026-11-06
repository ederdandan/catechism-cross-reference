import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ETL_ROOT } from "./config.ts";

export type Testament = "AT" | "NT" | "Deuterocanônico";

export interface BookInfo {
  usfm: string;
  name: string;
  testament: Testament;
  cic_abbreviations: string[];
}

export interface BooksConfig {
  books: BookInfo[];
  source_order: {
    matos_soares: { usfm: string; source_name: string }[];
    ave_maria: { usfm: string; section: "antigoTestamento" | "novoTestamento"; source_name: string }[];
  };
}

/** Lê `config/books.json` e confere a consistência interna das listas. */
export function loadBooksConfig(path = resolve(ETL_ROOT, "config", "books.json")): BooksConfig {
  const cfg = JSON.parse(readFileSync(path, "utf8")) as BooksConfig;
  const usfms = new Set(cfg.books.map((b) => b.usfm));
  if (cfg.books.length !== 73 || usfms.size !== 73) {
    throw new Error(`${path}: esperados 73 livros com USFM únicos`);
  }
  const check = (name: string, list: { usfm: string }[], expected: number) => {
    const seen = new Set<string>();
    for (const e of list) {
      if (!usfms.has(e.usfm)) throw new Error(`${path}: ${name} usa USFM desconhecido ${e.usfm}`);
      if (seen.has(e.usfm)) throw new Error(`${path}: ${name} repete ${e.usfm}`);
      seen.add(e.usfm);
    }
    if (list.length !== expected) throw new Error(`${path}: ${name} tem ${list.length} livros, esperado ${expected}`);
  };
  check("matos_soares", cfg.source_order.matos_soares, 73);
  check("ave_maria", cfg.source_order.ave_maria, 73);
  return cfg;
}

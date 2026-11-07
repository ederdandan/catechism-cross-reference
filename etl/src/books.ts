import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ETL_ROOT } from "./config.ts";

export type Testament = "AT" | "NT" | "Deuterocanônico";

export interface BookInfo {
  usfm: string;
  name: string;
  testament: Testament;
  /** Siglas aceitas nas citações do CIC; a primeira é a usada nos rótulos da saída. */
  cic_abbreviations: string[];
}

export interface BooksConfig {
  books: BookInfo[];
}

/** Lê `config/books.json` e confere a consistência interna da lista. */
export function loadBooksConfig(path = resolve(ETL_ROOT, "config", "books.json")): BooksConfig {
  const cfg = JSON.parse(readFileSync(path, "utf8")) as BooksConfig;
  const usfms = new Set(cfg.books.map((b) => b.usfm));
  if (cfg.books.length !== 73 || usfms.size !== 73) {
    throw new Error(`${path}: esperados 73 livros com USFM únicos`);
  }
  for (const b of cfg.books) {
    if (b.cic_abbreviations.length === 0) throw new Error(`${path}: ${b.usfm} sem sigla do CIC`);
  }
  return cfg;
}

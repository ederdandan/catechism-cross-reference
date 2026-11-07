// Numeração canônica (spec, seção 4): capítulos e versículos de cada livro segundo o
// org.vrs (hebraica), com Daniel, Ester e Baruc na numeração católica (canonical.json).
// Serve para validar as citações do CIC e ordenar a saída.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ETL_ROOT } from "../config.ts";
import { parseVrs, type Versification } from "./vrs.ts";

export const VERSIFICATION_DIR = resolve(ETL_ROOT, "config", "versification");

interface CanonicalConfig {
  books: Record<string, { chapters: number[]; note: string }>;
}

export function loadOrgVrs(): Versification {
  return parseVrs(readFileSync(resolve(VERSIFICATION_DIR, "org.vrs"), "utf8"), "org");
}

export class Canonical {
  /** usfm → versículo máximo por capítulo (índice 0 = capítulo 1). */
  readonly books = new Map<string, number[]>();

  constructor(org: Versification, usfms: readonly string[], path = resolve(VERSIFICATION_DIR, "canonical.json")) {
    const cfg = JSON.parse(readFileSync(path, "utf8")) as CanonicalConfig;
    for (const usfm of usfms) {
      const chapters = cfg.books[usfm]?.chapters ?? org.books.get(usfm);
      if (!chapters) throw new Error(`canônico: livro ${usfm} ausente no org.vrs e em canonical.json`);
      this.books.set(usfm, chapters);
    }
  }
}

/** Esquema canônico dos livros dados (normalmente os 73 de config/books.json). */
export function loadCanonical(usfms: readonly string[]): Canonical {
  return new Canonical(loadOrgVrs(), usfms);
}

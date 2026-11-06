import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ETL_ROOT } from "../config.ts";
import { parseVrs, type Versification } from "./vrs.ts";

export const VERSIFICATION_DIR = resolve(ETL_ROOT, "config", "versification");

/** Versículo canônico. */
export interface CanonRef {
  usfm: string;
  chapter: number;
  verse: number;
}

export const canonKey = (r: CanonRef): string => `${r.usfm}.${r.chapter}.${r.verse}`;

/** `"DAN 3:24-33"` → lista expandida. Só intervalos dentro de um capítulo. */
export function parseRange(spec: string, where: string): CanonRef[] {
  const m = /^([0-9A-Z]{3}) (\d+):(\d+)(?:-(\d+))?$/u.exec(spec);
  if (!m) throw new Error(`${where}: referência inválida "${spec}"`);
  const a = Number(m[3]);
  const b = m[4] === undefined ? a : Number(m[4]);
  if (b < a) throw new Error(`${where}: intervalo invertido "${spec}"`);
  const out: CanonRef[] = [];
  for (let v = a; v <= b; v++) out.push({ usfm: m[1]!, chapter: Number(m[2]), verse: v });
  return out;
}

interface CanonicalConfig {
  books: Record<string, { chapters: number[]; note: string }>;
  from_org: { org: string; canonical: string }[];
}

export function loadVrs(name: "org" | "vul" | "eng"): Versification {
  return parseVrs(readFileSync(resolve(VERSIFICATION_DIR, `${name}.vrs`), "utf8"), name);
}

/** Esquema canônico: inventário de versículos e conversão org → canônico. */
export class Canonical {
  /** usfm → versículo máximo por capítulo. */
  readonly books = new Map<string, number[]>();
  private readonly fromOrg = new Map<string, CanonRef>();

  constructor(org: Versification, usfms: readonly string[], path = resolve(VERSIFICATION_DIR, "canonical.json")) {
    const cfg = JSON.parse(readFileSync(path, "utf8")) as CanonicalConfig;
    for (const usfm of usfms) {
      const chapters = cfg.books[usfm]?.chapters ?? org.books.get(usfm);
      if (!chapters) throw new Error(`canônico: livro ${usfm} ausente no org.vrs e em canonical.json`);
      this.books.set(usfm, chapters);
    }
    for (const rule of cfg.from_org) {
      const a = parseRange(rule.org, "canonical.json from_org");
      const b = parseRange(rule.canonical, "canonical.json from_org");
      if (a.length !== b.length) throw new Error(`canonical.json: ${rule.org} e ${rule.canonical} têm tamanhos diferentes`);
      a.forEach((r, i) => this.fromOrg.set(canonKey(r), b[i]!));
    }
  }

  /** Converte uma referência `org` para o canônico (identidade, salvo `from_org`). */
  toCanonical(org: CanonRef): CanonRef {
    return this.fromOrg.get(canonKey(org)) ?? org;
  }

  exists(r: CanonRef): boolean {
    const max = this.books.get(r.usfm)?.[r.chapter - 1];
    return max !== undefined && r.verse >= 1 && r.verse <= max;
  }

  /** Todos os versículos canônicos de um livro, na ordem. */
  *verses(usfm: string): Generator<CanonRef> {
    const chapters = this.books.get(usfm) ?? [];
    for (let c = 0; c < chapters.length; c++) for (let v = 1; v <= chapters[c]!; v++) yield { usfm, chapter: c + 1, verse: v };
  }
}

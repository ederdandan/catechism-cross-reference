// Catecismo → índice por capítulo bíblico. Cada parágrafo citado leva o texto do CIC
// exatamente como na fonte (a mesma string lida, sem nenhuma transformação), com uma
// entrada no manifesto de proveniência para o teste de fidelidade (spec 2.1).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ETL_ROOT } from "../config.ts";
import type { AllSources } from "../sources/index.ts";
import type { Canonical } from "../versification/canonical.ts";
import { CitationParser, type AbbreviationFix, type Citation, type CitationIssue } from "./citations.ts";
import { paragraphsWithNoteBlock, selectParagraphs } from "./paragraphs.ts";

export interface CatechismConfig {
  note_only_paragraphs: number[];
  abbreviation_fixes: AbbreviationFix[];
}

export function loadCatechismConfig(path = resolve(ETL_ROOT, "config", "catechism.json")): CatechismConfig {
  return JSON.parse(readFileSync(path, "utf8")) as CatechismConfig;
}

/** Um capítulo bíblico e os parágrafos do CIC que o citam. */
export interface ChapterEntry {
  book: string;
  /** Sigla do livro como o CIC cita (primeira de `cic_abbreviations` em config/books.json). */
  abbreviation: string;
  usfm: string;
  chapter: number;
  catechism_paragraphs: { paragraph: number; text: string }[];
}

/** Entrada do manifesto de proveniência (formato lido por test/fidelity/verify.ts). */
export interface ProvenanceEntry {
  source: "catechism";
  locator: readonly (string | number)[];
  field: "texto";
  file: string;
  pointer: string;
}

export const BY_CHAPTER_FILE = "catechism_by_chapter.json";

export interface CatechismResult {
  byChapter: ChapterEntry[];
  /** De onde veio cada `text` de `byChapter` (arquivo `BY_CHAPTER_FILE`). */
  manifest: ProvenanceEntry[];
  citations: Citation[];
  issues: CitationIssue[];
  report: {
    paragraphs: number;
    noteOnly: number[];
    withNoteBlock: number[];
    citations: number;
    paragraphsWithCitations: number;
    chapters: number;
    books: number;
    irregular: { paragraph: number; usfm: string; chapter: number; irregular: string[] }[];
    fixesApplied: { paragraph: number; usfm: string; chapter: number; fix: string }[];
    unresolved: CitationIssue[];
  };
}

export function runCatechism(src: AllSources, canonical: Canonical, cfg = loadCatechismConfig()): CatechismResult {
  const paragraphs = selectParagraphs(src.catechism, new Set(cfg.note_only_paragraphs));
  const parser = new CitationParser(src.books.books, cfg.abbreviation_fixes, { chapters: (u) => canonical.books.get(u) });
  const citations: Citation[] = [];
  const issues: CitationIssue[] = [];
  for (const p of paragraphs) {
    const r = parser.parse(p);
    citations.push(...r.citations);
    issues.push(...r.issues);
  }

  // Agrupa por livro/capítulo na ordem de config/books.json.
  const byKey = new Map<string, Set<number>>();
  for (const c of citations) {
    const k = `${c.usfm}.${c.chapter}`;
    (byKey.get(k) ?? byKey.set(k, new Set()).get(k)!).add(c.paragraph);
  }
  const byNumber = new Map(paragraphs.map((p) => [p.paragraph, p]));
  const byChapter: ChapterEntry[] = [];
  const manifest: ProvenanceEntry[] = [];
  for (const b of src.books.books) {
    const n = canonical.books.get(b.usfm)?.length ?? 0;
    for (let ch = 1; ch <= n; ch++) {
      const set = byKey.get(`${b.usfm}.${ch}`);
      if (!set) continue;
      const i = byChapter.length;
      const list = [...set].sort((x, y) => x - y).map((num, j) => {
        const p = byNumber.get(num)!;
        manifest.push({ source: "catechism", locator: p.occurrence.locator, field: "texto", file: BY_CHAPTER_FILE, pointer: `/${i}/catechism_paragraphs/${j}/text` });
        return { paragraph: num, text: p.text };
      });
      byChapter.push({ book: b.name, abbreviation: b.cic_abbreviations[0]!, usfm: b.usfm, chapter: ch, catechism_paragraphs: list });
    }
  }

  return {
    byChapter,
    manifest,
    citations,
    issues,
    report: {
      paragraphs: paragraphs.length,
      noteOnly: cfg.note_only_paragraphs,
      withNoteBlock: paragraphsWithNoteBlock(paragraphs),
      citations: citations.length,
      paragraphsWithCitations: new Set(citations.map((c) => c.paragraph)).size,
      chapters: byChapter.length,
      books: new Set(byChapter.map((e) => e.usfm)).size,
      irregular: citations.filter((c) => c.irregular.length).map((c) => ({ paragraph: c.paragraph, usfm: c.usfm, chapter: c.chapter, irregular: c.irregular })),
      fixesApplied: citations.filter((c) => c.fix).map((c) => ({ paragraph: c.paragraph, usfm: c.usfm, chapter: c.chapter, fix: c.fix! })),
      unresolved: issues,
    },
  };
}

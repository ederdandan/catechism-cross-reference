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

/** Correção de versículos de uma citação (erro de digitação/OCR da fonte, ou numeração da Vulgata). */
export interface VerseFix {
  paragraph: number;
  usfm: string;
  chapter: number;
  /** Versículos como o parser leu da fonte; precisa bater exatamente (senão o build falha). */
  from: number[];
  /** Versículos canônicos que vão para a saída. */
  verses: number[];
  note: string;
}

export interface CatechismConfig {
  note_only_paragraphs: number[];
  abbreviation_fixes: AbbreviationFix[];
  verse_fixes: VerseFix[];
}

/** Rótulo no estilo do CIC, gerado a partir dos números (não é texto da fonte): `Mt 6, 9-13.16`. */
export function formatRef(abbreviation: string, chapter: number, verses: readonly number[]): string {
  if (!verses.length) return `${abbreviation} ${chapter}`;
  const runs: string[] = [];
  for (let i = 0; i < verses.length; ) {
    let j = i;
    while (j + 1 < verses.length && verses[j + 1] === verses[j]! + 1) j++;
    runs.push(i === j ? `${verses[i]}` : `${verses[i]}-${verses[j]}`);
    i = j + 1;
  }
  return `${abbreviation} ${chapter}, ${runs.join(".")}`;
}

/** Parágrafo citado num capítulo. */
export interface CitedParagraph {
  paragraph: number;
  /** Versículos canônicos citados, únicos e em ordem; `[]` = capítulo inteiro. */
  verses: number[];
  /** Rótulo gerado (ex.: `1 Tm 3, 15`). */
  ref: string;
  /** Texto do parágrafo exatamente como na fonte. */
  text: string;
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
  catechism_paragraphs: CitedParagraph[];
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
    verseFixesApplied: { paragraph: number; usfm: string; chapter: number; from: number[]; verses: number[]; note: string }[];
    /** Versículos da saída que não existem na numeração canônica (deve ficar vazio). */
    invalidVerses: { paragraph: number; usfm: string; chapter: number; verses: number[] }[];
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

  // Correções de versículo: cada uma precisa casar com exatamente uma citação lida.
  const verseFixesApplied: CatechismResult["report"]["verseFixesApplied"] = [];
  for (const f of cfg.verse_fixes) {
    const same = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((x, i) => x === b[i]);
    const hits = citations.filter((c) => c.paragraph === f.paragraph && c.usfm === f.usfm && c.chapter === f.chapter && same(c.verses, f.from));
    if (hits.length !== 1) throw new Error(`config/catechism.json: correção de versículo §${f.paragraph} ${f.usfm} ${f.chapter} [${f.from.join(",")}] casou com ${hits.length} citações (esperado 1)`);
    hits[0]!.verses = [...f.verses];
    verseFixesApplied.push({ paragraph: f.paragraph, usfm: f.usfm, chapter: f.chapter, from: f.from, verses: f.verses, note: f.note });
  }
  const invalidVerses: CatechismResult["report"]["invalidVerses"] = [];
  for (const c of citations) {
    const max = canonical.books.get(c.usfm)?.[c.chapter - 1] ?? 0;
    const bad = c.verses.filter((v) => v < 1 || v > max);
    if (bad.length) invalidVerses.push({ paragraph: c.paragraph, usfm: c.usfm, chapter: c.chapter, verses: bad });
  }

  // Agrupa por livro/capítulo (ordem de config/books.json) e, dentro, por parágrafo.
  const byKey = new Map<string, Map<number, { verses: Set<number>; whole: boolean }>>();
  for (const c of citations) {
    const k = `${c.usfm}.${c.chapter}`;
    const m = byKey.get(k) ?? byKey.set(k, new Map()).get(k)!;
    const e = m.get(c.paragraph) ?? m.set(c.paragraph, { verses: new Set(), whole: false }).get(c.paragraph)!;
    if (c.verses.length) for (const v of c.verses) e.verses.add(v);
    else e.whole = true;
  }
  const byNumber = new Map(paragraphs.map((p) => [p.paragraph, p]));
  const byChapter: ChapterEntry[] = [];
  const manifest: ProvenanceEntry[] = [];
  for (const b of src.books.books) {
    const n = canonical.books.get(b.usfm)?.length ?? 0;
    for (let ch = 1; ch <= n; ch++) {
      const cited = byKey.get(`${b.usfm}.${ch}`);
      if (!cited) continue;
      const i = byChapter.length;
      const abbreviation = b.cic_abbreviations[0]!;
      const list = [...cited.keys()].sort((x, y) => x - y).map((num, j): CitedParagraph => {
        const p = byNumber.get(num)!;
        const e = cited.get(num)!;
        // Capítulo inteiro citado no mesmo parágrafo que versículos dele: vale o capítulo inteiro.
        const verses = e.whole ? [] : [...e.verses].sort((x, y) => x - y);
        manifest.push({ source: "catechism", locator: p.occurrence.locator, field: "texto", file: BY_CHAPTER_FILE, pointer: `/${i}/catechism_paragraphs/${j}/text` });
        return { paragraph: num, verses, ref: formatRef(abbreviation, ch, verses), text: p.text };
      });
      byChapter.push({ book: b.name, abbreviation, usfm: b.usfm, chapter: ch, catechism_paragraphs: list });
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
      verseFixesApplied,
      invalidVerses,
      unresolved: issues,
    },
  };
}

import type { CatechismSource, SourceBible, TranslationId } from "./types.ts";

// Inventário das fontes: apenas contagens e anomalias estruturais. Nenhum texto é alterado.

export interface BibleInventory {
  id: TranslationId;
  totals: {
    books: number;
    chapters: number;
    verseRecords: number;
    /** Pares (capítulo, versículo) distintos. */
    distinctVerses: number;
    /** Registros a mais causados por números de versículo repetidos no mesmo capítulo. */
    repeatedExtraRecords: number;
    emptyTexts: number;
    whitespaceOnlyTexts: number;
  };
  books: {
    usfm: string;
    sourceName: string;
    chapters: number;
    verseRecords: number;
    /** capítulo → quantidade de registros */
    recordsPerChapter: Record<string, number>;
  }[];
  anomalies: {
    chapterNumbering: { usfm: string; chapters: number[] }[];
    repeatedVerseNumbers: { usfm: string; chapter: number; verse: number; occurrences: number }[];
    verseNumberGaps: { usfm: string; chapter: number; missing: number[] }[];
    outOfOrder: { usfm: string; chapter: number; verse: number; previous: number }[];
    emptyTexts: { usfm: string; chapter: number; verse: number }[];
    whitespaceOnlyTexts: { usfm: string; chapter: number; verse: number }[];
  };
}

const WHITESPACE_ONLY = /^\s+$/u;

export function inventoryBible(bible: SourceBible): BibleInventory {
  const inv: BibleInventory = {
    id: bible.id,
    totals: { books: bible.books.length, chapters: 0, verseRecords: 0, distinctVerses: 0, repeatedExtraRecords: 0, emptyTexts: 0, whitespaceOnlyTexts: 0 },
    books: [],
    anomalies: { chapterNumbering: [], repeatedVerseNumbers: [], verseNumberGaps: [], outOfOrder: [], emptyTexts: [], whitespaceOnlyTexts: [] },
  };
  for (const book of bible.books) {
    const chapterNumbers = book.chapters.map((c) => c.chapter);
    if (chapterNumbers.some((n, i) => n !== i + 1)) {
      inv.anomalies.chapterNumbering.push({ usfm: book.usfm, chapters: chapterNumbers });
    }
    const recordsPerChapter: Record<string, number> = {};
    let bookRecords = 0;
    for (const ch of book.chapters) {
      recordsPerChapter[String(ch.chapter)] = ch.verses.length;
      bookRecords += ch.verses.length;
      const counts = new Map<number, number>();
      let previous = 0;
      for (const v of ch.verses) {
        counts.set(v.verse, (counts.get(v.verse) ?? 0) + 1);
        if (v.verse <= previous) {
          inv.anomalies.outOfOrder.push({ usfm: book.usfm, chapter: ch.chapter, verse: v.verse, previous });
        }
        previous = Math.max(previous, v.verse);
        if (v.text === "") {
          inv.totals.emptyTexts++;
          inv.anomalies.emptyTexts.push({ usfm: book.usfm, chapter: ch.chapter, verse: v.verse });
        } else if (WHITESPACE_ONLY.test(v.text)) {
          inv.totals.whitespaceOnlyTexts++;
          inv.anomalies.whitespaceOnlyTexts.push({ usfm: book.usfm, chapter: ch.chapter, verse: v.verse });
        }
      }
      inv.totals.distinctVerses += counts.size;
      for (const [verse, n] of counts) {
        if (n > 1) {
          inv.totals.repeatedExtraRecords += n - 1;
          inv.anomalies.repeatedVerseNumbers.push({ usfm: book.usfm, chapter: ch.chapter, verse, occurrences: n });
        }
      }
      const max = Math.max(0, ...counts.keys());
      const missing: number[] = [];
      for (let n = 1; n <= max; n++) if (!counts.has(n)) missing.push(n);
      if (missing.length > 0) inv.anomalies.verseNumberGaps.push({ usfm: book.usfm, chapter: ch.chapter, missing });
    }
    inv.totals.chapters += book.chapters.length;
    inv.totals.verseRecords += bookRecords;
    inv.books.push({ usfm: book.usfm, sourceName: book.sourceName, chapters: book.chapters.length, verseRecords: bookRecords, recordsPerChapter });
  }
  return inv;
}

export interface CatechismInventory {
  declaredTotal: number;
  occurrences: number;
  /** Ocorrências na parte `numero: 0` (Prólogo). */
  prologueOccurrences: number;
  outsidePrologue: {
    occurrences: number;
    uniqueParagraphs: number;
    min: number;
    max: number;
    missingIn26to2865: number[];
    outsideRange: number[];
    duplicates: {
      paragraph: number;
      occurrences: number;
      identicalText: boolean;
      /** Cada ocorrência com os vizinhos na fonte, para decidir qual é a posição verdadeira. */
      locations: { partNumber: number; chapterTitle: string; previous: number | null; next: number | null }[];
    }[];
  };
}

export function inventoryCatechism(cic: CatechismSource): CatechismInventory {
  const body = cic.occurrences.filter((o) => o.partNumber !== 0);
  const byParagraph = new Map<number, number[]>();
  body.forEach((o, i) => {
    const list = byParagraph.get(o.paragraph);
    if (list) list.push(i);
    else byParagraph.set(o.paragraph, [i]);
  });
  const nums = [...byParagraph.keys()];
  const missing: number[] = [];
  for (let n = 26; n <= 2865; n++) if (!byParagraph.has(n)) missing.push(n);

  const neighbor = (i: number, delta: number): number | null => {
    const o = body[i]!;
    const other = body[i + delta];
    return other && other.partNumber === o.partNumber && other.chapterTitle === o.chapterTitle ? other.paragraph : null;
  };
  const duplicates = [...byParagraph]
    .filter(([, idx]) => idx.length > 1)
    .map(([paragraph, idx]) => {
      const first = body[idx[0]!]!;
      return {
        paragraph,
        occurrences: idx.length,
        identicalText: idx.every((i) => body[i]!.text === first.text),
        locations: idx.map((i) => ({
          partNumber: body[i]!.partNumber,
          chapterTitle: body[i]!.chapterTitle,
          previous: neighbor(i, -1),
          next: neighbor(i, +1),
        })),
      };
    });

  return {
    declaredTotal: cic.totalParagraphs,
    occurrences: cic.occurrences.length,
    prologueOccurrences: cic.occurrences.length - body.length,
    outsidePrologue: {
      occurrences: body.length,
      uniqueParagraphs: byParagraph.size,
      min: Math.min(...nums),
      max: Math.max(...nums),
      missingIn26to2865: missing,
      outsideRange: nums.filter((n) => n < 26 || n > 2865),
      duplicates,
    },
  };
}

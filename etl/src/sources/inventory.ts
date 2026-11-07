import type { CatechismSource } from "./types.ts";

// Inventário do Catecismo: apenas contagens e anomalias estruturais. Nenhum texto é alterado.

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

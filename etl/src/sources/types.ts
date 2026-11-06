/** Traduções lidas pelo ETL (spec, revisão 3: a CNBB foi retirada do projeto). */
export type TranslationId = "matos_soares" | "ave_maria";

/**
 * Caminho até o registro na fonte, para proveniência e para o teste de fidelidade:
 * chaves/índices até o objeto do versículo (ex.: `[0, "capitulos", 0, "versiculos", 0]`).
 */
export type SourceLocator = readonly (string | number)[];

export interface SourceVerse {
  /** Número do versículo exatamente como na fonte (pode repetir em Matos Soares). */
  readonly verse: number;
  /** Texto exatamente como na fonte. Nunca alterado. */
  readonly text: string;
  readonly locator: SourceLocator;
}

export interface SourceChapter {
  /** Número do capítulo exatamente como na fonte. */
  readonly chapter: number;
  /** Na ordem da fonte. */
  readonly verses: readonly SourceVerse[];
}

export interface SourceBook {
  readonly usfm: string;
  /** Nome do livro como aparece na fonte. */
  readonly sourceName: string;
  readonly chapters: readonly SourceChapter[];
}

export interface SourceBible {
  readonly id: TranslationId;
  /** Na ordem da fonte. */
  readonly books: readonly SourceBook[];
}

export interface CatechismOccurrence {
  readonly paragraph: number;
  /** Texto exatamente como na fonte. Nunca alterado. */
  readonly text: string;
  readonly partNumber: number;
  readonly partTitle: string;
  readonly chapterTitle: string;
  readonly locator: SourceLocator;
}

/** O `catecismo.json` lido sem filtros: todas as ocorrências, na ordem da fonte. */
export interface CatechismSource {
  readonly title: string;
  readonly subtitle: string;
  readonly source: string;
  readonly totalParagraphs: number;
  readonly occurrences: readonly CatechismOccurrence[];
}

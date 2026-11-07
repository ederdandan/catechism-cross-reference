/**
 * Caminho até o registro na fonte, para proveniência e para o teste de fidelidade:
 * chaves/índices até o objeto do parágrafo (ex.: `["partes", 1, "capitulos", 0, "paragrafos", 0]`).
 */
export type SourceLocator = readonly (string | number)[];

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

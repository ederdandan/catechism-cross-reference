// Filtros da ingestão do Catecismo (spec, seção 7). Não altera texto: só escolhe
// ocorrências e calcula até onde vai o corpo do parágrafo.

import type { CatechismOccurrence, CatechismSource } from "../sources/types.ts";

export interface CatechismParagraph {
  readonly paragraph: number;
  /** Texto exatamente como na fonte. */
  readonly text: string;
  /**
   * Fim (exclusivo) do corpo do texto, onde as citações são procuradas: antes do primeiro
   * bloco de notas vazado `N. Cf.` (seção 7.5); 0 para parágrafo que é só nota (7.4).
   */
  readonly bodyEnd: number;
  readonly occurrence: CatechismOccurrence;
}

/** Início de bloco de notas vazado: número da nota, ponto e `Cf.` (ex.: `125. Cf. Mt 18, 23-35`). */
const NOTE_BLOCK = /(?:^|\s)\d{1,4}\.\s+Cf\./u;

export const FIRST_PARAGRAPH = 26;
export const LAST_PARAGRAPH = 2865;

/**
 * §§26–2865 fora do Prólogo (7.1), uma ocorrência por número (7.2). As repetições têm
 * texto idêntico; isso é conferido aqui (divergência = erro).
 */
export function selectParagraphs(src: CatechismSource, noteOnly: ReadonlySet<number>): CatechismParagraph[] {
  const byNumber = new Map<number, CatechismOccurrence>();
  for (const o of src.occurrences) {
    if (o.partNumber === 0) continue;
    const prev = byNumber.get(o.paragraph);
    if (prev) {
      if (prev.text !== o.text) throw new Error(`catecismo: §${o.paragraph} repetido com texto diferente`);
      continue;
    }
    byNumber.set(o.paragraph, o);
  }
  const out: CatechismParagraph[] = [];
  for (let n = FIRST_PARAGRAPH; n <= LAST_PARAGRAPH; n++) {
    const o = byNumber.get(n);
    if (!o) throw new Error(`catecismo: §${n} ausente`);
    const m = NOTE_BLOCK.exec(o.text);
    const bodyEnd = noteOnly.has(n) ? 0 : m ? m.index : o.text.length;
    out.push({ paragraph: n, text: o.text, bodyEnd, occurrence: o });
  }
  return out;
}

/** Parágrafos com bloco de notas vazado no fim (corpo menor que o texto, mas não vazio). */
export function paragraphsWithNoteBlock(list: readonly CatechismParagraph[]): number[] {
  return list.filter((p) => p.bodyEnd > 0 && p.bodyEnd < p.text.length).map((p) => p.paragraph);
}

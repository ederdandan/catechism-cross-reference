import { expectArray, expectInt, expectRecord, expectString, readSourceJson } from "./read.ts";
import type { CatechismOccurrence, CatechismSource } from "./types.ts";

/**
 * Lê `catecismo.json` sem filtrar nada: todas as partes (inclusive o Prólogo) e todas
 * as ocorrências (inclusive repetidas), na ordem da fonte. Os filtros da seção 7 da
 * spec ficam em `src/catechism/`.
 */
export function readCatechism(path: string): CatechismSource {
  const root = expectRecord(readSourceJson(path), ["titulo", "subtitulo", "fonte", "totalParagrafos", "partes"], "catecismo");
  const occurrences: CatechismOccurrence[] = [];
  expectArray(root.partes, "catecismo.partes").forEach((rawPart, pi) => {
    const pw = `catecismo.partes[${pi}]`;
    const part = expectRecord(rawPart, ["numero", "titulo", "capitulos"], pw);
    const partNumber = expectInt(part.numero, `${pw}.numero`);
    const partTitle = expectString(part.titulo, `${pw}.titulo`);
    expectArray(part.capitulos, `${pw}.capitulos`).forEach((rawCh, ci) => {
      const cw = `${pw}.capitulos[${ci}]`;
      const ch = expectRecord(rawCh, ["titulo", "paragrafos"], cw);
      const chapterTitle = expectString(ch.titulo, `${cw}.titulo`);
      expectArray(ch.paragrafos, `${cw}.paragrafos`).forEach((rawP, gi) => {
        const gw = `${cw}.paragrafos[${gi}]`;
        const p = expectRecord(rawP, ["numero", "texto"], gw);
        occurrences.push({
          paragraph: expectInt(p.numero, `${gw}.numero`),
          text: expectString(p.texto, `${gw}.texto`),
          partNumber,
          partTitle,
          chapterTitle,
          locator: ["partes", pi, "capitulos", ci, "paragrafos", gi],
        });
      });
    });
  });
  return {
    title: expectString(root.titulo, "catecismo.titulo"),
    subtitle: expectString(root.subtitulo, "catecismo.subtitulo"),
    source: expectString(root.fonte, "catecismo.fonte"),
    totalParagraphs: expectInt(root.totalParagrafos, "catecismo.totalParagrafos"),
    occurrences,
  };
}

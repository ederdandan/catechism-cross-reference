import type { BooksConfig } from "../books.ts";
import { expectArray, expectInt, expectRecord, expectString, readSourceJson } from "./read.ts";
import type { SourceBible, SourceBook, SourceChapter, SourceVerse } from "./types.ts";

/**
 * Lê `biblia.json` (Matos Soares): `[{ livro, capitulos: [{ capitulo, versiculos: [{ numero, texto }] }] }]`.
 * Mantém todas as ocorrências de números repetidos, na ordem da fonte.
 */
export function readMatosSoares(path: string, books: BooksConfig): SourceBible {
  const order = books.source_order.matos_soares;
  const root = expectArray(readSourceJson(path), "matos_soares");
  if (root.length !== order.length) {
    throw new Error(`matos_soares: ${root.length} livros, esperado ${order.length}`);
  }
  const out: SourceBook[] = root.map((rawBook, bi) => {
    const where = `matos_soares[${bi}]`;
    const b = expectRecord(rawBook, ["livro", "capitulos"], where);
    const name = expectString(b.livro, `${where}.livro`);
    const expected = order[bi]!;
    if (name !== expected.source_name) {
      throw new Error(`${where}: livro "${name}", esperado "${expected.source_name}" (${expected.usfm})`);
    }
    const chapters: SourceChapter[] = expectArray(b.capitulos, `${where}.capitulos`).map((rawCh, ci) => {
      const cw = `${where}.capitulos[${ci}]`;
      const c = expectRecord(rawCh, ["capitulo", "versiculos"], cw);
      const verses: SourceVerse[] = expectArray(c.versiculos, `${cw}.versiculos`).map((rawV, vi) => {
        const vw = `${cw}.versiculos[${vi}]`;
        const v = expectRecord(rawV, ["numero", "texto"], vw);
        return {
          verse: expectInt(v.numero, `${vw}.numero`),
          text: expectString(v.texto, `${vw}.texto`),
          locator: [bi, "capitulos", ci, "versiculos", vi],
        };
      });
      return { chapter: expectInt(c.capitulo, `${cw}.capitulo`), verses };
    });
    return { usfm: expected.usfm, sourceName: name, chapters };
  });
  return { id: "matos_soares", books: out };
}

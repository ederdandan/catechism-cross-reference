import type { BooksConfig } from "../books.ts";
import { expectArray, expectInt, expectRecord, expectString, readSourceJson } from "./read.ts";
import type { SourceBible, SourceBook, SourceChapter, SourceVerse } from "./types.ts";

const SECTIONS = ["antigoTestamento", "novoTestamento"] as const;

/**
 * Lê `bibliaAveMaria.json`:
 * `{ antigoTestamento: [livro], novoTestamento: [livro] }`, livro = `{ nome, capitulos: [{ capitulo, versiculos: [{ versiculo, texto }] }] }`.
 */
export function readAveMaria(path: string, books: BooksConfig): SourceBible {
  const order = books.source_order.ave_maria;
  const root = expectRecord(readSourceJson(path), SECTIONS, "ave_maria");
  const out: SourceBook[] = [];
  for (const section of SECTIONS) {
    expectArray(root[section], `ave_maria.${section}`).forEach((rawBook, bi) => {
      const where = `ave_maria.${section}[${bi}]`;
      const expected = order[out.length];
      if (!expected) throw new Error(`${where}: livro excedente`);
      const b = expectRecord(rawBook, ["nome", "capitulos"], where);
      const name = expectString(b.nome, `${where}.nome`);
      if (section !== expected.section || name !== expected.source_name) {
        throw new Error(`${where}: livro "${name}", esperado "${expected.source_name}" em ${expected.section} (${expected.usfm})`);
      }
      const chapters: SourceChapter[] = expectArray(b.capitulos, `${where}.capitulos`).map((rawCh, ci) => {
        const cw = `${where}.capitulos[${ci}]`;
        const c = expectRecord(rawCh, ["capitulo", "versiculos"], cw);
        const verses: SourceVerse[] = expectArray(c.versiculos, `${cw}.versiculos`).map((rawV, vi) => {
          const vw = `${cw}.versiculos[${vi}]`;
          const v = expectRecord(rawV, ["versiculo", "texto"], vw);
          return {
            verse: expectInt(v.versiculo, `${vw}.versiculo`),
            text: expectString(v.texto, `${vw}.texto`),
            locator: [section, bi, "capitulos", ci, "versiculos", vi],
          };
        });
        return { chapter: expectInt(c.capitulo, `${cw}.capitulo`), verses };
      });
      out.push({ usfm: expected.usfm, sourceName: name, chapters });
    });
  }
  if (out.length !== order.length) throw new Error(`ave_maria: ${out.length} livros, esperado ${order.length}`);
  return { id: "ave_maria", books: out };
}

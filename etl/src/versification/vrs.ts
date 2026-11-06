// Leitor dos arquivos de versificação Paratext/UBS (`.vrs`, ubsicap/versification_json, MIT).
//
// Formato:
//   # comentário (inclui `#!`)
//   GEN 1:31 2:25 …                 → livro e versículo máximo de cada capítulo
//   PSA 50:0-21 = PSA 51:0-21       → mapeamento (versificação do arquivo → `org`)
//   ESG 1:1 = ESG 1:1a              → sufixos de letra (parte de versículo)

export interface VrsRef {
  book: string;
  chapter: number;
  verse: number;
  /** Letra de parte de versículo (`a`, `b`…), ou "". */
  part: string;
}

export interface VrsMapping {
  /** Versículos do lado esquerdo, expandidos. */
  from: VrsRef[];
  /** Versículos do lado direito (`org`), expandidos. */
  to: VrsRef[];
  /** Linha no arquivo (1-based), para o relatório. */
  line: number;
}

export interface Versification {
  name: string;
  /** usfm → versículo máximo por capítulo (índice 0 = capítulo 1). */
  books: Map<string, number[]>;
  mappings: VrsMapping[];
  /** Linhas do arquivo que não puderam ser usadas (erros do próprio .vrs). */
  irregular: { line: number; reason: string }[];
}

const BOOK_LINE = /^([0-9A-Z]{3})((?:\s+\d+:\d+)+)\s*$/u;
const SIDE = String.raw`([0-9A-Z]{3}) (\d+):(\d+)([a-z]?)(?:-(\d+)([a-z]?))?`;
const MAPPING_LINE = new RegExp(String.raw`^${SIDE}\s*=\s*${SIDE}\s*$`, "u");
const BLANK = /^\s*$/u;

function expand(book: string, chapter: string, a: string, aPart: string, b: string | undefined, bPart: string | undefined, where: string): VrsRef[] {
  const ch = Number(chapter);
  const start = Number(a);
  if (b === undefined) return [{ book, chapter: ch, verse: start, part: aPart }];
  const end = Number(b);
  if (aPart !== "" || (bPart ?? "") !== "") throw new Error(`${where}: intervalo com sufixo de letra não suportado`);
  // Intervalo invertido (ex.: `DAG 3:52-23` no vul.vrs): erro do arquivo; tratado como lista vazia e reportado.
  const out: VrsRef[] = [];
  for (let v = start; v <= end; v++) out.push({ book, chapter: ch, verse: v, part: "" });
  return out;
}

export function parseVrs(content: string, name: string): Versification {
  const books = new Map<string, number[]>();
  const mappings: VrsMapping[] = [];
  const irregular: Versification["irregular"] = [];
  content.split("\n").forEach((rawLine, i) => {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    const where = `${name}.vrs:${i + 1}`;
    if (BLANK.test(line) || line.startsWith("#")) return;
    const bm = BOOK_LINE.exec(line);
    if (bm) {
      const counts: number[] = [];
      for (const m of bm[2]!.matchAll(/(\d+):(\d+)/gu)) {
        const ch = Number(m[1]);
        if (ch !== counts.length + 1) {
          // Ex.: `6EZ 1:63 12:78` no vul.vrs. Livro fora do projeto; registrado e ignorado.
          irregular.push({ line: i + 1, reason: `livro ${bm[1]}: capítulo ${ch} fora de sequência` });
          return;
        }
        counts.push(Number(m[2]));
      }
      if (books.has(bm[1]!)) throw new Error(`${where}: livro ${bm[1]} definido duas vezes`);
      books.set(bm[1]!, counts);
      return;
    }
    const mm = MAPPING_LINE.exec(line);
    if (mm) {
      const g = mm.slice(1);
      mappings.push({
        from: expand(g[0]!, g[1]!, g[2]!, g[3]!, g[4], g[5], where),
        to: expand(g[6]!, g[7]!, g[8]!, g[9]!, g[10], g[11], where),
        line: i + 1,
      });
      return;
    }
    throw new Error(`${where}: linha não reconhecida: ${line}`);
  });
  return { name, books, mappings, irregular };
}

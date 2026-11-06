// Parser de citações bíblicas do CIC (spec, seção 8). Só lê o texto: nenhuma string
// da fonte é alterada; trabalha com regex e posições.
//
// Fase 1: grupos entre parênteses no corpo do parágrafo.
// Fase 2: em cada grupo, siglas da whitelist (sensível a maiúsculas) seguidas de
//         capítulo e, opcionalmente, versículos; capítulos encadeados com `;` ou `:`.

import type { CatechismParagraph } from "./paragraphs.ts";

export interface AbbreviationFix {
  paragraph: number;
  abbreviation: string;
  usfm: string;
  note: string;
}

export interface Citation {
  paragraph: number;
  usfm: string;
  /** Sigla da whitelist que casou (ou a da correção aplicada). */
  abbreviation: string;
  chapter: number;
  /** Versículos citados, expandidos e em ordem de aparição (vazio = capítulo inteiro ou não interpretado). */
  verses: number[];
  /** Posição (no texto do parágrafo) do grupo entre parênteses. */
  groupStart: number;
  /** Irregularidades da forma na fonte: o capítulo foi aceito, mas fica registrado. */
  irregular: string[];
  /** Correção de sigla aplicada (config/catechism.json). */
  fix?: string;
}

export interface CitationIssue {
  paragraph: number;
  groupStart: number;
  issue: string;
}

export interface BookCanon {
  /** Versículos por capítulo (índice 0 = capítulo 1). */
  chapters(usfm: string): readonly number[] | undefined;
}

interface Entry {
  usfm: string;
  abbreviation: string;
  /** Casa só com a forma exata (com o espaço opcional/variável entre número e sigla). */
  exact: RegExp;
  /** Mesmo livro escrito com numeral romano (`I Jo`, `I Cor`). */
  roman?: RegExp;
  fix?: string;
}

const ROMAN: Record<string, string> = { "1": "I", "2": "II", "3": "III" };

function entryPatterns(abbreviation: string): { source: string; exact: RegExp; roman?: RegExp } {
  const parts = abbreviation.split(" ");
  if (parts.length === 2 && ROMAN[parts[0]!]) {
    const [n, name] = parts as [string, string];
    const arabic = `${n}\\s*${name}`;
    const roman = `${ROMAN[n]}\\s+${name}`;
    return { source: `${arabic}|${roman}`, exact: new RegExp(`^${arabic}$`, "u"), roman: new RegExp(`^${roman}$`, "u") };
  }
  const p = parts.join("\\s*");
  return { source: p, exact: new RegExp(`^${p}$`, "u") };
}

export class CitationParser {
  private readonly base: Entry[];
  private readonly baseSources: string[];
  private readonly fixes: Map<number, AbbreviationFix[]>;
  private readonly canon: BookCanon;

  constructor(
    books: readonly { usfm: string; cic_abbreviations: readonly string[] }[],
    fixes: readonly AbbreviationFix[],
    canon: BookCanon,
  ) {
    this.canon = canon;
    this.base = [];
    this.baseSources = [];
    for (const b of books) {
      for (const a of b.cic_abbreviations) {
        const p = entryPatterns(a);
        this.base.push({ usfm: b.usfm, abbreviation: a, exact: p.exact, ...(p.roman ? { roman: p.roman } : {}) });
        this.baseSources.push(p.source);
      }
    }
    this.fixes = new Map();
    for (const f of fixes) this.fixes.set(f.paragraph, [...(this.fixes.get(f.paragraph) ?? []), f]);
  }

  private matcher(paragraph: number): { re: RegExp; entries: Entry[] } {
    const entries = [...this.base];
    const sources = [...this.baseSources];
    for (const f of this.fixes.get(paragraph) ?? []) {
      const p = entryPatterns(f.abbreviation);
      entries.push({ usfm: f.usfm, abbreviation: f.abbreviation, exact: p.exact, fix: `${f.abbreviation} → ${f.usfm}: ${f.note}` });
      sources.push(p.source);
    }
    // Mais longas primeiro, para `1 Jo` vencer `Jo` e `Heb` vencer `He`.
    const order = sources.map((s, i) => i).sort((a, b) => sources[b]!.length - sources[a]!.length);
    const alt = order.map((i) => `(?:${sources[i]})`).join("|");
    // Sigla sem letra/dígito colado antes e seguida (com espaço/ponto opcional) do capítulo.
    const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${alt})(?![\\p{L}])(?=\\s*\\.?\\s*\\d)`, "gu");
    return { re, entries };
  }

  parse(p: CatechismParagraph): { citations: Citation[]; issues: CitationIssue[] } {
    const citations: Citation[] = [];
    const issues: CitationIssue[] = [];
    const body = p.text.slice(0, p.bodyEnd);
    const { re, entries } = this.matcher(p.paragraph);
    for (const g of body.matchAll(/\(([^()]*)\)/gu)) {
      const group = g[1]!;
      const groupStart = g.index;
      const hits = [...group.matchAll(re)];
      hits.forEach((h, k) => {
        const found = h[0];
        let entry: Entry | undefined;
        const irregular: string[] = [];
        for (const e of entries) {
          if (e.exact.test(found)) { entry = e; break; }
          if (e.roman?.test(found)) { entry = e; irregular.push(`numeral romano na sigla («${found}»)`); break; }
        }
        if (!entry) throw new Error(`§${p.paragraph}: sigla sem entrada («${found}»)`);
        const end = k + 1 < hits.length ? hits[k + 1]!.index : group.length;
        const segment = group.slice(h.index + found.length, end);
        for (const c of this.segment(segment, entry.usfm, p.paragraph, groupStart, issues)) {
          citations.push({ paragraph: p.paragraph, usfm: entry.usfm, abbreviation: entry.abbreviation, chapter: c.chapter, verses: c.verses, groupStart, irregular: [...irregular, ...c.irregular], ...(entry.fix ? { fix: entry.fix } : {}) });
        }
      });
    }
    return { citations, issues };
  }

  /** Capítulo(s) e versículos depois da sigla, até a próxima sigla do grupo. */
  private segment(s: string, usfm: string, paragraph: number, groupStart: number, issues: CitationIssue[]) {
    const out: { chapter: number; verses: number[]; irregular: string[] }[] = [];
    const HEAD = /^(\s*)(\.?)\s*(\d+)/uy;
    const VERSE_START = /(\s*)([,.])\s*(?=\d)/uy;
    const VERSE = /(\d+)[ab]?(?:\s*\p{Pd}\s*(\d+)[ab]?)?/uy;
    const SEP = /\s*[.,]\s*(?=\d)/uy;
    const CHAIN = /\s*[;:]\s*(?=\d+\s*,)/uy;
    const CHAP = /(\d+)/uy;
    const max = this.canon.chapters(usfm);
    const head = HEAD.exec(s);
    if (!head) return out; // o lookahead da sigla garante o capítulo
    let pos = HEAD.lastIndex;
    let chapter = Number(head[3]);
    const first: string[] = [];
    if (head[2]) first.push("ponto entre sigla e capítulo");
    if (head[1] === "") first.push("sigla colada no capítulo");
    for (let irregular = first; ; irregular = []) {
      const verses: number[] = [];
      VERSE_START.lastIndex = pos;
      const vs = VERSE_START.exec(s);
      if (vs) {
        if (vs[2] === ".") irregular.push("ponto em vez de vírgula entre capítulo e versículo");
        if (vs[1] !== "") irregular.push("espaço antes da vírgula");
        pos = VERSE_START.lastIndex;
        for (;;) {
          VERSE.lastIndex = pos;
          const v = VERSE.exec(s);
          if (!v) break;
          pos = VERSE.lastIndex;
          const a = Number(v[1]);
          const b = v[2] === undefined ? a : Number(v[2]);
          if (b < a) irregular.push(`intervalo invertido ${a}-${b}`);
          for (let x = a; x <= Math.max(a, b); x++) verses.push(x);
          SEP.lastIndex = pos;
          if (!SEP.exec(s)) break;
          pos = SEP.lastIndex;
        }
      }
      // Resto que parece continuar a numeração (OCR `l2`, `I`, número solto): não adivinhar.
      const rest = /\s*(?:[\p{Pd},.]\s*)?[\dlI](?![\p{Ll}])/uy;
      rest.lastIndex = pos;
      if (rest.exec(s)) {
        irregular.push(`numeração não interpretada após ${chapter}${verses.length ? `, ${verses[verses.length - 1]}` : ""}: «${s.slice(pos, pos + 12)}»`);
        // Pula o trecho não interpretado para ainda achar capítulos encadeados (`Heb 5, l0; 6, 20`).
        const junk = /[\s\p{Pd},.]*[\dlI]+(?:[\s\p{Pd},.]+[\dlI]+)*/uy;
        junk.lastIndex = pos;
        if (junk.exec(s)) pos = junk.lastIndex;
      }
      if (!max || chapter < 1 || chapter > max.length) {
        issues.push({ paragraph, groupStart, issue: `capítulo inexistente: ${usfm} ${chapter}` });
      } else {
        const bad = verses.filter((v) => v < 1 || v > max[chapter - 1]!);
        if (bad.length) irregular.push(`versículo inexistente: ${usfm} ${chapter}:${bad.join(",")} (máx. ${max[chapter - 1]})`);
        out.push({ chapter, verses, irregular });
      }
      CHAIN.lastIndex = pos;
      if (!CHAIN.exec(s)) break;
      pos = CHAIN.lastIndex;
      CHAP.lastIndex = pos;
      const c = CHAP.exec(s)!;
      chapter = Number(c[1]);
      pos = CHAP.lastIndex;
    }
    return out;
  }
}

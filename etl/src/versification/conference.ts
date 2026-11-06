// Conferência automática da versificação (spec 6.2): compara as tabelas com os dados
// reais e lista todo ponto de desacordo. Só produz relatório; não altera nada.

import type { SourceBible, TranslationId } from "../sources/types.ts";
import type { Alignment, BaseTable, TranslationVersification } from "./align.ts";
import { canonKey, type Canonical, type CanonRef } from "./canonical.ts";
import { similarity, tokens } from "./lexical.ts";
import type { Versification } from "./vrs.ts";

/** Parâmetros da verificação lexical. */
const WINDOW = 8; // vizinhos considerados, em versículos canônicos, para cada lado
const MIN_TOKENS = 3;
const MIN_BEST = 0.5;
const MIN_GAIN = 0.3;

export interface LexicalFlag {
  key: string;
  /** Tradução de referência que indicou o deslocamento. */
  against: TranslationId;
  same: number;
  bestKey: string;
  best: number;
  /** Deslocamento em versículos canônicos (posição do melhor − posição atual). */
  offset: number;
}

export interface ChapterIssues {
  usfm: string;
  chapter: number;
  /** Versículos canônicos sem texto nesta tradução. */
  missing: number[];
  collisions: number[];
  lexical: LexicalFlag[];
}

export interface TranslationConference {
  translation: TranslationId;
  totals: {
    placed: number;
    viaRules: number;
    emptySkipped: number;
    collisions: number;
    /** Versículos com registro principal + `additional` declarados por regra. */
    declaredAdditional: number;
    outOfCanon: number;
    missingCanonical: number;
    /** Livros canônicos ausentes por inteiro na fonte (nenhum nas fontes atuais). */
    absentBooks: string[];
    lexicalFlags: number;
    lexicalChecked: number;
    unusedRules: number;
  };
  /** Perfil da tabela base × perfil da fonte, por livro (capítulos com versículo máximo diferente). */
  tableVsSource: { usfm: string; base: BaseTable; chapters: { chapter: number; table: number | null; source: number | null }[] }[];
  outOfCanon: { usfm: string; source: string; ref: string; via: string }[];
  collisions: { key: string; sources: string[] }[];
  chapters: ChapterIssues[];
  unusedRules: number[];
}

const srcRef = (p: { usfm: string; chapter: number; verse: number; occurrence: number }) =>
  `${p.usfm} ${p.chapter}:${p.verse}${p.occurrence > 1 ? `#${p.occurrence}` : ""}`;

function profileOf(bible: SourceBible, usfm: string): number[] {
  return bible.books.find((b) => b.usfm === usfm)?.chapters.map((c) => Math.max(0, ...c.verses.map((v) => v.verse))) ?? [];
}

/** Para cada tradução, texto (tokens) na chave canônica quando o registro cobre um único versículo. */
function singleTokens(al: Alignment): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const [key, idx] of al.byCanon) {
    if (idx.length !== 1) continue;
    const p = al.placements[idx[0]!]!;
    if (p.targets.length === 1) out.set(key, tokens(p.text));
  }
  return out;
}

export function conference(
  bibles: Record<TranslationId, SourceBible>,
  alignments: Record<TranslationId, Alignment>,
  configs: Record<TranslationId, TranslationVersification>,
  canonical: Canonical,
  tables: { org: Versification; vul: Versification; eng: Versification },
): TranslationConference[] {
  const ids = Object.keys(alignments) as TranslationId[];
  const toks = Object.fromEntries(ids.map((id) => [id, singleTokens(alignments[id])])) as Record<TranslationId, Map<string, Set<string>>>;

  // Sequência canônica de cada livro, para a janela da verificação lexical (atravessa capítulos).
  const seq = new Map<string, CanonRef[]>();
  const pos = new Map<string, number>();
  for (const usfm of canonical.books.keys()) {
    const list = [...canonical.verses(usfm)];
    seq.set(usfm, list);
    list.forEach((r, i) => pos.set(canonKey(r), i));
  }

  return ids.map((id) => {
    const al = alignments[id];
    const cfg = configs[id];
    const bible = bibles[id];
    const present = new Set(bible.books.map((b) => b.usfm));
    const chapters = new Map<string, ChapterIssues>();
    const chap = (r: CanonRef) => {
      const k = `${r.usfm}.${r.chapter}`;
      let c = chapters.get(k);
      if (!c) chapters.set(k, (c = { usfm: r.usfm, chapter: r.chapter, missing: [], collisions: [], lexical: [] }));
      return c;
    };

    // Cobertura canônica.
    let missingCanonical = 0;
    for (const usfm of canonical.books.keys()) {
      if (!present.has(usfm)) continue;
      for (const r of canonical.verses(usfm)) {
        if (!al.byCanon.has(canonKey(r))) {
          missingCanonical++;
          chap(r).missing.push(r.verse);
        }
      }
    }
    for (const c of al.issues.collisions) {
      const [usfm, ch, v] = c.key.split(".");
      chap({ usfm: usfm!, chapter: Number(ch), verse: Number(v) }).collisions.push(Number(v));
    }

    // Verificação lexical contra as outras traduções.
    let flags = 0;
    let checked = 0;
    const mine = toks[id];
    for (const [key, t] of mine) {
      if (t.size < MIN_TOKENS) continue;
      const i = pos.get(key);
      if (i === undefined) continue;
      const usfm = key.split(".")[0]!;
      const list = seq.get(usfm)!;
      let confirmed = false;
      let flag: LexicalFlag | undefined;
      for (const other of ids) {
        if (other === id) continue;
        const theirs = toks[other];
        const sameT = theirs.get(key);
        if (!sameT) continue;
        const same = similarity(t, sameT);
        if (same >= MIN_BEST) { confirmed = true; break; }
        let best = 0;
        let bestJ = i;
        for (let j = Math.max(0, i - WINDOW); j <= Math.min(list.length - 1, i + WINDOW); j++) {
          if (j === i) continue;
          const o = theirs.get(canonKey(list[j]!));
          if (!o) continue;
          const s = similarity(t, o);
          if (s > best) { best = s; bestJ = j; }
        }
        if (best >= MIN_BEST && best - same >= MIN_GAIN && !flag) {
          flag = { key, against: other, same: round(same), bestKey: canonKey(list[bestJ]!), best: round(best), offset: bestJ - i };
        }
      }
      checked++;
      if (flag && !confirmed) {
        flags++;
        const [, ch, v] = key.split(".");
        chap({ usfm, chapter: Number(ch), verse: Number(v) }).lexical.push(flag);
      }
    }

    // Tabela base × fonte.
    const tableVsSource: TranslationConference["tableVsSource"] = [];
    for (const b of bible.books) {
      const base = cfg.base.books?.[b.usfm] ?? cfg.base.default;
      const table = base === "canonical" ? canonical.books.get(b.usfm) : tables[base].books.get(b.usfm);
      const source = profileOf(bible, b.usfm);
      const n = Math.max(table?.length ?? 0, source.length);
      const diffs = [];
      for (let c = 0; c < n; c++) {
        if ((table?.[c] ?? null) !== (source[c] ?? null)) diffs.push({ chapter: c + 1, table: table?.[c] ?? null, source: source[c] ?? null });
      }
      if (diffs.length) tableVsSource.push({ usfm: b.usfm, base, chapters: diffs });
    }

    const sorted = [...chapters.values()].filter((c) => c.missing.length || c.collisions.length || c.lexical.length);
    const order = [...canonical.books.keys()];
    sorted.sort((a, b) => order.indexOf(a.usfm) - order.indexOf(b.usfm) || a.chapter - b.chapter);

    return {
      translation: id,
      totals: {
        placed: al.placements.length,
        viaRules: al.placements.filter((p) => p.via.startsWith("rule:")).length,
        emptySkipped: al.emptySkipped,
        collisions: al.issues.collisions.length,
        declaredAdditional: al.declaredAdditional.length,
        outOfCanon: al.issues.outOfCanon.length,
        missingCanonical,
        absentBooks: [...canonical.books.keys()].filter((u) => !present.has(u)),
        lexicalFlags: flags,
        lexicalChecked: checked,
        unusedRules: al.issues.unusedRules.length,
      },
      tableVsSource,
      outOfCanon: al.issues.outOfCanon.map((o) => {
        const p = al.placements[o.placement]!;
        return { usfm: p.usfm, source: srcRef(p), ref: canonKey(o.ref), via: p.via };
      }),
      collisions: al.issues.collisions.map((c) => ({ key: c.key, sources: c.placements.map((i) => `${srcRef(al.placements[i]!)} (${al.placements[i]!.via})`) })),
      chapters: sorted,
      unusedRules: al.issues.unusedRules,
    };
  });
}

function round(x: number): number {
  return Math.round(x * 100) / 100;
}

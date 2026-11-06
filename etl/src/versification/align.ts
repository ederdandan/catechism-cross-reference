// Alinhamento de versificação (spec, seção 6): posiciona cada versículo da fonte na
// chave canônica. Não altera texto: só calcula onde cada registro fica.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SourceBible, SourceLocator, TranslationId } from "../sources/types.ts";
import { Canonical, VERSIFICATION_DIR, canonKey, type CanonRef } from "./canonical.ts";
import type { Versification } from "./vrs.ts";

/**
 * Tabela base de um livro:
 *  - `org`: a numeração da fonte é a do org.vrs (convertida para o canônico por canonical.json);
 *  - `vul` / `eng`: aplica os mapeamentos do vul.vrs / eng.vrs para o org (e daí para o canônico);
 *  - `canonical`: a numeração da fonte já é a canônica (identidade).
 */
export type BaseTable = "org" | "vul" | "eng" | "canonical";

export interface ExceptionRule {
  book: string;
  /** Numeração da fonte: `"c:v"`, `"c:v-w"` ou `"c:v#k"` (k-ésima ocorrência de um número repetido). */
  from: string;
  /** Numeração canônica no mesmo livro: `"c:v"` ou `"c:v-w"`. */
  to: string;
  note: string;
  /** O registro compartilha o versículo `to` com outro registro principal (vai em `additional` na saída). */
  additional?: boolean;
}

export interface TranslationVersification {
  base: { default: BaseTable; books?: Record<string, BaseTable> };
  rules: ExceptionRule[];
}

export interface Placement {
  usfm: string;
  /** Numeração da fonte. */
  chapter: number;
  verse: number;
  /** 1-based: ordem entre registros com o mesmo número no mesmo capítulo. */
  occurrence: number;
  text: string;
  locator: SourceLocator;
  /** Versículos canônicos cobertos, em ordem. O texto vai no primeiro; mais de um = versículos juntados. */
  targets: CanonRef[];
  /** Origem do posicionamento: `base:<tabela>` ou `rule:<índice>`. */
  via: string;
  /**
   * Registro que compartilha o versículo canônico com outro registro principal da mesma
   * tradução (ex.: Vulgata divide em dois um versículo hebraico). Na saída vai em `additional`.
   */
  additional: boolean;
}

export interface Alignment {
  translation: TranslationId;
  placements: Placement[];
  /** Chave canônica → índices em `placements` que a cobrem. */
  byCanon: Map<string, number[]>;
  /** Registros com texto vazio na fonte (não posicionados; saem como `null`). */
  emptySkipped: number;
  /** Versículos canônicos com um registro principal e registros `additional` declarados por regra. */
  declaredAdditional: { key: string; placements: number[] }[];
  issues: {
    collisions: { key: string; placements: number[] }[];
    outOfCanon: { placement: number; ref: CanonRef }[];
    unusedRules: number[];
  };
}

export function loadTranslationVersification(id: TranslationId): TranslationVersification {
  return JSON.parse(readFileSync(resolve(VERSIFICATION_DIR, "exceptions", `${id}.json`), "utf8")) as TranslationVersification;
}

/** Índice de uma tabela vrs: `"BOOK c:v"` → referências org (sem partes de letra e sem versículo 0). */
export interface TableIndex {
  map: Map<string, CanonRef[]>;
  /** Linhas do .vrs que não puderam ser aplicadas (intervalos de tamanhos incompatíveis etc.). */
  irregular: { line: number; reason: string }[];
}

export function indexTable(vrs: Versification): TableIndex {
  const map = new Map<string, CanonRef[]>();
  const irregular: TableIndex["irregular"] = [...vrs.irregular];
  const add = (from: { book: string; chapter: number; verse: number }, to: { book: string; chapter: number; verse: number }) => {
    if (to.verse === 0) return; // título como versículo 0: o org numera os títulos a partir de 1
    const k = `${from.book} ${from.chapter}:${from.verse}`;
    const list = map.get(k) ?? [];
    if (!list.some((r) => r.usfm === to.book && r.chapter === to.chapter && r.verse === to.verse)) {
      list.push({ usfm: to.book, chapter: to.chapter, verse: to.verse });
    }
    map.set(k, list);
  };
  for (const m of vrs.mappings) {
    const from = m.from.filter((r) => r.verse !== 0);
    const to = m.to;
    if (from.length === 0 || to.length === 0) {
      if (m.from.length === 0 || to.length === 0) irregular.push({ line: m.line, reason: "intervalo vazio ou invertido" });
      continue;
    }
    if (m.from.length === to.length) m.from.forEach((f, i) => f.verse !== 0 && add(f, to[i]!));
    else if (from.length === 1) to.forEach((t) => add(from[0]!, t));
    else if (to.length === 1) from.forEach((f) => add(f, to[0]!));
    else irregular.push({ line: m.line, reason: `tamanhos diferentes (${m.from.length} × ${to.length})` });
  }
  return { map, irregular };
}

const FROM_SPEC = /^(\d+):(\d+)(?:-(\d+)|#(\d+))?$/u;
const TO_SPEC = /^(\d+):(\d+)(?:-(\d+))?$/u;

interface CompiledRule {
  index: number;
  /** `"c:v"` ou `"c:v#k"` → alvos. */
  targets: Map<string, CanonRef[]>;
  additional: boolean;
}

function compileRule(rule: ExceptionRule, index: number, where: string): CompiledRule {
  const f = FROM_SPEC.exec(rule.from);
  const t = TO_SPEC.exec(rule.to);
  if (!f || !t) throw new Error(`${where}: regra ${index} com from/to inválido (${rule.from} → ${rule.to})`);
  const fc = Number(f[1]);
  const fa = Number(f[2]);
  const fb = f[3] === undefined ? fa : Number(f[3]);
  const occ = f[4];
  const tc = Number(t[1]);
  const ta = Number(t[2]);
  const tb = t[3] === undefined ? ta : Number(t[3]);
  if (fb < fa || tb < ta) throw new Error(`${where}: regra ${index} com intervalo invertido`);
  const to: CanonRef[] = [];
  for (let v = ta; v <= tb; v++) to.push({ usfm: rule.book, chapter: tc, verse: v });
  const targets = new Map<string, CanonRef[]>();
  const nFrom = fb - fa + 1;
  if (nFrom === to.length) {
    for (let i = 0; i < nFrom; i++) targets.set(`${fc}:${fa + i}${occ ? `#${occ}` : ""}`, [to[i]!]);
  } else if (nFrom === 1) {
    targets.set(`${fc}:${fa}${occ ? `#${occ}` : ""}`, to); // versículo juntado na fonte
  } else {
    throw new Error(`${where}: regra ${index} (${rule.from} → ${rule.to}) com tamanhos incompatíveis`);
  }
  if (rule.additional && [...targets.values()].some((t) => t.length !== 1)) {
    throw new Error(`${where}: regra ${index} com "additional" precisa apontar para um único versículo`);
  }
  return { index, targets, additional: rule.additional === true };
}

export function align(
  bible: SourceBible,
  cfg: TranslationVersification,
  canonical: Canonical,
  tables: { vul: TableIndex; eng: TableIndex },
): Alignment {
  const where = `exceptions/${bible.id}.json`;
  const rulesByBook = new Map<string, CompiledRule[]>();
  cfg.rules.forEach((r, i) => {
    const list = rulesByBook.get(r.book) ?? [];
    list.push(compileRule(r, i, where));
    rulesByBook.set(r.book, list);
  });
  const usedRules = new Set<number>();

  const out: Alignment = {
    translation: bible.id,
    placements: [],
    byCanon: new Map(),
    emptySkipped: 0,
    declaredAdditional: [],
    issues: { collisions: [], outOfCanon: [], unusedRules: [] },
  };

  for (const book of bible.books) {
    const base = cfg.base.books?.[book.usfm] ?? cfg.base.default;
    const rules = rulesByBook.get(book.usfm) ?? [];
    for (const ch of book.chapters) {
      const seen = new Map<number, number>();
      for (const v of ch.verses) {
        const occurrence = (seen.get(v.verse) ?? 0) + 1;
        seen.set(v.verse, occurrence);
        if (v.text === "") {
          out.emptySkipped++;
          continue;
        }
        let targets: CanonRef[] | undefined;
        let via = `base:${base}`;
        let additional = false;
        // Regra com ocorrência explícita (`c:v#k`) tem precedência sobre a regra simples (`c:v`).
        for (const key of [`${ch.chapter}:${v.verse}#${occurrence}`, `${ch.chapter}:${v.verse}`]) {
          const r = rules.find((x) => x.targets.has(key));
          if (r) {
            targets = r.targets.get(key);
            via = `rule:${r.index}`;
            additional = r.additional;
            usedRules.add(r.index);
            break;
          }
        }
        if (!targets) {
          const self: CanonRef = { usfm: book.usfm, chapter: ch.chapter, verse: v.verse };
          if (base === "canonical") targets = [self];
          else if (base === "org") targets = [canonical.toCanonical(self)];
          else {
            const mapped = tables[base].map.get(`${book.usfm} ${ch.chapter}:${v.verse}`);
            targets = (mapped ?? [self]).map((r) => canonical.toCanonical(r));
          }
        }
        out.placements.push({ usfm: book.usfm, chapter: ch.chapter, verse: v.verse, occurrence, text: v.text, locator: v.locator, targets, via, additional });
      }
    }
  }

  out.placements.forEach((p, i) => {
    for (const t of p.targets) {
      if (!canonical.exists(t)) out.issues.outOfCanon.push({ placement: i, ref: t });
      const k = canonKey(t);
      const list = out.byCanon.get(k);
      if (list) list.push(i);
      else out.byCanon.set(k, [i]);
    }
  });
  for (const [key, list] of out.byCanon) {
    // Colisão declarada: exatamente um registro principal + registros `additional` (spec: campo "additional").
    const primary = list.filter((i) => !out.placements[i]!.additional);
    if (list.length > 1 && primary.length === 1) out.declaredAdditional.push({ key, placements: list });
    else if (list.length > 1 || primary.length === 0) out.issues.collisions.push({ key, placements: list });
  }
  cfg.rules.forEach((_, i) => { if (!usedRules.has(i)) out.issues.unusedRules.push(i); });
  return out;
}

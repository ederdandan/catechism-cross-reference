// Leitor INDEPENDENTE das fontes, usado só pelo teste de fidelidade (spec 2.1).
// Não importa nada de `src/` (garantido por test/static.test.ts): um erro nos leitores
// do ETL não pode se auto-validar aqui.

import { readFileSync } from "node:fs";

export type RawSourceId = "matos_soares" | "ave_maria" | "catechism";
export type Locator = readonly (string | number)[];

export interface RawSourcePaths {
  matos_soares: string;
  ave_maria: string;
  catechism: string;
}

const STRICT_UTF8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

export function readJsonStrict(path: string): unknown {
  const s = STRICT_UTF8.decode(readFileSync(path));
  return JSON.parse(s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
}

/** Registro de texto da fonte que precisa aparecer na saída. */
export interface CoverageRecord {
  /** Chave de cobertura: um registro bíblico, ou um parágrafo do CIC (as cópias repetidas contam como um). */
  key: string;
  source: RawSourceId;
  locator: Locator;
}

export class RawSources {
  private readonly json: Partial<Record<RawSourceId, unknown>> = {};
  /** Registros bíblicos com texto não vazio + parágrafos do CIC fora do Prólogo. */
  readonly coverage: CoverageRecord[] = [];

  constructor(paths: RawSourcePaths) {
    this.json.matos_soares = readJsonStrict(paths.matos_soares);
    this.json.ave_maria = readJsonStrict(paths.ave_maria);
    this.json.catechism = readJsonStrict(paths.catechism);
    this.collectCoverage();
  }

  /** Valor do campo `field` no registro apontado por `locator`, ou `undefined`. */
  resolve(source: RawSourceId, locator: Locator, field: string): unknown {
    let node: unknown = this.json[source];
    for (const step of [...locator, field]) {
      if (typeof node !== "object" || node === null || !Object.hasOwn(node, step)) return undefined;
      node = (node as Record<string | number, unknown>)[step];
    }
    return node;
  }

  /** Chave de cobertura de um texto da fonte (ver `CoverageRecord.key`). */
  coverageKey(source: RawSourceId, locator: Locator): string {
    if (source === "catechism") return `catechism#${String(this.resolve(source, locator, "numero"))}`;
    return `${source}@${JSON.stringify(locator)}`;
  }

  /** Para o CIC: o locator aponta para uma ocorrência fora do Prólogo? */
  isPrologue(locator: Locator): boolean {
    return locator[0] === "partes" && this.resolve("catechism", locator.slice(0, 2), "numero") === 0;
  }

  private collectCoverage(): void {
    const push = (source: RawSourceId, locator: Locator) =>
      this.coverage.push({ key: this.coverageKey(source, locator), source, locator });

    const ms = this.json.matos_soares as { capitulos: { versiculos: { texto: string }[] }[] }[];
    ms.forEach((b, bi) => b.capitulos.forEach((c, ci) => c.versiculos.forEach((v, vi) => {
      if (v.texto !== "") push("matos_soares", [bi, "capitulos", ci, "versiculos", vi]);
    })));

    const am = this.json.ave_maria as Record<string, { capitulos: { versiculos: { texto: string }[] }[] }[]>;
    for (const section of Object.keys(am)) {
      am[section]!.forEach((b, bi) => b.capitulos.forEach((c, ci) => c.versiculos.forEach((v, vi) => {
        if (v.texto !== "") push("ave_maria", [section, bi, "capitulos", ci, "versiculos", vi]);
      })));
    }

    const cic = this.json.catechism as { partes: { numero: number; capitulos: { paragrafos: { numero: number }[] }[] }[] };
    const seen = new Set<number>();
    cic.partes.forEach((p, pi) => {
      if (p.numero === 0) return;
      p.capitulos.forEach((c, ci) => c.paragrafos.forEach((g, gi) => {
        if (seen.has(g.numero)) return;
        seen.add(g.numero);
        push("catechism", ["partes", pi, "capitulos", ci, "paragrafos", gi]);
      }));
    });
  }
}

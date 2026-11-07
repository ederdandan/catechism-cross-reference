// Leitor INDEPENDENTE da fonte, usado só pelo teste de fidelidade (spec 2.1).
// Não importa nada de `src/` (garantido por test/static.test.ts): um erro no leitor
// do ETL não pode se auto-validar aqui.

import { readFileSync } from "node:fs";

export type RawSourceId = "catechism";
export type Locator = readonly (string | number)[];

export interface RawSourcePaths {
  catechism: string;
}

const STRICT_UTF8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

export function readJsonStrict(path: string): unknown {
  const s = STRICT_UTF8.decode(readFileSync(path));
  return JSON.parse(s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
}

/** Parágrafo do CIC que pode ser exigido numa visão da saída. */
export interface CoverageRecord {
  /** Chave de cobertura: o número do parágrafo (as cópias repetidas contam como um). */
  key: string;
  source: RawSourceId;
  locator: Locator;
}

export class RawSources {
  private readonly json: Record<RawSourceId, unknown>;
  /** Parágrafos do CIC fora do Prólogo (uma entrada por número). */
  readonly coverage: CoverageRecord[] = [];

  constructor(paths: RawSourcePaths) {
    this.json = { catechism: readJsonStrict(paths.catechism) };
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
    return `${source}#${String(this.resolve(source, locator, "numero"))}`;
  }

  /** O locator aponta para uma ocorrência dentro do Prólogo (`numero: 0`)? */
  isPrologue(locator: Locator): boolean {
    return locator[0] === "partes" && this.resolve("catechism", locator.slice(0, 2), "numero") === 0;
  }

  private collectCoverage(): void {
    const cic = this.json.catechism as { partes: { numero: number; capitulos: { paragrafos: { numero: number }[] }[] }[] };
    const seen = new Set<number>();
    cic.partes.forEach((p, pi) => {
      if (p.numero === 0) return;
      p.capitulos.forEach((c, ci) => c.paragrafos.forEach((g, gi) => {
        if (seen.has(g.numero)) return;
        seen.add(g.numero);
        const locator = ["partes", pi, "capitulos", ci, "paragrafos", gi];
        this.coverage.push({ key: this.coverageKey("catechism", locator), source: "catechism", locator });
      }));
    });
  }
}

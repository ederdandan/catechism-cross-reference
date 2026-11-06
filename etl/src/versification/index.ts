import type { AllSources } from "../sources/index.ts";
import type { TranslationId } from "../sources/types.ts";
import { align, indexTable, loadTranslationVersification, type Alignment, type TableIndex, type TranslationVersification } from "./align.ts";
import { Canonical, loadVrs } from "./canonical.ts";
import { conference, type TranslationConference } from "./conference.ts";

export const TRANSLATIONS: readonly TranslationId[] = ["matos_soares", "ave_maria"];

export interface VersificationResult {
  canonical: Canonical;
  alignments: Record<TranslationId, Alignment>;
  conference: TranslationConference[];
  tableIrregular: Record<"vul" | "eng", TableIndex["irregular"]>;
}

/** Etapa [2] do pipeline: alinha as três traduções à chave canônica e confere. */
export function runVersification(src: AllSources): VersificationResult {
  const org = loadVrs("org");
  const vul = loadVrs("vul");
  const eng = loadVrs("eng");
  const canonical = new Canonical(org, src.books.books.map((b) => b.usfm));
  const tables = { vul: indexTable(vul), eng: indexTable(eng) };
  const configs = Object.fromEntries(TRANSLATIONS.map((id) => [id, loadTranslationVersification(id)])) as Record<TranslationId, TranslationVersification>;
  const alignments = Object.fromEntries(
    TRANSLATIONS.map((id) => [id, align(src.bibles[id], configs[id], canonical, tables)]),
  ) as Record<TranslationId, Alignment>;
  return {
    canonical,
    alignments,
    conference: conference(src.bibles, alignments, configs, canonical, { org, vul, eng }),
    tableIrregular: { vul: tables.vul.irregular, eng: tables.eng.irregular },
  };
}

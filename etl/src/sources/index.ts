import { loadBooksConfig, type BooksConfig } from "../books.ts";
import { loadSourcesConfig, type SourcesConfig } from "../config.ts";
import { readAveMaria } from "./aveMaria.ts";
import { readCatechism } from "./catechism.ts";
import { readMatosSoares } from "./matosSoares.ts";
import type { CatechismSource, SourceBible } from "./types.ts";

export interface AllSources {
  config: SourcesConfig;
  books: BooksConfig;
  bibles: { matos_soares: SourceBible; ave_maria: SourceBible };
  catechism: CatechismSource;
}

/** Etapa [1] do pipeline: lê todas as fontes, sem alterar textos. */
export function loadAllSources(): AllSources {
  const config = loadSourcesConfig();
  const books = loadBooksConfig();
  return {
    config,
    books,
    bibles: {
      matos_soares: readMatosSoares(config.matos_soares, books),
      ave_maria: readAveMaria(config.ave_maria, books),
    },
    catechism: readCatechism(config.catechism),
  };
}

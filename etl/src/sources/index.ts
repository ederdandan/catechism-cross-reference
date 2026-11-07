import { loadBooksConfig, type BooksConfig } from "../books.ts";
import { loadSourcesConfig, type SourcesConfig } from "../config.ts";
import { readCatechism } from "./catechism.ts";
import type { CatechismSource } from "./types.ts";

export interface AllSources {
  config: SourcesConfig;
  books: BooksConfig;
  catechism: CatechismSource;
}

/** Etapa [1] do pipeline: lê a fonte do Catecismo e a lista de livros, sem alterar textos. */
export function loadAllSources(): AllSources {
  const config = loadSourcesConfig();
  return { config, books: loadBooksConfig(), catechism: readCatechism(config.catechism) };
}

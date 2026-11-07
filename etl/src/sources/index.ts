import { loadBooksConfig, type BooksConfig } from "../books.ts";
import { loadSourcesConfig, type SourcePaths, type SourcesConfig } from "../config.ts";
import { readCatechism } from "./catechism.ts";
import { sourcePaths } from "./fetch.ts";
import type { CatechismSource } from "./types.ts";

export interface AllSources {
  /** Origem fixada (repositório, commit, SHA-256). */
  origin: SourcesConfig;
  /** Caminhos locais das fontes no cache, já conferidos. */
  config: SourcePaths;
  books: BooksConfig;
  catechism: CatechismSource;
}

/**
 * Etapa [1] do pipeline: lê a fonte do Catecismo (do cache, ver `fetch.ts`) e a lista
 * de livros, sem alterar textos.
 */
export function loadAllSources(): AllSources {
  const origin = loadSourcesConfig();
  const config = sourcePaths(origin);
  return { origin, config, books: loadBooksConfig(), catechism: readCatechism(config.catechism) };
}

// Obtenção da fonte: baixa o arquivo do commit fixado em config/sources.json para
// etl/.cache/ (fora do git) e confere o SHA-256 dos bytes. Os bytes são gravados
// exatamente como recebidos, sem decodificar nem converter fim de linha.
//
// Uso direto: `npm run fetch:sources`.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { ETL_ROOT, loadSourcesConfig, rawUrl, type RemoteSource, type SourcePaths, type SourcesConfig } from "../config.ts";

export const CACHE_DIR = resolve(ETL_ROOT, ".cache", "sources");

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Caminho do arquivo no cache: `.cache/sources/<commit>/<path>`. */
export function cachePath(s: RemoteSource): string {
  return resolve(CACHE_DIR, s.commit, ...s.path.split("/"));
}

function cachedOk(s: RemoteSource): boolean {
  const p = cachePath(s);
  return existsSync(p) && sha256(readFileSync(p)) === s.sha256;
}

/** Caminhos das fontes já baixadas e conferidas; erro se faltar ou se o hash não bater. */
export function sourcePaths(cfg: SourcesConfig = loadSourcesConfig()): SourcePaths {
  if (!cachedOk(cfg.catechism)) {
    throw new Error(`Fonte do Catecismo ausente ou diferente do commit fixado em ${cachePath(cfg.catechism)}. Rode "npm run fetch:sources".`);
  }
  return { catechism: cachePath(cfg.catechism) };
}

/** Garante as fontes no cache (baixa se preciso) e devolve os caminhos locais. */
export async function fetchSources(cfg: SourcesConfig = loadSourcesConfig()): Promise<SourcePaths> {
  const s = cfg.catechism;
  if (!cachedOk(s)) {
    const url = rawUrl(s);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Falha ao baixar ${url}: HTTP ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const got = sha256(bytes);
    if (got !== s.sha256) throw new Error(`SHA-256 de ${url} é ${got}; esperado ${s.sha256}. Nada foi gravado.`);
    const p = cachePath(s);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(`${p}.tmp`, bytes);
    renameSync(`${p}.tmp`, p);
  }
  return sourcePaths(cfg);
}

if (import.meta.main) {
  const cfg = loadSourcesConfig();
  const paths = await fetchSources(cfg);
  console.log(`Fonte do Catecismo: ${cfg.catechism.repository} @ ${cfg.catechism.commit.slice(0, 7)} · SHA-256 conferido`);
  console.log(`Cache: ${paths.catechism}`);
}

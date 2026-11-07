import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Raiz da pasta `etl/`. */
export const ETL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Arquivo de fonte num repositório do GitHub, fixado num commit e conferido por SHA-256. */
export interface RemoteSource {
  /** `https://github.com/<dono>/<repositório>` */
  repository: string;
  /** Hash completo (40 hex) do commit usado. */
  commit: string;
  /** Caminho do arquivo dentro do repositório, com `/`. */
  path: string;
  /** SHA-256 (64 hex) dos bytes do arquivo nesse commit. */
  sha256: string;
}

export interface SourcesConfig {
  catechism: RemoteSource;
}

/** Caminhos locais (cache já conferido) das fontes. */
export interface SourcePaths {
  catechism: string;
}

const REPOSITORY = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const PATH = /^[\w.-]+(?:\/[\w.-]+)*$/u;

/** Lê `config/sources.json` e valida a origem do Catecismo. */
export function loadSourcesConfig(path = resolve(ETL_ROOT, "config", "sources.json")): SourcesConfig {
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (typeof raw !== "object" || raw === null) throw new Error(`${path}: esperado um objeto JSON`);
  const c = (raw as Record<string, unknown>).catechism;
  if (typeof c !== "object" || c === null) throw new Error(`${path}: chave "catechism" ausente ou não é objeto`);
  const s = c as Record<string, unknown>;
  const field = (key: keyof RemoteSource, re: RegExp): string => {
    const v = s[key];
    if (typeof v !== "string" || !re.test(v)) throw new Error(`${path}: catechism.${key} inválido`);
    return v;
  };
  return {
    catechism: {
      repository: field("repository", REPOSITORY),
      commit: field("commit", COMMIT),
      path: field("path", PATH),
      sha256: field("sha256", SHA256),
    },
  };
}

/** URL dos bytes crus do arquivo no commit fixado. */
export function rawUrl(s: RemoteSource): string {
  const [, owner, repo] = new URL(s.repository).pathname.split("/");
  return `https://raw.githubusercontent.com/${owner}/${repo}/${s.commit}/${s.path}`;
}

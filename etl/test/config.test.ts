import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSourcesConfig, rawUrl } from "../src/config.ts";
import { sourcePaths } from "../src/sources/fetch.ts";

test("sources.json fixa a fonte do Catecismo num commit do GitHub com SHA-256", () => {
  const s = loadSourcesConfig().catechism;
  assert.equal(s.repository, "https://github.com/ntwkst/catecismo-da-igreja-catolica");
  assert.match(s.commit, /^[0-9a-f]{40}$/u);
  assert.match(s.sha256, /^[0-9a-f]{64}$/u);
  assert.equal(rawUrl(s), `https://raw.githubusercontent.com/ntwkst/catecismo-da-igreja-catolica/${s.commit}/catecismo.json`);
});

test("a fonte baixada está no cache e confere com o SHA-256 (npm run fetch:sources)", () => {
  assert.ok(existsSync(sourcePaths().catechism));
});

test("sources.json com commit abreviado ou hash ausente é rejeitado", () => {
  const dir = mkdtempSync(join(tmpdir(), "sources-"));
  try {
    const f = join(dir, "sources.json");
    const base = { repository: "https://github.com/a/b", commit: "97af80f", path: "x.json", sha256: "0".repeat(64) };
    writeFileSync(f, JSON.stringify({ catechism: base }));
    assert.throws(() => loadSourcesConfig(f), /catechism\.commit/u);
    writeFileSync(f, JSON.stringify({ catechism: { ...base, commit: "0".repeat(40), sha256: undefined } }));
    assert.throws(() => loadSourcesConfig(f), /catechism\.sha256/u);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cache com bytes diferentes do SHA-256 fixado é recusado", () => {
  const cfg = loadSourcesConfig();
  assert.throws(() => sourcePaths({ catechism: { ...cfg.catechism, sha256: "0".repeat(64) } }), /fetch:sources/u);
});

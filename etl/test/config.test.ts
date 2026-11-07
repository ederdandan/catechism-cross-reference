import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { loadSourcesConfig } from "../src/config.ts";

test("sources.json aponta para a fonte do Catecismo, que existe", () => {
  const sources = loadSourcesConfig();
  for (const [key, path] of Object.entries(sources)) {
    assert.ok(existsSync(path), `fonte "${key}" não encontrada: ${path}`);
  }
});

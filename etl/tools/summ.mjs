import { readFileSync } from "node:fs";
const r = JSON.parse(readFileSync(process.argv[2], "utf8"));
const only = process.argv[3];
for (const t of r.translations) {
  if (only && t.translation !== only) continue;
  console.log(`\n===== ${t.translation}`);
  const byBook = new Map();
  for (const c of t.chapters) {
    const offs = new Map();
    for (const f of c.lexical) offs.set(f.offset, (offs.get(f.offset) ?? 0) + 1);
    const dom = [...offs].sort((a, b) => b[1] - a[1])[0];
    const s = `${c.chapter}[${c.missing.length ? "m" + c.missing.length : ""}${c.collisions.length ? " c" + c.collisions.length : ""}${c.lexical.length ? ` L${c.lexical.length}${dom ? "@" + (dom[0] > 0 ? "+" : "") + dom[0] : ""}` : ""}]`;
    (byBook.get(c.usfm) ?? byBook.set(c.usfm, []).get(c.usfm)).push(s);
  }
  for (const [b, l] of byBook) console.log(`  ${b} (${l.length}): ${l.join(" ")}`);
  console.log("  fora do canônico:", t.outOfCanon.slice(0, 12).map((o) => `${o.source}→${o.ref}`).join(", "), t.outOfCanon.length > 12 ? "…" : "");
}

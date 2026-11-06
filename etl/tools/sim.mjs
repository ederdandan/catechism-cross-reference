// Protótipo: similaridade lexical entre versículos de duas traduções (só análise).
const { loadAllSources } = await import("../src/sources/index.ts");
const src = loadAllSources();
const tok = (s) => new Set((s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").match(/\p{L}{4,}/gu) ?? []));
const sim = (a, b) => { if (!a.size || !b.size) return 0; let i = 0; for (const x of a) if (b.has(x)) i++; return i / Math.min(a.size, b.size); };
const chap = (id, usfm, c) => src.bibles[id].books.find((b) => b.usfm === usfm)?.chapters.find((x) => x.chapter === c);
const [A, B, usfm, ca, cb] = process.argv.slice(2);
const xa = chap(A, usfm, Number(ca)), xb = chap(B, usfm, Number(cb ?? ca));
for (const va of xa.verses) {
  const ta = tok(va.text);
  const scores = xb.verses.map((vb) => [vb.verse, sim(ta, tok(vb.text))]).sort((p, q) => q[1] - p[1]);
  const same = scores.find((s) => s[0] === va.verse)?.[1] ?? 0;
  console.log(`${A} ${va.verse}`.padEnd(16), `melhor ${B} ${scores[0][0]} (${scores[0][1].toFixed(2)})`.padEnd(26), `mesmo nº ${same.toFixed(2)}`, va.verse !== scores[0][0] && scores[0][1] > same + 0.2 ? "  <<<" : "");
}

// Mescla propostas (saída do propose.mjs) em etl/config/versification/exceptions/<t>.json.
// Uso: node merge.cjs <traducao> <propostas.json> <referencia>
// Uma regra por registro (chave: livro + from); proposta nova substitui a anterior do mesmo registro.
const fs = require("fs");
const [t, propPath, ref] = process.argv.slice(2);
const ETL = require("path").resolve(__dirname, "..");
const file = `${ETL}/config/versification/exceptions/${t}.json`;
const cfg = JSON.parse(fs.readFileSync(file, "utf8"));
const props = JSON.parse(fs.readFileSync(propPath, "utf8"));
const byKey = new Map(cfg.rules.map((r) => [`${r.book} ${r.from}`, r]));
let added = 0, replaced = 0;
for (const p of props) {
  const high = p.sNew >= 0.4 && p.sNew - p.sOld >= 0.2;
  const rule = {
    book: p.book,
    from: p.from,
    to: p.to,
    ...(p.kind === "col" ? { additional: true } : {}),
    confidence: high ? "alta" : "baixa",
    note: `auto: evidência lexical contra ${ref} ${p.sOld.toFixed(2)}→${p.sNew.toFixed(2)} (antes: ${p.current}); «${p.text.slice(0, 50)}…»`,
  };
  const k = `${p.book} ${p.from}`;
  if (byKey.has(k)) replaced++; else added++;
  byKey.set(k, rule);
}
// Remove regras que viraram identidade com a base (to == from, sem additional) só se a proposta assim disser — não aplicável aqui.
const order = JSON.parse(fs.readFileSync(`${ETL}/config/books.json`, "utf8")).books.map((b) => b.usfm);
const num = (s) => s.split(/[:#-]/).map(Number);
cfg.rules = [...byKey.values()].sort((a, b) => {
  const d = order.indexOf(a.book) - order.indexOf(b.book);
  if (d) return d;
  const [ac, av, ao = 1] = num(a.from), [bc, bv, bo = 1] = num(b.from);
  return ac - bc || av - bv || ao - bo;
});
fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + "\n");
console.log(`${t}: +${added} novas, ${replaced} substituídas, total ${cfg.rules.length}`);

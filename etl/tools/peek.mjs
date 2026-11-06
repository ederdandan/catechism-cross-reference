// Mostra versículos de várias fontes: node peek.mjs "PSA 51:1-4" "PSA 50:1-4" ...
const { loadAllSources } = await import("../src/sources/index.ts");
const src = loadAllSources();
const only = process.env.SRC ? process.env.SRC.split(",") : ["ave_maria", "matos_soares"];
for (const arg of process.argv.slice(2)) {
  const [, usfm, ch, a, b] = arg.match(/^(\w+) (\d+):(\d+)(?:-(\d+))?$/);
  for (const id of only) {
    const book = src.bibles[id].books.find((x) => x.usfm === usfm);
    const c = book?.chapters.find((x) => x.chapter === Number(ch));
    const vs = c?.verses.filter((v) => v.verse >= Number(a) && v.verse <= Number(b ?? a)) ?? [];
    const max = c ? Math.max(...c.verses.map((v) => v.verse)) : "-";
    for (const v of vs) console.log(`${id.padEnd(12)} ${usfm} ${ch}:${v.verse} (máx ${max}) ${JSON.stringify(v.text.slice(0, Number(process.env.W ?? 90)))}`);
    if (!vs.length) console.log(`${id.padEnd(12)} ${usfm} ${ch}:${a} — (máx ${max})`);
  }
  console.log();
}

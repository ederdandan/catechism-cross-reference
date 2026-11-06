// Experimento (não altera o projeto): canônico de TOB/JDT/SIR = numeração da Vulgata (vul.vrs).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const ETL = fileURLToPath(new URL("..", import.meta.url));
const S = `${ETL}/reports`; // não versionado
const { loadAllSources } = await import("../src/sources/index.ts");
const { align, indexTable, loadTranslationVersification } = await import("../src/versification/align.ts");
const { Canonical, loadVrs } = await import("../src/versification/canonical.ts");
const { conference } = await import("../src/versification/conference.ts");

const src = loadAllSources();
const org = loadVrs("org"), vul = loadVrs("vul"), eng = loadVrs("eng");
const cfg = JSON.parse(readFileSync(`${ETL}/config/versification/canonical.json`, "utf8"));
const DEUT = (process.env.BOOKS ?? "TOB,JDT,SIR").split(",");
for (const b of DEUT) cfg.books[b] = { chapters: vul.books.get(b), note: "experimento: Vulgata" };
mkdirSync(S, { recursive: true });
writeFileSync(`${S}/canonical-exp.json`, JSON.stringify(cfg));
const canonical = new Canonical(org, src.books.books.map((b) => b.usfm), `${S}/canonical-exp.json`);
const tables = { vul: indexTable(vul), eng: indexTable(eng) };
const ids = ["matos_soares", "ave_maria"];
const configs = {}, als = {};
for (const id of ids) {
  const c = loadTranslationVersification(id);
  c.base.books = { ...(c.base.books ?? {}), ...Object.fromEntries(DEUT.map((b) => [b, "canonical"])) };
  configs[id] = c;
  als[id] = align(src.bibles[id], c, canonical, tables);
}
const conf = conference(src.bibles, als, configs, canonical, { org, vul, eng });
for (const c of conf) {
  const inB = (l) => l.filter((x) => DEUT.includes(x.usfm));
  const ch = inB(c.chapters);
  console.log(c.translation, "— nos livros", DEUT.join("/"), ": capítulos pendentes", ch.length,
    "· sem texto", ch.reduce((s, x) => s + x.missing.length, 0),
    "· colisões", ch.reduce((s, x) => s + x.collisions.length, 0),
    "· lexicais", ch.reduce((s, x) => s + x.lexical.length, 0),
    "· fora do canônico", c.outOfCanon.filter((o) => DEUT.includes(o.usfm)).length);
  for (const x of ch) console.log("   ", x.usfm, x.chapter, "m", x.missing.join(","), "c", x.collisions.join(","), "L", x.lexical.length);
}

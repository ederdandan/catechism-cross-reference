// Gerador de PROPOSTAS de exceções (para revisão humana). Não grava nada no projeto.
// Uso: node propose.mjs <traducao> [USFM ...]   → imprime JSON de propostas
//
// Para cada capítulo canônico com pendência, alinha os registros da tradução T (na ordem
// da fonte) com os versículos canônicos do capítulo, por programação dinâmica, usando o
// texto da outra tradução R (já posicionado) como referência lexical. Permite:
//   - registro cobrindo vários versículos (versículo juntado na fonte);
//   - versículo canônico sem registro (lacuna);
//   - dois registros no mesmo versículo (colisão → "additional").
const { loadAllSources } = await import("../src/sources/index.ts");
const { runVersification } = await import("../src/versification/index.ts");
const { tokens } = await import("../src/versification/lexical.ts");
const { canonKey } = await import("../src/versification/canonical.ts");

const [T, ...onlyBooks] = process.argv.slice(2);
const R = T === "ave_maria" ? "matos_soares" : "ave_maria";
const src = loadAllSources();
const vers = runVersification(src);
const alT = vers.alignments[T];
const alR = vers.alignments[R];
const conf = vers.conference.find((c) => c.translation === T);

const K = 25; // máximo de versículos por registro juntado
const MARKER_RE = /(?<=[\p{L},;.:!?»”"’)]\s)(\d{1,3})(?=\s\p{Ll})/gu;
const GAP = 0.02, JOIN = 0.2, COL = 0.4, KEEP = 0.05;

// Quanto do texto de R no versículo aparece no registro de T (0–1).
const cont = (rv, t) => {
  if (!rv || !rv.size || !t.size) return 0;
  let n = 0;
  for (const x of rv) if (t.has(x)) n++;
  return n / rv.size;
};
const f1 = (a, b) => {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return (2 * n) / (a.size + b.size);
};

// Tokens de R por chave canônica (registros juntados de R dão seus tokens a todo o intervalo).
const rTok = new Map();
for (const p of alR.placements) {
  const t = tokens(p.text);
  for (const ref of p.targets) {
    const k = canonKey(ref);
    const prev = rTok.get(k);
    rTok.set(k, prev ? new Set([...prev, ...t]) : t);
  }
}

const proposals = [];
// Só capítulos estruturalmente inconsistentes na própria tradução (lacuna ou colisão);
// suspeitas só lexicais costumam vir de erro na tradução de referência.
const chapters = conf.chapters.filter((c) => (!onlyBooks.length || onlyBooks.includes(c.usfm)) && (c.missing.length || c.collisions.length || process.env.ALL));
// Também capítulos com registros fora do canônico.
const keyOf = (u, c) => `${u}.${c}`;
const todo = new Map(chapters.map((c) => [keyOf(c.usfm, c.chapter), c]));
for (const o of conf.outOfCanon) {
  const [u, c] = o.ref.split(".");
  if (!onlyBooks.length || onlyBooks.includes(u)) todo.set(keyOf(u, Number(c)), { usfm: u, chapter: Number(c) });
}

for (const { usfm, chapter } of todo.values()) {
  const max = vers.canonical.books.get(usfm)?.[chapter - 1];
  if (!max) continue;
  // Registros de T cujo primeiro alvo está neste capítulo canônico, na ordem da fonte.
  const recs = alT.placements.map((p, i) => ({ p, i })).filter(({ p }) => p.targets[0].usfm === usfm && p.targets[0].chapter === chapter);
  if (!recs.length) continue;
  const tt = recs.map(({ p }) => tokens(p.text));
  // Números de versículo embutidos no texto (ex.: "gente de Hai, 5 caindo"): evidência de junção.
  const markers = recs.map(({ p }) => new Set([...p.text.matchAll(MARKER_RE)].map((m) => Number(m[1]))));
  const MARK = 0.6;
  const markBonus = (i, a, b) => { let n = 0; for (let v = a + 1; v <= b; v++) if (markers[i].has(v)) n++; return n * MARK; };
  const C = (i, a, b) => { let s = 0; for (let v = a; v <= b; v++) s += cont(rTok.get(`${usfm}.${chapter}.${v}`), tt[i]); return s; };
  const U = (a, b) => { // tokens de R nos versículos a..b (1-based, inclusivo)
    const s = new Set();
    for (let v = a; v <= b; v++) for (const x of rTok.get(`${usfm}.${chapter}.${v}`) ?? []) s.add(x);
    return s;
  };
  const cur = recs.map(({ p }) => p.targets.filter((r) => r.chapter === chapter).map((r) => r.verse));
  const isCur = (i, a, b) => cur[i].length === b - a + 1 && cur[i][0] === a;
  const n = recs.length, m = max;
  const NEG = -1e9;
  const best = Array.from({ length: n + 1 }, () => new Float64Array(m + 1).fill(NEG));
  const back = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(null));
  best[0][0] = 0;
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= m; j++) {
      const s = best[i][j];
      if (s === NEG) continue;
      if (j < m && s - GAP > best[i][j + 1]) { best[i][j + 1] = s - GAP; back[i][j + 1] = ["gap", i, j]; }
      if (i < n) {
        for (let k = 1; k <= K && j + k <= m; k++) {
          const sc = s + C(i, j + 1, j + k) + markBonus(i, j + 1, j + k) - (k - 1) * JOIN + (isCur(i, j + 1, j + k) ? KEEP : 0);
          if (sc > best[i + 1][j + k]) { best[i + 1][j + k] = sc; back[i + 1][j + k] = ["place", i, j, j + 1, j + k]; }
        }
        if (j >= 1) {
          const sc = s + C(i, j, j) - COL + (isCur(i, j, j) ? KEEP : 0);
          if (sc > best[i + 1][j]) { best[i + 1][j] = sc; back[i + 1][j] = ["col", i, j, j, j]; }
        }
      }
    }
  }
  // Reconstrói.
  const res = new Array(n);
  let i = n, j = m;
  while (i > 0 || j > 0) {
    const b = back[i][j];
    if (!b) break;
    if (b[0] === "gap") { j = b[2]; continue; }
    res[b[1]] = [b[3], b[4], b[0]];
    i = b[1]; j = b[2];
  }
  recs.forEach(({ p }, r) => {
    const [a, b, kind] = res[r] ?? [];
    if (a === undefined) return;
    if (isCur(r, a, b) && p.targets.every((t) => t.chapter === chapter)) return;
    const sNew = C(r, a, b) / (b - a + 1);
    const sOld = cur[r].length ? C(r, cur[r][0], cur[r][cur[r].length - 1]) / cur[r].length : 0;
    proposals.push({
      book: usfm,
      from: `${p.chapter}:${p.verse}${p.occurrence > 1 ? `#${p.occurrence}` : ""}`,
      to: a === b ? `${chapter}:${a}` : `${chapter}:${a}-${b}`,
      kind,
      current: p.targets.map((t) => `${t.chapter}:${t.verse}`).join("+"),
      sNew: Math.round(sNew * 100) / 100,
      sOld: Math.round(sOld * 100) / 100,
      text: p.text.slice(0, 70),
    });
  });
}
console.log(JSON.stringify(proposals, null, 1));

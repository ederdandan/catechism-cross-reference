// Similaridade lexical entre traduções, usada SOMENTE para conferir o alinhamento
// (detectar versículos deslocados). Trabalha sobre cópias descartáveis dos textos:
// nada daqui é exportado nem volta para a saída.

const STOP = new Set([
  "para", "como", "pois", "porque", "quando", "sobre", "entre", "ainda", "assim", "então", "entao", "todo", "toda", "todos", "todas",
  "este", "esta", "isto", "esse", "essa", "isso", "aquele", "aquela", "eles", "elas", "dele", "dela", "deles", "delas", "seus", "suas",
  "minha", "minhas", "meus", "teus", "tuas", "nossa", "nosso", "vossa", "vosso", "mais", "muito", "muita", "tudo", "nada", "onde",
  "disse", "dizer", "diz", "será", "sera", "serão", "serao", "seja", "foram", "estava", "estão", "estao", "fazer", "fará", "fara",
  "senhor", "deus", "contra", "depois", "antes", "também", "tambem", "porém", "porem", "mesmo", "outro", "outra", "pelo", "pela",
  "pelos", "pelas", "nele", "nela", "neles", "nelas", "lhes", "vós", "vos", "você", "voce", "vocês", "voces",
]);

const WORD = /\p{L}{4,}/gu;
const MARK = /\p{M}/gu;

/** Conjunto de palavras distintivas (minúsculas, sem acento, ≥ 4 letras, sem palavras comuns). */
export function tokens(text: string): Set<string> {
  const folded = text.toLowerCase().normalize("NFD").replace(MARK, ""); // fidelity-ok: cópia descartável só para comparação
  const out = new Set<string>();
  for (const m of folded.matchAll(WORD)) if (!STOP.has(m[0])) out.add(m[0]);
  return out;
}

/** Sobreposição relativa ao menor conjunto (0–1). */
export function similarity(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  let n = 0;
  for (const x of small) if (big.has(x)) n++;
  return n / small.size;
}

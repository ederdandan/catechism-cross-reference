// Troca caracteres invisíveis literais por escapes (barra invertida + u + 4 hex) nos arquivos dados.
// Não usa a sequência de escape no próprio código (a ferramenta de escrita a decodificaria).
const fs = require("fs");
const BS = String.fromCharCode(92);
const codes = [0xad, 0xa0, 0xfeff, 0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x2028, 0x2029];
const set = new Set(codes.map((c) => String.fromCharCode(c)));
for (const f of process.argv.slice(2)) {
  const s = fs.readFileSync(f, "utf8");
  let n = 0;
  const out = [...s].map((ch) => {
    if (!set.has(ch)) return ch;
    n++;
    return BS + "u" + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, "0");
  }).join("");
  if (n) fs.writeFileSync(f, out);
  console.log(f, n, "substituídos");
}

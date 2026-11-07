# SPEC - Pipeline de ETL: Catecismo por referência bíblica

> **Revisão 8 — 2026-11-06.** Documento reescrito para o escopo atual: só o Catecismo da Igreja Católica (CIC) e o índice por capítulo bíblico. As decisões tomadas estão marcadas como **[DECIDIDO]**; observações e escopo futuro estão na seção 11. Versões anteriores desta spec estão no histórico do git.
>
> Decisões que continuam valendo, por revisão:
> * **Revisão 4:** a entrega é o índice **Catecismo por capítulo bíblico** (seção 5); os evangelhos se chamam Mateus, Marcos, Lucas e João, sem "São" (seção 9). Depois vieram os campos `verses` e `ref` e as correções de versículo.
> * **Revisão 6:** `etl/output/` é **versionado** no git (seção 6).
> * **Revisão 7:** a fonte do CIC é o repositório no GitHub, fixado por commit e SHA-256 (seções 3 e 6).

## 1. Visão Geral

Pipeline de extração, transformação e carga (ETL) local, de execução única (*one-shot build pipeline*). Ele lê o CIC em português, extrai as citações bíblicas do texto e gera um **JSON estático** com os parágrafos do CIC organizados por livro, capítulo e versículo da Bíblia.

* **[DECIDIDO]** A rotina ETL vive na pasta **`etl/`** na raiz deste repositório, escrita em **Node.js + TypeScript**, e grava os arquivos em **`etl/output/`**.
* Este repositório **apenas gera** a base. O consumo (PWA/WebApp, hospedagem estática como GitHub Pages, CDN como jsDelivr) acontece **em outro projeto**, que copia ou aponta para `etl/output/`.

---

## 2. Regra Fundamental: Fidelidade Absoluta dos Textos **[DECIDIDO]**

**Nenhum texto do Catecismo pode ser alterado. Zero mudanças.**

* Todo parágrafo é exportado **exatamente** como está na fonte: palavras, pontuação, acentos, espaços, caracteres invisíveis (ex.: `U+00AD`) e marcações.
* Isso inclui os marcadores de nota `(N)`, os títulos de seção embutidos no fim de parágrafos e os blocos de notas presentes no campo `texto`.
* Qualquer tratamento de exibição (ocultar marcações, formatar) é responsabilidade do front-end, nunca do ETL.
* O ETL **apenas** organiza e acrescenta metadados (livro, capítulo, versículos, `ref`) ao lado dos textos.
* Proibido no código: `trim()`, `normalize()`, substituições ou "limpezas" de texto. Leitura de JSON com UTF-8 estrito; a única intervenção permitida é remover o BOM do *arquivo*, se existir.

### 2.1 Teste de Fidelidade (obrigatório)
Ao final da execução, o ETL compara cada texto gerado com o texto original da fonte, caractere por caractere. **Qualquer divergência faz a geração falhar.**

* O verificador fica em `etl/test/fidelity/` e é **independente**: não importa nada de `src/` e relê a fonte sozinho.
* Cada texto da saída tem uma entrada no manifesto de proveniência (`etl/reports/provenance.json`), com a fonte, o caminho do registro na fonte e o ponteiro na saída.
* Falham o build: divergência de qualquer caractere, texto sem proveniência, caminho inexistente na fonte, proveniência duplicada e texto vindo do Prólogo (seção 7.1).
* Guardas estáticos (`etl/test/static.test.ts`) proíbem em `src/` os métodos que transformam strings, salvo uso marcado com `// fidelity-ok: <motivo>`, e caracteres invisíveis literais em `src/` e `test/`.

---

## 3. Fonte de Dados **[DECIDIDO — revisão 7]**

| Fonte | Repositório | Arquivo | Conteúdo |
| :--- | :--- | :--- | :--- |
| CIC | [ntwkst/catecismo-da-igreja-catolica](https://github.com/ntwkst/catecismo-da-igreja-catolica) | `catecismo.json` | 2.865 parágrafos em partes e capítulos; citações na numeração hebraica (Salmos) |

* A origem fica em `etl/config/sources.json`: repositório, commit completo (`97af80f…`), caminho do arquivo e SHA-256 dos bytes. Não há caminho fixo no código nem dependência de pasta local.
* Estrutura do arquivo: `partes[].capitulos[].paragrafos[]`, com `numero` e `texto` em cada parágrafo. O leitor confere o conjunto de chaves de cada registro.
* Particularidades da fonte, tratadas na seção 7 e nunca corrigidas no texto: Prólogo corrompido, parágrafos repetidos, blocos de notas vazados e erros de OCR/digitação nas citações.

---

## 4. Numeração Canônica **[DECIDIDO]**

* A numeração canônica é a **hebraica**, a mesma usada pelo CIC, tirada do `org.vrs` do Paratext/UBS (`ubsicap/versification_json`, licença MIT, © 2019 United Bible Societies; aviso em `etl/config/versification/LICENSE-ubsicap.txt`).
* Ela serve para validar as citações (capítulo e versículo existentes) e para ordenar a saída.
* **Exceção — Daniel, Ester e Baruc [DECIDIDO]:** seguem a **numeração católica**, como o CIC cita, definida em `etl/config/versification/canonical.json`:
  * Daniel com 14 capítulos; Dn 3 com 100 versículos (Cântico dos três jovens em Dn 3,24-90); Susana = Dn 13; Bel e o Dragão = Dn 14.
  * Ester com 16 capítulos, os acréscimos gregos dentro do próprio livro (Est 10,4–16,24).
  * Baruc com 6 capítulos; Br 6 = Carta de Jeremias.
* Nos Salmos o CIC cita na numeração hebraica (conferido: 33 de 33 citações com trecho literal comparável; nenhuma na Vulgata).

---

## 5. Formato da Saída: `etl/output/catechism_by_chapter.json` **[DECIDIDO — revisão 4]**

Lista, na ordem dos livros (seção 9) e dos capítulos, de todo capítulo citado por pelo menos um parágrafo do CIC:

```json
[
  {
    "book": "Mateus",
    "abbreviation": "Mt",
    "usfm": "MAT",
    "chapter": 16,
    "catechism_paragraphs": [
      { "paragraph": 153, "verses": [17], "ref": "Mt 16, 17", "text": "<texto do parágrafo exatamente como na fonte>" },
      { "paragraph": 552, "verses": [16, 18], "ref": "Mt 16, 16.18", "text": "..." }
    ]
  }
]
```

* `book`: nome padronizado; `abbreviation`: sigla como o CIC cita (a primeira da seção 9; o CIC usa só ela: `Act` 54×, `Rm` 100×); `usfm`: código do livro; `chapter`: numeração canônica (seção 4).
* `catechism_paragraphs`: parágrafos únicos, em ordem crescente, que citam o capítulo segundo as seções 7 e 8. O mesmo parágrafo aparece em cada capítulo que cita.
* `verses`: versículos canônicos que o parágrafo cita no capítulo, únicos e em ordem crescente (intervalos expandidos; sufixos `a`/`b` descartados). `[]` = capítulo citado inteiro (ex.: `(Gn 3)`).
* `ref`: rótulo **gerado** a partir de `abbreviation`, `chapter` e `verses`, no estilo do CIC, com intervalos compactados (`Mt 6, 9-13`, `Gn 2, 7.22`). Não é texto copiado da fonte.
* `text`: a string da fonte, sem nenhuma alteração (seção 2), inclusive marcadores de nota `(N)`, títulos de seção embutidos no fim, blocos de notas vazados e `U+00AD`.
* **Correções de versículo** (`etl/config/catechism.json` → `verse_fixes`, aprovadas pelo usuário):
  * erros de OCR/digitação da fonte: §432 `Act 4, l2` → 12; §1544 `Heb 5, l0` → 10; §2330 `Ex 20, l4` → 14; §1987 `Rm 6, 8- l l` → 8-11; §2475 `1 Pe 2, I` → 1; §1507 `Mc 16, 1 7-18` → 17-18; §2260 `Gn 9, 5-61` → 5-6; §2449 `Dt 15, 1 l` → 11;
  * versículo errado, conferido pelo trecho citado: §1693 `Mt 5, 47` → 48; §1858 `Mc 10, 18` → 19;
  * numeração da Vulgata: §§958 e 1032 `2 Mac 12, 46` → 12, 45 canônico.

  Cada correção precisa casar exatamente com o que o parser leu, senão o build falha. Nenhum versículo da saída pode ficar fora da numeração canônica (conferido pelo `npm test`, seção 8.2).
* **Correções de sigla** (`etl/config/catechism.json` → `abbreviation_fixes`, por parágrafo, revisadas pelo usuário): §320 `He` → Heb; §455 `1 Co` → 1 Cor; §371 `Ga 2, 23` → Gn 2, 23 (erro tipográfico da fonte).
* Formas irregulares da fonte com capítulo inequívoco (`I Jo`, `Jo14`, `Act 4, l2`…) são aceitas no capítulo e listadas em `etl/reports/catechism_citations.json`.
* **Fidelidade:** cada `text` tem entrada no manifesto; o `build:data` roda o verificador independente (seção 2.1) sobre `etl/output/` e falha em qualquer divergência. Como a saída repete parágrafos por capítulo, não se exige que cada texto da fonte apareça exatamente uma vez.
* **Cobertura:** só citações entre parênteses no corpo do texto (seções 7.5 e 8). Citações que estão apenas em notas de rodapé não entram nesta versão (seção 11).

---

## 6. Obtenção da Fonte e Versionamento **[DECIDIDO — revisões 6 e 7]**

* **Obtenção:** o ETL baixa `https://raw.githubusercontent.com/<dono>/<repositório>/<commit>/<caminho>` para `etl/.cache/sources/<commit>/` e confere o SHA-256 dos bytes. Com hash diferente, o arquivo é recusado e nada é gravado. Os bytes são gravados como recebidos, sem decodificar nem converter fim de linha.
* O cache é usado nas execuções seguintes, sempre com nova conferência do hash. `etl/.cache/` não é versionado.
* `npm run fetch:sources` baixa a fonte; `npm test` e `npm run build:data` fazem o mesmo antes de rodar.
* **Atualizar a fonte:** trocar `commit` e `sha256` em `sources.json`, rodar `npm run build:data` e revisar o diff da saída. Só com pedido do usuário.
* **Saída versionada:** `etl/output/` fica no git, sempre igual ao que o ETL gera a partir do commit. Todo commit que muda o ETL ou a config leva junto a saída regenerada; `npm run check:data` refaz o build e falha se a saída versionada estiver desatualizada.
* O `.gitattributes` fixa fim de linha LF em `etl/output/` e a marca como gerada.
* `etl/reports/` não é versionado.

---

## 7. Ingestão do Catecismo **[DECIDIDO]**

1. **Ignorar a parte `numero: 0` (Prólogo)** do `catecismo.json`. Os §§1–25 dessa parte estão corrompidos e as demais entradas dela repetem parágrafos existentes nas outras partes.
2. **Repetidos:** os §§1699, 1895, 2217, 2236, 2439 e 2759 aparecem várias vezes com texto idêntico; usa-se uma única ocorrência. O ETL confere que as cópias são iguais e falha se não forem.
3. **Todos os parágrafos §26–§2865** são lidos com o texto original; falta de algum número faz o build falhar.
4. **Parágrafos sem extração de citações:** os listados em `etl/config/catechism.json` → `note_only_paragraphs` (112, 113, 114, 164, 179, 827, 936, 937, 1191, 1193, 1486, 1527, 1528, 1531).
5. **28 parágrafos com bloco de notas vazado no fim** (49, 141, 179, 184, 197, 421, 682, 827, 1065, 1075, 1134, 1209, 1419, 1532, 1666, 1690, 1698, 1876, 1948, 2051, 2082, 2195, 2557, 2565, 2649, 2696, 2758, 2865): o `text` vai **completo** para a saída; a extração de citações considera somente o trecho anterior ao primeiro bloco `N. Cf.`.
6. **Cobertura desta versão:** 1.337 citações em 809 parágrafos, que formam 334 capítulos de 50 livros.

---

## 8. Parser de Citações Bíblicas no CIC

### 8.1 Escopo
* Somente citações **entre parênteses** no corpo do parágrafo (ex.: `(Mc 2, 17)`), após descartar os blocos de notas (seção 7.5).
* Somente siglas presentes na **whitelist** (seção 9). Isso elimina falsos positivos de fontes patrísticas: `PL`, `PG`, `SC`, `CCL`, `CSEL`, `Sermão`, `Coimbra`, `Funk` etc.
* Correspondência **sensível a maiúsculas** (evita `os`, `is`, `am` minúsculos do texto corrido).
* O parser trabalha em duas fases: (1) localizar os grupos entre parênteses; (2) em cada grupo, decompor e expandir as citações. Ele só lê o texto, com regex e posições.

### 8.2 Formatos suportados

| Formato | Exemplo no CIC | Resultado |
| :--- | :--- | :--- |
| Simples | `Mt 16, 18` | `MAT` 16 · `[18]` |
| Intervalo | `Mt 6, 9-13` | `MAT` 6 · `[9, 10, 11, 12, 13]` |
| Versículos separados por ponto | `Gn 2, 7.22` | `GEN` 2 · `[7, 22]` |
| Vários livros com `;` | `Mt 6, 7; 1 Rs 18, 26-29` | duas citações |
| Capítulo encadeado sem repetir o livro | `Mt 1, 20; 2, 13` | `MAT` 1 · `[20]` e `MAT` 2 · `[13]` |
| Capítulo inteiro | `Gn 3` | `GEN` 3 · `[]` |
| Sufixo de meio-versículo | `Mt 23, 37a` | `MAT` 23 · `[37]` |
| Numeral romano na sigla | `I Jo 4, 8` | `1JN` 4 · `[8]`, registrado como irregular |
| Espaçamento irregular ou OCR | `Lc 1 , 3 1` / `Act 4, l2` | registrado no relatório; não adivinhar (ver `verse_fixes`, seção 5) |

* Numeração das citações do CIC: **hebraica** (ex.: `Sl 51, 6` = Miserere), usada diretamente como canônica (seção 4).
* Capítulo ou versículo fora da numeração canônica vai para o relatório (`unresolved`, `invalidVerses`); o teste `catechism.test.ts` exige que `invalidVerses` fique vazio.
* Atenção a `\b` com acentos: em JavaScript usar a flag `u` ou delimitadores explícitos.

### 8.3 Relatório de execução
O ETL gera relatórios em `etl/reports/` (fora de `etl/output/`):
* `inventory.json`: origem da fonte e contagens da leitura;
* `catechism_citations.json`: citações não resolvidas, formas irregulares, correções aplicadas e contagens;
* `provenance.json`: manifesto do teste de fidelidade.

---

## 9. Tabela de Livros (USFM) e Siglas Aceitas

A tabela fica em `etl/config/books.json`: 73 livros na ordem canônica, com USFM, nome padronizado, testamento e as siglas aceitas do CIC (`cic_abbreviations`, whitelist). A primeira sigla é a usada em `abbreviation` e `ref`. Variantes com e sem espaço após o número (`1 Cor` / `1Cor`) são aceitas.

| USFM | Nome padronizado | Siglas no CIC (whitelist) | Testamento |
| :--- | :--- | :--- | :--- |
| GEN | Gênesis | Gn | AT |
| EXO | Êxodo | Ex | AT |
| LEV | Levítico | Lv | AT |
| NUM | Números | Nm | AT |
| DEU | Deuteronômio | Dt | AT |
| JOS | Josué | Js | AT |
| JDG | Juízes | Jz | AT |
| RUT | Rute | Rt | AT |
| 1SA | 1 Samuel | 1 Sm | AT |
| 2SA | 2 Samuel | 2 Sm | AT |
| 1KI | 1 Reis | 1 Rs | AT |
| 2KI | 2 Reis | 2 Rs | AT |
| 1CH | 1 Crônicas | 1 Cr | AT |
| 2CH | 2 Crônicas | 2 Cr | AT |
| EZR | Esdras | Esd | AT |
| NEH | Neemias | Ne | AT |
| TOB | Tobias | Tb | Deuterocanônico |
| JDT | Judite | Jdt | Deuterocanônico |
| EST | Ester | Est | AT |
| 1MA | 1 Macabeus | 1 Mac | Deuterocanônico |
| 2MA | 2 Macabeus | 2 Mac | Deuterocanônico |
| JOB | Jó | Job | AT |
| PSA | Salmos | Sl | AT |
| PRO | Provérbios | Pr | AT |
| ECC | Eclesiastes | Ecl | AT |
| SNG | Cântico dos Cânticos | Ct | AT |
| WIS | Sabedoria | Sb | Deuterocanônico |
| SIR | Eclesiástico / Sirácida | Sir | Deuterocanônico |
| ISA | Isaías | Is | AT |
| JER | Jeremias | Jr | AT |
| LAM | Lamentações | Lm | AT |
| BAR | Baruc | Br / Ba | Deuterocanônico |
| EZK | Ezequiel | Ez | AT |
| DAN | Daniel | Dn | AT |
| HOS | Oseias | Os | AT |
| JOL | Joel | Jl | AT |
| AMO | Amós | Am | AT |
| OBA | Abdias | Ab | AT |
| JON | Jonas | Jn | AT |
| MIC | Miqueias | Mq | AT |
| NAM | Naum | Na | AT |
| HAB | Habacuc | Hab | AT |
| ZEP | Sofonias | Sf | AT |
| HAG | Ageu | Ag | AT |
| ZEC | Zacarias | Zc | AT |
| MAL | Malaquias | Ml | AT |
| MAT | Mateus | Mt | NT |
| MRK | Marcos | Mc | NT |
| LUK | Lucas | Lc | NT |
| JHN | João | Jo | NT |
| ACT | Atos dos Apóstolos | Act / At | NT |
| ROM | Romanos | Rm / Rom | NT |
| 1CO | 1 Coríntios | 1 Cor | NT |
| 2CO | 2 Coríntios | 2 Cor | NT |
| GAL | Gálatas | Gl | NT |
| EPH | Efésios | Ef | NT |
| PHP | Filipenses | Fl | NT |
| COL | Colossenses | Cl | NT |
| 1TH | 1 Tessalonicenses | 1 Ts | NT |
| 2TH | 2 Tessalonicenses | 2 Ts | NT |
| 1TI | 1 Timóteo | 1 Tm | NT |
| 2TI | 2 Timóteo | 2 Tm | NT |
| TIT | Tito | Tt | NT |
| PHM | Filêmon | Fm | NT |
| HEB | Hebreus | Heb | NT |
| JAS | São Tiago | Tg | NT |
| 1PE | 1 São Pedro | 1 Pe | NT |
| 2PE | 2 São Pedro | 2 Pe | NT |
| 1JN | 1 São João | 1 Jo | NT |
| 2JN | 2 São João | 2 Jo | NT |
| 3JN | 3 São João | 3 Jo | NT |
| JUD | São Judas | Jd | NT |
| REV | Apocalipse | Ap | NT |

---

## 10. Etapas do Pipeline e Estrutura de Saída

```text
[1] Fonte e leitura (sem alterar textos)
    ├── Baixar/conferir catecismo.json (commit + SHA-256, seção 6)
    ├── Leitura estrita, filtros da seção 7 e inventário → reports/inventory.json
[2] Catecismo por referência bíblica
    ├── Parser de citações (parênteses + whitelist), correções e validação canônica
    └── Agrupar por capítulo e parágrafo → output/catechism_by_chapter.json
        + reports/catechism_citations.json e reports/provenance.json
[3] Teste de fidelidade (seção 2.1) — falha a geração se houver divergência
```

```text
etl/output/
└── catechism_by_chapter.json        # seção 5
```

### 10.1 Estrutura do Projeto ETL **[DECIDIDO]**

```text
etl/
├── package.json · tsconfig.json
├── config/
│   ├── sources.json                 # origem da fonte: repositório, commit, caminho e SHA-256
│   ├── books.json                   # 73 livros: USFM, nome, testamento, siglas do CIC
│   ├── catechism.json               # note_only_paragraphs, abbreviation_fixes, verse_fixes
│   └── versification/
│       ├── org.vrs                  # cópia do ubsicap/versification_json (MIT)
│       ├── LICENSE-ubsicap.txt
│       └── canonical.json           # Daniel, Ester e Baruc na numeração católica
├── src/
│   ├── index.ts                     # build:data (etapas [1]–[3])
│   ├── config.ts · books.ts
│   ├── sources/                     # obtenção (fetch.ts), leitor estrito do CIC e inventário
│   ├── versification/               # leitor .vrs e numeração canônica
│   └── catechism/                   # filtros (seção 7), parser (seção 8), índice por capítulo
├── test/                            # node:test; fidelity/ = verificador independente (seção 2.1)
├── tools/escape-invisible.cjs       # troca caracteres invisíveis literais por escapes no código
├── output/                          # JSON gerado (seção 5); versionado
├── reports/                         # relatórios (seção 8.3); não versionado
└── .cache/                          # fonte baixada (seção 6); não versionado
```

**Tecnologia e execução:**
* **Node.js 24** + **TypeScript** executado nativamente (sem build); checagem de tipos com `tsc --noEmit`.
* **Testes:** executor nativo `node:test`.
* **Comandos:** `npm run fetch:sources`, `npm run typecheck`, `npm test`, `npm run build:data`, `npm run check:data`.
* `npm run build:data` gera `etl/output/` do zero; a pasta é apagada e recriada a cada execução para não sobrar arquivo antigo.

---

## 11. Observações e Escopo Futuro

| # | Item | Situação |
| :--- | :--- | :--- |
| 1 | **Direitos autorais** | **[CIENTE]** O texto do CIC tem direitos de seu editor (© Libreria Editrice Vaticana); o repositório de origem não declara licença. Não impede o desenvolvimento local; precisa ser resolvido antes de publicar a base |
| 2 | **Notas de rodapé do CIC** | Fora desta versão. O conteúdo das notas está nos blocos vazados (seção 7.5); a ligação marcador → nota foi analisada em 2026-11-06 e a implementação ficou para depois |
| 3 | **Índice por versículo** (`catechism_by_verse.json`) | Futuro: índice leve versículo → parágrafos, só números |
| 4 | **Numeração dos deuterocanônicos** | Futuro: conferir as cerca de 30 citações restantes de Sb, Eclo, Tb e Dn |
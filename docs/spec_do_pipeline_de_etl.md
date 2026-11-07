# SPEC - Pipeline de ETL de Consolidação: Bíblia ⇄ Catecismo

> **Revisão 2 — 2026-11-06.** Atualizada após análise das fontes reais. As decisões tomadas estão marcadas como **[DECIDIDO]**; observações e escopo futuro estão na seção 11.
>
> **Revisão 3 — 2026-11-06 [DECIDIDO].** A tradução CNBB foi retirada do projeto (a fonte tinha texto perdido e deslocado); restam Matos Soares e Ave-Maria.
>
> **Revisão 4 — 2026-11-06 [DECIDIDO].** Primeira entrega reduzida: o índice **Catecismo por capítulo bíblico** (seção 5.E), gerado só a partir do CIC, sem depender do alinhamento das traduções. Os evangelhos passam a se chamar Mateus, Marcos, Lucas e João (sem "São"; seção 9).
>
> **Revisão 5 — 2026-11-06 [DECIDIDO].** A versão atual contém **só o necessário para o índice do Catecismo (5.E)**. O tratamento das Bíblias (leitores Matos Soares/Ave-Maria, alinhamento de versificação, `vul.vrs`/`eng.vrs`, exceções por tradução) foi removido do código; continua especificado nas seções 3–6 e 10 e preservado no histórico do git (commit `19cc1d7`). Da versificação ficam só o `org.vrs` e o `canonical.json` (sem `from_org`), usados para validar e ordenar as citações. O `build:data` tem três etapas: inventário do CIC, índice por capítulo e teste de fidelidade.
>
> **Revisão 6 — 2026-11-06 [DECIDIDO].** `etl/output/` passa a ser **versionado** no git (substitui a decisão "não versionado" da seção 10). Todo commit que muda o ETL ou a config leva junto a saída regenerada; `npm run check:data` refaz o build e falha se a saída versionada estiver desatualizada. O `.gitattributes` fixa fim de linha LF na saída. `etl/reports/` continua fora do git.

## 1. Visão Geral

Especificação técnica do pipeline de extração, transformação e carga (ETL) local de execução única (*one-shot build pipeline*). O objetivo é ler as bases de dados católicas locais, alinhar as referências bíblicas das diferentes traduções, extrair automaticamente as citações bíblicas contidas no Catecismo da Igreja Católica (CIC) e compilar todo o ecossistema em uma árvore de **JSONs estáticos desnormalizados**.

* **[DECIDIDO]** A rotina ETL vive na pasta **`etl/`** na raiz deste repositório, escrita em **Node.js + TypeScript**, e grava os arquivos em **`etl/output/`**.
* Este repositório **apenas gera** a base. O consumo (PWA/WebApp, hospedagem estática como GitHub Pages, CDN como jsDelivr) acontece **em outro projeto**, que copia ou aponta para `etl/output/`.

---

## 2. Regra Fundamental: Fidelidade Absoluta dos Textos **[DECIDIDO]**

**Nenhum texto da Bíblia ou do Catecismo pode ser alterado. Zero mudanças.**

* Todo versículo e todo parágrafo é exportado **exatamente** como está na fonte: palavras, pontuação, acentos, espaços, caracteres invisíveis e marcações.
* Isso inclui, sem exceção:
  * Ave-Maria: asteriscos (ex.: Gn 1,8 `…dia.*`) e hífens suaves `U+00AD` (ex.: Gn 1,6 `ou­tras`);
  * Catecismo: blocos de notas de rodapé presentes no campo `texto` e parágrafos cujo texto é apenas nota.
* Versículos juntados na fonte **não são divididos**; versículos vazios **não são preenchidos** com texto de outra fonte.
* Qualquer tratamento de exibição (ocultar marcações, formatar) é responsabilidade do front-end, nunca do ETL.
* O ETL **apenas** organiza, alinha e acrescenta metadados (`ref`, referências, índices) ao lado dos textos.

### 2.1 Teste de Fidelidade (obrigatório)
Ao final da execução, o ETL compara cada texto gerado com o texto original da fonte, caractere por caractere. **Qualquer divergência faz a geração falhar.**

---

## 3. Fontes de Dados (Inputs)

```text
C:\Users\ederd\estudo\estudoCatolico\
├── biblia-db\                        # Matos Soares — biblia.json
├── bibliaAveMariaJSON\               # Ave-Maria — bibliaAveMaria.json
└── catecismo-da-igreja-catolica\     # CIC — catecismo.json
```

| Fonte | Arquivo usado | Livros | Versículos | Numeração | Observações |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Matos Soares | `biblia.json` | 73 | 35.602 (+22 números repetidos) | Vulgata (Clementina) | Divisão própria em Pr, Sir, Ct, Jó |
| Ave-Maria | `bibliaAveMaria.json` | 73 | 35.450 | Vulgata nos Salmos | Junta versículos em listas (seção 6.3) |
| CIC | `catecismo.json` | — | 2.865 parágrafos | Hebraica (Salmos) | Ver seção 7 |

* **Matos Soares — números de versículo repetidos [DECIDIDO]:** os 22 casos em que o mesmo número de versículo aparece mais de uma vez no mesmo capítulo são mantidos **todos**, na ordem da fonte e com o texto intacto (nenhuma ocorrência é descartada ou fundida). O posicionamento de cada ocorrência na chave canônica é definido em `exceptions/matos_soares.json`, após levantamento caso a caso.
* `bibliaAveMariaRAW.json` **não é usado**: tem texto idêntico ao `bibliaAveMaria.json` em todos os 35.450 versículos.
* Os caminhos das fontes ficam em arquivo de configuração (`etl/config/sources.json`), não fixos no código.

---

## 4. Versificação Padrão **[DECIDIDO]**

* A chave canônica de todo o projeto é a **numeração hebraica**, a mesma usada pelo CIC.
* Formato da chave: `USFM.CAPÍTULO.VERSÍCULO` (ex.: `PSA.51.3`).
* Matos Soares e Ave-Maria são **alinhadas** à chave canônica através da **Tabela de Conversão de Versificação** (seção 6). O texto delas não é alterado; apenas é posicionado no versículo canônico correspondente.
* **Exceção — Daniel e Ester [DECIDIDO]:** nesses dois livros a chave canônica segue a **numeração católica**, como o CIC cita, e não a separação em livros próprios da tabela `org` (`S3Y`, `SUS`, `BEL`, `ESG`):
  * Daniel com 14 capítulos; Dn 3 com 100 versículos (Cântico dos três jovens em Dn 3,24-90); Susana = Dn 13; Bel e o Dragão = Dn 14.
  * Ester com os acréscimos gregos dentro do próprio livro, na numeração das edições católicas.

---

## 5. Formato Canônico dos Dados (Outputs)

### A. Capítulo Bíblico Multitradução (`etl/output/bible/{usfm}/{chapter}.json`)

Organizado pela numeração canônica. Cada tradução traz seu texto **original** e, **somente quando difere da chave canônica**, o campo `ref` com a referência como aparece na Bíblia impressa daquela tradução.

```json
{
  "book": "Salmos",
  "usfm": "PSA",
  "chapter": 51,
  "verses": [
    {
      "verse": 3,
      "translations": {
        "ave_maria":    { "ref": "Sl 50,3", "text": "<texto original da Ave-Maria>" },
        "matos_soares": { "ref": "Sl 50,3", "text": "<texto original de Matos Soares>" }
      },
      "catechism_paragraphs": [1850, 2100]
    }
  ]
}
```

Regras:
* **`ref` opcional:** omitido quando a referência da tradução é igual à canônica.
* **Ausência na fonte:** a tradução recebe `null` (ex.: versículo canônico que a tradução não tem).
* **Versículos juntados na fonte:** o texto vai inteiro no primeiro versículo canônico, com `ref` indicando o intervalo; os demais versículos do intervalo recebem `null` para aquela tradução.
  ```json
  "ave_maria": { "ref": "Js 12,8-24", "text": "<texto original completo, sem divisão>" }
  ```
* `catechism_paragraphs` lista os parágrafos do CIC que citam o versículo (vazio `[]` se nenhum).

### B. Parágrafo do Catecismo (`etl/output/catechism/{paragraph}.json`)

```json
{
  "paragraph": 545,
  "part": 2,
  "part_title": "<título da parte, como na fonte>",
  "chapter_title": "<título do capítulo, como na fonte>",
  "text": "<texto original integral, sem alteração>",
  "bible_references": [
    {
      "reference_text": "Mc 2, 17",
      "usfm": "MRK.2.17",
      "verses": ["MRK.2.17"]
    },
    {
      "reference_text": "Mt 6, 9-13",
      "usfm": "MAT.6.9-13",
      "verses": ["MAT.6.9", "MAT.6.10", "MAT.6.11", "MAT.6.12", "MAT.6.13"]
    }
  ]
}
```

* `reference_text` é o trecho **exatamente** como aparece no CIC.
* Parágrafo sem citação válida: `"bible_references": []` — o front-end exibe apenas o texto.

### C. Índices Bidirecionais (`etl/output/mappings/`)

* **`bible_to_cic.json`** — chave canônica → parágrafos do CIC.
  ```json
  { "MAT.16.18": [552], "MRK.2.17": [545] }
  ```
* **`cic_to_bible.json`** — parágrafo do CIC → chaves canônicas (já expandidas).
  ```json
  { "545": ["MRK.2.17", "LUK.15.7", "MAT.26.28"], "552": ["MAT.16.16", "MAT.16.18"] }
  ```
* Somente parágrafos **com** citação válida aparecem nos índices.

### D. Metadados

* **`etl/output/translations.json`** — descreve cada tradução:
  ```json
  {
    "matos_soares": { "name": "Matos Soares", "versification": "vulgata", "books": 73 },
    "ave_maria":    { "name": "Ave-Maria",    "versification": "vulgata", "books": 73 }
  }
  ```
* **`etl/output/books.json`** — os 73 livros: USFM, nome padronizado, testamento, capítulos e versículos por capítulo (numeração canônica).
* Todos os JSONs gerados incluem `"schema_version"` no nível raiz (ou em `etl/output/meta.json`).

### E. Catecismo por capítulo bíblico (`etl/output/catechism_by_chapter.json`) **[DECIDIDO — revisão 4]**

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

* `book`: nome padronizado; `abbreviation`: sigla como o CIC cita (a primeira da seção 9; o CIC usa só ela: `Act` 54×, `Rm` 100×); `chapter`: numeração canônica (seção 4). Nos Salmos o CIC cita na numeração hebraica (conferido: 33 de 33 citações com trecho literal comparável; nenhuma na Vulgata).
* `catechism_paragraphs`: parágrafos únicos, em ordem crescente, que citam o capítulo segundo as seções 7 e 8. O mesmo parágrafo aparece em cada capítulo que cita.
* `verses`: versículos canônicos que o parágrafo cita no capítulo, únicos e em ordem crescente (intervalos expandidos; sufixos `a`/`b` descartados). `[]` = capítulo citado inteiro (ex.: `(Gn 3)`).
* `ref`: rótulo **gerado** a partir de `abbreviation`, `chapter` e `verses`, no estilo do CIC, com intervalos compactados (`Mt 6, 9-13`, `Gn 2, 7.22`). Não é texto copiado da fonte.
* **Correções de versículo** (`etl/config/catechism.json` → `verse_fixes`, aprovadas pelo usuário): erros de OCR/digitação da fonte (§432 `Act 4, l2` → 12; §1544 `Heb 5, l0` → 10; §2330 `Ex 20, l4` → 14; §1987 `Rm 6, 8- l l` → 8-11; §2475 `1 Pe 2, I` → 1; §1507 `Mc 16, 1 7-18` → 17-18; §2260 `Gn 9, 5-61` → 5-6; §2449 `Dt 15, 1 l` → 11), versículo errado conferido pelo trecho citado (§1693 `Mt 5, 47` → 48; §1858 `Mc 10, 18` → 19) e numeração da Vulgata (§§958 e 1032 `2 Mac 12, 46` → 12, 45 canônico). Cada correção precisa casar exatamente com o que o parser leu, senão o build falha; nenhum versículo da saída pode ficar fora da numeração canônica.
* `text`: a string da fonte, sem nenhuma alteração (seção 2) — inclusive marcadores de nota `(N)`, títulos de seção embutidos no fim, blocos de notas vazados e `U+00AD`.
* **Fidelidade:** cada `text` tem entrada no manifesto `etl/reports/provenance.json`; o `build:data` roda o verificador independente sobre `etl/output/` e falha em qualquer divergência. Como a saída é parcial e repete parágrafos por capítulo, não se exige a cobertura "cada texto exatamente uma vez" (2.1, item 3); as demais verificações valem.
* **Cobertura:** só citações do corpo do texto (seção 7.6). Citações que estão apenas em notas de rodapé (ex.: §§881, 882 e 936 para Mt 16) não entram nesta versão.
* **Correções de sigla** (`etl/config/catechism.json`, por parágrafo, revisadas pelo usuário): §320 `He` → Heb; §455 `1 Co` → 1 Cor; §371 `Ga 2, 23` → Gn 2, 23 (erro tipográfico da fonte). Formas irregulares da fonte com capítulo inequívoco (`I Jo`, `Jo14`, `Act 4, l2`…) são aceitas no capítulo e listadas em `etl/reports/catechism_citations.json`.

---

## 6. Tabela de Conversão de Versificação

Documento de dados (não código) que diz, para cada tradução, **qual versículo da fonte corresponde a qual versículo canônico**. Não altera texto; só alinha.

### 6.1 Diferenças identificadas que a tabela precisa cobrir

| Tipo | Onde | Fonte afetada |
| :--- | :--- | :--- |
| Numeração dos Salmos (Vulgata × hebraica) e títulos contados ou não como versículo | Salmos | Ave-Maria, Matos Soares |
| Fronteira de capítulos diferente | Lv 5–6 · Nm 16–17 · Ne 3–4 · Ez 20–21 · Joel (3 × 4 caps.) · Malaquias (3 × 4 caps.) | Matos Soares × Ave-Maria |
| Divisão de versículos da Vulgata | Pr · Sir · Ct · Jó | Matos Soares |
| Versículos juntados em listas (seção 6.3) | Js 12, 15, 18, 19 · 1Rs 4 · 1Cr 6, 8, 9, 24, 25 · Esd 2 · Ne 7, 10, 12 | Ave-Maria |
| Pequenas diferenças (1 a 6 versículos) | ~40 livros, inclusive NT | Todas |

### 6.2 Origem da tabela **[DECIDIDO — Opção A: tabelas públicas]**

* **Fonte principal:** arquivos de versificação do Paratext/UBS do repositório `ubsicap/versification_json` (pasta `examples/`, formatos `.vrs` e `.json`). **Licença MIT** — © 2019 United Bible Societies Institute for Computer Assisted Publishing (verificado em 2026-11-06). Último commit: 2020-03-11.
  * `org.vrs` ("original": BHS no AT, GNT no NT, "Catholic" nos deuterocanônicos) → **chave canônica** deste projeto.
  * `vul.vrs` (Vulgata, v1.5 — "mainly Catholic Bibles", baseado em VUL83/NVL98) → ~530 mapeamentos para `org` (ex.: `PSA 22:0-6 = PSA 23:0-6`, `PSA 50:0-21 = PSA 51:0-21`, `PSA 9:22-39 = PSA 10:1-18`, `JOL 3:1-21 = JOL 4:1-21`, `MAL 4:1-6 = MAL 3:19-24`, `DAN 3:91-100 = DAN 3:24-33`).
  * `eng.vrs` (inglesa/protestante, v2.0) → ~265 mapeamentos para `org` (ex.: `NUM 16:36-50 = NUM 17:1-15`, `NEH 4:1-6 = NEH 3:33-38`, `PSA 51:1-19 = PSA 51:3-21`).
  * Formato das correspondências: `LIVRO cap:vers = LIVRO cap:vers` (versificação da tradução → `org`). Versículo `0` = título/subscrito dos Salmos.
* **Limitações conhecidas (verificadas):**
  * O README do repositório avisa que a seção de mapeamentos **nunca foi totalmente validada** — alguns mapeamentos apontam para versículos inexistentes. Reforça a obrigatoriedade da conferência automática abaixo.
  * `vul.vrs` **não mapeia Tobias, Judite e Eclesiástico** ("seguem outra *Vorlage* que não a LXX"). Matos Soares diverge nesses livros (Tb 298 × 297, Jdt 345 × 339, Sir 1.520 × 1.591) → tratar via camada de exceções.
  * Em `org`, os acréscimos gregos de Daniel e Ester ficam em **livros separados** (`S3Y`, `SUS`, `BEL`, `ESG`). Ex.: `DAN 3:24-90 (vul) = S3Y 1:1-67`. Neste projeto, Daniel e Ester seguem a numeração católica (exceção da seção 4); os mapeamentos para `S3Y`/`SUS`/`BEL`/`ESG` não são usados como chave.
* **As traduções locais são híbridas** — não seguem uma única tabela pública:
  * **Matos Soares:** compatível com `vul` (Joel 3 caps., Malaquias 4 caps., Salmos Vulgata).
  * **Ave-Maria:** Salmos pela Vulgata, mas Joel (4 caps.) e Malaquias (3 caps.) pela numeração hebraica.
  * Por isso a configuração define, **por tradução e por livro**, qual tabela base se aplica (`vul`, `eng` ou identidade com `org`), mais as exceções.
* **Fonte secundária (referência):** CrossWire/SWORD (`canon_vulg.h`). Usada só para conferência: as tabelas `Catholic`/`Catholic2` não têm mapeamento e há divergências conhecidas entre SWORD e JSword.
* **Camada de exceções por fonte:** as tabelas públicas descrevem versificações *padrão*; cada arquivo local tem particularidades próprias (versículos juntados na Ave-Maria, números repetidos em Matos Soares). Essas particularidades ficam num arquivo de exceções separado, documentado e revisável, sem alterar texto.
* **Conferência automática:** o ETL valida a tabela contra os dados reais (contagem de capítulos/versículos por livro em cada fonte) e lista no relatório todo ponto em que a tabela pública e a fonte local não concordam.
* **Licença das tabelas:** MIT — permite uso, cópia e redistribuição, mantendo o aviso de copyright e da licença junto aos arquivos incorporados.

### 6.3 Versículos juntados (Ave-Maria)
Nos capítulos listados, a Ave-Maria agrupa vários versículos em um único registro (ex.: Js 12,8 contém o texto dos vv. 8–24; Esd 2 tem registro com 1.698 caracteres). O texto **não é dividido**: aplica-se a regra de intervalo da seção 5.A.

---

## 7. Ingestão do Catecismo **[DECIDIDO]**

1. **Ignorar a parte `numero: 0` (Prólogo)** do `catecismo.json`. Os §§1–25 dessa parte estão corrompidos e as demais entradas dela repetem parágrafos existentes nas outras partes.
2. **Repetidos:** os §§1699, 1895, 2217, 2236, 2439 e 2759 aparecem várias vezes com texto idêntico; usa-se uma única ocorrência.
3. **Todos os parágrafos §26–§2865 são exportados** com o texto original.
4. **14 parágrafos cujo texto é apenas nota de rodapé** (112, 113, 114, 164, 179, 827, 936, 937, 1191, 1193, 1486, 1527, 1528, 1531): exportados **com o texto como está** e `"bible_references": []`.
5. **28 parágrafos com bloco de notas vazado no fim** (49, 141, 179, 184, 197, 421, 682, 827, 1065, 1075, 1134, 1209, 1419, 1532, 1666, 1690, 1698, 1876, 1948, 2051, 2082, 2195, 2557, 2565, 2649, 2696, 2758, 2865): `text` exportado **completo**; a extração de referências considera somente o trecho anterior ao primeiro bloco `N. Cf.`.
6. **Cobertura aceita nesta versão:** apenas citações no corpo do texto — 1.301 citações em 804 parágrafos (~28%). As notas de rodapé (4.681 marcadores sem conteúdo na fonte) ficam para versão futura.
7. Os títulos de parte e capítulo da fonte são incluídos em cada parágrafo (seção 5.B), sem alteração.

---

## 8. Parser de Citações Bíblicas no CIC

### 8.1 Escopo
* Somente citações **entre parênteses** no corpo do parágrafo (ex.: `(Mc 2, 17)`), após descartar os blocos de notas (seção 7.5).
* Somente siglas presentes na **whitelist** (seção 9). Isso elimina falsos positivos de fontes patrísticas: `PL`, `PG`, `SC`, `CCL`, `CSEL`, `Sermão`, `Coimbra`, `Funk` etc.
* Correspondência **sensível a maiúsculas** (evita `os`, `is`, `am` minúsculos do texto corrido).

### 8.2 Formatos a suportar

| Formato | Exemplo no CIC | Resultado |
| :--- | :--- | :--- |
| Simples | `Mt 16, 18` | `MAT.16.18` |
| Intervalo | `Mt 6, 9-13` | `MAT.6.9` … `MAT.6.13` |
| Versículos separados por ponto | `Gn 2, 7.22` | `GEN.2.7`, `GEN.2.22` |
| Vários livros com `;` | `Mt 6, 7; 1 Rs 18, 26-29` | duas referências |
| Capítulo encadeado sem repetir o livro | `Mt 1, 20; 2, 13` | `MAT.1.20`, `MAT.2.13` |
| Intervalo entre capítulos | `Gn 1, 1-2, 4` | `GEN.1.1` … `GEN.2.4` (via `books.json`) |
| Sufixo de meio-versículo | `Mt 23, 37a` | `MAT.23.37` |
| Espaçamento irregular da fonte | `Lc 1 , 3 1` / `Lc 24. 25-27` | registrar no relatório; não adivinhar |

* Numeração das citações do CIC: **hebraica** (ex.: `Sl 51, 6` = Miserere) — usa a chave canônica diretamente.
* O regex base da revisão 1 é substituído por um parser em duas fases: (1) localizar citações dentro de parênteses; (2) decompor e expandir cada uma.
* Atenção a `\b` com acentos: em JavaScript usar a flag `u` ou delimitadores explícitos.

### 8.3 Relatório de execução
O ETL gera um relatório em `etl/reports/` (fora de `etl/output/`) com: citações não resolvidas, siglas desconhecidas, referências a versículos inexistentes e contagens por etapa.

---

## 9. Tabela de Livros (USFM) e Siglas Aceitas

Siglas do CIC observadas na fonte (incluir variantes com e sem espaço após o número, ex.: `1 Cor` / `1Cor`). Itens marcados com `*` são esperados mas devem ser confirmados por varredura completa do CIC.

| USFM | Nome padronizado | Siglas no CIC (whitelist) | Testamento |
| :--- | :--- | :--- | :--- |
| GEN | Gênesis | Gn | AT |
| EXO | Êxodo | Ex | AT |
| LEV | Levítico | Lv | AT |
| NUM | Números | Nm | AT |
| DEU | Deuteronômio | Dt | AT |
| JOS | Josué | Js | AT |
| JDG | Juízes | Jz* | AT |
| RUT | Rute | Rt* | AT |
| 1SA | 1 Samuel | 1 Sm | AT |
| 2SA | 2 Samuel | 2 Sm | AT |
| 1KI | 1 Reis | 1 Rs | AT |
| 2KI | 2 Reis | 2 Rs* | AT |
| 1CH | 1 Crônicas | 1 Cr* | AT |
| 2CH | 2 Crônicas | 2 Cr* | AT |
| EZR | Esdras | Esd* | AT |
| NEH | Neemias | Ne* | AT |
| TOB | Tobias | Tb | Deuterocanônico |
| JDT | Judite | Jdt* | Deuterocanônico |
| EST | Ester | Est* | AT |
| 1MA | 1 Macabeus | 1 Mac* | Deuterocanônico |
| 2MA | 2 Macabeus | 2 Mac | Deuterocanônico |
| JOB | Jó | Job | AT |
| PSA | Salmos | Sl | AT |
| PRO | Provérbios | Pr | AT |
| ECC | Eclesiastes | Ecl* | AT |
| SNG | Cântico dos Cânticos | Ct | AT |
| WIS | Sabedoria | Sb | Deuterocanônico |
| SIR | Eclesiástico / Sirácida | Sir | Deuterocanônico |
| ISA | Isaías | Is | AT |
| JER | Jeremias | Jr | AT |
| LAM | Lamentações | Lm* | AT |
| BAR | Baruc | Br* / Ba* | Deuterocanônico |
| EZK | Ezequiel | Ez | AT |
| DAN | Daniel | Dn | AT |
| HOS | Oseias | Os | AT |
| JOL | Joel | Jl | AT |
| AMO | Amós | Am | AT |
| OBA | Abdias | Ab* | AT |
| JON | Jonas | Jn | AT |
| MIC | Miqueias | Mq* | AT |
| NAM | Naum | Na* | AT |
| HAB | Habacuc | Hab* | AT |
| ZEP | Sofonias | Sf | AT |
| HAG | Ageu | Ag* | AT |
| ZEC | Zacarias | Zc | AT |
| MAL | Malaquias | Ml | AT |
| MAT | Mateus | Mt | NT |
| MRK | Marcos | Mc | NT |
| LUK | Lucas | Lc | NT |
| JHN | João | Jo | NT |
| ACT | Atos dos Apóstolos | Act / At* | NT |
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
| PHM | Filêmon | Fm* | NT |
| HEB | Hebreus | Heb | NT |
| JAS | São Tiago | Tg | NT |
| 1PE | 1 São Pedro | 1 Pe | NT |
| 2PE | 2 São Pedro | 2 Pe | NT |
| 1JN | 1 São João | 1 Jo | NT |
| 2JN | 2 São João | 2 Jo* | NT |
| 3JN | 3 São João | 3 Jo* | NT |
| JUD | São Judas | Jd* | NT |
| REV | Apocalipse | Ap | NT |

**Mapeamento das fontes bíblicas para USFM:** feito pela **ordem fixa dos livros** de cada fonte (listas explícitas e conferidas), não por busca de nome — os nomes são ambíguos (ex.: `Jó` × `João`, `Livro de Job (Jó)`). Ordens diferem entre fontes (ex.: Ave-Maria coloca Jó e Salmos antes de 1–2 Macabeus).

---

## 10. Etapas do Pipeline e Estrutura de Saída

```text
[1] Leitura das fontes (sem alterar textos)
    ├── Matos Soares (JSON), Ave-Maria (JSON), CIC (JSON)
    └── Mapeamento de livros para USFM por ordem fixa
[2] Alinhamento de versificação
    └── Aplicar Tabela de Conversão → chave canônica (hebraica) + `ref` quando diferente
[3] Catecismo
    ├── Filtrar Prólogo, deduplicar, identificar blocos de notas
    └── Parser de citações (parênteses + whitelist) e expansão
[4] Cruzamento
    └── Montar catechism_paragraphs por versículo e os índices bidirecionais
[5] Exportação estática
    └── etl/output/ + relatório em etl/reports/
[6] Teste de fidelidade (seção 2.1) — falha a geração se houver divergência
```

```text
etl/output/
├── meta.json                        # schema_version, data de geração
├── translations.json
├── books.json
├── bible/
│   ├── GEN/1.json … 50.json
│   ├── …
│   └── REV/1.json … 22.json
├── catechism/
│   ├── 26.json … 2865.json
│   └── full.json                    # todos os parágrafos consolidados
└── mappings/
    ├── bible_to_cic.json
    └── cic_to_bible.json
```

### 10.1 Estrutura do Projeto ETL **[DECIDIDO]**

```text
etl/
├── package.json
├── tsconfig.json
├── config/
│   ├── sources.json                 # caminhos das fontes locais
│   ├── books.json                   # 73 livros: USFM, nomes, siglas do CIC, ordem por fonte
│   └── versification/
│       ├── org.vrs / vul.vrs / eng.vrs   # cópias do ubsicap/versification_json (MIT, com LICENSE)
│       ├── LICENSE-ubsicap.txt
│       └── exceptions/              # particularidades de cada fonte (seção 6.2)
│           ├── matos_soares.json
│           └── ave_maria.json
├── src/
│   ├── sources/                     # leitores: Matos Soares, Ave-Maria, CIC
│   ├── versification/               # leitura dos .vrs + exceções → chave canônica
│   ├── catechism/                   # filtros (seção 7) e parser de citações (seção 8)
│   ├── build/                       # cruzamento e exportação
│   └── index.ts                     # executa o pipeline completo
├── test/                            # testes (inclui o teste de fidelidade — seção 2.1)
├── reports/                         # relatório de execução (ignorado pelo git)
└── output/                          # JSONs gerados (seção 5)
```

**Tecnologia:**
* **Node.js 24** (instalado: v24.22.1) + **TypeScript**.
* **Testes:** executor nativo `node:test`.
* **Git [DECIDIDO — revisão 6]:** `etl/output/` **é versionado**, sempre igual ao que o ETL gera a partir do commit (conferido por `npm run check:data`), com fim de linha LF fixado no `.gitattributes`; `etl/reports/` não é versionado (fica no `.gitignore`).
* **Execução:** um único comando (ex.: `npm run build:data`) gera `etl/output/` do zero; a pasta é apagada e recriada a cada execução para não sobrar arquivo antigo.
* Leitura de JSON das fontes com `utf-8` e remoção apenas do BOM do *arquivo*, se existir; o conteúdo dos textos nunca é normalizado (sem `normalize()`, sem `trim()`).

---

## 11. Observações e Escopo Futuro

| # | Item | Situação |
| :--- | :--- | :--- |
| 1 | **Direitos autorais** (Ave-Maria, CIC/LEV) | **[CIENTE]** Não impede o desenvolvimento local; responsabilidade do projeto que publicar a base |
| 2 | **Notas de rodapé do CIC** | **[DECIDIDO]** Fora desta versão; planejado para versão futura; exigiria nova fonte (texto do vatican.va indicado em `catecismo.json` → `fonte`) |

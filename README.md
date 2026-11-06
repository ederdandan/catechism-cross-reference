# catechism-cross-reference

ETL local, de execução única, que lê o **Catecismo da Igreja Católica (CIC)** e duas Bíblias católicas em
português (**Matos Soares** e **Ave-Maria**) e gera JSONs estáticos com **referências cruzadas
Bíblia ⇄ Catecismo**. A base gerada é consumida por outro projeto.

A especificação completa, que é a fonte da verdade do projeto, está em
[`docs/spec_do_pipeline_de_etl.md`](docs/spec_do_pipeline_de_etl.md). O estado do trabalho e o que falta
estão em [`docs/implementacoes_futuras.md`](docs/implementacoes_futuras.md).

---

## Sumário

1. [Regra fundamental: fidelidade dos textos](#1-regra-fundamental-fidelidade-dos-textos)
2. [Entrega atual: Catecismo por capítulo bíblico](#2-entrega-atual-catecismo-por-capítulo-bíblico)
3. [Como executar](#3-como-executar)
4. [Fontes de dados](#4-fontes-de-dados)
5. [Como o ETL funciona](#5-como-o-etl-funciona)
6. [Estrutura do projeto](#6-estrutura-do-projeto)
7. [Relatórios](#7-relatórios)
8. [Limitações conhecidas](#8-limitações-conhecidas)
9. [Referências e licenças](#9-referências-e-licenças)

---

## 1. Regra fundamental: fidelidade dos textos

Nenhum versículo ou parágrafo do CIC pode ter **qualquer caractere alterado** na saída. Isso inclui
pontuação, espaços, marcações e caracteres invisíveis como `U+00AD`. O ETL só organiza, alinha e
acrescenta metadados.

Essa regra é garantida em três camadas:

| Camada | O que faz |
|---|---|
| **Leitura estrita** | UTF-8 com `fatal: true`: byte inválido é erro, não vira `�`. Só o BOM do início do arquivo é descartado. O conjunto de chaves de cada registro é conferido. |
| **Guardas estáticos** (`test/static.test.ts`) | Em `src/` são proibidos `trim`, `normalize`, `replace`, `toLowerCase`, `toUpperCase`, `padStart`/`padEnd` etc. O uso legítimo, que nunca é sobre texto da fonte, exige o comentário `// fidelity-ok: <motivo>`. Caracteres invisíveis literais são proibidos em `src/` e `test/`. |
| **Teste de fidelidade** (`test/fidelity/`) | Um verificador **independente**, que não importa nada de `src/`, relê as fontes sozinho. Cada texto da saída tem uma entrada no manifesto de proveniência, e o verificador compara caractere por caractere. Divergência, texto sem proveniência ou caminho inexistente fazem o **build falhar**. |

As fontes ficam em `C:\Users\ederd\estudo\estudoCatolico\` e são **somente leitura**: o ETL nunca
grava nada lá.

---

## 2. Entrega atual: Catecismo por capítulo bíblico

O arquivo `etl/output/catechism_by_chapter.json` (~982 KB) é uma lista, na ordem canônica dos livros e
capítulos, de todo capítulo bíblico citado por pelo menos um parágrafo do CIC (spec, seção 5.E).

```json
[
  {
    "book": "Mateus",
    "abbreviation": "Mt",
    "usfm": "MAT",
    "chapter": 16,
    "catechism_paragraphs": [
      { "paragraph": 153, "text": "Quando Pedro confessa que Jesus é o Cristo, o Filho do Deus vivo, Jesus declara-…" },
      { "paragraph": 424, "text": "Movidos pela graça do Espírito Santo e atraídos pelo Pai, nós cremos e confessam…" }
    ]
  }
]
```

| Campo | Tipo | Descrição |
|---|---|---|
| `book` | string | Nome padronizado do livro (`config/books.json`). Os evangelhos são "Mateus", "Marcos", "Lucas" e "João". |
| `abbreviation` | string | Sigla como o CIC cita: `Mt`, `Lc`, `1 Cor`, `Sl`… |
| `usfm` | string | Código USFM do livro: `MAT`, `LUK`, `1CO`, `PSA`… |
| `chapter` | number | Capítulo na numeração canônica (ver [5.2](#52-versificação-canônica)). |
| `catechism_paragraphs` | array | Parágrafos do CIC que citam o capítulo, únicos e em ordem crescente. |
| `catechism_paragraphs[].paragraph` | number | Número do parágrafo (§26–§2865). |
| `catechism_paragraphs[].text` | string | Texto do parágrafo **exatamente como na fonte**. |

**Números desta versão:**
- 334 capítulos de 50 livros;
- 1.337 citações em 809 parágrafos;
- 1.250 pares capítulo × parágrafo.

O mesmo parágrafo aparece em cada capítulo que ele cita. O §693, por exemplo, aparece em 9.

> **Atenção, consumidor:** como o texto não pode ser alterado, ele traz as imperfeições da fonte:
> - marcadores de nota como `(405)` em 605 parágrafos;
> - o título da seção seguinte grudado no fim de 23 parágrafos (ex.: §455 termina em `ARTIGO 3 «JESUS CRISTO…»`);
> - blocos de notas vazados no fim;
> - hífen invisível `U+00AD`.
>
> Se precisar de texto "limpo" para exibição, faça isso no projeto consumidor.

---

## 3. Como executar

Requisitos: **Node.js ≥ 24**, que executa TypeScript nativamente, sem build. Não há dependências de
runtime; só `typescript` e `@types/node` para a checagem de tipos.

```sh
cd etl
npm install
npm run typecheck    # tsc --noEmit
npm test             # node:test
npm run build:data   # gera output/ e reports/
```

O `build:data` executa quatro etapas:

```
[1] Leitura das fontes + inventário            → reports/inventory.json
[2] Alinhamento de versificação + conferência  → reports/versification.json
[3] Catecismo por referência bíblica           → output/catechism_by_chapter.json
                                                 reports/catechism_citations.json
                                                 reports/provenance.json
[4] Teste de fidelidade sobre output/          → falha (exit 1) se houver divergência
```

A pasta `output/` é apagada e recriada a cada build. `output/` e `reports/` não são versionados.

Os caminhos das fontes ficam em `etl/config/sources.json`.

---

## 4. Fontes de dados

| Fonte | Repositório | Commit usado | Conteúdo |
|---|---|---|---|
| **Matos Soares** | [Dancrf/biblia-db](https://github.com/Dancrf/biblia-db) → `biblia.json` | `c5feeff` (2026-03-14) | Bíblia católica, tradução do Pe. Manuel de Matos Soares (1956). 73 livros, 35.624 registros, com 22 números de versículo repetidos. Numeração da Vulgata. |
| **Ave-Maria** | [fidalgobr/bibliaAveMariaJSON](https://github.com/fidalgobr/bibliaAveMariaJSON) → `bibliaAveMaria.json` | `bb8c7ac` (2024-01-01) | Bíblia Ave-Maria. 73 livros, 35.450 registros. Marcações `*` e `U+00AD` preservadas. Junta versículos em alguns capítulos (ex.: Js 12,8 contém os vv. 8–24). |
| **Catecismo** | [ntwkst/catecismo-da-igreja-catolica](https://github.com/ntwkst/catecismo-da-igreja-catolica) → `catecismo.json` | `97af80f` (2026-08-25) | CIC em português, texto do [vatican.va](https://www.vatican.va/archive/cathechism_po/index_new/prima-pagina-cic_po.html). 2.865 parágrafos em partes e capítulos. |

### Particularidades das fontes (tratadas, nunca corrigidas no texto)

- **CIC, parte `numero: 0` (Prólogo):** os §§1–25 estão corrompidos e as demais entradas repetem
  parágrafos de outras partes. A parte é ignorada.
- **CIC, parágrafos repetidos:** os §§1699, 1895, 2217, 2236, 2439 e 2759 aparecem várias vezes com
  texto idêntico. Usa-se uma ocorrência; o ETL confere que as cópias são iguais.
- **CIC, só nota:** 14 parágrafos cujo texto é apenas nota de rodapé. Não geram citações.
- **CIC, bloco de notas vazado:** 28 parágrafos têm um bloco `N. Cf. …` no fim. As citações só são
  procuradas antes dele.
- **CIC, notas de rodapé:** a fonte traz só o marcador `(N)`, sem o conteúdo. Essas notas não estão
  disponíveis nesta versão.
- **Bíblias:** registros sem letras ficam como estão:
  - Ave-Maria Js 19,12-17 = `"[]"`;
  - Matos Soares 2 Sm 18,25 e Lm 5,5 = `"."`.

A CNBB foi avaliada e **retirada do projeto** (spec, revisão 3): a fonte tinha texto perdido e deslocado.

---

## 5. Como o ETL funciona

### 5.1 Livros e siglas

`etl/config/books.json` lista os 73 livros com:
- USFM, nome padronizado e testamento;
- as siglas aceitas nas citações do CIC (`cic_abbreviations`);
- a **ordem fixa dos livros em cada fonte**.

As fontes são mapeadas para USFM por essa ordem, conferida contra o nome do livro na fonte, e não por
busca de nome. Os nomes são ambíguos: `Jó` × `João`, `Livro de Job (Jó)`.

### 5.2 Versificação canônica

- **Chave canônica:** `USFM.CAPÍTULO.VERSÍCULO`, na **numeração hebraica** (`org.vrs` do Paratext/UBS).
- **Exceções:** Daniel, Ester e Baruc seguem a **numeração católica**, como o CIC cita:
  - Daniel com 14 capítulos, incluindo o Cântico dos três jovens em Dn 3,24-90, Susana = Dn 13 e Bel = Dn 14;
  - Ester com 16 capítulos (Vulgata);
  - Baruc com 6 capítulos (Carta de Jeremias = Br 6).

  Essas regras estão em `etl/config/versification/canonical.json`.
- **Salmos:** o CIC cita na numeração hebraica. Isso foi conferido nos dados: 33 de 33 citações com
  trecho literal comparável batem com a hebraica, e nenhuma com a Vulgata.
- **Tabelas de conversão:** `org.vrs`, `vul.vrs` e `eng.vrs`, copiados de
  [ubsicap/versification_json](https://github.com/ubsicap/versification_json) (commit `0833abd`, MIT).
- **Exceções por tradução:** ficam em `etl/config/versification/exceptions/<traducao>.json`. Cada arquivo
  define a tabela base por livro (`org` | `vul` | `eng` | `canonical`) e regras pontuais:
  - `from`, na numeração da fonte: `c:v`, `c:v-w` ou `c:v#k` (k-ésima ocorrência de um número repetido);
  - `to`, na numeração canônica: `c:v` ou `c:v-w`;
  - `additional`, quando dois registros caem no mesmo versículo.

A versificação só é necessária para exportar o **texto bíblico** alinhado, que ainda está em andamento
(fase F3). O índice por capítulo do Catecismo não depende dela.

### 5.3 Parser de citações do CIC

O parser trabalha em duas fases:
1. localiza os grupos **entre parênteses** no corpo do parágrafo;
2. em cada grupo, reconhece siglas da lista de livros, **sensível a maiúsculas**, seguidas de capítulo e versículos.

| Forma na fonte | Exemplo | Resultado |
|---|---|---|
| Simples | `(Mt 16, 18)` | Mt 16:18 |
| Intervalo | `(Mt 6, 9-13)` | Mt 6:9–13 |
| Versículos separados por ponto ou vírgula | `(Gn 2, 7.22)`, `(1 Jo 4, 8, 16)` | Gn 2:7, 22 · 1 Jo 4:8, 16 |
| Vários livros | `(Mt 6, 7; 1 Rs 18, 26-29)` | duas citações |
| Capítulo encadeado | `(Mt 1, 20; 2, 13)` | Mt 1:20 e Mt 2:13 |
| Meio versículo | `(Mt 23, 37a)` | Mt 23:37 |
| Capítulo inteiro | `(Gn 3)` | Gn 3 |
| Texto antes da sigla | `(«citação»: Jo 1, 14)` | Jo 1:14 |

Ficam de fora fontes patrísticas e outras siglas fora da lista, como `PL`, `PG`, `DS` e `Sermão`.

**Formas irregulares da fonte:** quando o capítulo é inequívoco, a citação é aceita no capítulo e
registrada no relatório; versículos ambíguos não são adivinhados. São 24 casos, por exemplo:
- `I Jo 4, 9`, numeral romano;
- `Jo14, 16-17`, sigla colada no número;
- `Act 4, l2`, letra "l" no lugar de "1";
- `Gn 9, 5-61`, erro de digitação por 5-6.

**Correções de sigla** (`etl/config/catechism.json`): valem só no parágrafo indicado e foram revisadas.

| § | Na fonte | Leitura |
|---|---|---|
| 320 | `He 1, 3` | Hebreus 1, 3 |
| 455 | `1 Co 12, 3` | 1 Coríntios 12, 3 |
| 371 | `Ga 2, 23` | Gênesis 2, 23 (erro tipográfico; o trecho é «osso dos meus ossos») |

---

## 6. Estrutura do projeto

```
catechism-cross-reference/
├── README.md
├── CLAUDE.md                          # regras do projeto para o agente
├── docs/
│   ├── spec_do_pipeline_de_etl.md     # especificação (fonte da verdade)
│   └── implementacoes_futuras.md      # estado atual e pendências
└── etl/
    ├── package.json · tsconfig.json
    ├── config/
    │   ├── sources.json               # caminhos das fontes (somente leitura)
    │   ├── books.json                 # 73 livros, siglas do CIC, ordem por fonte
    │   ├── catechism.json             # parágrafos só nota e correções de sigla
    │   └── versification/
    │       ├── org.vrs · vul.vrs · eng.vrs · LICENSE-ubsicap.txt
    │       ├── canonical.json         # Daniel, Ester e Baruc na numeração católica
    │       └── exceptions/            # matos_soares.json, ave_maria.json
    ├── src/
    │   ├── index.ts                   # build:data (etapas [1]–[4])
    │   ├── config.ts · books.ts
    │   ├── sources/                   # leitores estritos e inventário
    │   ├── versification/             # .vrs, canônico, alinhamento, conferência
    │   └── catechism/                 # filtros, parser de citações, índice por capítulo
    ├── test/
    │   ├── *.test.ts                  # node:test
    │   └── fidelity/                  # verificador de fidelidade independente
    ├── tools/                         # scripts de análise (fora do pipeline)
    ├── output/                        # gerado; não versionado
    └── reports/                       # gerado; não versionado
```

Os scripts de `etl/tools/` estão documentados em `docs/implementacoes_futuras.md`, seção 7.

---

## 7. Relatórios

| Arquivo | Conteúdo |
|---|---|
| `reports/inventory.json` | Contagens por fonte: livros, capítulos, registros, repetidos, vazios, lacunas e repetidos do CIC. |
| `reports/versification.json` | Conferência do alinhamento: tabela × fonte, colisões, fora do canônico, versículos sem texto, suspeitas lexicais. |
| `reports/catechism_citations.json` | Parágrafos lidos, citações, formas irregulares, correções aplicadas e citações não resolvidas. |
| `reports/provenance.json` | Manifesto de proveniência: para cada texto da saída, o registro da fonte (`locator`) e o caminho na saída (`file` + JSON Pointer). |

---

## 8. Limitações conhecidas

- **Notas de rodapé do CIC não entram.** Só o corpo do texto é analisado, o que dá cerca de 28% dos
  parágrafos com citação. Por exemplo, os §§881, 882 e 936 citam Mt 16 apenas em nota. Cobrir as notas
  exige outra fonte, como o texto do vatican.va.
- **Só citações entre parênteses** são reconhecidas; uma menção no texto corrido não é capturada.
- **Granularidade por capítulo** na entrega atual. O nível de versículo, com o texto bíblico das duas
  traduções, depende de terminar a versificação (fase F3).
- **Textos com as imperfeições da fonte** (ver [seção 2](#2-entrega-atual-catecismo-por-capítulo-bíblico)).

---

## 9. Referências e licenças

- **Versificação:** [ubsicap/versification_json](https://github.com/ubsicap/versification_json), licença
  MIT, © 2019 United Bible Societies Institute for Computer Assisted Publishing. Cópia da licença em
  `etl/config/versification/LICENSE-ubsicap.txt`.
- **Catecismo da Igreja Católica:** texto do
  [vatican.va](https://www.vatican.va/archive/cathechism_po/index_new/prima-pagina-cic_po.html), via
  [ntwkst/catecismo-da-igreja-catolica](https://github.com/ntwkst/catecismo-da-igreja-catolica).
  © Libreria Editrice Vaticana.
- **Bíblia Matos Soares:** via [Dancrf/biblia-db](https://github.com/Dancrf/biblia-db).
- **Bíblia Ave-Maria:** via [fidalgobr/bibliaAveMariaJSON](https://github.com/fidalgobr/bibliaAveMariaJSON).
- **USFM:** códigos de livro do padrão
  [Unified Standard Format Markers](https://ubsicap.github.io/usfm/).

> **Direitos autorais** (spec, seção 11): os textos da Ave-Maria e do CIC têm direitos de seus editores.
> Isso não impede o desenvolvimento local; a responsabilidade pelo licenciamento é do projeto que publicar
> a base gerada.

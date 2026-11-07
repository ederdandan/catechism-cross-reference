# Implementações futuras — estado do ETL e o que falta

Registro de 2026-11-06, para retomar o trabalho depois. Fonte da verdade continua sendo
[`spec_do_pipeline_de_etl.md`](spec_do_pipeline_de_etl.md) (revisão 5).

## 0. Entrega atual: Catecismo por capítulo bíblico ✅

Especificada na spec, seção 5.E (revisões 4 e 5).

* **Saída:** `npm run build:data` gera `etl/output/catechism_by_chapter.json` (~1,1 MB).
  * Tem 334 capítulos de 50 livros e 1.337 citações em 809 parágrafos.
  * Cada entrada tem `book`, `abbreviation`, `usfm`, `chapter` e
    `catechism_paragraphs: [{ paragraph, verses, ref, text }]`.
  * O arquivo é versionado no git (spec, revisão 6); `npm run check:data` confere se está em dia.
  * `verses` traz os versículos canônicos citados (`[]` = capítulo inteiro); `ref` é um rótulo gerado,
    como `1 Tm 3, 15`.
  * 12 versículos foram corrigidos (`verse_fixes`): OCR/digitação, §§1693 e 1858, e 2 Mac 12, 46
    convertido da Vulgata. Aprovado pelo usuário em 2026-11-06.
* **Fidelidade:** etapa [3] do build. Os 1.250 textos são comparados com a fonte pelo verificador
  independente, e qualquer divergência interrompe o build.
* **Revisado pelo usuário em 2026-11-06:**
  * correções de sigla (§§320, 455, 371);
  * as 24 formas irregulares aceitas no capítulo;
  * as 12 correções de versículo;
  * a numeração hebraica dos Salmos, conferida nos dados.
* **Código:**
  * `src/catechism/paragraphs.ts`: filtros da seção 7;
  * `src/catechism/citations.ts`: parser da seção 8;
  * `src/catechism/index.ts`: índice e manifesto;
  * `src/versification/`: leitor `.vrs` e numeração canônica;
  * `config/catechism.json`;
  * `test/catechism.test.ts`.
* **Limitações conhecidas** (não são erros):
  * citações só de nota de rodapé ficam de fora, porque a fonte não tem o conteúdo das notas;
  * só valem citações entre parênteses;
  * os textos levam as imperfeições da fonte (marcadores `(N)`, títulos embutidos, notas vazadas,
    `U+00AD`), e o consumidor deve lidar com elas.

Na data deste registro, `npm run typecheck` passa e `npm test` dá 40/40.

`npm run build:data` executa:
1. inventário do Catecismo;
2. índice por capítulo, que grava em `output/`;
3. teste de fidelidade.

## 1. Tratamento das Bíblias: removido desta versão

Na revisão 5 (2026-11-06), o usuário pediu para deixar só o necessário para o índice do Catecismo.
Saíram do código:
* os leitores da Matos Soares e da Ave-Maria;
* o alinhamento de versificação e a conferência (fase F3);
* `vul.vrs`, `eng.vrs` e as exceções por tradução;
* os scripts de análise da F3 em `tools/`.

O índice não depende de nenhum deles. Antes de remover, a saída foi comparada com a da versão anterior
e ficou idêntica byte a byte.

Tudo continua no histórico do git. O commit **`19cc1d7`**, o anterior à remoção nesta mesma branch
`feat/catecismo-por-referencia-biblica`, tem (a `main` também tem as fases F0–F3):
* o código completo das Bíblias;
* este documento com as decisões pendentes da F3:
  * Daniel/Ester/Baruc;
  * Tobias/Judite/Eclesiástico na Vulgata;
  * regras de exceção;
* os números da conferência e o método do gerador de propostas.

Para retomar, basta trazer esses arquivos de volta a partir desse commit.

## 2. Próximos passos possíveis

* **API estática** (branch `feat/api-catecismo`): Hono com geração estática (`toSSG`) publicada no
  GitHub Pages. Proposta feita e aguardando aprovação. Antes de publicar, o usuário precisa confirmar
  os direitos autorais do texto do CIC e que o repositório pode ser público.
* `catechism_by_verse.json`: índice leve versículo → parágrafos, só números (spec 5.C).
* Conferir a numeração das cerca de 30 citações deuterocanônicas restantes (Sb, Eclo, Tb, Dn).
* Conferência automática do trecho «…» citado contra o texto bíblico. Na análise, 717 de 811 citações
  bateram e 94 ficaram como suspeitas. Exige trazer de volta uma fonte bíblica (ver seção 1).
* Notas de rodapé, com uma nova fonte (vatican.va).
* Texto do versículo bíblico na saída, que exige trazer de volta as Bíblias e terminar a F3.

## 3. Ferramenta de apoio (`etl/tools/`)

| Script | Uso | O que faz |
|---|---|---|
| `escape-invisible.cjs` | `node tools/escape-invisible.cjs <arquivos...>` | Troca caracteres invisíveis literais (U+00AD, U+00A0, U+FEFF…) por escapes `\uXXXX` em código e testes. Necessário porque as ferramentas de escrita do agente decodificam esses escapes. **Nunca usar em fontes nem em saída.** |

## 4. Para retomar

* **Branches:**
  * `main` tem as fases F0–F3 parciais (commits `39841c2` e `247526c`);
  * `feat/catecismo-por-referencia-biblica` tem a versão enxuta, só com o Catecismo. O código das
    Bíblias fica no commit anterior, `19cc1d7`;
  * `feat/api-catecismo` foi criada a partir de `19cc1d7` para a API e ainda não tem commits próprios.
* **Passos:**
  1. Ler a spec e este arquivo.
  2. Em `etl/`, rodar `npm install`, `npm run typecheck`, `npm test` e `npm run build:data`.

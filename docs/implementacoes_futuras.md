# Implementações futuras — estado do ETL e o que falta

Registro de 2026-11-06, para retomar o trabalho depois. Fonte da verdade continua sendo
[`spec_do_pipeline_de_etl.md`](spec_do_pipeline_de_etl.md) (revisão 8).

## 0. Entrega atual: Catecismo por capítulo bíblico ✅

Especificada na spec, seção 5.

* **Saída:** `npm run build:data` gera `etl/output/catechism_by_chapter.json` (~1,1 MB).
  * Tem 334 capítulos de 50 livros e 1.337 citações em 809 parágrafos.
  * Cada entrada tem `book`, `abbreviation`, `usfm`, `chapter` e
    `catechism_paragraphs: [{ paragraph, verses, ref, text }]`.
  * O arquivo é versionado no git (spec, seção 6); `npm run check:data` confere se está em dia.
  * `verses` traz os versículos canônicos citados (`[]` = capítulo inteiro); `ref` é um rótulo gerado,
    como `1 Tm 3, 15`.
  * 12 versículos foram corrigidos (`verse_fixes`): OCR/digitação, §§1693 e 1858, e 2 Mac 12, 46
    convertido da Vulgata. Aprovado pelo usuário em 2026-11-06.
* **Fonte:** `catecismo.json` do repositório ntwkst/catecismo-da-igreja-catolica, fixado por commit e
  SHA-256 em `config/sources.json` (spec, seções 3 e 6).
* **Fidelidade:** etapa [3] do build. Os 1.250 textos são comparados com a fonte pelo verificador
  independente, e qualquer divergência interrompe o build.
* **Revisado pelo usuário em 2026-11-06:**
  * correções de sigla (§§320, 455, 371);
  * as 24 formas irregulares aceitas no capítulo;
  * as 12 correções de versículo;
  * a numeração hebraica dos Salmos, conferida nos dados.
* **Código:**
  * `src/sources/`: obtenção da fonte (`fetch.ts`), leitor estrito e inventário;
  * `src/catechism/paragraphs.ts`: filtros da seção 7;
  * `src/catechism/citations.ts`: parser da seção 8;
  * `src/catechism/index.ts`: índice e manifesto;
  * `src/versification/`: leitor `.vrs` e numeração canônica;
  * `config/catechism.json`;
  * `test/catechism.test.ts`.
* **Limitações conhecidas** (não são erros):
  * citações que estão só nas notas de rodapé ficam de fora;
  * só valem citações entre parênteses;
  * os textos levam as imperfeições da fonte (marcadores `(N)`, títulos embutidos, notas vazadas,
    `U+00AD`), e o consumidor deve lidar com elas.

Na data deste registro, `npm run typecheck` passa e `npm test` dá 43/43.

`npm run build:data` executa:
1. obtenção da fonte (commit + SHA-256), leitura e inventário do Catecismo;
2. índice por capítulo, que grava em `output/`;
3. teste de fidelidade.

## 1. Próximos passos possíveis

* `catechism_by_verse.json`: índice leve versículo → parágrafos, só números (spec, seção 11).
* Conferir a numeração das cerca de 30 citações deuterocanônicas restantes (Sb, Eclo, Tb, Dn).
* Notas de rodapé: o conteúdo das notas está nos blocos vazados no fim de 28 parágrafos (spec, seção
  7.5). A análise de 2026-11-06 ligou 97,7% dos marcadores `(N)` à sua nota. A implementação ficou para
  depois.
* Licença de uso: o texto do CIC tem direitos de seu editor e o repositório de origem não declara
  licença (spec, seção 11).

## 2. Ferramenta de apoio (`etl/tools/`)

| Script | Uso | O que faz |
|---|---|---|
| `escape-invisible.cjs` | `node tools/escape-invisible.cjs <arquivos...>` | Troca caracteres invisíveis literais (U+00AD, U+00A0, U+FEFF…) por escapes `\uXXXX` em código e testes. Necessário porque as ferramentas de escrita do agente decodificam esses escapes. **Nunca usar em fontes nem em saída.** |

## 3. Para retomar

1. Ler a spec e este arquivo.
2. Em `etl/`, rodar `npm install`, `npm run typecheck`, `npm test` e `npm run build:data`. A fonte
   é baixada do GitHub (commit fixado em `config/sources.json`) na primeira execução; não depende
   de nenhuma pasta local.

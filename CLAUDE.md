# catechism-cross-reference

ETL que lê o Catecismo da Igreja Católica (CIC) em português, extrai as citações bíblicas do texto e gera um JSON estático com os parágrafos do CIC organizados por livro, capítulo e versículo da Bíblia (`etl/output/catechism_by_chapter.json`). A base gerada é consumida por outro projeto.

**Fonte da verdade:** [`docs/spec_do_pipeline_de_etl.md`](docs/spec_do_pipeline_de_etl.md). Leia antes de qualquer trabalho. Decisões marcadas como **[DECIDIDO]** não devem ser reabertas sem pedido do usuário.

## Regras obrigatórias

1. **Não alterar nem criar nada sem permissão explícita do usuário** — arquivos, pastas, dependências, commits ou push. Leitura e análise são livres; escrita, não. Em caso de dúvida, pergunte.
2. **Fidelidade absoluta dos textos (spec, seção 2):** nenhum parágrafo do CIC pode ter qualquer caractere alterado — nem pontuação, espaços, marcações ou caracteres invisíveis (`U+00AD`). Proibido `trim()`, `normalize()`, substituições ou "limpezas" no texto. O ETL só organiza e acrescenta metadados.
3. **A fonte é o `catecismo.json` do repositório [ntwkst/catecismo-da-igreja-catolica](https://github.com/ntwkst/catecismo-da-igreja-catolica)**, fixada em `etl/config/sources.json` por commit e SHA-256. O ETL baixa para `etl/.cache/` (fora do git); a cópia é somente leitura. Trocar de commit só com pedido do usuário.
4. Toda geração deve passar pelo **teste de fidelidade** (spec, seção 2.1); divergência = falha.

## Projeto

* Código em `etl/` — **Node.js 24 + TypeScript**; testes com `node:test`. Estrutura na spec, seção 10.1.
* Saída em `etl/output/`, **versionada** (todo commit que muda o ETL leva a saída regenerada; conferir com `npm run check:data`); `etl/reports/` não é versionado.
* Numeração canônica **hebraica** (`org.vrs` do Paratext/UBS, `ubsicap/versification_json`, MIT), exceto Daniel, Ester e Baruc (numeração católica, `config/versification/canonical.json`).

## Comunicação

* Responder em **português do Brasil**.
* Apresentar achados com dados verificados; ao descobrir erro em análise anterior, corrigir explicitamente.

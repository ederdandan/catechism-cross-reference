# catechism-cross-reference

ETL que consolida Bíblias católicas em português (Matos Soares e Ave-Maria) e o Catecismo da Igreja Católica (CIC) em JSONs estáticos com referências cruzadas Bíblia ⇄ Catecismo. A base gerada é consumida por outro projeto.

**Fonte da verdade:** [`docs/spec_do_pipeline_de_etl.md`](docs/spec_do_pipeline_de_etl.md). Leia antes de qualquer trabalho. Decisões marcadas como **[DECIDIDO]** não devem ser reabertas sem pedido do usuário.

## Regras obrigatórias

1. **Não alterar nem criar nada sem permissão explícita do usuário** — arquivos, pastas, dependências, commits ou push. Leitura e análise são livres; escrita, não. Em caso de dúvida, pergunte.
2. **Fidelidade absoluta dos textos (spec, seção 2):** nenhum versículo ou parágrafo do CIC pode ter qualquer caractere alterado — nem pontuação, espaços, marcações (ex.: `*`) ou caracteres invisíveis (`U+00AD`). Proibido `trim()`, `normalize()`, substituições ou "limpezas" no texto. O ETL só organiza, alinha e acrescenta metadados.
3. **As fontes em `C:\Users\ederd\estudo\estudoCatolico\` são somente leitura.** Nunca modificar, mover ou extrair nada dentro delas.
4. Toda geração deve passar pelo **teste de fidelidade** (spec, seção 2.1); divergência = falha.

## Projeto

* Código em `etl/` — **Node.js 24 + TypeScript**; testes com `node:test`. Estrutura na spec, seção 10.1.
* Saída em `etl/output/`, **versionada** (todo commit que muda o ETL leva a saída regenerada; conferir com `npm run check:data`); `etl/reports/` não é versionado.
* Chave canônica: numeração **hebraica** (`USFM.CAP.VERS`), exceto Daniel e Ester (numeração católica).
* Tabelas de versificação: Paratext/UBS (`ubsicap/versification_json`, MIT) + exceções por fonte.

## Comunicação

* Responder em **português do Brasil**.
* Apresentar achados com dados verificados; ao descobrir erro em análise anterior, corrigir explicitamente.

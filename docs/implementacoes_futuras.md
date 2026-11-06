# Implementações futuras — estado do ETL e o que falta

Registro de 2026-11-06, para retomar o trabalho depois. Fonte da verdade continua sendo
[`spec_do_pipeline_de_etl.md`](spec_do_pipeline_de_etl.md) (revisão 3).

## 1. Estado atual

| Fase | Conteúdo | Status |
|---|---|---|
| F0 | Estrutura `etl/`, Node 24 + TypeScript (type stripping), `tsc --noEmit`, `node:test` | ✅ concluída |
| F1 | Leitores estritos das fontes (UTF-8 fatal, só o BOM do arquivo removido, conjunto exato de chaves), inventário (`reports/inventory.json`) | ✅ concluída |
| F2 | Verificador de fidelidade independente (`test/fidelity/`, sem importar `src/`) e guardas estáticos | ✅ concluída |
| F3 | Versificação: tabelas Paratext/UBS, canônico, alinhamento, conferência | 🔶 em andamento (código pronto; faltam as regras de exceção) |
| F4 | Catecismo: filtros e parser de citações | ⏳ pendente |
| F5 | Exportação dos JSONs e manifesto de proveniência | ⏳ pendente |
| F6 | Build completo com teste de fidelidade obrigatório | ⏳ pendente |

Na data deste registro, `npm run typecheck` passa e `npm test` dá 44/44.

`npm run build:data` hoje executa só os passos [1] (inventário) e [2] (versificação/conferência,
grava `reports/versification.json`). Ainda não gera nada em `output/`.

## 2. Decisões pendentes (do usuário)

1. **Esquema canônico de Daniel, Ester e Baruc (decisão 2):** sem resposta. O que está em
   `config/versification/canonical.json` é a proposta em uso:
   * DAN com 14 capítulos (3:100, 13:64, 14:42);
   * EST na numeração da Vulgata (VUL83, 16 capítulos);
   * BAR com 6 capítulos (Carta de Jeremias = Bar 6);
   * conversões `from_org`: S3Y → DAN 3:24-90, DAN 3:24-33 → 3:91-100, SUS → DAN 13,
     BEL → DAN 14, LJE → BAR 6.
2. **Tobias, Judite e Eclesiástico na numeração da Vulgata:** proposta ainda não aprovada.
   As duas traduções seguem o Eclesiástico longo da Vulgata (51 capítulos; por exemplo,
   Eclo 1 tem 40 versículos contra 30 no org). Experimento feito com TOB/JDT/SIR = vul.vrs
   (capítulos 1–51 para SIR, porque o vul.vrs tem 52 e nenhuma fonte tem o 52):

   | Tradução | Esquema | Capítulos pendentes | Versículos canônicos sem texto | Fora do canônico |
   |---|---|---|---|---|
   | Matos Soares | org (atual) | 49 | 99 | 273 |
   | Matos Soares | Vulgata | 47 | 86 | 0 |
   | Ave-Maria | org (atual) | 17 | 35 | 273 |
   | Ave-Maria | Vulgata | 13 | 23 | 1 |

   Se for aprovada:
   * acrescentar TOB/JDT/SIR em `canonical.json`;
   * pôr `"canonical"` como base desses livros nos dois arquivos de exceção;
   * registrar o desvio na spec.

   Verificar também se Pr e 1Cr da Matos Soares têm o mesmo padrão.
3. **Revisão das regras de exceção:** o usuário vai revisar ("3 - posso revisar").

## 3. F3 — o que falta

* **Regras de exceção:** preencher `config/versification/exceptions/matos_soares.json` e
  `ave_maria.json`, que hoje têm `"rules": []`. Cada regra precisa de:
  * `note` com a evidência;
  * nível de confiança, para a revisão do usuário.
* **Conferência só com as tabelas base** (antes de qualquer regra):

  | Tradução | Colisões | Fora do canônico | Versículos sem texto | Suspeitas lexicais | Capítulos pendentes |
  |---|---|---|---|---|---|
  | Matos Soares | 61 | 283 | 253 | 767 | 304 |
  | Ave-Maria | 23 | 289 | 423 | 696 | 189 |

* **Fatos já verificados para as regras:**
  * A Ave-Maria junta versículos e renumera em sequência. Exemplos:
    * Js 15: 21 → 21-32, 22 → 33-47, 23 → 48-60, 24 → 61, 25 → 62, 26 → 63;
    * Js 12: 4 → 4-5 e 8 → 9-24;
    * Js 7: 4 → 4-5.
  * O número do versículo seguinte aparece embutido no texto 9 vezes na Ave-Maria e nunca
    na Matos Soares.
  * A Matos Soares pula números de versículo no Eclesiástico (cap. 1 sem 7 e 32; cap. 3 sem 22;
    cap. 4 sem 2 e 7…). Falta ver se o texto está embutido no vizinho (vira regra de versículo
    juntado) ou se falta de fato (fica `null`).
  * Registros sem letras na fonte, mantidos como estão:
    * Ave-Maria JOS 19:12-17 = `"[]"`;
    * Matos Soares 2SA 18:25 e LAM 5:5 = `"."`.
* **Método usado para gerar propostas** (implementado em `etl/tools/propose.mjs` e
  `etl/tools/merge.cjs`; ver a seção 7):
  * Programação dinâmica monótona por capítulo canônico, que alinha os registros da tradução T
    aos versículos canônicos.
  * Pontuação: quanto dos tokens da outra tradução (referência) aparece no registro.
    Parâmetros: JOIN 0,2 · COL 0,4 · GAP 0,02 · KEEP 0,05 · K = 25 · bônus 0,6 por número de
    versículo embutido.
  * Rodar só em capítulos com lacuna ou colisão, porque nos capítulos só lexicais o gerador
    acaba seguindo erros da tradução de referência.
  * Confiança "alta" quando a pontuação nova é ≥ 0,4 e ganha ≥ 0,2 sobre a atual; senão "baixa".
  * Colisões viram regras com `"additional": true`.
  * Não aplicar propostas nos livros cujo esquema canônico está pendente (seção 2), porque o
    gerador colapsa versículos legítimos em colisões sem evidência.
* **Testes:** faltam testes unitários do campo `additional` (colisão declarada vs. colisão real)
  em `test/versification.test.ts`.
* **Critério de saída da F3:** conferência limpa (sem colisões não declaradas, sem fora do canônico
  e sem regras sem uso). Lacunas restantes devem estar justificadas.

## 4. F4 — Catecismo

* Filtrar o Prólogo e os parágrafos repetidos (§§1699, 1895, 2217, 2236, 2439, 2759). Regra
  aprovada: a posição correta é a do vizinho n−1. Relatar §1699 e §2759 no relatório.
* §1698 tem um bloco de notas vazado que não está na lista de 28 da spec: documentar no relatório,
  sem alterar o texto.
* Os títulos de seção vêm embutidos no fim do texto do parágrafo anterior. Isso só se registra:
  o texto não pode ser alterado.
* Parser das citações bíblicas do corpo do CIC → chaves canônicas, usando `cic_abbreviations` de
  `config/books.json`. Variantes já encontradas:
  * `He 1, 3` (§320);
  * `1 Co 12, 3` (§455);
  * erro tipográfico `Ga 2, 23` (§371), que é Gn.
* Confirmar em que numeração o CIC cita Tb/Jt/Eclo e DAN/EST/BAR (depende das decisões da seção 2).

## 5. F5 — Exportação

* JSONs de `output/` conforme a spec, seção 5:
  * `translations` só com `matos_soares` e `ave_maria`, sem campo `cnbb` (revisão 3);
  * campo `ref` mantido.
* Campo `additional: [{ "ref", "text" }]` no objeto da tradução para colisões declaradas.
* `translations.json` sem entrada CNBB.
* Manifesto de proveniência (`source`, `locator`, `field`, `file`, `pointer`) no formato que
  `test/fidelity/verify.ts` já consome.
* **Documentar na spec (pedir permissão):** o campo `additional` (5.A), o `canonical.json` e o
  formato dos arquivos de exceção (`base`, `rules`, `from` `c:v` / `c:v-w` / `c:v#k`, `to`,
  `additional`).

## 6. F6 — Build final

* `build:data` completo: fontes → versificação → catecismo → exportação → verificação de
  fidelidade. Qualquer divergência faz o build falhar (spec, 2.1).
* Relatórios finais em `reports/`.
* Revisar a seção de direitos autorais (spec, 11) antes de publicar a base.

## 7. Ferramentas de apoio (`etl/tools/`)

Scripts de análise usados na F3. Não fazem parte do pipeline nem de `build:data`, e não ficam
sob os guardas estáticos de `src/`/`test/`. Também não estão no `tsconfig`, porque são `.mjs`/`.cjs`.
Só leem as fontes. A única exceção é o `merge.cjs`, que grava nos arquivos de exceção do projeto.
Rodar de dentro de `etl/`.

| Script | Uso | O que faz |
|---|---|---|
| `propose.mjs` | `node tools/propose.mjs <traducao> [USFM ...] > propostas.json` | Gera as propostas de regras (seção 3) e imprime JSON; não grava nada. `ALL=1` inclui capítulos só com suspeita lexical. |
| `merge.cjs` | `node tools/merge.cjs <traducao> propostas.json <referencia>` | **Grava** as propostas em `config/versification/exceptions/<traducao>.json` com `confidence` e `note`. Rodar só com aprovação, e depois `npm run build:data` para conferir. |
| `exp-vulgate-deutero.mjs` | `[BOOKS=TOB,JDT,SIR] node tools/exp-vulgate-deutero.mjs` | Experimento da decisão 2 da seção 2: canônico desses livros = vul.vrs e conferência resultante. Grava só `reports/canonical-exp.json`. |
| `peek.mjs` | `[SRC=ave_maria] [W=90] node tools/peek.mjs "JOS 7:4-5" ...` | Mostra os versículos das fontes como estão (texto cortado em `W` caracteres). |
| `sim.mjs` | `node tools/sim.mjs <A> <B> <USFM> <capA> [capB]` | Similaridade lexical versículo a versículo entre duas traduções; `<<<` marca deslocamento provável. |
| `summ.mjs` | `node tools/summ.mjs reports/versification.json [traducao]` | Resumo por livro das pendências da conferência (lacunas `m`, colisões `c`, lexicais `L@deslocamento`). |
| `escape-invisible.cjs` | `node tools/escape-invisible.cjs <arquivos...>` | Troca caracteres invisíveis literais (U+00AD, U+00A0, U+FEFF…) por escapes `\uXXXX` em código e testes. Necessário porque as ferramentas de escrita do agente decodificam esses escapes. **Nunca usar em fontes nem em saída.** |

Ficaram de fora os scripts exploratórios da CNBB (retirada na revisão 3) e o gerador do
`config/books.json`, que dependia do banco da CNBB. O `books.json` já está versionado.

## 8. Para retomar

* **Branch:** todo o trabalho está na `main` (commits `39841c2` em diante). Nenhum push foi feito.
* **Passos:**
  1. Ler a spec e este arquivo.
  2. Responder às decisões da seção 2.
  3. Em `etl/`, rodar `npm install`, `npm run typecheck`, `npm test` e `npm run build:data`, e
     conferir os números de `reports/versification.json`.
  4. Continuar a F3 pelas regras de exceção: `tools/propose.mjs`, depois revisão, depois
     `tools/merge.cjs`, depois a conferência.

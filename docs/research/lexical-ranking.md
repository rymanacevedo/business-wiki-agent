# Lexical ranking and rank fusion in pure TypeScript

- **Ticket**: [#45 Research: lexical ranking and rank fusion in pure TypeScript](https://github.com/rymanacevedo/business-wiki-agent/issues/45), on map [#42](https://github.com/rymanacevedo/business-wiki-agent/issues/42)
- **Date**: 2026-10-20
- **Question**: how to rank Markdown Page sections lexically in pure TypeScript with no native dependencies, and fuse that ranking with an embedding ranking.
- **Method**: read the Wiki Pages in `fixtures/full` (70 Pages plus `index.md`, `log.md`, `SCHEMA.md`), the current `agent/tools/search_wiki.ts`, and `evals/query/questions.yaml`; read the BM25, BM25+, BM25L and RRF papers and the Lucene, Elasticsearch, Weaviate and Azure docs that implement them; read the npm registry and GitHub sources of six candidate libraries; ran a throwaway BM25 (`/tmp/lexrank/bm25.ts`, about 160 lines, reproduced in the appendix) over the fixture with `bun` for four Queries from `questions.yaml`. Every section-level number below comes from that run.

## 1. What is being ranked

### 1.1 Page shapes (primary source: `fixtures/full`)

`fixtures/full/SCHEMA.md` fixes the layout: `profile.md`, `summaries/<source-id>.md`, `entities/<slug>.md`, `obligations/<due>-<slug>.md`, `expenses/<category>.md`, plus `index.md`, `log.md`, `SCHEMA.md`. Every Page starts with YAML frontmatter (`title`, `kind`, `sources`, `created`, `updated`, `status`, `flags`) and kind-specific keys: an Expense Record's `expense:` block (`vendor`, `date`, `amount`, `document`, `allocations`, `payment.status/due/evidence`), an entity's `entity:`, an Obligation's `obligation`, `due`, `counterparty`, `recurs`, a Ledger's `category:`.

Bodies have these shapes:

| Kind                     | Body shape (observed)                                                                                                                                                                                                                                                                                                    | Example                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Profile                  | `#` title, then `##` sections (`Identity`, `Owner`, `Addresses`, `Licenses, permits, and registrations`, `Insurance`, `Premises lease`, `Banking`, `Tax filings`, `Contracts`), each a run of fact lines `- **Fact**: value (src: id)`; a Contradiction is a fact line plus an indented `  - First recorded:` sub-bullet | `profile.md`                                                                    |
| Obligation               | no or one `#` heading, then five to eight fact lines, no `##`                                                                                                                                                                                                                                                            | `obligations/2026-11-15-insurance-renewal-meridian-mutual-insurance-company.md` |
| Entity                   | a bare capitalised name line, fact lines, then `## Records` or `## Documents` lists of Page links                                                                                                                                                                                                                        | `entities/harbor-hardware-supply.md`                                            |
| Summary / Expense Record | a prose line with a Citation, bullet facts with nested item bullets, sometimes `## Also seen in` (10 Pages), `## Flags` (1), `## Transactions (as stated on the statement)` (2 bank statements), `## Notes` (2)                                                                                                          | `summaries/2026-09-12-invoice-cascade-parts-4471.md`                            |
| Ledger                   | one prose line, then one row per Allocation: `- 2026-09-12 Cascade Appliance Parts: 212.48 [invoice](../summaries/...) (src: ...)`                                                                                                                                                                                       | `expenses/supplies.md`                                                          |

Heading census across the fixture (`grep -rh '^#\{1,4\} ' fixtures/full`): the only `##` headings that repeat are `Also seen in` (10), `Records` (8), `Documents` (3), `Transactions (as stated on the statement)` (2), `Tax filings` (2), `Premises lease` (2, both on the Profile, which carries the heading twice), `Notes` (2). No `###` or deeper heading appears anywhere, so a sectioning rule only needs `#` and `##`.

### 1.2 The tokens a Query needs whole

Values that `evals/query/questions.yaml` lists under `must_include`, or that the Pages carry as identifiers:

- EIN `88-1234567`; filing number `LLC-2024-0731558`; sales-tax registration `ST-24-558201`; permit `BP-2025-0918`; licence `BL-2026-1093`; policy `GL-2025-77410`; invoice numbers `#4471`, `#3381`, `R20931`; receipt `77120`.
- Amounts `$212.48`, `478.07`, `110.64`, `518.02` (a sum the model computes; it is on no Page), `$1,284.00`, `$1,000,000`, `$2,000,000`.
- Dates `2026-11-15`, `2026-12-31`, `2024-10-09` (Pages also spell `October 9, 2024`, `March 1, 2026`, `03/02/2026`).
- Slugs and Source ids: `harbor-hardware-supply`, `cascade-appliance-parts`, `2026-09-12-invoice-cascade-parts-4471`, `2025-11-15-insurance-cert-meridian`; Obligation kinds `insurance-renewal`, `lease-notice`.
- Masked values `***-**-6789`, `****6615`, `****4417` (Masking per `SCHEMA.md`).

Queries are short natural-language questions ("What is our EIN?", "What do we owe Cascade Appliance Parts?", "How much did we spend on supplies in September 2026?"). After stop-word removal they carry one to four content tokens, so a single rare term (an identifier, a vendor name) must be allowed to decide the ranking.

### 1.3 What the current tool does (`agent/tools/search_wiki.ts`)

Splits the Query on `[^\p{L}\p{N}]+`, which turns `88-1234567` into `88` and `1234567` and `212.48` into `212` and `48`; scores a whole Page as `matched terms * 1000 + occurrence count` with no length normalisation, no IDF and no section awareness; scans every Page including `SCHEMA.md`, `index.md` and `log.md` (the map calls these "scaffolding Pages competing with real ones"); returns up to 8 Pages with the first 5 matching lines. The Schema text alone contains most English words a Query would use ("insurance", "renew", "payment", "due"), so it is a frequent false hit.

## 2. Tokeniser

### 2.1 Rule

1. Lowercase. Remove thousands separators: a comma between a digit and a group of three digits (`1,284.00` -> `1284.00`; `1,000,000` -> `1000000`).
2. Tokens are the matches of
   ```
   /\d+(?:\.\d+)?(?:-[\p{L}\p{N}]+)*|[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*/gu
   ```
   a decimal number, or a run of letters and digits, either optionally continued by `-` plus more letters or digits. `-` is the only joiner, and only when both sides are alphanumeric; `.` joins only digit to digit. Everything else (`$`, `#`, `*`, `%`, `(`, `:`, `,`, `/`, `—`, `"`) is a separator. This keeps every identifier, date, slug and Source id in section 1.2 as one token and stops `hardware.md` becoming a token.
3. Drop tokens shorter than 2 characters and a 40-word English stop list that includes `src` (the Citation keyword that appears in every section).
4. Every hyphenated compound also emits its parts (`gl-2025-77410` -> `gl`, `2025`, `77410`), and every compound that starts `YYYY-MM-DD` also emits `YYYY-MM`. This is the spirit of Elasticsearch's `word_delimiter_graph` with `preserve_original`: the whole token is rare (high IDF) and wins exact matches; the parts let `cascade` or `4471` match a Source id and let a month Query match a date.
5. Query side only: `Month YYYY` -> `YYYY-MM` (`September 2026` -> `2026-09`). No stemming, no synonym list.

### 2.2 Tested input -> output (from the run)

| Input (from the fixture)                                        | Tokens                                                                                                                             |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `EIN: 88-1234567`                                               | `ein`, `88-1234567`, `88`, `1234567`                                                                                               |
| `$212.48`                                                       | `212.48`                                                                                                                           |
| `2026-09-12`                                                    | `2026-09-12`, `2026`, `09`, `12`, `2026-09`                                                                                        |
| `Policy GL-2025-77410`                                          | `policy`, `gl-2025-77410`, `gl`, `2025`, `77410`                                                                                   |
| `harbor-hardware-supply`                                        | `harbor-hardware-supply`, `harbor`, `hardware`, `supply`                                                                           |
| `(src: 2026-09-12-invoice-cascade-parts-4471)`                  | `2026-09-12-invoice-cascade-parts-4471`, `2026`, `09`, `12`, `invoice`, `cascade`, `parts`, `4471`, `2026-09`                      |
| `Invoice #4471`                                                 | `invoice`, `4471`                                                                                                                  |
| `***-**-6789`                                                   | `6789`                                                                                                                             |
| `****6615`                                                      | `6615`                                                                                                                             |
| `annual premium $1,284.00`                                      | `annual`, `premium`, `1284.00`                                                                                                     |
| `limits each occurrence $1,000,000`                             | `limits`, `each`, `occurrence`, `1000000`                                                                                          |
| `Tax 8.0% 15.64`                                                | `tax`, `8.0`, `15.64`                                                                                                              |
| `[receipt](../summaries/2026-08-03-receipt-harbor-hardware.md)` | `receipt`, `summaries`, `2026-08-03-receipt-harbor-hardware`, `2026`, `08`, `03`, `receipt`, `harbor`, `hardware`, `md`, `2026-08` |
| `ST-24-558201; effective 2024-11-04`                            | `st-24-558201`, `st`, `24`, `558201`, `effective`, `2024-11-04`, `2024`, `11`, `04`, `2024-11`                                     |
| `Permit No. BP-2025-0918`                                       | `permit`, `no`, `bp-2025-0918`, `bp`, `2025`, `0918`                                                                               |
| `Compressor start relay (univ.) — 18.75 each`                   | `compressor`, `start`, `relay`, `univ`, `18.75`, `each`                                                                            |
| `Harbor Ave Ste 210, Portside`                                  | `harbor`, `ave`, `ste`, `210`, `portside`                                                                                          |
| `Net 30; Due: 2026-10-12`                                       | `net`, `30`, `due`, `2026-10-12`, `2026`, `10`, `12`, `2026-10`                                                                    |

Known limits: `Sam's` -> `sam`, `s` (dropped); `03/02/2026` stays three tokens (`03`, `02`, `2026`) because that Page wrote a US-style date, which the Schema discourages; `October 9, 2024` is not normalised on the Page side (see Open questions). The masked SSN becomes `6789`, which only ever matches the masked line itself, so Masking is unaffected.

## 3. Sectioning rule

Unit of ranking: the **section**, keyed `path#n`. Rule, in order:

1. Split frontmatter from body with `splitPage` from `packages/page-edits/lib/frontmatter.ts` (first line `---`, up to the next `---`). Do not run the YAML parser on the search path; the frontmatter lines are scanned as text.
2. Frontmatter becomes **fact lines folded into section 0**: for each of `title`, `kind`, `status`, `flags`, `entity`, `obligation`, `due`, `counterparty`, `category`, `recurs`, `superseded_by`, `done_on`, `sources`, and the scalar `expense.*` and `payment.*` keys, emit `key: value` when the value is not `[]` or `null`. `created` and `updated` are skipped (Ingest dates, never asked for). This makes `obligation: insurance-renewal`, `due: 2026-11-15`, `vendor: cascade-appliance-parts`, `amount: 212.48`, `document: 4471` searchable even when the body does not repeat them.
3. A leading `# Title` line before any content is the Page heading, not a section boundary. Every `## Heading` starts a new section; the heading text is indexed with the section. `###` never occurs; if it does, it stays inside its `##` parent.
4. Every section's indexed text is **Page title + heading + its lines**. Repeating the title (the "header metadata" idea in section 6) is what lets `## Also seen in` on the Harbor Hardware receipt match "Harbor Hardware".
5. Fact lines are never split: a `- **Fact**: ...` line and its indented continuation (`  - First recorded: ...`, nested item bullets) stay in one section. The fact line is the **excerpt unit**: a hit returns the section's best-matching line(s), as `search_wiki` does today with `MAX_LINES`.
6. Oversize guard: a section over 300 tokens is split at the fact-line boundary nearest its midpoint, repeating title and heading on both halves. In the fixture this fires once (the 2026-09-30 bank statement's `## Transactions`, 360 tokens).
7. Scaffolding is excluded from the lexical index: `index.md` (the model has already read it), `log.md`, `SCHEMA.md`. Sources are never indexed (map: "Sources stay outside retrieval").

Measured on `fixtures/full` with this rule: 70 Pages -> **108 sections**; tokens per section (after parts expansion) min 5, p25 37, median 82, p75 145, p90 194, max 360, mean 99; 2 sections under 20 tokens (entity Pages with a single line); vocabulary 919 distinct tokens.

## 4. BM25 for sections of 20 to 300 tokens

### 4.1 What the sources say

- **Formula.** `score(D,Q) = Σ IDF(q) · f(q,D)(k1+1) / (f(q,D) + k1(1 − b + b·|D|/avgdl))` ([Wikipedia, Okapi BM25](https://en.wikipedia.org/wiki/Okapi_BM25)). Robertson and Zaragoza, _The Probabilistic Relevance Framework: BM25 and Beyond_ (2009, [PDF](http://www.staff.city.ac.uk/~sbrp622/papers/foundations_bm25_review.pdf)), eq. 3.12: `B = (1 − b) + b·dl/avdl`, "setting b = 1 will perform full document-length normalisation, while b = 0 will switch normalisation off"; on `k1`: "any one term's contribution to the document score cannot exceed a saturation point". Section 3.5: "values such as 0.5 < b < 0.8 and 1.2 < k1 < 2 are reasonably good in many circumstances. However, there is also evidence that optimal values do depend on other factors (such as the type of documents or queries)". The `(k1 + 1)` numerator "does not affect the ranking produced".
- **IDF form.** The Robertson-Spärck Jones IDF `log((N − n + 0.5)/(n + 0.5))` goes negative when `n > N/2`; for a one-term Query on such a term it "ranks all documents not containing that term higher than those that do" (Trotman, Puurula, Burgess, _Improvements to BM25 and Language Models Examined_, ADCS 2014, [PDF](https://andrewtrotman.github.io/papers/2014-2.pdf)). Lucene's `BM25Similarity` uses `log(1 + (docCount − docFreq + 0.5)/(docFreq + 0.5))`, defaults `k1 = 1.2, b = 0.75`, and rejects `b` outside `[0, 1]` ([javadoc](https://lucene.apache.org/core/9_9_0/core/org/apache/lucene/search/similarities/BM25Similarity.html)). In this Wiki `2026` is in 88 of 108 sections, so the `1 +` form is needed to keep year tokens from subtracting.
- **BM25+** (Lv and Zhai, CIKM 2011, DOI 10.1145/2063576.2063584, paywalled; restated by Trotman 2014 and Wikipedia): adds a constant `δ` inside the IDF-weighted bracket so that "a single occurrence of a search term contributes at least a constant amount" however long the document; "they suggest that a δ value of 1 is effective across collections". Motivation: "the component of term frequency normalization by document length is not lower-bounded properly" so very long documents are over-penalised ([abstract](https://api.semanticscholar.org/graph/v1/paper/DOI:10.1145/2063576.2063584?fields=title,abstract)).
- **BM25L** (Lv and Zhai, SIGIR 2011, DOI 10.1145/2009916.2010070, paywalled; via Trotman 2014): adds `δ` to the length-normalised term frequency `c_td = tf / (1 − b + b·L_d/L_avg)` before saturation; "the best value for δ was 0.5 in all their experiments".
- **Do variants matter?** Trotman 2014 compared nine functions (BM25, BM25+, BM25L, BM25-adpt, ...) and found "once trained ... there is very little difference in performance between these functions" and "no clear evidence that any one of the ranking functions is systematically better than the others"; tuned values on INEX 2009 were BM25 `b = 0.3, k1 = 1.1`, BM25L `b = 0.3, k1 = 1.8, δ = 0.6`, BM25+ `b = 0.3, k1 = 1.6, δ = 0.7`, all within 0.004 MAP. Robertson and Zaragoza give no explicit rule for uniform-length corpora; it follows from eq. 3.12 that when `dl ≈ avdl`, `B ≈ 1` for every `b`, so `b` only acts on the spread of lengths.
- **One rare term dominating.** BM25 is a plain sum with no coverage factor (Robertson and Zaragoza: "the full document score is obtained by summing these term-weights"). Each term's contribution is bounded by `IDF · (k1 + 1)`, so the ceiling scales with IDF: in this Wiki `88-1234567` (IDF 3.44) can contribute 16 times what `2026` (0.21) can. That is the behaviour wanted: a Query containing an EIN, policy number or amount should be decided by that token.

**Parameters proposed for 20 to 300 token sections:** `k1 = 1.2` (saturation matters because Citations repeat the Source id and vendor on every fact line, inflating `tf`), `b = 0.5` (the low end of the Robertson-Zaragoza range, between Trotman's tuned 0.3 and Lucene's 0.75; see 4.2 for why), `δ = 0` (plain BM25; BM25+ was designed for long documents, which the 300-token split rule removes), Lucene IDF. Expose all three as options so the eval loop can tune them.

### 4.2 What the fixture run showed

Setup: Lucene-form IDF `ln(1 + (N - n + 0.5)/(n + 0.5))`, section as document, `avgdl` 99. IDF of the identifier tokens is high and flat: `88-1234567` 3.44 (in 3 sections), `gl-2025-77410` 3.19, `212.48` 2.99, `cascade` 2.99; `2026` is 0.21 (88 of 108 sections) and `portside` 0.92, so date years and the town add almost nothing, which is right.

| Query (from `questions.yaml`)                          | Query tokens                                         | `k1=1.2 b=0.75` top 4 (score)                                                                                                     | `k1=1.2 b=0.5` top 4 (score)                                                                                       |
| ------------------------------------------------------ | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| What is our EIN?                                       | `ein`                                                | ein-letter summary `#0` 5.28; IRS entity `## Documents` 5.01; ein-letter `## Tax filings` 4.73; **profile.md `## Identity` 4.51** | ein-letter `#0` 5.29; IRS `## Documents` 4.71; **profile.md `## Identity` 4.69**; ein-letter `## Tax filings` 4.33 |
| When does our insurance renew, and who is the insurer? | `insurance`, `renew`, `insurer`                      | Meridian entity 8.74; 2025 certificate 6.78; 2026 certificate 6.68; **insurance-renewal Obligation 4.27**                         | same order: 8.25, 7.10, 7.04, 4.29                                                                                 |
| What do we owe Cascade Appliance Parts?                | `owe`, `cascade`, `appliance`, `parts`               | pay-invoice Obligation 13.49; Cascade entity 13.45; **invoice 4471 13.13**; invoice 4472 13.10                                    | Cascade entity 13.60; **invoice 4471 13.50**; invoice 4472 13.46; Obligation 13.42                                 |
| How much did we spend on supplies in September 2026?   | `much`, `spend`, `supplies`, `2026-09`, `2026`, `09` | **expenses/supplies.md 8.79**; bank statement `## Transactions` 3.43; Harbor Hardware Aug receipt 3.42; Freshway receipt 3.38     | **supplies Ledger 9.11**; then 3.64, 3.50, 3.43                                                                    |

Readings:

- Every Query's cited target (`profile.md`, `obligations/2026-11-15-`, `2026-09-12-invoice-cascade-parts-4471`, `expenses/supplies.md`) is in the lexical top 4; the Cascade and supplies targets are top 1 or 2. Without the `YYYY-MM` expansion the supplies Query still ranked the Ledger first, but only through `supplies` and the near-useless `2026`; with it the margin over the runner-up grows from 2.5 to 5.4 points.
- `b` matters for the Profile. Its `## Identity` section is about 180 tokens against a mean of 99, so at `b = 0.75` it loses to the 60-token ein-letter summary. At `b = 0.5` it moves from 4th to 3rd; at `b = 0.3` (first run) to 2nd. Sections vary 5 to 360 tokens, so some normalisation is still wanted; `b = 0.5` is the compromise tested.
- BM25+ with `delta = 1` (first run) lifted the sales-tax `license-renewal` Obligation to 4th for the insurance Query because `renew` appears once in it: with one- to four-token Queries, `delta` adds `idf * delta` for mere presence and flattens the term-frequency signal. `delta = 0.5` (MiniSearch's default `d`) changed no ordering versus `delta = 0` in any of the four Queries. Use `delta = 0`, or at most 0.5.
- `renew` does not match `renewal`; `insurer` matches because the certificate summaries say "Insurer". No stemmer is proposed (an English stemmer would also mangle slugs and identifiers unless guarded); the embedding ranker and the Obligation's folded frontmatter fact `obligation: insurance-renewal` cover the gap.
- Ties are near: the four Cascade sections sit within 0.4 points. Section-to-Page collapse (section 8) decides the order that matters, with a deterministic tiebreak on path.

## 5. Reciprocal Rank Fusion

### 5.1 What the sources say

- **Formula and k.** Cormack, Clarke and Büttcher, _Reciprocal Rank Fusion outperforms Condorcet and individual Rank Learning Methods_, SIGIR 2009 ([PDF](http://cormack.uwaterloo.ca/cormacksigir09-rrf.pdf)): `RRFscore(d) = Σ_r 1/(k + r(d))`, "where k = 60 was fixed during a pilot investigation and not altered during subsequent validation"; "while highly-ranked documents are more important, the importance of lower-ranked documents does not vanish as it would were, say, an exponential function used. The constant k mitigates the impact of high rankings by outlier systems"; "four pilot experiments ... indicated that k = 60 was near-optimal, but that the choice was not critical".
- **Missing from one list.** The paper defines each ranking as a permutation of all documents and does not treat truncated lists. The practical convention is Elasticsearch's pseudocode: `if d in result(q): score += 1.0 / (k + rank(result(q), d))`, i.e. an absent document contributes nothing from that list; `rank_constant` defaults to 60 and "higher value means lower-ranked documents carry more weight"; `rank_window_size` (how many results each retriever contributes) defaults to `size` ([Elasticsearch RRF](https://www.elastic.co/guide/en/elasticsearch/reference/current/rrf.html)). OpenSearch uses the same formula, `rank_constant` default 60, range `[1, 10000]` ([score-ranker processor](https://docs.opensearch.org/latest/search-plugins/search-pipelines/score-ranker-processor/)).
- **One ranker.** With a single list `RRF(d) = 1/(k + r(d))` is strictly decreasing in rank, so the order is the input order for every `k > 0`. Elasticsearch requires "a minimum of two child retrievers" and documents no single-retriever path, so a degraded (lexical-only) call must bypass the fusion step rather than call it with one list; the result is identical either way, but the eval report should label which rung answered (map, "Not yet specified").
- **Weighted RRF.** Azure AI Search multiplies each query's reciprocal-rank score by a per-query `weight` (default 1.0; "a weight of 0.5, the score is reduced ... 2.0, the score becomes a larger factor") and notes each query contributes "a maximum of approximately 1/k" ([hybrid-search-ranking](https://learn.microsoft.com/en-us/azure/search/hybrid-search-ranking)). OpenSearch takes `weights` in `[0, 1]` summing to 1. Weaviate offers `rankedFusion` (`1/(rank + 60)` summed) and `relativeScoreFusion` (min-max scaled scores summed) behind an `alpha` (default 0.75 toward vector), and made `relativeScoreFusion` the default from v1.24 ([search operators](https://docs.weaviate.io/weaviate/api/graphql/search-operators), [hybrid](https://docs.weaviate.io/weaviate/search/hybrid)).

**Parameters proposed:** `k = 60`, each ranker contributing its top 20 sections (the Wiki has 108; 20 is a fifth and bounds the embedding work), equal weights at first. A weight is one multiplication per list, so expose `weights?: number[]` and leave it at `[1, 1]` until the before-and-after evals say otherwise.

### 5.2 Measured

With the lexical list for the Cascade Query as the only input, RRF at `k = 60` returned the identical order (`order preserved? true`). With a fake second list (a 4-item "embedding" ranking that omitted invoice 4471), the fused top 5 at `k = 60` was Obligation 0.0325, invoice 4472 0.0320, Cascade entity 0.0320, Eastside invoice 0.0303, invoice 4471 0.0159: the item missing from one list fell from 3rd to 5th because it collected `1/(60+3)` from one list only. At `k = 10` the same order held with wider gaps. For this Wiki (108 sections, candidate lists of 10 to 20), `k` between 10 and 60 does not change the order of these examples; `k = 60` is kept as the documented convention.

## 6. How other tools do section-level search

- **Obsidian** addresses sections and blocks (`[[Page#Heading]]`, nested `[[Page#H2#H3]]`, `[[Page#^blockid]]`, ids limited to "Latin letters, numbers, and dashes") ([Links](https://obsidian.md/help/links)) and its core search has `section:` ("Find matches in the same section (text between two headings)") and `block:` operators, but sorts only by file name or time: it filters, it does not rank ([Search](https://obsidian.md/help/plugins/search)). Section as the unit of proximity and heading as the address are the parts worth copying; the lack of ranking is what this module adds.
- **Dendron** indexes `title` and `body` with Fuse.js (`useExtendedSearch`, `ignoreLocation`, `ignoreFieldNorm: true`, `distance: 15`), keywords match in any order, ties sort by `updated` ([FuseEngine.ts](https://raw.githubusercontent.com/dendronhq/dendron/master/packages/common-all/src/FuseEngine.ts), [docs](https://wiki.dendron.so/notes/a7c3a810-28c8-4b47-96a6-8156b1524af3)). Whole-note fuzzy matching; no sectioning.
- **Foam** relies on VS Code quick-open and search, supports `[[note#Section]]` and `^block` anchors, and its "Foam Queries" filter by tag, link, path and properties with no relevance score ([wikilinks](https://raw.githubusercontent.com/foambubble/foam/main/docs/user/features/wikilinks.md), [block anchors](https://raw.githubusercontent.com/foambubble/foam/main/docs/user/features/block-anchors.md), [queries](https://raw.githubusercontent.com/foambubble/foam/main/docs/user/features/foam-queries.md)).
- **Karpathy's LLM wiki** ([gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)): "When answering a query, the LLM reads the index first to find relevant pages, then drills into them", which "works surprisingly well at moderate scale (~100 sources, ~hundreds of pages)" and "avoids the need for embedding-based RAG infrastructure"; "A search engine over the wiki pages is the most obvious one ... at small scale the index file is enough ... as the wiki grows you want proper search", pointing at a "local search engine for markdown files with hybrid BM25/vector search and LLM re-ranking". This matches the map's standing decision: `read_index` first, retrieval as the second rung.
- **Heading splitters.** LangChain's `MarkdownHeaderTextSplitter` splits on a configured set of header levels, attaches the header hierarchy as metadata (`{'Header 1': 'Foo', 'Header 2': 'Bar'}`), strips the headers from chunk text by default (`strip_headers=False` keeps them), and expects a second size-based splitter inside each group ([docs](https://docs.langchain.com/oss/python/integrations/splitters/markdown_header_metadata_splitter)). LlamaIndex's `MarkdownNodeParser` splits on `^(#+)\s(.*)`, skips fenced code, keeps a header stack and records `header_path` (ancestors joined by `/`) on each node ([source](https://raw.githubusercontent.com/run-llama/llama_index/main/llama-index-core/llama_index/core/node_parser/file/markdown.py)). The sectioning rule in section 3 is the same shape with two Wiki-specific additions: frontmatter facts folded into section 0, and fact lines as the never-split excerpt unit.

## 7. Libraries versus hand-rolled

Registry facts from `npm view <pkg> --json` and the published tarballs on 2026-10-20; repository facts from the GitHub API on the same day. "Keeps tokens" means the default tokeniser leaves `88-1234567`, `$212.48`, `GL-2025-77410`, `2026-09-12`, `harbor-hardware-supply` whole.

|                             | minisearch 7.2.0                                               | @orama/orama 3.1.18                                                      | lunr 2.3.9                                                                                               | wink-bm25-text-search 3.1.2                                       | flexsearch 0.8.212                                                                                             | fuse.js 7.5.0                                                | Hand-rolled                          |
| --------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------ |
| Licence                     | MIT                                                            | Apache-2.0                                                               | MIT                                                                                                      | MIT                                                               | Apache-2.0                                                                                                     | Apache-2.0                                                   | repo's                               |
| Last publish / last commit  | 2025-09-16 / 2025-09-16                                        | 2025-12-19 / 2026-07-03                                                  | 2020-08-19 / 2020-08-19                                                                                  | 2022-11-21 / 2022-11-21                                           | 2025-09-06 / 2026-05-29                                                                                        | 2026-07-13 / 2026-08-09                                      | n/a                                  |
| Unpacked size; runtime deps | 827 kB; none                                                   | 2.19 MB (4 build targets); none, `node >= 20`                            | 976 kB (ships tests, site); none                                                                         | 109 kB; 4 (wink-nlp + 3.8 MB English model)                       | 2.33 MB; none                                                                                                  | 417 kB; none                                                 | about 120 lines, see below           |
| Ranking                     | BM25+ (`k 1.2, b 0.7, d 0.5`)                                  | BM25+ (`k 1.2, b 0.75, d 0.5`), per query                                | classic BM25 (`k1 1.2, b 0.75`), scores frozen at build                                                  | BM25F-style, doc-level length norm, additive IDF constant `k = 1` | positional "resolution" score, no IDF, no length norm                                                          | Bitap fuzzy; token mode adds IDF weighting, no tf saturation | BM25 with chosen IDF, `k1`, `b`, `δ` |
| Default tokeniser           | split `/[\n\r\p{Z}\p{P}]+/u`: splits `-` and `.`; keeps `$212` | split `/[^A-Za-zàèéìòóù0-9_'-]+/`: **keeps hyphens**, splits `.` and `$` | `/[\s\-]+/` then trimmer, stop words, stemmer: `harbor-hardware-supply` -> `harbor`, `hardwar`, `suppli` | none: the caller's `definePrepTasks` is the tokeniser             | `/[^\p{L}\p{N}]+/u` plus `numeric: true` chunks digits into triplets (`88-1234567` -> `88`, `123`, `456`, `7`) | match `/[\p{L}\p{M}\p{N}_]+/gu`: splits `-`, `.`, `$`        | section 2 rule                       |
| Custom tokeniser            | `tokenize(text, field)` at index and search time               | `components.tokenizer` object with `tokenize(raw, lang, prop)`           | global `lunr.tokenizer.separator` or `builder.tokenizer`                                                 | required                                                          | `Encoder({split, numeric:false, dedupe:false})` or `encode` fn                                                 | `tokenize: RegExp                                            | fn` (token mode)                     | yes |
| Field boost / length norm   | per-field boost, doc boost, per-field avg length               | per-property boost, per-property avg length                              | field and doc boost at build, per-field avg length                                                       | mandatory `fldWeights`, doc-level norm                            | per-field boost, no length norm                                                                                | key `weight`, `fieldNormWeight`                              | per-section, title repeated          |
| Types                       | bundled `.d.ts`, TS source                                     | bundled per build, TS source                                             | `@types/lunr` only                                                                                       | none                                                              | hand-written `index.d.ts`, JS source                                                                           | bundled, TS source                                           | TS                                   |
| Native / Node-only          | none; needs ES2018 Unicode regex                               | none; `process.hrtime` guarded; bun supported                            | none                                                                                                     | pure JS; README asks for Node 16 or 18                            | none; guarded `require("worker_threads")`                                                                      | none                                                         | none                                 |
| Open issues / stars         | 10 / 6.2k                                                      | 18 / 10.6k                                                               | 105 / 9.2k                                                                                               | 0 / 74                                                            | 29 / 13.8k                                                                                                     | 2 / 20.5k                                                    | n/a                                  |

Sources: [minisearch `src/MiniSearch.ts`](https://github.com/lucaong/minisearch/blob/master/src/MiniSearch.ts) (`defaultBM25params = { k: 1.2, b: 0.7, d: 0.5 }`, score `idf * (d + tf(k+1)/(tf + k(1 − b + b·len/avg)))`, `SPACE_OR_PUNCTUATION = /[\n\r\p{Z}\p{P}]+/u`); [orama `components/algorithms.js`](https://github.com/oramasearch/orama) (identical BM25+ formula; english splitter in `tokenizer/languages.js`); [lunr `lib/builder.js`](https://github.com/olivernn/lunr.js) (`this._b = 0.75; this._k1 = 1.2`, `lunr.tokenizer.separator = /[\s\-]+/`); [wink `src/wink-bm25-text-search.js`](https://github.com/winkjs/wink-bm25-text-search) (`idf = log((N − n + 0.5)/(n + 0.5) + k)`, "consolidation can be carried out only once"); [flexsearch `src/encoder.js` and `doc/encoder.md`](https://github.com/nextapps-de/flexsearch) ("A resolution of 1 will disable scoring"); [fuse `dist/fuse.mjs`](https://github.com/krisk/Fuse) (`DEFAULT_TOKEN = /[\p{L}\p{M}\p{N}_]+/gu`, Bitap).

Reading the table against the brief ("pure TypeScript, no new runtime services, a package under `packages/` tested at its interface"):

- **fuse.js** and **flexsearch** are out: neither is a probabilistic ranker, and flexsearch's default encoder chops digit runs into triplets.
- **wink-bm25-text-search** is out: no releases since 2022, no types, and it drags wink-nlp plus a 3.8 MB model in as runtime dependencies for a tokeniser we would replace anyway.
- **lunr** is out: no release since 2020, 105 open issues, stems by default (so slugs become `hardwar`), and the index is immutable after build, which fights a Wiki that changes on every Ingest.
- **minisearch** and **orama** are both credible: zero dependencies, BM25+ with configurable `k`, `b`, `d`, custom tokenisers, TypeScript. Orama's default tokeniser already keeps hyphens. Both would still need: the section splitter (section 3), the parts expansion and Query normalisation (section 2), the Lucene IDF (both have it), RRF (neither has it; Orama has its own hybrid search tied to its own vector store), and the Page collapse. That is, the library would supply about 40 of the 120 lines, and would bring 0.8 to 2.2 MB of package for them, plus a second scoring vocabulary (MiniSearch's `boostDocument`, `fuzzy`, `prefix`, `combineWith`) that the tool text must then not expose.
- **Hand-rolled** BM25 over an in-memory `Map<term, Map<sectionId, tf>>` is about 40 lines (the appendix's class is 35), the tokeniser 20, the sectioner 40, RRF 8, collapse 10. It has no dependency to pin beside Eve 0.80.1, runs identically in bun tests, Node 24 and Vercel functions, and the whole scoring path is readable in one file, which is what makes the before-and-after evals explainable. The index is rebuilt per Query from the store's `list` and `read` (108 sections; the whole throwaway run, including bun start-up, reading 73 files, sectioning, indexing and twelve ranked searches, took 27 ms wall clock under `time`), so there is nothing to persist and no Blob operation is spent (ADR-0001's 2,000 advanced operations a month).

## 8. Recommendation

Hand-roll it, as one private file of the Retrieval package (`packages/retrieval/lib/lexical.ts`, about 120 lines), with these fixed decisions:

1. **Unit**: the section of section 3, keyed `path#n`, frontmatter facts folded into section 0, title and heading repeated into every section's text, fact lines never split, 300-token overflow split at a fact-line boundary, `index.md`, `log.md`, `SCHEMA.md` and `sources/` excluded.
2. **Tokeniser**: section 2 (hyphen-joined compounds, decimal numbers, thousands separators removed, parts and `YYYY-MM` emitted, 40 stop words including `src`, Query-side `Month YYYY` -> `YYYY-MM`). No stemmer. The same function tokenises Pages and Queries.
3. **Ranker**: BM25 with Lucene IDF, `k1 = 1.2`, `b = 0.5`, `δ = 0`, exposed as options; the index is rebuilt from the store on each call (no persistence, no Blob writes).
4. **Fusion**: RRF with `k = 60` over each ranker's top 20 sections, absent sections contributing 0, equal weights. When the embedding adapter is degraded, return the lexical order directly and label the rung `lexical`; do not call fusion with one list.
5. **Collapse**: section scores to Pages by max fused score, ties broken by path; the Page carries its best section's heading and its best fact lines as the excerpt. The Neighbourhood expansion (the map's next ticket) starts from these Pages.
6. **Tests at the interface**: the four Queries in 4.2 as fixture tests asserting the cited Page is in the top 3 (`profile.md` for the EIN, `obligations/2026-11-15-` for insurance, `summaries/2026-09-12-invoice-cascade-parts-4471.md` for Cascade, `expenses/supplies.md` for supplies), plus the 18-row tokeniser table in 2.2 as a snapshot.

Sketch (types and error handling elided; the appendix has the runnable version this condenses):

```ts
// packages/retrieval/lib/lexical.ts
const TOKEN =
  /\d+(?:\.\d+)?(?:-[\p{L}\p{N}]+)*|[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*/gu;
const STOP = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "by",
  "do",
  "for",
  "from",
  "how",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "our",
  "src",
  "the",
  "to",
  "we",
  "what",
  "when",
  "who",
  "with",
]);

export function tokenise(text: string): string[] {
  const out: string[] = [];
  for (const [tok] of text
    .toLowerCase()
    .replace(/(?<=\d),(?=\d{3}\b)/g, "")
    .matchAll(TOKEN)) {
    if (tok.length < 2 || STOP.has(tok)) continue;
    out.push(tok);
    if (tok.includes("-")) {
      out.push(...tok.split("-").filter((p) => p.length >= 2 && !STOP.has(p)));
      const ym = /^(\d{4}-\d{2})-\d{2}/.exec(tok);
      if (ym) out.push(ym[1]);
    }
  }
  return out;
}

export type Section = {
  id: string;
  path: string;
  heading: string;
  lines: string[];
  text: string;
};

export function sectionise(path: string, page: string): Section[] {
  /* section 3; uses splitPage from page-edits */
}

export type Bm25Options = { k1?: number; b?: number; delta?: number };

export function rankLexical(
  sections: Section[],
  query: string,
  { k1 = 1.2, b = 0.5, delta = 0 }: Bm25Options = {}
) {
  const docs = sections.map((s) => ({ s, tf: counts(tokenise(s.text)) }));
  const avgdl = docs.reduce((n, d) => n + d.tf.total, 0) / docs.length;
  const df = new Map<string, number>();
  for (const d of docs)
    for (const t of d.tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const idf = (t: string) =>
    Math.log(
      1 + (docs.length - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5)
    );
  const terms = [...new Set(tokenise(normaliseQuery(query)))];
  return docs
    .map((d) => ({
      id: d.s.id,
      score: terms.reduce((sum, t) => {
        const f = d.tf.get(t) ?? 0;
        if (!f) return sum;
        return (
          sum +
          idf(t) *
            ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.tf.total) / avgdl)) +
              delta)
        );
      }, 0),
    }))
    .filter((h) => h.score > 0)
    .sort((x, y) => y.score - x.score || x.id.localeCompare(y.id));
}

/** Reciprocal Rank Fusion (Cormack et al. 2009), k = 60; a section absent from a list scores 0 there. */
export function fuse(
  lists: string[][],
  k = 60,
  weights = lists.map(() => 1)
): { id: string; score: number }[] {
  const scores = new Map<string, number>();
  lists.forEach((list, i) =>
    list.forEach((id, rank) =>
      scores.set(id, (scores.get(id) ?? 0) + weights[i] / (k + rank + 1))
    )
  );
  return [...scores]
    .map(([id, score]) => ({ id, score }))
    .sort((x, y) => y.score - x.score || x.id.localeCompare(y.id));
}
```

`search_wiki` then becomes: list and read the Pages (excluding `sources/` and the three scaffolding Pages), `sectionise` each, `rankLexical` for the lexical list, the embedding adapter's list if it is live, `fuse` or pass through, collapse to Pages, return the top 8 Pages with up to 5 best fact lines each: the same output contract the tool has today, so the eval rows need no change.

## 9. Open questions

- **Page-side date spelling.** Pages write `October 9, 2024`, `March 1, 2026` and once `03/02/2026`; the Query normaliser only handles `Month YYYY`. Either extend the tokeniser to emit `YYYY-MM-DD` and `YYYY-MM` for `Month D, YYYY` on the Page side (about 6 lines, same `MONTHS` table), or leave it to the embedding ranker and to the Schema's "absolute dates" rule. The eval rows accept both spellings, so this only affects ranking, not grading.
- **Kind prior.** For "What is our EIN?" the Profile is the cited target but ranks 3rd lexically behind the ein-letter summary and the IRS entity. A small multiplicative boost for `kind: profile` and `kind: obligation` sections (Established Facts) would fix it; so might the embedding list or the Neighbourhood step (the summary links to the Profile). Decide after the baseline eval, not before.
- **`b` and `δ` tuning.** `b = 0.5, δ = 0` is the tested compromise on 108 sections. The eval loop should try `b ∈ {0.3, 0.5, 0.75}` once the module exists; Trotman 2014 suggests the differences will be small.
- **Stemming or not.** `renew` misses `renewal`; `supplies` misses `supply`. A guarded light stemmer (strip `-s`, `-al`, `-ing` on alphabetic tokens of 5+ letters only, never on hyphenated compounds or digits) is cheap but adds a second place the ranking can surprise. Prefer to measure the embedding ranker first.
- **Rebuild per Query versus cache.** Rebuilding the index from the store on each `search_wiki` call is simplest and costs one `list` plus one `read` per Page. On Vercel Blob that is 70 reads per Query, which are not "advanced operations" under ADR-0001 but are not free either; if Query evals show latency, cache the sections keyed by the store's etag in module scope (the Blob cap research on the map owns this).
- **Section ids across edits.** `path#n` changes when a heading is inserted above. Fine for the per-Query rebuild; if sections are ever persisted for embeddings, key them by `path#heading-slug` plus a content hash instead.
- **Lint's flag searches.** Whether Lint should use this ranker or the existing frontmatter scan is the seam ticket's question; nothing here forces either.

## Appendix: the throwaway script

`/tmp/lexrank/bm25.ts`, run as `bun /tmp/lexrank/bm25.ts fixtures/full`. Not committed; the scoring and splitting parts are reproduced here so the numbers above can be regenerated. The driver (file walk, printing, the fake embedding list for the RRF check) is omitted.

```ts
const STOP = new Set(
  "a an and are as at be by do does did for from how in is it its of on or our the to was we what when which who whom why with you your src".split(
    " "
  )
);
const MONTHS =
  "january february march april may june july august september october november december".split(
    " "
  );
export function normaliseQuery(q: string): string {
  return q.replace(
    new RegExp(`\\b(${MONTHS.join("|")})\\s+(\\d{4})\\b`, "gi"),
    (_, m, y) =>
      `${y}-${String(MONTHS.indexOf(m.toLowerCase()) + 1).padStart(2, "0")}`
  );
}
const TOKEN =
  /\d+(?:\.\d+)?(?:-[\p{L}\p{N}]+)*|[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*/gu;
export function tokenise(text: string, { parts = true } = {}): string[] {
  const norm = text.toLowerCase().replace(/(?<=\d),(?=\d{3}\b)/g, "");
  const out: string[] = [];
  for (const m of norm.matchAll(TOKEN)) {
    const tok = m[0];
    if (tok.length < 2 || STOP.has(tok)) continue;
    out.push(tok);
    if (parts && tok.includes("-")) {
      for (const p of tok.split("-"))
        if (p.length >= 2 && !STOP.has(p)) out.push(p);
      const ym = /^(\d{4}-\d{2})-\d{2}/.exec(tok);
      if (ym) out.push(ym[1]);
    }
  }
  return out;
}

type Section = {
  id: string;
  page: string;
  heading: string;
  text: string;
  lines: string[];
};
const FM_KEYS =
  /^(title|kind|status|flags|entity|obligation|due|counterparty|category|recurs|superseded_by|done_on|sources):\s*(.*)$/;
const FM_EXPENSE =
  /^\s+(vendor|date|amount|document|status|due|evidence):\s*(.*)$/;
export function sectionise(path: string, page: string): Section[] {
  const { frontmatter, body } = splitPage(page); // page-edits/lib/frontmatter.ts
  const title =
    frontmatter
      .find((l) => l.startsWith("title:"))
      ?.slice(6)
      .trim() ?? path;
  const fmFacts: string[] = [];
  for (const l of frontmatter) {
    const m = FM_KEYS.exec(l) ?? FM_EXPENSE.exec(l);
    if (m && m[2] && m[2] !== "[]" && m[2] !== "null")
      fmFacts.push(`${m[1]}: ${m[2]}`);
  }
  const sections: Section[] = [];
  let heading = "";
  let buf: string[] = [];
  const flush = () => {
    const content = buf.filter((l) => l.trim());
    if (content.length === 0 && sections.length > 0) {
      buf = [];
      return;
    }
    const extra = sections.length === 0 ? fmFacts : [];
    sections.push({
      id: `${path}#${sections.length}`,
      page: path,
      heading,
      text: [title, heading, ...extra, ...content].join("\n"),
      lines: content,
    });
    buf = [];
  };
  for (const line of body) {
    if (/^##? /.test(line)) {
      if (
        line.startsWith("# ") &&
        sections.length === 0 &&
        buf.every((l) => !l.trim())
      ) {
        heading = line.slice(2);
        continue;
      }
      flush();
      heading = line.replace(/^#+ /, "");
      continue;
    }
    buf.push(line);
  }
  flush();
  return sections;
}

type Params = { k1: number; b: number; delta: number };
class BM25 {
  N = 0;
  avgdl = 0;
  df = new Map<string, number>();
  docs: { sec: Section; tf: Map<string, number>; len: number }[] = [];
  constructor(sections: Section[]) {
    for (const sec of sections) {
      const toks = tokenise(sec.text);
      const tf = new Map<string, number>();
      for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
      for (const t of tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
      this.docs.push({ sec, tf, len: toks.length });
    }
    this.N = this.docs.length;
    this.avgdl = this.docs.reduce((s, d) => s + d.len, 0) / this.N;
  }
  idf(t: string) {
    const n = this.df.get(t) ?? 0;
    return Math.log(1 + (this.N - n + 0.5) / (n + 0.5));
  }
  search(query: string, p: Params) {
    const q = [...new Set(tokenise(normaliseQuery(query)))];
    const hits: {
      id: string;
      score: number;
      matched: string[];
      sec: Section;
    }[] = [];
    for (const d of this.docs) {
      let score = 0;
      const matched: string[] = [];
      for (const t of q) {
        const f = d.tf.get(t) ?? 0;
        if (!f) continue;
        matched.push(t);
        const norm = f + p.k1 * (1 - p.b + (p.b * d.len) / this.avgdl);
        score += this.idf(t) * ((f * (p.k1 + 1)) / norm + p.delta);
      }
      if (score > 0) hits.push({ id: d.sec.id, score, matched, sec: d.sec });
    }
    return hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  }
}

function rrf(lists: string[][], k = 60) {
  const s = new Map<string, number>();
  for (const list of lists)
    list.forEach((id, i) => s.set(id, (s.get(id) ?? 0) + 1 / (k + i + 1)));
  return [...s.entries()].sort((a, b) => b[1] - a[1]);
}
```

Driver settings that produced the numbers in sections 2 to 5: scaffolding set `{index.md, log.md, SCHEMA.md}` skipped; parameter sets `{k1 1.2, b 0.75, δ 0}`, `{1.2, 0.5, 0}`, `{1.2, 0.5, 0.5}` (and `{1.2, 0.75, 1}`, `{1.2, 0.3, 0}` in a first run without the `YYYY-MM` expansion); RRF checked with the Cascade lexical list alone and with a fabricated 4-item second list `[lex[3], lex[0], "entities/cascade-appliance-parts.md#0", lex[7]]`.

# Prototype: the retrieval result as the model sees it

Throwaway. Answers [wayfinder ticket #47](https://github.com/rymanacevedo/business-wiki-agent/issues/47)
on map [#42](https://github.com/rymanacevedo/business-wiki-agent/issues/42). Never merged.

Run from this branch: `bun scripts/prototype-retrieval-result.ts [--debug] [--matrix] ["query" ...]`.
Options: `--excerpt all|facts`, `--links page|section`, `--no-pad`, `--neighbours count|weighted`,
`--floor <n>`, `--match-floor <fraction>`, `--kind <kind>`, `--fixture <name>`.

Captured runs over `fixtures/full`:

- `run-first-cut.txt`: the first cut, excerpts from every line including frontmatter, Page-level Links, no padding.
- `run-46-rules.txt`: the #46 ordering with fact-line excerpts, section-scoped forward Links, padding.
- `run-weighted-floors.txt`: degree-weighted Neighbourhood, floor 0.2, Match floor a third of the top score.
- `run-matrix.txt`: the Neighbourhood under five configurations for eight Queries.

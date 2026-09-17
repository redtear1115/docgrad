# docgrad scorecard — docgrad @ 56f0334 · 2026-09-17

> Graduation scorecard. `loop` (measure only, no `--judge`) found every `measure` row meeting its
> target before the first round, so no round ran and no history row was written; this page is
> written from that final measure output. It replaces the 1.x five-dimension scorecard of
> 2026-07-26 (round 9), which `report` still shows as history from `.docgrad/history.jsonl`.

## Measure
measure_hash dd15ca3f · corpus_hash 71d1ce84 · docgrad 1.9.2 · full corpus (13 files, ~75,155 tokens)

| Signal | Value | Verdict | Line | accept | meets_target |
|---|---|---|---|---|---|
| `dead_link_ratio` | 0 (0/250), `bad_anchors` 0 | OK | OK = 0% | OK | true |
| `orphan_ratio` | 0 (0/13) | OK | OK ≤ 5% | OK | true |
| `reachable_ratio` | 1 | OK | OK ≥ 95% | OK | true |
| `index_present` | 1 (`README.md`) | OK | OK = 1 | OK | true |
| `date_coverage` | 1 (13/13) | OK | OK ≥ 90% | OK | true |
| `key_doc_age` | 0 days | OK | OK ≤ 60 days (`stale_after_days`) | OK | true |
| `date_drift` | 0 days (0 mismatches) | OK | OK < 30 days | OK | true |
| `entry_cost` | 2,651 tokens | OK | OK ≤ 5,000 tok (`entry_cost_tiers[2]`) | OK | true |
| `pollution` | 0 | OK | OK < 10% (`pollution_max`) | OK | true |
| `undocumented_dirs` | 0 | OK | OK = 0 | OK | true |
| `drifted_dirs` | 0 | OK | OK = 0 | OK | true |

**11 of 11 rows meet target.** `targets` is empty, so every row is held to the default OK; no signal
accepts WATCH.

- **Freshness — date concentration:** coverage is 100%, but 12 of 13 dated files (0.92) carry
  `2026-09-17`. That is the v2.0.0 documentation sweep (#103–#108) touching nearly every document on
  one day, not a backfill — but either way the date signal cannot currently say which document has
  gone unmaintained. It regains its discriminating power as the files are next edited apart.
- **Economy:** fixed cost 2,651 tokens (`skills/docgrad/SKILL.md`); pollution 0 (`exclude: []`);
  out of scope 0 files / 0 tokens; untracked 0 — corpus matches the commit. Thresholds are the
  shipped defaults (`customised: false`).
- `improve`/`loop` act on this block only — see
  [improve.md](../skills/docgrad/reference/improve.md#stop-conditions-loop-any-one-of-them-ends-it) §Stop conditions;
  judge stars are not an input.

## Judge — not comparable across rounds
judge not run this round — no judged-dimension table

## Token economy (report-only)
- Fixed cost: ~2,651 tokens (entry_files: `skills/docgrad/SKILL.md`) — already counted in economy
- Marginal cost (`scenarios`):
  - `skills/docgrad/scripts/lib.mjs`: ~68,088 tokens, max_depth 2 hops, fan_in 9, code_pointer yes,
    churn_commits 25 — **the scenario that taxes the most**: the most-changed file, anchored from nine
    documents, so an agent touching it is pointed at almost the whole corpus
  - `skills/docgrad/scripts/links.mjs`: ~43,774 tokens, max_depth 1 hop, fan_in 5, code_pointer yes,
    churn_commits 13
- Pollution surface: 0% (`exclude: []`) — already counted in economy
- Thresholds in force: shipped defaults
- Out of scope (not charged to the pollution surface): 0 files / 0 tokens
- Untracked files in the corpus: 0 — corpus matches the commit
- Interpretation: the entry file is small (3.5% of the corpus) and routes to reference files by
  command, so the fixed tax is low; the cost sits on the marginal side, where `lib.mjs` is referenced
  by `rubric.md`, `measure.md`, `CONTRIBUTING.md`, `how-to.md`, `design.md` and more. That is the
  expected shape for a tool whose one shared library is described from several angles; the lever, if
  it ever matters, is pointing those mentions at one section rather than trimming the entry file.

### Traceability (report-only)
- code_pointer_ratio: not computed — `src_dirs` (`skills/docgrad/scripts/`) has no first-level
  subdirectory (6 loose files), so `retrieval.mjs` derived no areas. Both scenario files do point back
  to documentation (`code_pointer: true`).
- index_hotness: ratio 1.91 (index `README.md` 21 commits/90d against a median of 11; top5:
  `docs/design.md` 49, `docs/how-to.md` 27, `README.md` 21, `reference/improve.md` 19,
  `reference/rubric.md` 18) — below the ~3 level that would suggest the index is absorbing content.
- Files with long structure.rules / low anchored ratio: none (one rule line in the corpus,
  `reference/init.md`, 122 chars, anchored).

## Graduation gate
`.docgrad/graduation/docs-gate.mjs` and `docs-gate.yml` have been produced, **not installed** — no
workflow references them (this repo has no `.github/`). Run it by hand with
`DOCGRAD_DIR=. node .docgrad/graduation/docs-gate.mjs --root .`; today it is green, with every threshold
pinned to the numbers above (see `.docgrad/graduation/README.md`).

## Suggested next steps
**Measure rows not meeting target first:** none — all 11 rows meet target.

1. Install the gate (copy the `.mjs` to `.github/scripts/` and the `.yml` to `.github/workflows/`),
   or deliberately decide not to; until then it only guards anyone who runs it by hand.
2. Decide how tight to keep two pinned thresholds before they bite: `max_entry_cost_tokens: 2651`
   fails on any growth of `SKILL.md` (the shipped OK line is 5,000), and `min_freshness_coverage: 1`
   fails on the first document added without `Last updated:`.
3. For stars, run `/docgrad judge` — this loop did not rate anything.

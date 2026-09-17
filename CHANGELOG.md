# Changelog

Version authority is `version` in [.claude-plugin/plugin.json](.claude-plugin/plugin.json); this file records changes per version.
For version-number semantics (semver, docgrad-specific) see [docs/how-to.md](docs/how-to.md) §Cut a release.

## Unreleased

### v2.0.0 epoch 1 — the fingerprints speak in two layers

v2 separates **`measure`** — the five scripts' deterministic output, reproducible, fit to gate CI —
from **`judge`**, the model's stars, which are not. The evidence for the split is measured: the first
`--runs 5` eval distribution had the rating each case exists to pin identical in all five runs of all
three cases, while judge votes over those same unchanging ratings ran `2/3 1/3 3/3 0/3 3/3` (#69,
#79).

This epoch does **one** thing: it renames the fingerprints into that vocabulary.

- `thresholds_hash` → **`measure_hash`**
- `judgement_hash` → **`judge_hash`**

**Both digest the same inputs in the same order, so neither value moved** — `ec596daf` and
`c40cc974` on this repo, either side of the change, pinned as literals in the test suite. A rename
that quietly changed a digest would otherwise look exactly like one that did not.

**`rubric_hash` does move**, from **`1bd26aa6` to `28b8b7fc`**, and the reason is
circular in a way worth stating: the move is caused by the §Version history entry that discloses it.
`reference/rubric.md` is hashed whole, so recording a break inside it *is* a break. `judge_hash`,
`measure_hash` and `corpus_hash` are unmoved.

**Not in this epoch**, and named so the intermediate state is not mistaken for an oversight:

- `reference/audit.md` is **not** split yet, and `judge_hash` still covers it — so a judge-side
  fingerprint still covers measure-side instructions. The split, and the repoint, are the next epoch.
- No ★ anchor changed. The retirement of linkage/freshness/economy's star anchors — the actual
  semantic change behind the major — is the next epoch too.
- `history.jsonl` rows written before this carry the old field names, and nothing rewrites them.
  `report` will need to map them; until it does, one ruler under two names reads as two rulers (#82).
- `reference/improve.md` still tells a round to copy `docgrad_version` "straight from" a block whose
  key is `version` (#90), and its example row still mixes live fingerprint values with fictional ones
  (#89). Both pre-date this epoch; both are tracked.

### v2.0.0 epoch 2a — `reference/audit.md` splits into `measure.md` + `judge.md`

**This section supersedes epoch 1's "neither value moved" and "not split yet."** The split named as
"the next epoch" above has happened: `reference/audit.md` (480 lines) is split along one line — steps
that run scripts go to **`measure.md`** (steps 1, 8, 8b), steps that rate go to **`judge.md`** (steps
2–7, 9, and §Scoped audit). No semantic change: no anchor, threshold, target, command, or output
format moved. `reference/audit.md` stays as a thin router and the `audit` command itself is
unchanged. `lib.mjs`'s `JUDGE_FILES` repoints from `['reference/audit.md', 'reference/placement.md']`
to `['reference/judge.md', 'reference/placement.md']`.

- **`judge_hash` moves, from `c40cc974` (epoch 1's pinned value) to `742bdf54`.** This is a
  **false break**: the file judge_hash covers moved from audit.md to judge.md, but no rating rule
  changed.
- **`measure_hash` stays `ec596daf`** — it is config-only in this epoch; whether a measure-side
  fingerprint should also cover `measure.md` is decided in epoch 2b.
- **`corpus_hash` stays `71d1ce84`** — `.docgrad.yml` is untouched.
- **`rubric_hash` moves, from `28b8b7fc` to `e2fab513`**, because of the new
  `reference/rubric.md` §Version history entry (v2.0.0, E2a) and the audit.md → judge.md/measure.md
  reference updates it required.
- **Rule-1 waiver, deliberate and disclosed:** `judge_hash` moves twice within 2.0.0 — once in
  this epoch because its coverage changed (audit.md → judge.md, no rule changed: a false break), and
  once in epoch 2b because rules change. The two moves cannot be told apart from the hash alone. Treat
  every 1.x → 2.0 pair of rounds as a break, whatever the hashes say. This is acceptable only because
  2.0.0 is a major release, and the release procedure already requires a major release to state
  restart-from-baseline. CONTRIBUTING.md rule 1 ("do not change what a hash covers in the same release
  as a change it would have revealed") is waived for 2.0.0, and this is the disclosure.

### v2.0.0 epoch 2b-1 — the scripts emit measure verdicts (OK/WATCH/FAIL), and `measure_hash` covers the rules

**This section supersedes epoch 2a's "measure_hash stays config-only."** `links.mjs`, `freshness.mjs`,
`inventory.mjs` and `coverage.mjs` each gain a top-level `measure` array: one row per mechanical
signal, each carrying its raw value (with `numerator`/`denominator` when it is a ratio), an
`OK`/`WATCH`/`FAIL` verdict, the boundary line that decided it, and the rubric.md anchor it was read
from. `retrieval.mjs` stays report-only and carries none. No star anchor, no judge rule, and no
improve/loop rule changed in this epoch — the star anchors and these verdict lines coexist; the
anchors retire in a later epoch. See [reference/measure.md](skills/docgrad/reference/measure.md)
§Verdict lines for the full band table.

- **`measure_hash` moves, from `ec596daf` to `ae3014b1`.** Its inputs grow: alongside the same three
  config values as before (`economy.entry_cost_tiers`, `economy.pollution_max`,
  `freshness.stale_after_days`), it now also covers `lib.mjs › MEASURE_BANDS` (the band table,
  unresolved) and `reference/measure.md`'s content. Every verdict-deciding rule lives in that band
  table as plain data — including a row's `scope` (whether it is nulled under a scoped run) and a
  row's secondary OK condition, where one exists (`dead_link_ratio`'s `ok_also`) — precisely so a
  change to any of them moves this hash the same way a threshold edit does.
- **`judge_hash` is unchanged, `742bdf54`.** `judge.md` and `placement.md` are untouched in this
  epoch.
- **`corpus_hash` is unchanged, `71d1ce84`.** `.docgrad.yml` is untouched.
- **`rubric_hash` moves, from `e2fab513` to `de7f3203`**, because of the new
  `reference/rubric.md` §Version history entry (v2.0.0, E2b-1) and a cleanup within the epoch 2a
  entry above it: two parenthetical internal plan-review labels are replaced with their meaning in
  words, no semantic change.
- **The 2.0.0 rule-1 waiver (recorded above, epoch 2a) also covers this move**, with the same
  disclosure: every 1.x → 2.0 pair of rounds is treated as a break regardless of which hash reveals
  it, because 2.0.0 is a major release.
- `measureHash`'s signature changes to `measureHash(config, skillRoot = SKILL_ROOT)`, matching
  `judgeHash`'s parameter order (config first). It still returns `null`, never throws, when `config`
  is `null` or when `reference/measure.md` cannot be read.
- **Fixed: a ratio row's verdict is decided on the unrounded division, not the rounded `value` it
  reports.** `dead_link_ratio`, `orphan_ratio`, `date_coverage` and `reachable_ratio` used to compare
  the four-decimal `value` against the OK/FAIL lines, so a ratio that rounds exactly onto a boundary
  without actually clearing it (51/1019 orphans rounds to 0.0500, the ★4 "orphans ≤5%" line, while
  the true ratio is 0.050049…) read as OK. They now evaluate the raw numerator/denominator; the
  reported `value` is unchanged.

### v2.0.0 epoch 4a — history rows carry schema 2

`.docgrad/history.jsonl` rows written by `improve`/`loop` now carry `"schema": 2` and a nested
`docgrad` object — the fingerprint block copied **verbatim** from `inventory.mjs`'s output, so its
version key is `version`, not the old top-level `docgrad_version`. `report` (SKILL.md's `report` row)
now tells the two shapes apart instead of reading a schema-2 row's fields as "unknown":

- **`docgrad_version` → `docgrad.version`.** The five comparability fields (`version`, `rubric_hash`,
  `measure_hash`, `judge_hash`, `corpus_hash`) travel together as one object, written whole every
  round even when nothing moved.
- **Legacy handling.** A row with no `schema` is a 1.x row: it is shown in its own "1.x rounds"
  block, never joined to a schema-2 row, and the four legacy break rules (rubric fingerprint, corpus
  fingerprint, measure fingerprint under its old or new name, judge fingerprint under its old or new
  name) and the five-dimension note apply inside that block. The rubric and corpus rules and the
  five-dimension note are the old `report` wording; the measure and judge fingerprint rules were
  previously stated only in improve.md, and reading them under either name is the old→new name
  mapping that the v2.0.0 epoch 1 entry in rubric.md §Version history said `report` would need. A
  field missing from a legacy row is still read as unknown and still draws no break.
- **New break rules for schema-2 rows.** A schema-2 row missing its `docgrad` object, its `measure`
  object, or any of `docgrad`'s five required keys is no longer silently "unknown" — `report` prints
  it as a spec violation, one line per row, and excludes that row as a comparison baseline. Among
  rows that are not violations: the measure trend breaks on `docgrad.measure_hash` or
  `docgrad.corpus_hash`; the judge series (optional to draw, always labelled "not comparable across
  rounds") breaks on `docgrad.judge_hash` or `docgrad.rubric_hash`; a `null` value is a value, not a
  violation, and compares equal only to `null`. No overall score is ever computed.
- **improve.md:141**'s citation of "judge.md step 4" is fixed to "judge.md step 3 (boundary rules)" —
  judge.md's top-level step 4 does not carry the boundary rules and would have dangled once a later
  epoch removes it.
- Resolves the two gaps epoch 1 left open above: improve.md's `docgrad_version` instruction (#90)
  and its example row mixing live and fictional fingerprints (#89, now `<…>` placeholders).
- Closes #87, #88, #89, #90.

**No fingerprint moves.** `improve.md`, `SKILL.md`, `CONTRIBUTING.md`, `docs/design.md` and
`inventory.mjs`'s comments are not inputs to any hash: `rubric_hash`/`measure_hash`/`judge_hash`/
`corpus_hash` are `de7f3203`/`ae3014b1`/`742bdf54`/`71d1ce84`, identical before and after this epoch.

### v2.0.0 epoch 2b-2 — linkage, freshness and economy stop being rated; `rubric.md` is judge-only

**This section supersedes epoch 2b-1's "the star anchors and these verdict lines coexist."** That
intermediate state is over: `rubric.md` §Freshness, §Linkage, §Economy and §Token economy report are
now stubs with no `★`, pointing at [reference/measure.md](skills/docgrad/reference/measure.md)'s new
§Freshness notes / §Linkage notes / §Economy notes / §Token economy signals sections. `judge.md`'s
former steps 4/5 (Freshness / Linkage) and 7 (Economy) move into `measure.md`, keeping their step
numbers; `judge.md` now rates only completeness, correctness and consistency, and step 9's Dimension
table drops the Freshness/Linkage/Economy rows (a new `## Measure` block, holding one line per
`measure` item, is inserted above it instead). The retired ★1–★5 tables, the two "Scope of ★5" notes,
the pollution downgrade rule and the dimension-order clause are preserved verbatim in `rubric.md`'s
new §Version history entry, "v2.0.0 (E2b-2)", for reading pre-2.0 `history.jsonl` rows. No ★1–★5
threshold moved for the three dimensions that remain judged (completeness, correctness, consistency).

**The per-dimension legacy mapping, for reading pre-2.0 rows only**: ★4 or ★5 → `OK`, ★3 → `WATCH`,
★1 or ★2 → `FAIL`. Approximate, not a new rule — offered only as a reading aid; the retired anchors
in rubric.md §Version history are the ruler.

**The freshness ★4 "isolated mismatches" exception has no measure successor.** The retired ★4 anchor
read "only isolated mismatches, drift <30 days" — two conditions, one of which (`date_drift`) is
measured today. The "isolated" clause never had a count attached to it in the rubric, so a pre-2.0
★4 freshness score may have rested on a judgement call this repo no longer makes at all.

**The key-document narrowing is disclosed, not a new rule.** Since E2b-1, `key_doc_age` measures
`entry_files` ∪ `index_file` only — narrower than rubric.md's pre-2.0 "key documents" (which also
included each area's authoritative document). Area-authority staleness is no longer a separate
signal at all; where it matters, a stale authoritative document fails claims under **correctness**,
which is an existing, unchanged judge rule (see [placement.md](skills/docgrad/reference/placement.md)).

- **`judge_hash` moves, from `742bdf54` to `e8881920`.** This is a real rule removal: steps 4/5 and 7
  leave `judge.md`, and the Dimension table in step 9 drops three rows.
- **`measure_hash` moves, from `ae3014b1` to `38724510`.** `measure.md` grows the four new sections
  and gains judge.md's former steps 4/5 and 7; `lib.mjs › MEASURE_BANDS[*].source` strings are
  reworded to cite the now-retired anchors (e.g. `retired rubric.md Linkage ★4 "zero dead links" /
  ★2 "2–10%" (see rubric.md §Version history, v2.0.0)`).
- **`rubric_hash` moves, from `de7f3203` to `bd6e9480`**, because of the new §Version history entry
  and the rewording of §Freshness/§Linkage/§Economy/§Token economy report into stubs.
- **`corpus_hash` is unchanged, `71d1ce84`.** `.docgrad.yml` is untouched.
- **The 2.0.0 rule-1 waiver (recorded above, epoch 2a) also covers this move**, with the same
  disclosure: every 1.x → 2.0 pair of rounds is treated as a break regardless of which hash reveals
  it, because 2.0.0 is a major release.

**improve/loop is not runnable until E2c; do not release without E2c.** — resolved in epoch 2c-2. This epoch retires the
anchors judge/measure read from; `improve.md`'s convergence flow still reasons about six rated
dimensions and is updated in a later epoch of this release. This is a named intermediate state, not
something this epoch fixes.

### v2.0.0 epoch 4b — `rubric_hash` folded into `judge_hash`

This waited on epoch 2b-2: before it, `rubric.md` still carried a measure threshold, so editing it
could move a judge fingerprint for a measure-side reason, and folding it into `judge_hash` then would
have muddied the two layers this release exists to separate. Epoch 2b-2 retired that last measure
threshold, so `rubric.md` now holds only judge anchors — the same layer `judge.md` and
`placement.md` already carry — so `judge_hash` now covers all three whole-file, and `rubric_hash`
stops existing as its own field. No ★1–★5 threshold moved and no default changed. **This slice does
not touch the graduation gate**: `skills/docgrad/templates/docs-gate.mjs` already asserts only
mechanical numbers, and the remaining star/target wording tied to graduation belongs to a later
epoch (E2c) — #82 can be closed once that lands.

- **`judge_hash` moves, from `e8881920` to `6c0f1ed0`.** `rubric.md` is added to `lib.mjs ›
  JUDGE_FILES`, and this epoch's `rubric.md` §Version history entry adds lines to the file, moving
  the hash a second time in the same edit.
- **The `docgrad` block no longer has `rubric_hash`.** `docgradMeta()` now returns `version`,
  `measure_hash`, `judge_hash`, `corpus_hash` — four fields, not five.
- **`measure_hash` and `corpus_hash` are unchanged**, `38724510` and `71d1ce84`. No measure.md,
  `MEASURE_BANDS` or config value changed, and `.docgrad.yml` is untouched.
- **How `report` treats old rows**: in a legacy (1.x) row the rubric break (legacy rule (a)) still
  applies unchanged; in a schema-2 row written before this epoch, a `rubric_hash` key may still be
  present and is now read as an ignored key rather than a schema violation.
- **The 2.0.0 rule-1 waiver (recorded above, epoch 2a) also covers this move**, with the same
  disclosure: every 1.x → 2.0 pair of rounds is treated as a break regardless of which hash reveals
  it, because 2.0.0 is a major release.

### v2.0.0 epoch 2c-1 — `targets` names measure signals, `accept`/`meets_target` are added, the 1.x economy star fields retire

`targets` held a star (1–5) per 1.x dimension in 1.x. Since judge and measure split, a judged
dimension has no target any more: `targets` now names a `measure` signal id (`entry_cost`,
`dead_link_ratio`, …) and accepts exactly `OK` (the default, for every signal) or `WATCH`, in block
form —

```yaml
targets:
  entry_cost: WATCH
```

— validated at `loadConfig` time: an unknown id, a 1.x dimension name with a non-numeric value,
`FAIL`, a number or any other spelling is a config error naming the correct form. A config still
carrying a 1.x star-valued key (`completeness: 4`, …) is not rejected: the key is dropped and a
warning is appended to the run's
`note` (a new top-level `note` on `inventory.mjs`, which had none before, present only when this
fires); `links.mjs`, `freshness.mjs` and `coverage.mjs` append the same clause to their existing
`note`. `retrieval.mjs` emits no `measure` array and gets no warning. See
[measure.md](skills/docgrad/reference/measure.md) §Targets for the full semantics.

- **Every `measure` row gains `accept` and `meets_target`, right after `verdict`.** `accept` is the
  verdict this repo's config allows that signal to settle at. `meets_target` is `true` when `verdict`
  is `OK`, `true` when `verdict` is `WATCH` and `accept` is `WATCH`, `false` otherwise, and `null`
  exactly when `verdict` is `null`. `FAIL` never meets a target, even an accepted `WATCH`.
- **Breaking: the three 1.x economy star fields are removed from `inventory.economy_thresholds`** —
  `cost_allows_star`, `star_5_cost_met` and `pollution_caps_at` are gone. `entry_cost_tiers`,
  `pollution_max`, `customised`, `entry_cost_tokens_est` and `pollution_ratio` are unchanged. Anything
  still reading the three removed keys breaks.
- **`targets` is still not a `measure_hash` input**, unchanged from 1.x: it decides when a repo is
  satisfied, not how it is measured. `tests/lib.test.mjs` pins this both for `corpus_hash` (as
  before) and for `measure_hash` (new).
- **`measure_hash` moves, from `38724510` to `cc49bc6f`.** `reference/measure.md` grows a new
  §Targets section and its own §Version history section (with one entry, v2.0.0 E2c-1) — both
  `measure_hash` inputs. **`judge_hash` is unchanged, `6c0f1ed0`.** `corpus_hash` is unchanged,
  `71d1ce84`: `.docgrad.yml`'s `targets` block converts to v2 form (a bare `targets:`), which is not
  a corpus field.
- **Root `.docgrad.yml` and the `basic` / `root-index` test fixtures convert to v2 form** (a bare
  `targets:`, since none of them accepts a `WATCH`); the evals fixtures' `targets: {}` is unchanged.
- **improve/loop is not runnable until E2c-2.** — resolved in epoch 2c-2. This slice supplies the data (`targets`,
  `meets_target`) that E2c-2's loop prose reads; the loop, the `measure`/`judge` commands and the
  `audit` alias are the next slice, shipping in the same 2.0.0 release.

### v2.0.0 epoch 2c-2 — `improve`/`loop` run again; `measure`/`judge` become commands; `audit` becomes a deprecated alias

This closes out the "improve/loop is not runnable until E2c(-2)" intermediate state named in epochs 2b-2 and 2c-1
(#79, #80). `improve.md` now reasons entirely about the four scripts' `measure` rows — `verdict` / `accept` /
`meets_target`, added in E2b-1/E2c-1 — for selecting what to fix, verifying a fix held, deciding when to stop, and
recommending graduation. It never again reasons about a star rating anywhere in that flow.

- **Working set = `measure` rows with `meets_target: false`.** Pick order: every `FAIL` before any unaccepted
  `WATCH`; within the same verdict, a fixed tie-break — `undocumented_dirs`, `drifted_dirs`, `date_coverage`,
  `key_doc_age`, `date_drift`, `index_present`, `dead_link_ratio`, `orphan_ratio`, `reachable_ratio`, `entry_cost`,
  `pollution` (the 1.x rubric tie-break completeness → freshness → linkage → economy, with the judged dimensions
  removed). A signal not on this list is picked last, in `lib.mjs › MEASURE_BANDS` order — no list edit is required
  to make a new signal pickable. One signal per round, same exceptions as before (trivial-fix allowlist, small-corpus
  mode) minus typo-level consistency, which drops off the allowlist because consistency is judge-only now and the
  loop never touches a judge deduction directly.
- **Two kinds of row never enter the working set**, and neither is called a "design ceiling" any more (that language
  belonged to the freshness/economy ★5 anchors this release already retired): a `meets_target: null` row (not
  measured this round — named in the report with its `note`, counts neither for nor against "targets met"), and a
  row whose only fix is outside docgrad's remit (needs CI, source code, or a product decision) — excluded from
  the working set but **always counted as unmet**, so graduation is withheld while one is open.
- **New stop condition: "outside docgrad's remit."** When the working set is otherwise empty but such a row remains
  unmet, the loop stops immediately — no round runs, nothing is committed, no history row is written — with its own
  stop report naming the rows, each appended to `.docgrad/out-of-scope.jsonl` (skipped if an identical open entry
  already exists). Plateau is now defined only over a non-empty working set, so it can no longer fire on this
  situation by mistake.
- **`--judge` becomes a per-round flag on `improve`/`loop`.** A round without it runs only the four scripts;
  `judge.md` runs only when the flag is passed. The history row's `judge` object is always written, `{"incomparable":
  true, "stars": {}, "sample": null}` without `--judge`, exactly as before with it; `coverage` is `null` without
  `--judge`. `.docgrad/scorecard-latest.md` is still overwritten every round: without `--judge` it keeps the Measure
  block, the Token economy block (with Traceability), Outside docgrad's remit, and Suggested next steps (limited to
  unmet `measure` rows), and prints the literal line "judge not run this round — no judged-dimension table" in place
  of the Dimension table. No star is ever written by a round that skipped `--judge`.
- **Commit message**: `docs(docgrad): round N convergence — <signal> <old verdict>→<new verdict>`, with a `measure:`
  body line listing rows not meeting target (or "all rows meet target") and a `ledger:` line only when `--judge` ran.
- **Edge cases the loop now names**: a round where every row's `meets_target` is `null` stops as "nothing measured"
  (never targets met, never graduation); a fix that leaves the picked row exactly unchanged (and worsens no other row) is
  kept and recorded as no improvement on the picked row (whether that round counts toward plateau is decided in
  §Stop conditions — see the #102 follow-up section below), while a fix that worsens any row — the picked row included, verdict or value — is
  reverted; the history row's `dimension` is always the picked measure id; `audit --dim <dimension>`
  implies `--judge`, since a dimension can only be judged.
- **One source for the loop's rules.** `improve.md` step 4 (keep or revert) and `improve.md` §Stop conditions are the
  only places those rules are defined; `docs/design.md` and `INTEROP.md` now link there instead of restating them, and
  `improve.md`'s own step 2 / §Rows outside the working set point at §Stop conditions. `tests/single-source-rules.test.mjs`
  fails when any other tracked markdown file (outside CHANGELOG, case studies, evals and §Version history sections)
  restates either rule (#102).
- **SKILL.md gains `measure` and `judge` as first-class commands** (#80): `measure` runs the four scripts only,
  needs no rubric.md; `judge` reads rubric.md and rates the three LLM-judged dimensions, needs this round's `measure`
  output. **`audit` becomes a documented deprecated alias**: it runs `measure`; it runs `judge` too only with
  `--judge`. This was always report-only and still is — nothing about "audit writes nothing" changed, only which of
  the two passes run by default. The frontmatter `description` and `argument-hint` are reworded to match (no more
  "six-dimension star rating … until target ratings are met"); the `report` row is untouched, byte for byte.
  `/docgrad` with no argument now also prints a one-paragraph statement of the two layers.
- **`judge.md` step 9's Dimension table drops the `Target` column** (`| Dimension | Rating | Main deductions |`, still
  exactly Completeness/Correctness/Consistency, pinned by `tests/rubric-retirement.test.mjs`) — a judged dimension
  never had a `measure`-style target, and the column was carried over from `audit.md` unexamined. The Measure block
  line spec now names `accept`/`meets_target` and requires printing an accepted `WATCH`. "Suggested next steps" now
  lists unmet `measure` rows first (the loop's own pick), then judge deductions as recommendations only. The
  empty-sample blockquote drops "treat it like a design ceiling … excluded from pick the lowest dimension" for
  "never a candidate in the first place" — correctness's `n/a` case was never a `measure` row for the loop to
  exclude. The "audit writes nothing" note is now "measure/judge write nothing," naming `audit` as their alias. The
  scoped-audit section now names `judge <scope>` / `measure <scope>` alongside the historical `audit <scope>`
  spelling.
- **`rubric.md`'s own correctness not-measurable note** (§Correctness) drops the same "design ceiling … loop's
  dimension picking" wording for "no target, never in the loop's working set," and gets this epoch's own
  §Version history entry (which also annotates the E2b-2 entry's "improve/loop is not runnable until E2c" as
  resolved here).
- **`init.md` questionnaire item 8** now asks which `measure` signals may settle at `WATCH` (default `OK`
  everywhere, `FAIL` never accepted) instead of "which dimensions to lower to 3"; the shipped `.docgrad.yml` template's
  `targets:` block becomes bare with a commented `entry_cost: WATCH` example; the `economy.entry_cost_tiers` comment
  now says tiers `[0]` and `[3]` are "not read by any verdict (kept so a 1.x config still loads)," matching
  `lib.mjs`; the wrap-up step points at `/docgrad measure` (and `/docgrad judge`) instead of `/docgrad audit`.
- **`docs/design.md` and `docs/how-to.md`** get the command table, the `targets:` example, the "How loop works" steps
  and stop conditions, and the "add a scoring dimension" tie-break/`targets` guidance updated to the same vocabulary;
  the 1.x history narrative paragraphs are untouched. **`.agents/workflows/docgrad.md`**'s command list gains
  `measure`/`judge`, and its no-argument default becomes `measure` (was `audit`).
- **The fingerprint moves:**
  - **`judge_hash` moves, from `6c0f1ed0` to `d2c22f68`.** A real content change in `judge.md` (the
    Dimension table header, the Measure block spec, the reordered "Suggested next steps," the reworded empty-sample
    blockquote, the "audit writes nothing" → "measure/judge write nothing" note, the scoped-audit section wording)
    plus `rubric.md`'s own two changes (§Correctness's wording, and this section's own §Version history entry, which
    changes `rubric.md` a second time in the same edit).
  - **`measure_hash` is unchanged, `cc49bc6f`.** `measure.md` and `lib.mjs › MEASURE_BANDS` are untouched this slice
    (deliberately — see the Non-goals below).
  - **`corpus_hash` is unchanged, `71d1ce84`.** `.docgrad.yml` is untouched.
  - **The 2.0.0 rule-1 waiver (recorded above, epoch 2a) also covers this move**, with the same disclosure: every
    1.x → 2.0 pair of rounds is treated as a break regardless of which hash reveals it, because 2.0.0 is a major
    release.
- **Breaking**: `audit` no longer rates by default — a script or habit that ran `audit` expecting a star rating in
  the scorecard must now pass `--judge` explicitly.
- **Not in this slice (Non-goals, disclosed)**: `reference/measure.md` (its own line 6, "read rubric.md before
  scoring," is a noted follow-up, not fixed here — measure needs no rubric.md, so that line is already stale but
  moving `measure_hash` for it belongs to its own slice); `evals/`, `templates/`, `SKILL.md`'s `report` row,
  `case-studies/**`, `README*` (still say "six dimensions," left for E5, #83); the E4 graduation gate
  (#82/#88/#90); E3's scorecard two-block layout (#81/#87).

### v2.0.0 #102 follow-up — when the loop's stop conditions are checked, and the step 4 edge cases

No script, output or fingerprint changes; `improve.md` is in no fingerprint.

- **§Stop conditions says when each condition is checked.** Targets met, Nothing measured and Outside docgrad's remit
  are checked between step 1 and step 2: a round that stops there picks nothing, fixes nothing, runs no step 5 and
  writes no history row. Plateau is checked after step 5, so the round that triggers it is still recorded. Needs
  human decision can arise mid-round.
- **A single `improve` runs the same pre-round checks** as `loop`, instead of always running its one round.
- **Graduation happens at the Targets met stop**, which is the one pre-round stop that writes and commits files: the
  two gate files, their README and a fresh `.docgrad/scorecard-latest.md` (step 5 did not run, so without this
  `report` would reprint the previous round's scorecard). No history row is written for it.
- **Step 4**: the picked row improving does not save a round in which another row worsened — it is reverted. Any
  move of the picked row's value toward its OK line counts as partial success; the old "without a verdict change
  being possible this round" qualifier is gone. An unchanged picked row is kept and recorded as no improvement on
  that row, and no longer decides plateau by itself.
- **Plateau is working-set-wide**: a round where the picked row was unchanged but another working-set row improved
  does not count. Only changes the round kept count as improvement — a reverted change contributes none, a side fix
  or small-corpus fix that stayed still does.
- Step 3's economy dead end ("delete it" is the only way left) is handed to the user as Needs human decision, not
  called a plateau.
- `tests/single-source-rules.test.mjs` gains patterns for four paraphrases and the two stop conditions that had none,
  plus a fixed list of known restatements every pattern set must keep catching. `README.md`'s 1.x plateau sentence is
  allow-listed until E5 (#83) rewrites it as a link. Known limit: the check still only recognises listed phrasings
  (see #102).

### v2.0.0 epoch 4c — the graduation gate asserts pollution (closes #82)

`skills/docgrad/templates/docs-gate.mjs` gains a sixth threshold, `max_pollution_ratio` (default `0.1`, matching
`economy.pollution_max`), checked with `<=` against `inventory.pollution.ratio`. The gate never passes `--include`,
so that ratio is a number and never null. If a docgrad install reports `inventory.pollution.ratio` as anything else
(too old, or a shape change), the gate exits 2 (environment problem) rather than guessing.

- **One pin rule.** At graduation, `max_pollution_ratio` is pinned to that round's `inventory.pollution.ratio` —
  exactly the same "current values become the thresholds" rule `improve.md` §Graduation already applies to the
  other five, and never to `economy.pollution_max`. This keeps the gate green on day one even for a repo that
  graduated with `targets: pollution: WATCH` (a ratio at or above `pollution_max`). `improve.md` §Graduation and
  `graduation-README.md`'s pinned-thresholds table both name this one rule; neither restates it differently.
  `economy.pollution_max` stays the separate, config-side WATCH boundary the scripts evaluate every round — the
  gate's threshold and that boundary can differ, on purpose, once a repo pins its own.
- **The ratio can expire in either direction.** Unlike the four absolute numbers, and like
  `min_freshness_coverage`, `max_pollution_ratio` can go red on its own as the corpus changes shape — but where
  freshness coverage only falls as the corpus grows, pollution can move either way: a new junk file matched by
  `exclude` (tracked or not) raises it, a new clean doc lowers it. `graduation-README.md` says so.
  `docs-gate.mjs` also gains one comment line: CI runs on a clean checkout and measures the clean corpus, but a
  local run with untracked files may read a different `pollution.ratio` (`inventory.mjs`'s `pollution.note`
  already says this; the gate just doesn't hide it).
- **Backward compat for gates already committed.** A gate produced before this key existed (docgrad ≤ 2.0.0-pre)
  has no `max_pollution_ratio`. `measure.md` §8b item 3 treats a missing key as "not declared by this gate" and
  reports it once — *"this gate predates the pollution threshold"* — never as fail-closed (the fail-closed rule
  stays about the `THRESHOLDS` block's shape, not which keys a given gate declares). Item 4's "logic differs from
  the template" note gains the same allowance: an older gate is *expected* to differ once the template's checks
  grow, and the remedy is regenerating it, not treating the difference as a defect.
- **`measure_hash` moves, from `cc49bc6f` to `dd15ca3f`.** `reference/measure.md` §8b and §Version history are the
  only `measure_hash` inputs this slice touches; the produced template (`docs-gate.mjs`) and its README are not
  inputs, so shipping them alone would not have moved it. `judge_hash` (`d2c22f68`) and `corpus_hash` (`71d1ce84`)
  are unaffected — no judge-side file changed and no corpus-selecting config field moved.
- New `tests/docs-gate.test.mjs` runs the template against temp repos: pass at defaults, exit 1 naming pollution
  when it is pushed over threshold, exit 2 when `inventory.pollution.ratio` is absent from a stubbed docgrad
  install, and exit 0 for a fixture whose ratio exceeds the shipped default but whose `THRESHOLDS` is pinned to its
  own current ratio (a graduated-with-WATCH repo). A test also asserts the template's `THRESHOLDS` block is still a
  plain list of `key: <number>` lines — the shape `measure.md` §8b's fail-closed parser depends on.
- `docs/design.md` and `improve.md`'s attached graduation-report passage now list pollution among what the gate
  blocks. Non-goals for this slice: `README.md`/`README.zh-TW.md` (E5, #83), `judge.md`/`rubric.md`
  (`judge_hash` does not move), `lib.mjs › MEASURE_BANDS`, and any script output shape.

### v2.0.0 epoch 3 — the scorecard prints a Measure block and a separate, explicitly incomparable Judge block (closes #81)

`judge.md` step 9's scorecard template splits its two layers visually as well as fingerprint-wise: `## Measure`
(number + OK/WATCH/FAIL, unchanged) is followed by a new `## Judge — not comparable across rounds` heading, and
only then the existing three-row `| Dimension | Rating | Main deductions |` table. No table column, row, or
verdict computation changed — this is a formatting and disclosure slice, not a re-scoring.

- **Title line gains `@ <short-sha>`**: `# docgrad scorecard — <repo> @ <short-sha> · <YYYY-MM-DD>`, and the
  scoped-report header gains the same. The `## Measure` block's first line is now
  `measure_hash <h> · corpus_hash <h>`, copied from the scripts' own `docgrad` block, so a reader can see which
  ruler produced the numbers without cross-referencing `history.jsonl`.
- **New `## Judge — not comparable across rounds` heading**, printed before the Dimension table (full, scoped, and
  `--dim` reports alike). Under it: a `judge_hash <h> · correctness sample: <n>/<claims_total> claims` line (with
  scoped / `--dim` non-correctness / zero-verifiable-claims variants), then the exact sentence *"Stars are model
  judgement: never compared with another round, never averaged or summed, and never combined into an overall
  rating."* The Measure block also gains a line pointing `improve`/`loop`'s stop conditions at
  [improve.md](skills/docgrad/reference/improve.md) §Stop conditions, stating plainly that judge stars are not an
  input — a link, not a restated rule (`tests/single-source-rules.test.mjs` stays green).
- **`improve.md`'s no-`--judge` scorecard variant** keeps the `## Judge — not comparable across rounds` heading;
  under it, the existing literal line **"judge not run this round — no judged-dimension table"** replaces the
  sample line, the no-overall sentence, and the table — unchanged text, new home.
- **New §Known instability** in `judge.md`, just before step 9. From `--runs 5` (2026-09-16, #68): completeness
  split ★1/★2 across five runs on the `linkage-known` fixture because the ★1/★2 boundary has no criterion for
  "documents exist but are hollow" (#70) — a docgrad star that is not stable; and the eval harness's own
  judges split 0/3–3/3 on `planted-contradiction` while docgrad's pinned stars were identical in all five runs
  (#69) — so a star cannot be checked by another model's vote either. Both are disclosed, not fixed, in 2.0.0.
- **Scoped runs without judge** (`measure <scope>`, `audit <scope>` without `--judge`) keep the Judge heading
  with the "judge not run this round" line, same as `improve` without `--judge`.
- **Breaking for anything that parses `.docgrad/scorecard-latest.md`'s headings**: a script or downstream tool
  that greps for the old, heading-less `| Dimension | Rating | Main deductions |` table immediately under
  `## Measure` now finds a `## Judge — not comparable across rounds` heading in between, and the title line's
  shape changed (`@ <short-sha>` inserted before the date). `report`'s reprint of an old `scorecard-latest.md`
  file is unaffected — it reprints stored text verbatim, it does not re-parse the old shape into the new one.
- **`judge_hash` moves, from `d2c22f68` to `9c31f7e3`.** All of the above is judge-side content in `judge.md`
  (`lib.mjs › JUDGE_FILES`): the step 9 template, the §Scoped audit update, and the new §Known instability
  section — plus this slice's own `rubric.md` §Version history entry, which moves the hash a second time in the
  same edit (the same pattern as the E2a, E4b and E2c-2 entries: the value could not be quoted inside that entry
  itself). `measure_hash` (`dd15ca3f`) and `corpus_hash` (`71d1ce84`) are unaffected — no `measure.md`,
  `MEASURE_BANDS`, or config value changed.
- Tests: `tests/lib.test.mjs` pins the new `judge_hash`; `tests/rubric-retirement.test.mjs` asserts the template's
  block order (`## Measure` → `## Judge — not comparable across rounds` → the Dimension table), the exact
  no-overall sentence, narrow negatives (no `| Overall` row, no "overall rating/score/stars:" phrasing, no
  fractional star), that §Scoped audit names the new heading, and that `improve.md`'s no-judge variant names it
  too.
- Non-goals for this slice: `measure.md`/`lib.mjs` (measure-side, untouched — `measure_hash` does not move),
  `SKILL.md`'s report row (already states the two-layer split correctly), `README.md`/`README.zh-TW.md` and
  `evals/`/`case-studies/` (E5, #83), and fixing #69/#70 themselves — this slice discloses them, it does not
  resolve them. This repo's own `.docgrad/scorecard-latest.md` is left as-is, a record of a past round under the
  old layout; `report` reprints it verbatim regardless.

### v2.0.0 epoch 5a — user-facing docs speak the two layers (#83)

`README.md`/`README.zh-TW.md` and their supporting files catch up to the two-layer vocabulary the previous
epochs already gave the skill itself: `measure` (reproducible OK/WATCH/FAIL, targets, what CI and `loop` act
on) and `judge` (★1–★5 for completeness/correctness/consistency only, not reproducible, never gates CI, no
overall score). No rubric anchor, measure band, or loop rule changed — this slice is documentation only.

- **README command table** now lists `init` / `measure` / `judge` / `improve` / `loop` / `report`, with `audit`
  kept as one row marked **deprecated alias** (still report-only, still runs `measure` plus `judge` only with
  `--judge` — see [SKILL.md](skills/docgrad/SKILL.md) routing). The intro states plainly that ★ ratings are
  never reproducible and never gate CI, mirroring the sentence #83 asked for.
- **"Every dimension ≥★4" and "design ceiling" are gone.** The stop-condition bullets under §From install to
  graduation now link to [improve.md](skills/docgrad/reference/improve.md) §Stop conditions instead of
  restating them (`tests/single-source-rules.test.mjs`'s README `ALLOWED` entry is removed along with the
  restated text it excused); "design ceiling" is named once as a retired 1.x concept, per
  [improve.md](skills/docgrad/reference/improve.md) §Rows outside the working set.
- **New `UPGRADING.md`** at the repo root: the eight 1.x → 2.0 breaking changes (commands, `.docgrad.yml`
  `targets`, output shape, fingerprint renames, `history.jsonl` schema 2, the scorecard's two blocks, the
  graduation gate's new pollution threshold, and "re-run `measure` for a new baseline"), each linking to its
  source section instead of restating it. Linked from both READMEs near the top ("Coming from 1.x?"). Not part
  of the docgrad corpus (same as `NOTICE.md`) — outside `docs_dirs`/`docs_files`/`entry_files`/`index_file` in
  `.docgrad.yml`, so it cannot register as an orphan.
- **Case studies 1–4's README rows are untouched in number**, but rows 3 and 4 are reworded (row 3 in both of its
  text columns) to state plainly that they graded 1.x star ratings, and `case-studies/README.md` gains a top-of-file disclaimer
  that cases 1–4 were recorded under 1.x, before the measure/judge split — see UPGRADING.md for how those
  numbers map. `case-studies/01–04*.md` themselves are untouched (#79 comment: they are records of past
  measurements, not edited).
- **`CONTRIBUTING.md` §Tests and evals**, `docs/how-to.md` (the `audit` references in §Fewer permission
  prompts and §Run the skill-level evals), `skills/docgrad/reference/init.md`,
  `skills/docgrad/templates/graduation-README.md`, `INTEROP.md`, and `NOTICE.md` are updated to name
  `measure`/`judge` instead of the retired `audit` verb, or to state the six-dimension rating as a 1.x fact
  (NOTICE.md) rather than a current one. `docs/design.md`'s evals-directory line now names both layers.
- **Both READMEs link, rather than paraphrase, the loop's rules**: which row a round picks (improve.md step 2),
  whether its change is kept (step 4), and when `loop` stops (§Stop conditions).
- **`docs/how-to.md` §Cut a release's semver lines (83–85) are unchanged policy**: only "rubric star anchor" is
  renamed to "judge star anchor (rubric.md)"; no new semver category or sentence was added for measure-band
  changes (whether measure-band changes need their own semver level is an open question, not decided here).
- **Smaller corrections found by the same sweep**: `docs/design.md`'s blocker sentence now applies to every
  command except `init` (it named only `audit`/`improve`/`loop`), its attribution labels the six-dimension rating
  as 1.x, and `CONTRIBUTING.md`'s unit-test count is brought up to date.
- **`placement.md` says `judge`, not the retired `audit` router**, in the line describing what consumes a
  consistency deduction — see the E5a entry in `rubric.md` §Version history.
  **`judge_hash` moves accordingly, from `9c31f7e3` to `41cb532f`.** `measure_hash` and `corpus_hash` are unaffected — no `measure.md`,
  `MEASURE_BANDS`, or `.docgrad.yml` value changed. `tests/lib.test.mjs` pins the new literal.
- Non-goals: `case-studies/01–04*.md` content, `evals/` (E5b, #83), and `SKILL.md`/`measure.md`/`judge.md`/
  `improve.md`/`rubric.md` content — already v2, untouched except the new `rubric.md` §Version history entry
  above.

### v2.0.0 epoch 5b — evals speak the two layers (#83)

`evals/` catches up to the same measure/judge vocabulary E5a gave the docs, and stops asking any grader for a
property only the operator reading `--runs` output can see.

- **Every case's `prompt.md`** now runs `/docgrad measure` then `/docgrad judge` on `./target` (the retired
  `/docgrad audit` command no longer appears in any prompt or grader), and asks for the full scorecard — both the Measure
  block and the Judge block. `planted-contradiction`'s prompt additionally asks for the correctness dimension's
  claim-ledger table and cumulative coverage, unchanged from before.
- **`linkage-known`'s grader now passes on `measure` numbers, not a judge star**: `dead_link_ratio` must verdict
  **FAIL** (`> 2%`, at 1/12 = 8.33%) and name the dead link `docs/guide.md` → `./install.md`; `orphan_ratio` /
  `reachable_ratio` must be `OK` (no orphan deduction); freshness assertions are limited to the
  date-independent rows, `date_coverage` `OK` and `date_drift` `OK` with `mismatches: []`. `key_doc_age`/`stale`
  are removed from both its mechanical-signals block and its criteria — they depend on the day the eval runs,
  not the fixture, and cannot be pinned without steering the run. No criterion asks for a star on
  linkage/freshness/economy, since `measure` never prints one.
- **`clean-baseline`'s grader** asserts zero false positives across the same rows (`dead_link_ratio`,
  `orphan_ratio`, `reachable_ratio`, `index_present` all `OK`; `date_coverage`/`date_drift` `OK`;
  `mismatches: []`) plus the correctness ledger all `pass`. `key_doc_age`/`stale` are removed for the same
  reason and with the same one-sentence wording as `linkage-known`. The retired "★5 is a design ceiling"
  criterion is gone — there is no ★ on a measure signal to excuse.
- **`planted-contradiction`'s grader** keeps its four assertions unchanged in substance; only "an audit is
  report-only" becomes "measure/judge are report-only," and its closing paragraph now names it explicitly as
  **the judge case** — the one whose own vote instability (#69) is tracked separately, not fixed here. Per #69,
  criterion 2's literal-phrase requirement ("the sign is reversed relative to the code") is left unchanged in
  this slice; the issue's finding that it produces a coin-flip vote is noted in the grader as a pointer to #69,
  not resolved by rewording the criterion's semantics.
- **Every `evals/*/fixture.sh` now pins its commit date**: `GIT_AUTHOR_DATE`/`GIT_COMMITTER_DATE` are set to
  `2026-09-13T12:00:00`, the date every fixture file's own "Last updated" line already claims. `date_drift` and
  `mismatches` are therefore stable whatever day `claude plugin eval` actually runs on — verified by running
  `links.mjs`/`freshness.mjs` against scaffolded copies of `clean-baseline` and `linkage-known` with
  `DOCGRAD_TODAY=2027-06-01` (>180 days later): `mismatches: []` and every row either grader asserts held at
  its asserted verdict; only `key_doc_age` moved (OK → FAIL), which is exactly why it isn't asserted.
- **`case.yaml` tags**: `clean-baseline` and `linkage-known` are `[measure, judge]` (both run `judge`, and
  `linkage-known`'s pass condition is specifically about `measure` determinism); `planted-contradiction` is
  `[judge]`.
- **`evals/README.md`**: the case table is reframed around what each case pins (measure correctness /
  judge sampling / false positives across both layers); `--runs 5`'s star distribution is stated plainly as a
  tracked defect (#69), never a green-suite criterion; the blocker table and dated results from the 1.x
  `audit`-era harness runs are kept, under an explicit "History" label, as a record of what it took to get the
  harness running at all — their diagnoses (scaffold, `Bash`, `git`, `node`) still hold, only their vocabulary
  is 1.x. §Mechanical baselines for the fixtures is rebuilt from **scaffolded copies** (the table shows the links and freshness rows) (each case's own
  `fixture.sh`, run in a scratch directory, then the four scripts against the `target/` it creates) rather than
  reading the fixtures in place — `evals/fixtures/*` sits inside this repo's own git history, so an in-place
  read would date every file by this repo's commits, not the fixture's pinned date.
- No fingerprint moves: `evals/` is not in `measure_hash`, `judge_hash` or `corpus_hash`'s inputs, and none of
  the four scripts, `rubric.md`, `judge.md` or `.docgrad.yml`-shaped config changed. Confirmed unchanged before
  and after: `measure_hash dd15ca3f`, `judge_hash 41cb532f`, `corpus_hash 71d1ce84`.
- Non-goals: `claude plugin eval` was not run as part of this slice (it spends usage) — offered to the user
  after merge, per the plan's E5b acceptance note.

## 1.9.2 — 2026-09-16

Four measurement fixes and one documentation entry. No ★1–★5 anchor text changed and no default
moved — **but `rubric_hash` moves**, from `21fcfd36` to `1bd26aa6` (measured on
`tests/fixtures/basic`), because it fingerprints the whole of `reference/rubric.md` and the last item
below adds a section to it. `judgement_hash`, `thresholds_hash` and `corpus_hash` are unmoved.

That is a ruler fingerprint moving in a patch release, which normally would not happen. It is
deliberate here: the section being added is the one a reader consults **to interpret a break**, and
holding it back so the hash stays still would have left everyone who sees a v1.9.0 `corpus_hash` move
without the note that explains it. The hash moved; no anchor did.

- **Fixed (#75): a dangling *ancestor* symlink still disclosed whether a directory outside the root
  exists.** #57 closed this oracle for a link target's final component; the level above stayed open.
  With `jump -> /outside/dir` and a link `jump/x.md`, `lstat` on the final component throws because
  its ancestor does not resolve, and that throw is indistinguishable from an ordinary in-root miss —
  so the link was filed as dead when the outside directory was absent and as out-of-root when it
  existed. One bit per probe, from a repo docgrad is merely grading. The check now applies to every
  component, stopping at the first that fails. **What closes it is that both answers now agree**, not
  that anything stopped looking: an unresolvable component lands out-of-root here, a resolvable one
  pointing outside lands out-of-root at the containment check.
- **Fixed (#74): `#L39-L86` is GitHub's line-range convention, not a heading reference.** Every link
  written that way was reported as a broken anchor, charging a repo linkage for a convention that is
  not broken. It is now judged as nothing rather than as a heading. A mistyped heading anchor is
  still reported, and so is a lower-case `#l39-l86`, which is not the convention either. Verifying
  that a range falls inside the target file — the strictly better answer — adds a measurement signal
  rather than removing a false one, and is left for the v2 measure/judge split.

- **Fixed: `retrieval.mjs` did not understand `file:` links, so a document could be reachable for
  linkage and unreachable for traceability.** Both scripts build a graph out of the same markdown
  links, from two copies of the same parsing; v1.9.0 taught `links.mjs` about `file:` URIs and left
  the copy in `retrieval.mjs` at the pre-1.9.0 behaviour. A tree whose index links that way got
  `reachable_ratio` counting the edge and `depth_from_index: null` for the same document, which then
  understated `marginal_tokens`. One `lib.mjs › resolveLinkTarget(root, rel, target)` now serves
  both. **`links.mjs` output is unchanged** — byte-identical on docgrad itself, both test fixtures
  and a 46-file external tree.
  **`retrieval.mjs` changes in two ways, not one.** The `file:` case is the reason for the change;
  the second is that it now percent-decodes ordinary link targets, which `links.mjs` has always done
  and it never did. A link to `guide%20one.md` used to build an edge to the literal
  `docs/guide%20one.md` — matching nothing — and now resolves to `docs/guide one.md`. Both are
  corrections in the same direction (retrieval now reads a link the way the link checker does), and
  a repo with percent-encoded link targets will see `depth_from_index` and `marginal_tokens` move
  without owning a single `file:` link.
- **Fixed: an unterminated quote in an inline list degraded silently.** `exclude: [docs/a, "unclosed]`
  kept the quote character inside the value (`"unclosed`), so that entry silently became a different
  string than the one written. It now throws at load, naming the offending item. **No well-formed
  config is affected**: a quoted comma (`["a, b", c]`), an apostrophe mid-item (`docs/owner's/`) and
  an empty list parse exactly as before, and no fingerprint moves. This is one shape, not a general
  syntax check — a missing closing bracket (`docs_dirs: [docs/`) is still accepted quietly, and is
  left alone here.
- **Added: a §Version history entry for v1.9.0's inline-list parser fix.** The CHANGELOG already
  records that a config containing a quoted comma now selects a different corpus; §Version history is
  where a reader goes to interpret the `report` break that results, and until now it said nothing
  about this one. The entry states what the break means — **a `corpus_hash` move at v1.9.0 may be a
  parser fix rather than a corpus edit**, `report` cannot tell the two apart, and `git log` on
  `.docgrad.yml` settles it — so the newer side is read as the corrected measurement rather than as a
  scope someone widened on purpose.

## 1.9.1 — 2026-09-16

**Documentation only. No script, rubric or config change; every hash is unmoved.**

- **Fixed: `docs/how-to.md` §Cut a release had no step for publishing the GitHub Release.** Steps 1–7
  end at the git tag. A tag is not a release — it is visible to anyone who goes looking, while a
  release is what the repository's front page shows, what "Latest" points at, and what notifies
  people watching. The consequence was measurable: v1.7.0, v1.8.0 and v1.9.0 were all tagged and none
  was released, so the front page read "Latest: v1.6.0" while the manifest read 1.9.0. Now step 8,
  with the command.
- **Fixed: `docgrad--v1.8.0` was never tagged.** Created retroactively at `f36546b`, the merge that
  carried v1.8.0, with the same `claude plugin tag` that would have created it at the time. The tag
  sequence v1.0.0 → v1.9.0 now has no gap.
- Releases for v1.7.0, v1.8.0 and v1.9.0 published from their existing changelog sections.

This is the same shape as the missing `--scaffold` in `evals/README.md`, one release earlier: **a
documented procedure whose last step was never written down does not get performed**, and nothing
reports the omission, because nothing knows it is one.

## 1.9.0 — 2026-09-16

Two measurement gaps closed, one new measurement added, and the skill-level eval suite produces a
score for the first time. **No ★1–★5 anchor text changed**; `rubric_hash` and `judgement_hash` are
unmoved. One conditional break: a config whose inline list previously mis-split on a quoted comma
now selects a different corpus, which moves `corpus_hash` for that config alone (see below).

### The eval suite scores, and says something uncomfortable (#59)

`claude plugin eval` had never produced a number. It does now, and the first `--runs 5` distribution
is the reason this release exists in the shape it does: **the measurement is reproducible and the
grading is not.**

The star each case exists to pin was identical in all five runs of all three cases — linkage ★2 ×5,
consistency ★2 ×5, `clean-baseline` identical cell for cell. Judge votes over those same unchanging
ratings ran 3/3 ×5, `1/3 3/3 2/3 2/3 3/3`, and `2/3 1/3 3/3 0/3 3/3`. One run scored 0 of 3 while
carrying the most explicit deduction of the five. Three hypotheses were tested against the
transcripts and none correlates with the vote (#69).

Two things had to be fixed before any of that could be seen. On macOS `/usr/bin/git` is the `xcrun`
shim and cannot write its cache inside the sandbox, so every git-derived signal came back `null` and
freshness rounded down from ★4 to ★3 — correctly, on half an input. `node` was not on the sandbox
PATH either; an earlier run scored only because the model went looking for an fnm install unaided.
Both are now resolved at scaffold time into `./bin/`, where they still resolve. And two graders were
asking judges to verify things a single transcript cannot show: one claimed its fixture was "free of
any defects" when it genuinely has no build or test documentation, the other asked for consistency
"across multiple runs". Their numbered criteria were never changed.

`evals/README.md` now carries eight blockers rather than five, a table for telling apart the three
different failures that all print `score 0`, and three rules for writing a grader. One of those cost
a diagnosis: a usage limit hit mid-run records `score: 0` and reads exactly like a failed case.

A real discretion gap surfaced too, which is what `--runs 5` is for: completeness split ★1/★2 over
one fixed fixture (#70).

### Two measurement gaps closed. No ★1–★5 threshold moved and no default changed; a repo affected by
either gap will measure differently, which is the point.

- **Fixed: `file://` link targets were always dead** (`links.mjs`). They fell through the
  external-scheme check and were resolved as a relative path literally named `file:///…`. A `file:`
  URI is now mapped onto the root (both `--root` as given and its realpath are tried) and judged
  like any other link; a target outside the root, or on a host other than `localhost`, goes to
  `out_of_root_links` and is never stat'ed (#57). Decoded once, by the URL parser. `retrieval.mjs`
  keeps its own link resolution and does not yet read `file://`.
- **Added: `freshness.field` / `heading_field` take an inline list** (`lib.mjs`, `init.md` item 7),
  e.g. `heading_field: ["Last updated:", "Updated:"]`, for a corpus with more than one spelling of
  the same date signal. Keywords are verbatim (a string is one keyword, never split or trimmed);
  per convention, the first document line naming a listed keyword *and* carrying a date wins. For
  the fields an active convention reads, an empty string, empty list or non-string element is now a
  config error instead of a keyword that matches nothing. Inline-list items are split on commas
  outside quotes, so a quoted item may contain one (YAML quote escaping is still not supported); an
  apostrophe inside a plain item is unchanged. A config whose inline list previously mis-split on a
  quoted comma will now parse differently — and, for `exclude`/`docs_dirs`, hash differently.

### Added — `inventory.mjs --locate-ledger <path>` (#63 prerequisite)

Reports where every claim already recorded in a claim ledger sits **in this round's corpus**. Nothing
else could answer that question: `reference/improve.md` step 1 mandates `--exclude-ledger` on every
round that has a ledger, and that flag filters ledgered candidates out **before**
`claim_candidates_cap` is applied — so a real loop round emits exactly zero of the positions a caller
would need.

Three properties callers are meant to rely on, each with a test:

- **Reads the unfiltered population.** In the loop the two ledger flags always arrive together;
  locating against the filtered list would report every ledgered claim as not-located, the exact
  opposite of the question. They are independent and may name different files.
- **Uncapped.** `claim_candidates_cap` governs the emitted window, not this. A ledger of 100 against
  the default cap of 60 reports 100.
- **A claim with no current position is reported, never dropped.** `claim_hash` is derived from the
  claim text, so a claim edited since it was ledgered has no position by construction. Such a row is
  emitted with `located: false`; omitting it would read as "nothing here", which is the one reading a
  caller must never be given. Measured on this repo's own ledger: 1 of 3 rows is already in this
  state.

Shape: `locate_ledger: {path, lines, distinct, located, not_located, multi_position, entries, note}`,
present **only** when the flag is passed. `lines` is the ledger's **non-empty row** count (blank lines are skipped, as
`--exclude-ledger` already skips them) and `distinct` the number of distinct `claim_hash` values — a ledger is append-only and re-verification appends a row for a hash
already present, so the two differ on every real ledger; `located + not_located === distinct`. One
hash may hold several positions at once (the same claim sentence in two documents is one hash in two
places, which is a duplication finding rather than an error) and every position is listed. A row's own
`doc` field is echoed as `ledger_doc` for not-located rows and is **never trusted**: positions are
recomputed from this round's scan, so a stale or tampered `doc`/`line` cannot move where a claim is
reported.

The other four scripts accept the flag and report the no-op in their own `note`, as they already do
for `--include` and `--exclude-ledger` (`docs/how-to.md` §Extend the measurement scripts).

**Fingerprints and cost.** `rubric_hash`, `judgement_hash`, `thresholds_hash` and `corpus_hash` are
all unchanged — this release touches none of `reference/rubric.md`, `reference/audit.md`,
`reference/placement.md`, nor any corpus-selecting config field. The one measurable cost is
`entry_cost`: documenting the flag in `SKILL.md` §Scripts took this repo from **1,556 to 1,633
tokens** (+77), well inside the ★4 band and far from the ★5 ceiling of 3,000.

Without the flag, output is unchanged: no new key, and byte-identical JSON from all five scripts
across the five `tests/fixtures/` repos. (On *this* repo the unflagged `inventory.mjs` output moves by
one field — `claim_population.src_symbols` 2,365 → 2,408 — because `src_dirs` is
`skills/docgrad/scripts/` and the new functions add identifiers to the symbol index. Editing the
scripts at all does that; it is not a behavioural change from the flag.)

## 1.8.0 — 2026-09-14

Four defects fixed (#54 #56 #57 #55). **No ★1–★5 threshold moved** and every shipped default is
unchanged. `rubric_hash` moves to `21fcfd36` (rubric prose changed); a new `judgement_hash` joins the
fingerprint block.

**Read this before upgrading — #57 can stop docgrad working on your repo, and no hash will warn you.**
Three configuration shapes now **fail the run** instead of quietly measuring content from outside the
repository. `corpus_hash` cannot tell you whether you are affected: it digests the config's path
*strings*, not the files actually collected. So check, don't compare hashes:

```bash
grep -n '\.\.' .docgrad.yml                    # shape 1: a configured path containing ..
find <each configured path> -type l -exec sh -c 'realpath "$1" | grep -qv "^$PWD/" && echo "$1"' _ {} \;
                                                # shapes 2 and 3: a configured path that IS a symlink
                                                # out of the root, or a *.md symlink in the corpus
node <docgrad>/skills/docgrad/scripts/links.mjs --root .   # shape 4: keep the dead_links count
```

Shape 3 is the one that surprises people: its owner greps for `../`, finds none, and concludes they
are safe — while `docs/` is a symlink to a shared docs tree outside the repo.

**Shape 4 is the opposite problem and it is silent.** An out-of-root *document link* that pointed at
a missing file used to count in `dead_links`; it now lands in the new `out_of_root_links` bucket. So
`dead_links` can shrink, **the linkage rating can improve, and a generated CI gate that was failing
can turn green** — with no config change, no error, and no fingerprint moving. Keep the pre-upgrade
count above and compare.

- **Fixed (#57) docgrad read whatever the audited repository pointed it at.** It is documented and
  demonstrated as a tool you run against repos you did not write, and that repo controls both
  `.docgrad.yml` and the symlinks in its tree. Content read this way reaches the scorecard, and
  `audit.md` then instructs the agent to Read each claim's file — so it reaches the agent's context
  too. Exposure is **disclosure, not execution**: the five scripts still run only their own code and
  `git` with fixed argv.
  - **Containment is built on `fs.realpathSync`, never on `path.resolve`.** A lexical check is
    defeated by one committed symlink: `docs-x -> /` with `docs_dirs: ['docs-x/Users/v/notes/']`
    resolves lexically inside the root, passes, and then `readdirSync` follows it out. There is a
    test whose only job is to fail against a lexical implementation.
  - Eight enforcement points, not the two the issue named: `collectFiles`, `pushSingleFile`,
    `walkMarkdown`, `buildSrcSymbolIndex`, `coverage.mjs`, `retrieval.mjs`'s `resolveFiles` **and
    `walkFiles`**, and `links.mjs`. `walkFiles` was the one nobody listed: `Dirent.isDirectory()` is
    false for a symlink, so a symlinked **file** inside a perfectly contained `src_dirs` was read by
    `hasCodePointer()` — and `src_dirs` is the only route that reads arbitrary **non-markdown** bodies.
  - **Missing paths stay non-fatal.** `realpathSync` throws ENOENT, and a missing `docs_dir` is
    deliberately skipped because `.docgrad.yml` is shared across branches. Turning "not on this
    branch" into exit 1 would have been a worse bug than the one being fixed.
  - **`links.mjs` was an existence oracle.** A hostile document could ask whether any absolute path
    exists on the auditor's machine: absent targets were reported dead, present ones silently
    dropped. The fix is about that *difference* — an out-of-root target is bucketed and
    **`existsSync` is never called on it**; relabelling the present case while still stat-ing would
    have left the oracle open. Non-fatal, unlike a configured path: an accidental `../../` link is
    common and exit 1 there would be a corpus-wide regression.
  - **Deliberately not done:** no extension filter was added to `pushSingleFile`. Its absence is a
    separate defect, and "fixing" it here would silently drop legitimate in-root non-markdown entries
    (`docs_files: ['NOTES.txt']`), moving `files_total` and two denominators for repos doing nothing
    wrong. `exclude`/`out_of_scope` are left unchecked too — they are pure string matchers that never
    touch the filesystem, and the code says so, so the omission cannot be read as an oversight.
  - Accepted residual: TOCTOU between check and read. Five separate processes, a seconds-wide window,
    and it needs a concurrent attacker; closing it means carrying validated handles across four files.
- **Fixed (#54) the claim-candidate window counted what was emitted, not what could be drawn.**
  Sampling can only draw from what `inventory.mjs` emits, and the emitted list did not exclude claims
  already in the ledger — so every ledger row cost the window a usable slot. Measured on one repo:
  nominally 60, **actually 33 drawable**, and worsening, because sampling draws from the top so
  verified claims concentrate at the window's front. The more successful the sampling, the less
  useful the window. New shared flag **`--exclude-ledger <path>`**, default off; the filter runs
  **before** the cap slice, which is the whole fix. A missing or malformed ledger fails loudly —
  a silent fallback would leave the defect in place while looking fixed.
  - **Consequence for comparability:** with the flag, `claim_candidates` is a prefix of the
    *filtered* order, so **"raising the cap only appends" stops holding** — the filter moves as the
    ledger grows. Every document asserting that property was found by search rather than by hand;
    hand-enumeration had already missed it twice, including `audit.md`'s draw procedure, the one an
    auditor follows step by step.
  - Without the flag, output is unchanged byte for byte (verified across four corpora and all five
    scripts).
  - Not fixed here, filed as #60: the ranking degrades to path order after roughly 98 candidates
    (77% of one real population has `refs: 1`), and excluding drawn claims reaches that flat region
    sooner. The remedy is a better ranking signal, which is a design question.
- **Added (#56) `judgement_hash` — a fingerprint for the rules that apply the anchors.** `rubric_hash`
  covers `rubric.md`, so v1.7.0's #48 could add two correctness boundary rules to `audit.md` — one of
  which can only lower a pass rate — with **no fingerprint moving at all**. That break could only be
  disclosed in prose and trusted to be read. The new field covers `audit.md` and `placement.md`,
  chosen against `SKILL.md`'s own blockers: those are the files the skill says you must read before
  rating. `rubric.md` is excluded (hashing it twice moves two fingerprints for one edit) and so is
  `improve.md` (it delegates the rating to `audit.md` and a plain `audit` never reads it).
  **It does not mark the break that motivated it** — a pre-1.8.0 round has no such field, so its
  first appearance reads "unknown → first value".
- **Fixed (#55) five statements in the surfaces that had never been scanned.** `SKILL.md` said
  `coverage.mjs`/`retrieval.mjs` "deliberately do not accept" `--include`; they accept it and
  deliberately ignore it, which matters because "do not accept" sends a reader looking for an error
  that never comes. Three case studies anchored on relative time ("today's HEAD", "the current
  scripts") — true when written, false now.
  - **The fifth is the one worth naming.** `case-studies/03-fixtures.md` still said the eval harness
    "was not available on this account". v1.7.0 established that this is false — the message means a
    CLI build predating the command's release — and corrected `docs/how-to.md` and `evals/README.md`.
    This file was missed, and so was it by the scan run for this very issue. A tool that grades
    whether documentation matches reality was carrying, in its own records, a cause its own
    documentation had already declared wrong. Corrected in place with a dated note rather than
    rewritten, because what was recorded at the time is itself part of the record.
  - All four case studies gain a **version convention**, drawn where the carrier changes rather than
    where the file sits: prose code references are **frozen** (rewriting `scripts/links.mjs` to
    `skills/docgrad/scripts/links.mjs` would claim v1.5.0 had the v1.7.0 layout), while **markdown
    links are maintained** against the current layout so they still resolve. Case study 4 spans
    v0.5.0–v1.6.0 and says so instead of naming one version.

## 1.7.0 — 2026-09-14

Six defects fixed (#47 #48 #49 #50 #51 #52). **No ★1–★5 threshold moved**, no dimension gained or
lost a criterion, and every shipped default is unchanged. `rubric_hash` moves to `e1d1c6dc` because
rubric prose changed; a new `thresholds_hash` joins the fingerprint block.

**What this version asks of you.** Four things, and none of them is detectable from a score alone:

1. **If your `.docgrad.yml` sets an `economy:` block, your economy rating may move without a file
   changing.** `economy.entry_cost_tiers` and `economy.pollution_max` have existed since v1.0.0 and
   were **read by nothing** — the thresholds actually applied were retyped in `rubric.md`'s prose. A
   repo carrying `pollution_max: 0.2` was graded at 0.1 and is now graded at 0.2. This is the fix
   working, and it is a real break in that repo's trend. Repos that never set the block are graded
   exactly as before.
2. **Correctness pass rates are not comparable across this version, and no fingerprint says so.**
   `reference/audit.md` gained two boundary rules, one of which can only lower a pass rate.
   `rubric_hash` is computed over `rubric.md` alone, and the rules live in `audit.md`, so `report`
   cannot draw this break mechanically. Treat the first 1.7.0 round in any repo as a **new baseline**
   for correctness rather than a continuation. A drop across this boundary is not evidence of decay.
3. **This repo's own `corpus_hash` breaks once** (`684034d6` → `d2a71823`) because the skill payload
   moved to `skills/docgrad/`. If you track docgrad's own scores, the discontinuity is at this
   release. Your repo's `corpus_hash` is unaffected.
4. **Two report-only numbers step once**: `structure.rules.anchored_ratio` (now counts API-shaped
   coordinates) and `retrieval.marginal_tokens` (now de-duplicates symlinked entry files). Neither
   carries a star, so nothing is regraded — but a trend line will show a step.

Also: `history.jsonl` gains `thresholds_hash`; `.docgrad/ledger.jsonl` gains `borderline` and
`rationale`, both forward-only (do not back-fill). Installation changed — see below.

- **Fixed (#47) docgrad could only be packaged for Claude Code, and the reason was the layout, not
  the README.** The skill payload now sits at `skills/docgrad/` as the
  [Agent Skills specification](https://agentskills.io/specification) expects; `"skills": ["./"]`
  (plugin root *is* skill root) was a Claude-Code-only spelling. Added `.codex-plugin/plugin.json`,
  `.agents/` workspace discovery and a root `plugin.json` for Antigravity. **Only Claude Code is
  marked verified in the README**, meaning installed from a real machine with the skill and scripts
  resolving afterwards; the others say unverified, and the Skills CLI cannot be tested against this
  layout until the release is published.
  - **The move silently broke `version`, which is why it has a test now.** `docgradMeta()` read
    `<skill root>/.claude-plugin/plugin.json`, and the manifest stays at the repo root, so `version`
    would have become `null` while `rubric_hash` stayed correct — one field broken, one field fine,
    the hardest kind to notice, and it would have surfaced months later as a `history.jsonl` full of
    nulls. It searches upward now.
  - **`git clone … ~/.claude/skills/docgrad` no longer works, and `cp -r skills/docgrad` is a trap:**
    it leaves `.claude-plugin/` behind and reproduces exactly that `version: null` failure. Clone the
    repo and symlink the payload; the README gives the two commands.
  - `docs-gate.mjs` resolves both layouts, so a gate copied into someone's CI keeps working across
    the boundary. While there: its plugin-cache fallback never matched a real install (the path
    carries a version segment the candidate list lacked), so every `DOCGRAD_DIR`-less run against a
    plugin install exited 2. Pre-existing, fixed here.
- **Fixed (#50) two config fields claimed to move a rubric anchor and were wired to nothing; a third
  moved one without claiming to.** `economy.entry_cost_tiers` / `economy.pollution_max` are now read
  by `inventory.mjs`, which emits `economy_thresholds` — the values in force, whether they are the
  shipped ones, and the arithmetic over them — and `rubric.md` cites that instead of keeping a second
  copy of the numbers. `reference/init.md` warned against editing these fields because "changing the
  threshold changes the rubric anchor"; that causal chain did not exist, and the warning has been
  rewritten to describe what is now true.
  - The mirror image: **`freshness.stale_after_days` has always driven the freshness ★3 staleness
    window** while the anchor read like a fixed "≤60 days" and nothing warned it was configurable. A
    repo could set 365 and quietly redefine ★3 with `rubric_hash` unmoved. No behaviour changes; the
    anchor now says it is configurable and the value is fingerprinted.
  - **New `thresholds_hash`** covers all three. `rubric_hash` fingerprints the ruler docgrad ships;
    `thresholds_hash` fingerprints the ruler a repo is actually graded by. One thing it cannot do:
    pre-1.7.0 history lines have no such field, so the round where an inert `economy:` block became
    authoritative reads as "unknown → first value", not as a change. That transition is breakpoint 1
    above, disclosed here because it cannot be detected there.
  - `loadConfig()` finally deep-merges `economy` — it was the only nested map without it, so
    `economy: { pollution_max: 0.2 }` left `entry_cost_tiers` `undefined`. Nothing noticed because
    nothing read the field: the two defects had been hiding each other. `validateConfigTypes` now
    covers nested maps.
- **Fixed (#48) the same claim over unmodified code was judged `pass` in one round and `fail` in
  another, and nothing recorded that it had happened.** Both verifiers described the code correctly;
  they disagreed about whether a generalisation above a table is a claim about its rows. So a
  pass-rate change could not be told apart from documentation decay — and cross-round comparison is
  the reason the ledger exists.
  - The ledger gains **`rationale`** (mandatory on every `fail` and every borderline `pass`: which
    sentence, which code line, why) and **`borderline`**. Previously a later round could re-verify the
    claim but not the judgement, and the judgement was the unstable part.
  - `audit.md` settles the two recurring boundaries instead of asking each round to re-derive them:
    a generalisation adjacent to a structured list is judged **against every row**; an incomplete
    enumeration is not itself a misstatement but is always borderline. "When in doubt, round down"
    still governs what is left.
  - The **borderline count is printed beside the pass rate**, zero included. A field that appears
    only when inconvenient is not a disclosure.
- **Fixed (#49) a graduation gate expires by itself, and nobody finds out.** Producing
  `.docgrad/graduation/docs-gate.mjs` solved "there is no deliverable" and not "nobody runs it".
  Measured: a gate pinned at `min_freshness_coverage: 0.93` in round 8, red from round 9, unreferenced
  by any workflow, unnoticed for four rounds. The cause was not decay but **corpus growth** — the
  denominator went 46 → 50 — which is an action docgrad actively encourages. Note the direction of
  failure: prose nobody follows leaves you *knowing* you have no gatekeeper; a gate nobody runs leaves
  you *believing* you have one.
  - `audit` and `report` now report a present gate's state every round: that it exists, whether any
    workflow references it, and its declared thresholds evaluated against the numbers this round
    already measured.
  - **docgrad does not execute it** — not even when it looks unmodified. It is a Node module committed
    into the repo being graded, and this tool's documented use includes auditing clones of repos you
    did not write. An executed gate also decides its own verdict, so it would carry the whole risk and
    buy no integrity. The check costs nothing because the gate consumes exactly the three script
    outputs the audit already produced. A `THRESHOLDS` block that is not a plain list of numbers fails
    closed: docgrad says it cannot evaluate it and stops.
  - §Graduation's argument is rewritten: a deliverable is **necessary, not sufficient**.
- **Fixed (#51) `anchored_ratio` still recognised only path-shaped coordinates.** v1.6.0 taught the
  claim population to accept API-shaped ones; this signal was left behind, so a library repo scored 0
  **by construction** and `rubric.md`'s traceability note ("<0.5 means claims lack verifiable code
  landing points") fired on repos where every rule had one.
  - Also: **a symlinked entry-file pair was charged twice.** `inventory.mjs` de-duplicates on
    realpath, `retrieval.mjs` de-duplicated on the config string, so `CLAUDE.md -> AGENTS.md` cost 348
    tokens in `entry_cost` and 696 in `marginal_tokens` — while `rubric.md` has always defined
    `marginal_tokens` as counting each file once. The issue flagged this as unverified; a fixture
    reproduced it exactly before anything was changed.
- **Fixed (#52) three smaller doc/code disagreements.** `init.md` said a directory in `docs_files` is
  dropped; it is a hard error with exit 1. `audit.md` described `untracked.files` as if it were a
  complete list; it is capped at 20 — the same shape as the candidate cap v1.6.0 fixed, and the same
  file already documented the identical cap for `out_of_scope`.
  - The third had its location wrong in the issue but the problem was real: the disjunction was in
    `NO_GIT` itself ("git is unavailable **or** this is not a git working tree") while `audit.md` told
    the reader the note says which. It does now — the two causes have different remedies (install git
    / run elsewhere, versus this check can never apply here).

## 1.6.0 — 2026-09-13

Five measurement defects fixed (#40 #41 #42 #44 #45), plus two statements the tool was making about
its own behaviour that turned out to be false. **No ★1-★5 threshold moved and no dimension changed**;
`rubric_hash` moves to `f0ce7d6a` because the Correctness and Economy measurement prose changed.

**What this version asks of you.** Three things, and a patch-level version number would have hidden
all of them:

1. **If you have a `.docgrad/ledger.jsonl`, its keys change.** `claim_id` was `<path>:<line>`; it is
   now `claim_hash`, a content hash the scripts hand you. Existing rows carry a `claim` field, so
   the hashes can be back-computed — the recipe is in `reference/improve.md`. Until you migrate, a
   round that re-verifies old entries will not match them up.
2. **The claim-candidate order reshuffles once.** `refs` now counts API-shaped references as well as
   path-shaped ones, so the ranking changes. Sampling stays fully deterministic; it is the
   continuity with an existing ledger's *draw order* that breaks, not its keys.
3. **Check `claim_population.truncated` before trusting cumulative coverage.** See the candidate
   window entry below — this one contradicts something v1.5.0 told you.

- **Fixed (#42) false broken anchors from underscores next to punctuation.** `extractHeadings()`
  stripped an underscore whenever *either* neighbour was non-alphanumeric, so `### cmd._args` slugged
  to `cmdargs` while GitHub produces `cmd_args` — and a link pointing at that heading was reported
  broken. Broken anchors always cost a star, and linkage is a fully mechanical dimension, so nothing
  prompts an agent to doubt the script: on a real repo the convergence loop **edited a file that had
  nothing wrong with it** to satisfy the false positive. An underscore is an emphasis delimiter only
  when it is part of a matching pair whose outer sides are non-alphanumeric; that is what is now
  implemented. 0.6.1 fixed a narrower case of the same bug and the fix was incomplete.
- **Fixed (#41) the ledger's primary key was destroyed by this tool's own core action.** `claim_id`
  keyed on `<path>:<line>`, and moving content out of an entry file is one of the two prescribed ways
  to improve economy. Every such move invalidates a batch of keys; the next round then reads the
  wrong line, records a false `fail`, and — because failures are re-verified without a cap — consumes
  the following round's new-draw budget. Measured: one round cut an entry file from 9,209 to 5,391
  tokens and invalidated three ledger keys. `claim_candidates` now carries `claim_hash` (sha256, 12
  hex chars) over the claim text with whitespace collapsed and nothing else normalised: a moved claim
  hashes the same, an **edited** claim hashes differently and is re-verified, which is correct.
- **Fixed (#40) on a library repo the correctness dimension had no mechanical basis at all.**
  `extractClaimLines()` recognised a claim by inline code shaped like a *file path*, and library
  documentation describes an *API*. Measured on `tj/commander.js`: baseline `claims_total` **0**, so
  the audit fell back to exactly the free-form sampling `reference/audit.md` forbids — the rule
  contradicted itself, because at zero population it offered no alternative. API-shaped spans now
  count, **guarded** by requiring every segment to exist as a symbol under `src_dirs`; with `src_dirs`
  unset the extension is inert and says so.
  - **Also disclosed: how much of the population docgrad wrote itself.** After that same repo's
    convergence loop wrote three documents in docgrad's house style, **all 26 candidates came from
    those three files and none from the seven pre-existing ones** — the correctness score rose while
    the repo's actual documentation debt was never sampled. `claim_population` and
    `totals.claims_docgrad_authored_ratio` now report this, and the audit must state it.
- **Fixed (#44) `exclude` carried two incompatible meanings and the pollution surface honoured only
  one.** "WIP I am ashamed of" and "content I deliberately scoped out of this run" are different
  claims about a repo and only the first should move a star. Measured on `tj/commander.js`: excluding
  translated mirrors that are graded as their own corpus charged **40.6% pollution** and capped
  economy at ★3 while the fixed cost was a perfect 0 — the one dimension five rounds of convergence
  could not move, blocked by field semantics rather than documentation quality. New list field
  **`out_of_scope:`** takes files out of the corpus without charging them, and its count and token
  total are reported on **every** run, empty or not, so the field cannot become a silent switch for
  zeroing your own pollution surface. A path in both fields stays charged (`exclude` wins), so a
  broad `out_of_scope` entry can never quietly cancel an `exclude` someone already wrote.
  **Default behaviour is unchanged and no existing rating moves**; a config that never uses the field
  hashes exactly as it did before the field existed.
- **Fixed (#45) four of the five scripts could not say which version produced their output.** Only
  `inventory.mjs` emitted the `docgrad` fingerprint. All five now do, in the same position — which
  matters most for `links.mjs`, whose `orphans` field changed shape in v1.5.0: the output most likely
  to be misread across versions was the one that could not identify itself.
- **Fixed: the claim-candidate window was a second, undocumented coverage ceiling — and v1.5.0 said
  it did not exist.** `inventory.mjs` emits only the top-ranked candidates, and a round can only draw
  from what is emitted; once a ledger covers them all, every later round draws zero while
  `claims_total` still reads in the hundreds. v1.5.0's rewritten sampling rule said coverage grows
  "with no ceiling" — true of the mechanism #37 changed, false of the pipeline. A repo under
  long-running convergence was three rounds from hitting it. The window is now the config field
  **`claim_candidates_cap`** (default 60, so nothing changes by default), and `claim_population`
  reports `cap` / `emitted` / `population` / `truncated` with instructions, so a truncated window can
  no longer read as a complete one.
- **Fixed: `coverage.mjs` reported a `scope` it does not honour.** It ignores `--include` and always
  compares the full corpus — its own `note` says so — yet it echoed the requested scope in the same
  object, while `retrieval.mjs`, which also ignores the flag, reports `null`. `scope` now means one
  thing across all five scripts: what the output actually covers, not what the caller asked for.
  `reference/audit.md` contradicted itself on this too and now matches the code.
- **Fixed: the `src_dirs`-unset note overstated what you lose.** It listed `a.b` as an API shape, but
  `a.b` is collected by the *path* matcher and keeps producing candidates with or without `src_dirs`.

## 1.5.0 — 2026-09-13

The repository's working language becomes English, `case-studies/` is added, and five measurement
defects are fixed (#35-#39). **No ★1-★5 threshold moved and the set of dimensions is unchanged**, but
`reference/rubric.md` did change in substance as well as in language, so `rubric_hash` moves and
`report` draws a comparability break here. A second break signal, `corpus_hash`, is introduced. Read
the comparability entry below before deciding what either break means for your history.

- **Changed (language) the whole repo is now English**: `SKILL.md`, all five files under
  `reference/`, `docs/design.md`, `docs/how-to.md`, `evals/` prompts and grader criteria, this
  changelog, `NOTICE.md`, and the comments and test names under `scripts/`, `tests/` and
  `templates/`. `README.md` is English; the Traditional Chinese README is kept in full as
  [README.zh-TW.md](README.zh-TW.md). The skill's `description` keeps its Chinese trigger keywords,
  so `/docgrad` still fires on Chinese phrasing.
  - **Fixtures under `tests/fixtures/` and `evals/fixtures/` were deliberately left in Chinese.**
    They are frozen corpora: their byte and token counts are asserted in the unit tests and recorded
    as baselines in `evals/README.md`, and several of them exist specifically to exercise CJK
    behaviour (`githubSlug()` on CJK headings, CJK-aware token estimation). Translating them would
    silently invalidate the baselines that make the evals meaningful.
  - **Machine-readable strings that tests assert on** (`note` fields, thrown-error text) were
    translated together with their assertions, in the same change. 71/71 unit tests pass.
- **Changed (comparability) `rubric_hash` f46f90cc → 21e957e5.** Three things moved it, and they are
  not equally serious. (1) The file was translated, so the qualitative anchor text is now different
  prose. (2) #37 changed what `correctness_sample` means and added a rule for an unmeasurable
  correctness dimension. (3) #35's evidence about the pollution surface was added under Economy. What
  survived untouched: **every numeric threshold, every ★1-★5 band, and the dimension order that
  breaks ties**. On (1) the honest position is that the qualitative anchors *are* the ruler a model
  reads, and "the same meaning in another language" is an assertion nobody can mechanically check —
  so this is recorded as a **real** break rather than papered over with a hash alias. Consequences:
  - **Mechanical dimensions are unaffected**: linkage, economy, and the mechanical part of freshness
    are computed by scripts, and no model reads the rubric to produce them. Scores across this
    version are directly comparable.
  - **Judged dimensions** (completeness, correctness, consistency) were read off different text
    before and after. Treat a one-star difference across this boundary as unexplained.
  - **No baseline restart is required.** Unlike 1.0.0, the set of dimensions and every threshold are
    unchanged, so the history stays meaningful; `report` draws the break line and you decide.
  - A structural hash — over the thresholds and the anchor ordering rather than the file bytes —
    would distinguish a translation from a real rubric change and remove this class of false break
    entirely. Not implemented; it is in the repo's open issues.
- **Changed (instruction) the convergence commit message is no longer hard-coded to Traditional
  Chinese**: `reference/improve.md` now says to write it in the target repo's own language, taken
  from `language:` in its `.docgrad.yml`. The message structure is unchanged.
- **Added `case-studies/`**: measured runs with the commands to reproduce them —
  [commander.js](case-studies/01-commander-js.md) (real agent token usage on one feature-design task,
  before and after convergence), [docgrad on itself](case-studies/02-docgrad-self.md) (nine real
  rounds, re-measured under one ruler), and [the eval fixtures](case-studies/03-fixtures.md)
  (is the star rating reproducible, and does the English rubric rate the same as the Chinese one).
  `case-studies/measure/token-usage.mjs` reads Claude Code's own subagent transcripts and reports
  real per-run token usage.
- **Added (README) agent-executable install and update instructions**: blocks you can paste into any
  Claude Code session to have the agent install, update, or go from zero to a first scorecard, plus
  docgrad's own always-on and on-invoke token cost as reported by `claude plugin details docgrad`.
- **Fixed (#39) `links.mjs` reported `orphans: []` when it had not computed orphans at all.**
  `reachable_ratio` correctly returned `null` under the same condition; `orphans` returned a value
  indistinguishable from "computed, and there are none". Measured on `tj/commander.js`: all seven of
  its documents were mutually unreachable, `index_file` was unset, and the JSON said zero orphans.
  `orphans` is now `null` whenever reachability was not computed — no `index_file`, or a scoped run —
  which is what `reference/audit.md` already claimed for scoped audits. **This changes the output
  type**: anything reading `orphans.length` must handle `null`. `templates/docs-gate.mjs` now treats
  "not computed" as its own violation rather than a silent pass.
- **Fixed (#38) `retrieval.mjs` counted entry files twice in `marginal_tokens`** when an entry file
  also sat on the index chain, and again when the same path was listed twice in `entry_files`. Every
  file is now counted once, which is what `reference/rubric.md` already specified — the code was
  wrong, not the spec. Report-only: **no star rating changes**, but scenarios whose entry file is
  reachable from the index will report a lower `marginal_tokens` than v1.4.0 did. `max_depth` was
  examined and left alone; it is a per-document maximum with no summation, so it could not
  double-count.
- **Fixed (#38) misconfigured fields failed silently.** `docs_files: PRODUCT.md` — a scalar where a
  list belongs — made `for…of` iterate the string character by character, every character failed
  `existsSync`, and **no files were collected with no error raised**; the only symptom was that
  `files_total` did not move. All list fields (`docs_dirs`, `docs_files`, `entry_files`, `exclude`,
  `src_dirs`, `scenarios`), the new boolean, and single-path fields (`index_file`) now throw an error
  that names the field and shows the correct form. `index_file: null` remains a legitimate answer; a
  key with nothing after the colon does not, because that parses as an empty mapping rather than as
  null. **Repos that have been quietly collecting nothing will now fail loudly** — that is the point.
- **Fixed (#37) the claim ledger's coverage had a hard ceiling, and worse documentation sampled
  less.** The old rule topped the round up to `correctness_sample` *total* verifications, so
  re-verification crowded out new draws; the fixed point sat at `2 × correctness_sample − 1` distinct
  claims and one real repo froze at 23 of 335 (≈7%) no matter how many rounds it ran. Because every
  `fail` was re-verified while only half the passes were, a repo with more failures got *fewer* new
  samples — the incentive pointed the wrong way. **`correctness_sample` now means new claims drawn
  per round, not claims verified per round.** A round verifies: every outstanding `fail`/`stale` (no
  cap, so the pass rate stays honest), up to `floor(correctness_sample / 2)` least-recently-verified
  passes, plus `correctness_sample` new draws that re-verification can no longer reduce. Coverage now
  grows by `correctness_sample` every round without a ceiling. **Comparability**: no threshold moved,
  but old pass rates were increasingly dominated by claims already known to be correct, so they read
  high — the more so the larger the ledger. Treat a pre-change ★4 as no stronger than a post-change
  ★4, never the reverse; coverage *trajectories* across this change are not comparable at all.
- **Added (#37) a rule for a correctness dimension that cannot be measured.** Every correctness anchor
  is phrased as a pass rate, and a pass rate over zero claims is undefined — which is the normal case
  for a library whose documentation describes an API rather than file paths. Four independent runs on
  the same fixture rated it ★3, ★3, ★1 and ★2, each defensibly. Correctness is now reported as
  `n/a (not measurable)`, recorded as `null` in `history.jsonl`, counted as met for targets and
  removed from the loop's working set — the same handling as a design ceiling, for a different
  reason. The report must say what to do about it: the corpus needs claims anchored to real code
  coordinates, which is completeness and placement work, not correctness work.
- **Added (#36) `corpus_hash`**, alongside `rubric_hash` in every `inventory.mjs` run and in each
  `history.jsonl` round. Changing `docs_dirs`, `docs_files`, `entry_files`, `exclude`, `index_file`
  or `exclude_untracked` moves `files_total`, `claims_total`, the freshness denominator and the
  pollution denominator at once — every score across that round becomes incomparable while
  `rubric_hash` does not move a character. Until now the only defence was a hand-written line in
  `history.jsonl`'s `notes`, and a hand-written record is exactly what docgrad marks other repos down
  for. `report` now draws a break on this field too. Rounds recorded before this version carry no
  `corpus_hash` and are treated as unknown, which does not block anything.
- **Added (#35) visibility for the pollution surface's irreproducibility, and an opt-in fix.** The
  pollution ratio is a **rated** input, and it is computed by walking the filesystem rather than
  asking git — so an untracked local draft inside an excluded directory changes a star rating.
  Measured on one repo at a single commit: ratio 0.1066 in a working checkout against 0.0517 in a
  clean worktree, with the `pollution_max: 0.1` downgrade threshold sitting between them. Two people
  can rate the same commit differently, and nothing in the output said why. Now: `inventory.mjs`
  reports an `untracked` block (count, tokens, paths — all `null` rather than zero when git is
  unavailable), `pollution` carries a `note` whenever a collected file is untracked, and
  `.docgrad.yml` accepts `exclude_untracked` to measure the clean-checkout corpus instead.
  **The default is `false`, so no existing rating changes** — a silent change to everyone's economy
  star is precisely the failure this tool exists to catch. Untracked files are detected as the
  complement of `git ls-files`, deliberately **not** via `--exclude-standard`, which would have
  filtered out the gitignored draft that motivated the whole issue.
- **Known, not fixed**: `exclude` still cannot distinguish "WIP I am ashamed of" from "content I
  deliberately scoped out of this run". On `tj/commander.js`, scoping out translated mirrors charged
  40.6% pollution and capped economy at ★3 while the fixed cost was a perfect 0 — the one dimension
  the convergence loop could not move. That needs a second field and a rubric decision about what the
  pollution surface is actually measuring; it is not addressed here.

## 1.4.0 — 2026-09-13

`.docgrad.yml` adds a new field `docs_files`: brings **single** markdown files outside
`docs_dirs` into the corpus as **ordinary documents** (`type: 'doc'`). **The ★1–★5 anchor text
is unchanged, word for word**, `reference/rubric.md` is unmodified, `rubric_hash` is unchanged.

- **Added (field) `docs_files`**: prompted by oikos wanting to bring root-level `PRODUCT.md`
  (4,378 tokens / 12 claims) and `DESIGN.md` (8,059 tokens / 3 claims) into scoring, which
  revealed the **schema couldn't do it** — corpus collection has exactly one site-wide chokepoint,
  `scripts/lib.mjs › collectFiles()`, all five scripts go through it, and it only accepts
  directories (`docs_dirs`) and single-file entries (`entry_files`/`index_file`). Three workarounds,
  each with a cost:
  - Putting a single file in `docs_dirs` **blows up**: `ENOTDIR: not a directory, scandir
    '…/PRODUCT.md'` (writing it as `PRODUCT.md/` doesn't help either — `path.join` normalizes
    away the trailing slash).
  - `entry_files` picks up the file, but `inventory.mjs › fileType()` labels it `entry`, sending
    it straight into `entry_cost.tokens_est`: oikos measured **9,037 → 21,474**, crossing the
    20,000 threshold in `economy.entry_cost_tiers` → economy **★3 → ★1**. **And that cost is
    fake**: in oikos, these two files are conditionally loaded (the entry file says to read them
    "before starting UI/visual work"), while `reference/init.md`'s criterion is "the agent
    auto-loads it on every task." `reference/audit.md` §Economy also mandates that an auditor
    who finds `entry_cost.files` mismatching reality must record it as a deduction — which
    amounts to trading an inflated fixed cost for a permanent deduction.
  - `docs_dirs: [docs/, ./]`: `collectFiles` does **not** dedupe across `docs_dirs` (dedup only
    happens in the single-file loop), so the whole of `docs/` gets counted twice; and under repo
    root there are floating directories like `.claude/worktrees/` too, so the score becomes
    machine-dependent and non-reproducible.
- **The difference from `entry_files` is "when it's loaded," not "how important it is"**:
  always-loaded → `entry_files` (counts toward fixed cost); conditionally loaded → `docs_files`
  (doesn't count). Either one will pick up the file, and **picking the wrong one won't error —
  it will just distort economy**, inflating it in one direction or underreporting it in the
  other. The criterion and the cost of choosing wrong are written into `reference/init.md`'s
  questionnaire (added as item 3, with later items renumbered).
- **Semantics aligned with the existing single-file entry**: file doesn't exist → silently
  skipped (same as `entry_files`); files already scanned by `docs_dirs` aren't double-counted;
  `exclude` still takes priority (listing a file in `docs_files` doesn't override it — it's still
  counted toward the pollution surface); **it is not a reachability root** — `links.mjs`'s roots
  are still only `index_file` + `entry_files`, and `docs_files` is judged for orphan status the
  same way as an ordinary document. This is deliberate: if no document links to a conditional
  document, the agent can only find it by guessing.
- **Fixed in passing (lib)**: the error message when a single-file entry points at a directory.
  It used to blow up only once `inventory.mjs` tried to read the file, with
  `EISDIR: illegal operation on a directory`, giving no clue which config field was wrong. Changed
  to throw immediately in `collectFiles()`: "`docs_files` may only list a single file, but
  `docs/` is a directory — put the whole directory in `docs_dirs` instead," shared across
  `entry_files`/`index_file` on the same code path.
- **⚠️ Score comparability across 1.4.0 — affects only repos that actually set `docs_files`**.
  Bringing in new files also moves `files_total`/`claims_total`/`tokens_est`, freshness's
  denominator, and the population behind orphans and reachable ratio — that repo's scores
  **cannot be directly compared** across 1.4.0; the baseline should be recalculated from the round
  in which this field was introduced (same nature as the 1.3.0 freshness note: a measurement-scope
  correction, not a quality regression). **Repos that don't set this field see no change in
  output at all** — it defaults to an empty array, no need to rerun `init`.
  - oikos actually ran it (`docs_files: [PRODUCT.md, DESIGN.md]`, `--config` external, no file in
    that repo modified): `files_total` 46 → 48, `claims_total` 317 → 332, `tokens_est` 134,253 →
    146,690, freshness `coverage_ratio` 93.48% → 89.58% (the two newly added files have no
    frontmatter date, so the denominator grows), pollution surface 11.77% → 10.88%.
    **`entry_cost.tokens_est` stays at 9,037** (which is exactly the point of this field), dead
    links/broken anchors/orphans 0/0/0, reachable ratio 100%, `coverage.mjs`'s
    undocumented/drifted are unchanged.
  - `retrieval.mjs` (report-only, doesn't count toward stars) also moves: once the new files are
    in the link graph, a doc that was previously unreachable from `index_file` may become
    reachable, and `marginal_tokens`/`max_depth` shift upward accordingly (oikos measured
    `lib/balance.ts` 32,655 → 41,058, `max_depth` 1 → 3). That's a retrieval path that already
    existed but wasn't visible before now being counted — it isn't the cost getting more expensive.
- **Tests**: 66 → 71 (collecting single files outside `docs_dirs`, dedup, silently skipping
  missing files, `exclude` priority, throwing on a path that points to a directory, `type: 'doc'`
  and excluded from `entry_cost`, orphan detection matching ordinary documents). Added fixture
  `tests/fixtures/docs-files/`, and confirmed by actually removing the `docs_files` loop that all
  5 of these go red.

## 1.3.1 — 2026-09-13

Release process aligned with the official toolchain; pure metadata/docs, no change to any
judgment semantics.

- **`marketplace.json` gets a marketplace-level `description`**: previously only the plugin entry
  had a description, the marketplace itself didn't, `claude plugin validate .` reported a
  warning, and browsers saw an empty field. After the fix, validate is fully green with no
  warnings.
- **Release tags now use `claude plugin tag --push`**: official format is `docgrad--v<version>`
  (annotated); before creating a tag it verifies `plugin.json` matches the marketplace entry, so
  tags are no longer typed by hand.
  - v0.2.0 through v1.3.0 have been backfilled with official-format tags pointing at **exactly
    the same commit** as the old tags (verified one by one against `plugin.json`'s version
    number).
  - The old `vX.Y.Z` lightweight series is kept, not deleted (external links may point to them),
    but **new versions only get the official format** — the two series coexisting only needs to
    cover existing history, not keep growing.
- **`docs/how-to.md` §Cut a release**: rewritten as 7 steps, adding `claude plugin validate .`
  as a pre-release step.

## 1.3.0 — 2026-09-13

A batch of P1s: all come from real runs against oikos/dream-calm-true, not hypothesized.
**The ★1–★5 anchor text is unchanged, word for word.**

- **Fixed (#15, freshness) backfill self-pollution**: git date comparison now excludes docgrad's
  own convergence commits (the `docs(docgrad):` prefix), taking the most recent non-docgrad
  commit instead.
  - Before: after oikos round 1 backfilled `last_updated` for 39 files, that very commit pushed
    the git date of all those files to that same day, so round 2 got **38 false mismatches** —
    half of the second round was spent cleaning up the measurement fallout from the first.
  - **Comparing freshness scores across 1.3.0**: old scores may include false mismatches and run
    low; that's a correction, not a regression.
- **Added (#15) `date_concentration`** (report-only, doesn't affect the star rating): the largest
  same-day share. oikos measured **0.68** (28/41 files stuck on the backfill day) — these files
  will age in lockstep and go stale in lockstep; a `coverage_ratio` of 95% can't tell you who's
  actually been neglected.
  It can't distinguish "backfill" from "genuinely edited at the same time" — it only flags, it
  doesn't judge.
- **Added (#14) graduation artifact**: `templates/docs-gate.mjs` + `templates/docs-gate.yml`. At
  closeout these get copied into the target repo's `.docgrad/graduation/`, with thresholds set to
  match current state — **produced but not installed**, and never written into `.github/`.
  Blocker #3's "don't touch CI" means not auto-modifying it, not that materials can't be produced.
  - Motivation: convergence naturally decays without a gate. On the **same day** oikos closed
    out, a new orphan appeared (`utm-convention.md`) along with a file missing `last_updated`
    (coverage 95.1%→90.7%), and both were still there two months later. Prose recommendations
    produce no artifact, so no one acts on them.
  - `docs-gate.mjs` deliberately does **not** import `lib.mjs` (it gets copied out, decoupled from
    docgrad's install path); instead it calls the already-installed scripts to read the JSON.
    `exit 1` = docs don't meet the bar, `exit 2` = environment problem, so CI can tell whose fault
    it is.
  - The template explicitly notes that dead links/formatting can use more mature off-the-shelf
    tools instead (lychee, markdown-link-check, markdownlint, Vale); docgrad's scripts add
    differentiated value on orphans/reachability and entry-file token budgets.
- **Added (#17) `.docgrad/out-of-scope.jsonl`**: findings outside docgrad's remit (stale code
  comments, CI, product decisions) now land in a machine-readable file, append-only never
  rewritten, and the closeout report must list all `status: open` items with their count.
  - Motivation: oikos round 3 caught `lib/supabase/server.ts`'s docstring going stale, and could
    only write it into notes — still there two months later, because natural-language notes have
    nothing tracking them.
- **Fixed (#13) `report`'s branch divergence**: now checks
  `git rev-list --count HEAD..docgrad/converge` first; if it's > 0, the report warns at the top
  that the trend may be incomplete; the header always states the data source as
  `<branch> @ <short-sha>`.
  - Motivation: oikos's main history stopped at round 4 ("all dimensions ★4, targets met"), but
    the truth was on an unmerged converge branch (round 5 recorded consistency at ★2). Running
    `report` on main gave an overly optimistic trend that didn't match reality, with no warning
    at all.
- **Relaxed (#18) "one dimension per round"**, with two exceptions, both of which must be noted
  in the report:
  - A **trivial-fix allowlist** (dead links, orphans missing from the index, typo-level
    consistency) may be fixed opportunistically in any round — these three categories have full
    mechanical verification, there's no risk of "fixing it halfway and leaving a contradiction,"
    and the rule blocking them just pushes zero-risk fixes to the next round.
  - **Small-corpus mode** (`tokens_est` < 10,000 or `files` < 5) allows multiple dimensions in one
    round. dream-calm-true's scorecard noted to itself that "the two install methods could be
    unified, but changing it would violate one-dimension-per-round" — and a two-line, zero-risk
    fix got pushed out just like that.
  - Neither exception waives step 4's verification: if any dimension drops, revert regardless.
- **Tests**: 64 → 66 (a docgrad commit doesn't count as a content update, `date_concentration`
  catches backfill traces).

## 1.2.0 — 2026-09-13

Filled in the three Testing items from the Anthropic skill authoring checklist (#19), and fixed a
sampling blind spot exposed only while building the evals.

- **Added (#19) skill-level eval suite**: `evals/`, laid out per `claude plugin eval`'s
  `prompt.md` + `graders/*.md` convention, three cases each guarding one failure mode:
  - `linkage-known` — **reproducibility**: dead links 1/12 = 8.33%, and per the anchors that can
    only be linkage ★2, with no room for interpretation. The star rating must be perfectly
    consistent across multiple runs; any divergence gets tracked as a defect.
  - `planted-contradiction` — **sampling coverage**: the contradicting sentence is deliberately
    placed next to the anchor line (that line itself carries no code ref).
  - `clean-baseline` — **false positives**: a fully clean repo must not be docked. Without this
    check, every increase in sensitivity risks quietly turning into false positives everywhere.
  - The mechanical baselines for the three mini-repos in `evals/fixtures/` are listed in
    `evals/README.md`; the graders' assertions are built on these actually-measured numbers, not
    estimates.
  - **Not yet executed**: `claude plugin eval` reports early access locally. The cases are
    written but have never been run once; the docs list no scores. `case.yaml`'s field schema is
    undocumented, so this suite deliberately doesn't write `case.yaml` — better to forgo advanced
    features than guess the format; `--runs`/`--model` are always passed as CLI flags.
- **Fixed (lib) `extractClaimLines` missed the sentence next to an anchor line**: discovered while
  building `planted-contradiction`. The 1.1.0 implementation only picked up lines that themselves
  carried a code ref, but **contradictions are often written in the sentence right after the
  anchor line** — exactly what happened with oikos's balance sign issue, so the new mechanism
  would have reproduced the very blind spot it was meant to fix.
  - Candidates now additionally carry `section` (the heading they belong to) and `section_lines`
    (the start/end line numbers of that section).
  - `reference/audit.md` step 3 now specifies that **the verification scope is the entire
    `section_lines` range**; any sentence within the section that mismatches the code is recorded
    as `fail`, with `claim_id` pointing at the offending line.
  - The definition of `claims_total` is unchanged (still lines that themselves carry a code ref),
    so the cumulative coverage denominator is unaffected.
- **Release process**: `docs/how-to.md` §Cut a release adds "run the evals" as a required step
  (once access is granted), and states explicitly that a report may not fill in scores that were
  never run.
- **Tests**: 63 → 64 (section scope must cover the neighboring sentence, and must not cross into
  the next heading).

## 1.1.0 — 2026-09-13

Correctness sampling changed from "the LLM picks freely each round" to mechanically determined
and accumulated to disk, with history now carrying a version fingerprint.
**The existing ★1–★5 anchor text is unchanged, word for word** — what changes is which claims get
sampled, and what numbers sit next to the score.

- **Fixed (#12) correctness score not reproducible**: re-verifying on the same day as oikos's
  closeout on 2026-07-13, consistency went ★4→★2 (`transactions-design.md`'s balance sign was
  the opposite of `lib/balance.ts`, "not covered by the first four rounds' sampling"). The root
  cause wasn't that the anchors weren't fine-grained enough — it was that **sampling was
  unconstrained**: no matter how fine the anchors, they don't control "which ones get sampled."
  - **The sampling population and draw order are now produced by scripts**: `inventory.mjs`
    adds `totals.claims_total` (non-heading lines outside fences that carry code coordinates) and
    `claim_candidates` (stably sorted by ref count → path → line, top 60 taken). The same corpus
    produces exactly the same order every run (verified with tests).
  - **The ledger accumulates to disk**: `improve`/`loop` append to `.docgrad/ledger.jsonl` each
    round (`claim_id` = `<path>:<line>`, append-only, never rewritten; a new line is appended on
    re-verification, so you can see when something broke and when it was fixed). When line
    numbers drift, the old `claim_id` is kept and marked `moved_from`, to avoid inflating
    cumulative coverage.
  - **Each round re-verifies before sampling new ones**: everything `fail`/`stale` is fully
    re-verified; half of `pass` gets resampled (taking even-indexed positions by sorted
    `claim_id`, reproducible). `audit` **reads** the ledger but doesn't write to it — consistent
    with the rule that "audit is a pure report, it doesn't write to disk."
  - **The report now reads "star rating + coverage"**: `correctness ★4 (pass rate 8/8, cumulative
    coverage 23/68 = 34%)`. A pass rate of 8/8 means something very different at 5% coverage
    versus 60% — giving only the star rating would let readers overestimate confidence. Coverage
    doesn't affect the star rating.
  - Under a scoped audit, cumulative coverage **cannot be reported** (the denominator has been
    narrowed by `--include`, so it means something different from the full-repo figure); the
    ledger is still read, not written.
- **Added (#16) version fingerprint in history**: every line now carries `docgrad_version` and
  `rubric_hash` (the first 8 chars of the sha256 of `reference/rubric.md`'s contents), supplied
  by `inventory.mjs`'s new `docgrad` block, not filled in by the LLM itself. `report` now draws a
  comparability break wherever `rubric_hash` changes — fixing "the ruler changed, but it got
  drawn as a quality regression" (this repo's own round 9 consistency ★5→★4 was exactly this
  case, and at the time it could only be written up as prose in the notes). Old records missing
  the field are treated as unknown and don't block anything.
- **Added (lib)**: `docgradMeta()` (version + rubric fingerprint, returns `null` instead of
  throwing when the file can't be read), `extractClaimLines()`, `rankClaimCandidates()`.
- **`report`**: when `.docgrad/ledger.jsonl` exists, it now also reports cumulative coverage and
  which claims are currently still `fail`/`stale`.
- **Tests**: 59 → 63 (rubric fingerprint changes with content, missing file returns null, claim
  line extraction excludes fences/headings, candidate ranking is stable).

## 1.0.0 — 2026-09-13

> ### ⚠️ BREAKING — rubric structure changed, historical scores need to be recalculated
>
> Adds a sixth dimension, **economy**. Existing `.docgrad/history.jsonl` records in each repo are
> missing the `economy` key, and **"targets met" and overall scores are not comparable across
> 1.0.0** — a convergence loop should restart its baseline (keep the old records, don't delete
> them). **The existing five dimensions' ★1–★5 anchor text is unchanged, word for word** —
> what's incomparable is the dimension composition, not each dimension's own scale.
>
> Upgrade action: rerun `/docgrad audit` on each already-onboarded repo to get a six-dimension
> baseline; `.docgrad.yml` doesn't need to change to run (when `targets.economy` and `economy.*`
> aren't set, defaults apply) — only add fields if you want to adjust the target.

- **Added (dimension) economy** (issue #11): fixed cost and pollution surface are promoted from
  report-only to a star-rated dimension.
  - Anchors: ★1 fixed cost > 20,000 tokens / ★2 > 10,000 ≤ 20,000 / ★3 > 5,000 ≤ 10,000 /
    ★4 ≤ 5,000 and pollution surface < 10% / ★5 ≤ 3,000, pollution surface < 10%, and the
    entry-file token budget is enforced by a mechanical gate.
  - Downgrade rule: when pollution surface ≥ 10%, this dimension is capped at ★3 (otherwise "low
    cost but heavily polluted" would fall into a gap between anchors with no star to assign).
  - Fully mechanical (`inventory.mjs`'s `entry_cost.tokens_est` and `pollution.ratio`), no LLM
    judgment involved.
  - **★5 is judged a design ceiling**: the required mechanical gate touches CI, hitting
    Blocker #3 → capped at ★4 within loop, the same nature as freshness ★5
    (`reference/improve.md` §Dimension cap already has two such examples).
  - Dimension ordered last: it runs counter to completeness (adding documentation pushes fixed
    cost up), so on a tie, content dimensions move first, avoiding loop oscillating between
    "add it back then remove it."
- **Why add a dimension instead of just reporting**: completeness rewards coverage, and when it's
  report-only, every legal move for loop each round is "add more documentation," with nothing
  pushing content not worth its tokens out of the entry file. External evidence (comparisons of
  multiple coding agents on SWE-Bench Lite and AgentBench) shows longer context files raise cost
  without necessarily raising success rate. The cost of adding a dimension (major bump + history
  recalculation) was paid knowingly — contrast with 0.5.0, which deliberately did **not** add a
  sixth dimension when widening consistency's scope: that change was to the judging scope of an
  existing dimension, this one changes the reward direction itself.
- **`improve`'s fix for economy has guardrails**: only "move entry-file content out, leaving just
  a pointer" and "move WIP/historical baggage out of the corpus" are allowed. Anything moved must
  land inside `docs_dirs` and be reachable from the index, otherwise completeness/linkage would
  drop and the verification step blocks it. **Deleting content that's still correct and still
  needed, just to cut cost, is forbidden**; when the only way to bring the cost down is deletion,
  it's judged a plateau, and the trade-off is handed to the user.
- **`report`'s handling of the break point**: rounds missing the `economy` key belong to the
  five-dimension era; that dimension is drawn as `—`, the trend chart draws a break line there
  with a note that it can't be compared to newer rounds.
- **Config**: `targets.economy` (default 4) and `economy.entry_cost_tiers`/`economy.pollution_max`
  (default `[20000, 10000, 5000, 3000]`/`0.1`). Defaults apply when unset; existing repos don't
  need to rerun `init`. Changing the thresholds = changing the rubric anchors = historical scores
  losing comparability; `init` already states "lower the target rather than change the
  threshold."
- **`init` questionnaire**: `entry_files`'s criterion now spelled out explicitly — "the agent
  auto-loads it on every task," not "important." Listing a customer-facing GitHub landing page
  here is a fixed tax paid for nothing (this repo stepped on this itself, see #22 in 0.6.2).
- **scoped audit**: economy **cannot be star-rated under scope** (both fixed cost and pollution
  surface are full-corpus concepts); it reports "not applicable (requires a full audit)," and
  must not be marked ★1 because of that — same as linkage's orphans/reachable ratio.
- **Tests**: 59 (added assertions for the defaults of `targets.economy` and `economy.*`).

## 0.6.2 — 2026-09-13

Structural fixes following a cross-project retrospective (oikos/dream-calm-true/this repo/
kdan-bpm) and comparison against Anthropic's official skill authoring best practices.
**No star-anchor semantics changed; historical score comparability is unaffected.**

- **Fixed (#20) internal inconsistency in the docs**: four places still said "four scripts,"
  but `retrieval.mjs` has been the fifth since 0.6.0.
  - `reference/rubric.md`'s scoring principles item 1, and two places in `reference/improve.md`
    (the placement boundary, graduation recommendations), changed to five.
  - `reference/audit.md` §scoped audit's "four scripts plus `--include`" was doubly wrong: only
    inventory/links/freshness accept that flag, coverage/retrieval deliberately don't
    (`SKILL.md` already documented this). Changed to three, and stated explicitly.
- **Fixed (#21) reference depth and long-file table of contents**: official guidance requires
  every reference file to be reachable from SKILL.md in one hop, and files >100 lines need a
  Contents section.
  - `reference/placement.md` was previously only reachable via rubric.md/audit.md (two hops), yet
    it's the basis for judging consistency's placement/duplication. Blocker #2 now names it
    directly, and it's been made reachable in one hop.
  - `docs/design.md` (161 lines), `reference/audit.md` (151 lines), and `reference/rubric.md`
    (126 lines) got a Contents section added.
- **Fixed (#24) trimmed the rubric body**: version history moved into a `<details>` block titled
  "Version history and comparability notes" at the end of the file; the main body's measurement
  column for each dimension now just points to it in one line. rubric.md is mandatory reading per
  Blocker #2, so every scoring pass pays its token cost; version history is only needed when
  comparing scores across versions.
  - **The anchor table and measurement methods are unchanged, word for word** — only the
    historical notes moved. Freshness ★5's graduation-only note remains a **current rule**
    (improve.md's design ceiling depends on it), not history, so it stays in the main body — only
    the comparability sentence moved into details.
  - Also backfilled 0.2.0 (completeness moved to a mechanical basis via coverage) into the history
    list.
- **Fixed (#26, lib) `collectFiles()` missed `index_file`**: when `index_file` sat outside
  `docs_dirs` and wasn't in `entry_files`, it didn't enter the corpus, so it got filtered out of
  `links.mjs`'s roots (roots only recognize in-corpus paths), and **the entire subtree only
  reachable from the index was misjudged as orphans**, with `reachable_ratio` also marked down
  and no note at all. The index is inherently part of the documentation system, so it's now
  brought into the corpus the same way `entry_files` is.
  - Affected: repos with the index at repo root — their linkage rating was **understated** in
    the past, with deductions even pointing at files that had no problem.
    `index_file` inside `docs_dirs` is unaffected.
  - Regression test: added `tests/fixtures/root-index/`, confirmed red before the fix.
- **Fixed (#22) this repo's own `.docgrad.yml` misreported fixed cost**: `entry_files` used to
  include `README.md`, but that's a GitHub landing page, not part of agent context. After
  removal, fixed cost went 2,823 → **1,047 tokens** (the old value was inflated 1.7x). Also added
  `src_dirs: [scripts/]` and `scenarios:`, taking coverage/retrieval out of degraded mode.
- **Fixed (#23) frontmatter**: `license` changed to the valid SPDX identifier `MIT` (the old value
  `MIT. See NOTICE.md for attribution.` mixed in explanatory text); removed `user-invocable: true`
  (that field defaults to true anyway; it's only meant for setting to false).
  - **`allowed-tools` not adopted**: a Bash rule must match exactly up to the first `*`, and a
    skill doesn't know its own installed absolute path at authoring time; the only portable
    pattern is `Bash(node *)`, which effectively pre-authorizes any node command. Instead,
    `docs/how-to.md` teaches users to add a rule using their own absolute path.
- **Verification**: `node --test tests/*.test.mjs` **59 pass**; this repo's dead 0/bad_anchors
  0/orphans 0/reachable 1.0, freshness coverage 1.0/stale 0/mismatch 0/pollution surface 0%
  (the newly added Contents anchors all pass the check after aligning with GitHub slug rules).

## 0.6.1 — 2026-09-05

- **Fixed (links/lib)**: a family of three false broken-anchor reports, all traced to slug
  generation being inconsistent with GitHub. Measured against kdan-bpm, 18 `bad_anchors` went to
  zero after the fix (dead 0/orphans 0/reachable 1.0 unchanged).
  - `githubSlug()` now converts each run of whitespace to one dash (previously collapsed `\s+`
    into a single dash). Adjacent whitespace left behind after punctuation is stripped produces a
    double dash on GitHub: `## 狀態圖例 (status / sot_level legend)` →
    `狀態圖例-status--sot_level-legend`.
  - `extractHeadings()` now only strips underscores used **for emphasis**; underscores inside a
    word are literal (per GFM rules). It used to strip them unconditionally, so `sot_level` got
    computed as `sotlevel`, breaking every link to that section.
  - `extractHeadings()` now recognizes explicit anchors `<a id="x">`/`<a name='x'>` (including
    ones with other attributes before them). Long-lived links often switch to explicit anchors;
    previously only `#` headings were recognized, so all of these were misreported.
- **Fixed (inventory)**: `entry_cost` now dedupes symlink aliases — when multiple entry names
  point at the same physical file (e.g. `CLAUDE.md -> AGENTS.md`), the agent only loads it once,
  but summing per name doubled the fixed cost (measured 5,792 vs a true value of 2,896). `files`
  still lists every name; a new `symlink_aliases` marks the collapsed aliases.
- **Docs**: `reference/audit.md`/`reference/rubric.md` removed the exception "manually confirm
  `cjk_uncertain` broken anchors before counting them" — that exception existed only to paper
  over the bug above; now that it's fixed, broken anchors are always counted, and
  `cjk_uncertain` is downgraded to an informational field.
- **Tests**: 54 → 58 (one each for the double-dash slug, in-word underscores, explicit anchors,
  symlink dedup).

## 0.6.0 — 2026-09-04

- **Added (script)**: fifth measurement script `scripts/retrieval.mjs` — traceability and
  marginal cost, report-only (doesn't count toward stars). For each entry in `.docgrad.yml`'s new
  `scenarios:` field (a list of representative code paths), it computes `marginal_tokens`
  (entry_files + index chain + anchoring doc tokens, each file counted once), `max_depth` (how
  many hops a BFS from `index_file` needs to reach the farthest anchoring doc), `fan_in` (how
  many docs anchor it), `code_pointer` (whether that path's code points back to any doc), and
  `churn_commits` (commit count over the past 90 days, weighted to flag the "most heavily taxed"
  scenario); when there's no `scenarios:`, it still gives `areas` (`code_pointer`/`fan_in` per
  top-level subdirectory of `src_dirs`) and `index_hotness` (`index_file`/`entry_files`'s
  90-day commit count `ratio` against the median across all docs, plus `top5`). Doesn't accept
  `--include` (same reasoning as `coverage.mjs` — traceability is a full-index/retrieval concept).
  Added the pure function `lib.mjs › extractCodeRefs()`: extracts backtick-wrapped paths that
  start with a `src_dirs` prefix, `` `path › symbol` `` form, and bare filenames (matched against
  basename), shared by `retrieval.mjs`/`inventory.mjs`, with no directory name hardcoded. A hit in
  the ancestor direction (a doc pointing at a parent directory of the query) only counts a ref
  **strictly deeper than the owning `src_dirs`** — a mention of the whole app in general doesn't
  count as "a doc that governs this file," otherwise the same doc would be a fixed hit for every
  scenario.
- **Added (field)**: `inventory.mjs` now outputs `structure: {h2: [{title, tokens_est}], rules:
  {count, median_chars, p90_chars, anchored_ratio}}` per file (`rules.pattern` is a new config key,
  default `**MUST`; a list item containing that string counts as a rule line; `anchored` means
  that line itself yields coordinates via `extractCodeRefs`); `totals` adds `rules_total`/
  `rules_anchored_ratio` (aggregated across all files, not a per-file average). Files with no H2
  still get a `structure`, just empty.
- **Fixed (measurement artifact)**: `freshness.mjs`'s `freshness.convention` now accepts multiple
  values separated by comma/`+` (`frontmatter, heading-line`), and `extractClaimedDate` tries them
  in order, taking the first one it extracts; the output `convention` always returns the actual
  list adopted (previously a single value was also a string — this is an output shape change, not
  a measurement semantics change — `coverage_ratio`'s judgment logic itself is unchanged). Added
  `freshness.heading_field` (the in-line keyword used for heading-line); when only `field` is set
  and convention includes heading-line, it falls back to using `field` (backward compatible with
  old config). Fixes the measurement artifact where "only one date convention is recognized at a
  time, so repos mixing conventions show a falsely low `coverage_ratio`, requiring manual
  deduction every round" (motivation: kdan-workforce measured that
  `docs/superpowers/specs/` uses frontmatter while `docs/integrations/`+`docs/runbooks/` use
  heading-line, and a single value only recognized about 76%).
- **Compatibility**: this version is **not a rubric anchor change** — the ★1–★5 judgment
  thresholds are unchanged, word for word, and historical score comparability is unaffected
  (both the Token Economy and the new "traceability" section are report-only). The new
  `.docgrad.yml` fields (`scenarios`/`rules`/`freshness.heading_field`) are all optional; when
  unset, the four existing scripts' output is unchanged; `freshness.convention`'s single-value
  behavior is unchanged. Existing repos don't need to rerun `/docgrad init` to keep using the old
  config — only add fields to use the new signals.

## 0.5.0 — 2026-07-26

- **Added**: `reference/placement.md` — information placement policy. Three trade-off axes
  (access cost / drift risk / audience breadth) decide the authoritative home for each category of
  information: putting everything in the entry file is the lowest access cost but the most
  expensive in token tax and the most prone to rot, so audience breadth arbitrates. Six decision
  rules, including how to cut decision-relevant information — **the rationale for a current
  conclusion is written into the spec it constrains**, not into a separate log (rationale and
  conclusion travel together, overwritten rather than accumulated, and must include the rejected
  alternatives and the conditions that rejected them); debate history stays in an issue. (issue #4)
- **Measurement scope change (not an anchor change)**: consistency's judgment scope widens from
  "within docs" to **docs ↔ code comments/spec** placement and duplication; deductions are split
  into `[contradiction]`/`[duplication]`/`[placement]`. The ★1–★5 anchor text is unchanged, but a
  repo previously at ★5 may get marked down due to cross-carrier duplication — when comparing
  consistency scores across 0.5.0, the report should note the scope has widened (same nature as
  0.2.0's move of completeness to a mechanical coverage basis). Decided to widen the dimension
  rather than add a sixth: adding a dimension = rubric structure change = major bump + recalculating
  every repo's history.
- **Convergence discipline**: when `improve`/`loop` picks consistency, one round fixes one class of
  deduction (`[contradiction]` → `[duplication]` → `[placement]`). For the placement class, **only
  files within docs scope are touched** — recommendations to move content into code comments or
  other source files are never auto-executed (beyond the "commit only docs changes" branch
  discipline, and scripts can't verify code comments anyway); instead they go into the report's
  "needs human handling" list, so getting stuck here is judged a design ceiling, not a plateau.
- **Positioning**: `docs/design.md` adds the boundary between "information placement" and "code
  quality" — judging placement means reading code comments, but not evaluating comment quality,
  otherwise the consistency dimension would slide into a code review.

## 0.4.0 — 2026-07-26

- **Added (command)**: `audit <scope>`/`audit --dim <dimension>` — scoped audit, limited to a
  directory/glob/topic or a single dimension. Always pure report and **never writes to
  `.docgrad/`** (mixing scoped scores into history would wreck cross-round comparability); each
  dimension's validity and report header format under a limited scope is in `reference/audit.md`
  §scoped audit. (issue #2)
- **Added (CLI)**: shared flags for the four scripts are now parsed in one place,
  `scripts/lib.mjs › parseArgs()`, adding `--include <glob>` (repeatable/comma-separated,
  supports `**`/`*`/`?` and directory prefixes) and `--config <file>` (external config — used when
  the doc source itself can't hold files on disk). Unknown flags always throw, no longer silently
  ignored. (issue #2, #3 suggestion 2)
- **Measurement semantics**: `links.mjs` returns `[]` for orphans and `null` for reachable ratio
  when scope is limited (reachability is a full-index concept and gets distorted the moment scope
  narrows — it must not be docked for that); `coverage.mjs` deliberately doesn't accept
  `--include` (narrowing the docs side would misjudge out-of-scope mentions as undocumented), and
  says so in `note`; `inventory.mjs`'s `entry_cost.files` now lists the entry files actually
  counted.
- **Compatibility**: without flags, the four scripts' output is the same as 0.3.0 except for one
  added `scope: null` field; rubric anchors unchanged.

## 0.3.0 — 2026-07-26

- **Added (loop behavior)**: `reference/improve.md` adds the **design ceiling** — when a
  dimension's next star anchor falls inside a Blocker's forbidden zone, that dimension is
  directly judged "converged within docgrad's remit," removed from dimension selection and
  targets-met judgment, and named in the graduation recommendation. Fixes the structural
  contradiction of "freshness ★5 requires a CI gate / Blocker #3 says don't touch CI" being
  misreported as a plateau (issue #1).
- **Docs (applicability boundary)**: README/SKILL.md/`docs/design.md` now state the precondition
  up front — a local markdown file tree with a writable `.docgrad.yml`; git isn't a hard
  requirement (without git, freshness degrades to claimed-only); wiki/remote doc sources aren't
  supported, though that scenario can independently borrow the rubric's five-dimension anchors for
  manual scoring (the boundary-documentation part of issue #3).
- **Note (not an anchor change)**: the rubric marks freshness ★5 as graduation-only scope.
  The ★1–★5 judgment thresholds are unchanged, word for word; historical score comparability is
  preserved.

## 0.2.0 — 2026-07-13

- **Added**: fourth measurement script `scripts/coverage.mjs` (coverage drift) — git-compares each
  code area against the docs mentioning it, mechanically detecting `undocumented`/`drifted`
  areas, and feeds that into completeness's star rating. Fixes the hole where "a new feature grows
  inside an existing module with no docs written, and completeness ★5 stays falsely pinned."
- **Config**: `.docgrad.yml` adds `src_dirs` and `coverage:` (`drift_after_days: 30`,
  `min_commits: 3`). Existing repos need to rerun `/docgrad init` or manually add `src_dirs`; when
  unset, completeness degrades to pure LLM comparison (same as the old behavior).
- **Measurement method change (not an anchor change)**: the rubric's completeness "measurement"
  line now uses coverage output as its mechanical basis; the star anchors are unchanged, word for
  word, and historical score comparability is preserved.
- **Release**: turned into a plugin (`.claude-plugin/plugin.json` + `marketplace.json`), supporting
  install and version-update notifications via
  `/plugin marketplace add redtear1115/docgrad`.

## 0.1.0 — 2026-07-12

- Initial release: five-dimension rubric (completeness/correctness/freshness/linkage/consistency)
  + token economy report; five commands `init · audit · improve · loop · report`; three
  zero-dependency measurement scripts (inventory/links/freshness).

# measure — run the mechanical scripts

> **Last updated:** 2026-09-16

Precondition (blocker): the target repo root must have `.docgrad.yml`; if not → stop, point to `/docgrad init`.
This process **does not modify any file** and writes no state — pure report. Read [rubric.md](rubric.md) before scoring.

## Contents

- [Step 1. Run the mechanical scripts](#1-run-the-mechanical-scripts)
- [Verdict lines](#verdict-lines)
- [Step 8. Token economy report](#8-token-economy-report)
- [Step 8b. The graduation gate, if the repo has one](#8b-the-graduation-gate-if-the-repo-has-one)

For a scoped run: see [judge.md](judge.md) §Scoped audit.

## Verdict lines

Every script except `retrieval.mjs` (report-only) now emits a top-level `measure` array: each row
carries `id`, `value` (with `numerator`/`denominator` when it is a ratio), `verdict`
(`"OK" | "WATCH" | "FAIL" | null`) and `line` — the boundary that decided the verdict, in the
number's own units — plus the anchor `source` it was read from. **Report the number first and the
verdict next to it**; the verdict names which line fired, it does not replace the number. The
evaluation order is fixed for every row: **FAIL is checked first, then OK, else WATCH.** A row
with no calibrated FAIL line (`fail: null` in `lib.mjs › MEASURE_BANDS`) can be OK or WATCH but
never FAIL — there is no anchor boundary to fail against. Every row's `ok`/`fail` line is one of
five comparisons — `<`, `<=`, `>`, `>=`, `==` — read in their ordinary arithmetic sense; `==` is
exact equality, used for presence checks (`index_present`) and zero checks (`undocumented_dirs`,
`drifted_dirs`) rather than for a ratio.

A ratio row (`dead_link_ratio`, `orphan_ratio`, `date_coverage`, and `reachable_ratio` where it
applies) is **evaluated against the unrounded division**, not against the four-decimal `value` it
reports: 51 orphans over 1019 included documents is 0.050049…, which rounds to the same `0.0500`
a reader sees whether or not the true ratio actually cleared the ★4 "orphans ≤5%" line, so judging
the rounded number would let a display artifact decide the verdict. `value` in the output stays the
rounded number a reader expects; only the comparison uses the fuller precision.

One row's OK line is a compound condition: `dead_link_ratio` is OK only when the ratio is `0`
**and** the row's reported `bad_anchors` count is also `0` — broken anchors always cost stars, so a
repo with zero dead links and one bad anchor is WATCH, not OK. That second condition is part of the
row's own data (`lib.mjs › MEASURE_BANDS`), the same as every threshold above.

During 2.0.0's development the star anchors in [rubric.md](rubric.md) and these verdict lines
coexist: both describe the same boundaries, and neither replaces the other yet. The star anchors
retire in a later epoch; until then, read a `measure` row as the mechanical half of the same
judgement the ★ rating makes by hand.

The eleven rows, across four scripts, each citing the rubric.md anchor its OK/FAIL lines come from:

- **links.mjs**
  - `dead_link_ratio` — `dead_links.length / total_links`. FAIL `> 2%`; OK requires the ratio to be
    `0` **and** `bad_anchors.length` to be `0` — broken anchors always cost stars, so a repo with
    zero dead links and one bad anchor is WATCH, not OK. `bad_anchors` is reported alongside the
    row for that reason. With `total_links: 0` the ratio is `0` with `note: "no links"` — the ★4
    anchor is literally "zero dead links", and the no-links risk is the orphan/index rows' job, not
    this one's.
  - `orphan_ratio` — `orphans.length / included.length`. FAIL `> 20%`; OK `≤ 5%`. `null` (not `0`)
    whenever `orphans` itself is `null` (no `index_file`, or a scoped run) or the corpus is empty —
    a ratio with no denominator is not a measurement.
  - `reachable_ratio` — the script's own `reachable_ratio`. No FAIL line; OK `≥ 95%`. `null` under
    the same conditions as `orphan_ratio`.
  - `index_present` — `1` when `config.index_file` is set and present in the unscoped corpus, else
    `0`. FAIL when not present (rubric.md ★1 "no index at all"); OK when present. `null` under
    scope — an `--include` run cannot say what the full corpus's index looks like.
- **freshness.mjs**
  - `date_coverage` — `files_with_signal / files_total`. FAIL `< 60%`; OK `≥ 90%`. `null` with
    `note: "empty corpus"` when `files_total` is `0`.
  - `key_doc_age` — the oldest `age_days` among this round's **key documents**, a narrower set than
    rubric.md's: `entry_files ∪ index_file`, restricted to documents that are both in the corpus
    and carry a non-null `age_days` (a missing document or one with no date signal is named and
    skipped, not counted as `0`). This subset feeds `key_doc_age` only — the freshness ★ rating
    still reads rubric.md's full "key documents" definition (which also includes each area's
    authoritative document) until a later epoch. FAIL `> max(180, freshness.stale_after_days)`; OK
    `≤ freshness.stale_after_days`. Because the FAIL line is a `max`, a repo that has legitimately
    configured `stale_after_days: 365` sees a 200-day key document rated OK, not WATCH — the
    configured window stays meaningful, exactly as rubric.md §Freshness says it can be. `null` when
    the run is scoped (`note: "key documents are a full-corpus concept"`) or when no key document
    survives the filter (`note: "no dated key document"`).
  - `date_drift` — the largest `drift_days` among `mismatches`, or `0` when there are none. No FAIL
    line; OK `< 30 days`. This line covers only the drift-days half of ★4's "only isolated
    mismatches, drift <30 days" — the "isolated" clause has no count attached to it in the rubric
    and is not measured here.
- **inventory.mjs**
  - `entry_cost` — `entry_cost.tokens_est`. FAIL `> economy.entry_cost_tiers[1]`; OK
    `≤ economy.entry_cost_tiers[2]`. `null` under scope (`note: "full-corpus concept"`), matching
    [judge.md](judge.md) §Scoped audit's economy row.
  - `pollution` — `pollution.ratio`. No FAIL line; OK `< economy.pollution_max`. `null` under scope,
    same reason and note as `entry_cost`.
- **coverage.mjs**
  - `undocumented_dirs` — `undocumented.length`. No FAIL line (none calibrated in rubric.md); OK
    `= 0`. `null` with `note: "src_dirs is unset"` on the script's own early-exit path.
  - `drifted_dirs` — `drifted.length`. Same shape as `undocumented_dirs`: no FAIL line, OK `= 0`,
    `null` with the same note when `src_dirs` is unset.

`lib.mjs › measureHash()` covers `economy.entry_cost_tiers` / `economy.pollution_max` /
`freshness.stale_after_days` (as before), plus the band table above (`lib.mjs › MEASURE_BANDS`,
unresolved) and this section's file, `reference/measure.md` — moving a threshold, or editing this
prose, moves it. See [rubric.md](rubric.md) §Version history for the recorded old → new value and
[CONTRIBUTING.md](../../../CONTRIBUTING.md) for the fingerprint discipline this falls under.

## Steps

### 1. Run the mechanical scripts

`SKILL_DIR` = this skill's install directory (one level above this file). Run from the target repo root:

```bash
node "$SKILL_DIR/scripts/inventory.mjs" --root . --exclude-ledger .docgrad/ledger.jsonl
node "$SKILL_DIR/scripts/links.mjs" --root .
node "$SKILL_DIR/scripts/freshness.mjs" --root .
node "$SKILL_DIR/scripts/coverage.mjs" --root .
node "$SKILL_DIR/scripts/retrieval.mjs" --root .
```

Consume all five JSON outputs in full; don't truncate with head/grep/jq. If any script exits non-zero → stop and report stderr.
Every script except `retrieval.mjs` also emits a top-level `measure` array; report each row number-first, verdict next to it (see [§Verdict lines](#verdict-lines)).

`--exclude-ledger <path>` (#54, optional, pass only when `.docgrad/ledger.jsonl` exists): tells
`inventory.mjs` to filter candidates already in that ledger out of `claim_candidates` **before**
`claim_candidates_cap` is applied, so the cap counts drawable candidates instead of every ledger row
costing the window a slot permanently. It is a shared flag across all five scripts — the other four
accept it and say in their own output that it is a no-op for them, the same way they already handle
an ignored `--include`.

### 8. Token economy report

Expand on the details of fixed cost and pollution surface per rubric.md's "Token economy report" section, with a break-even interpretation attached.
Report `inventory.out_of_scope` on the line right after the pollution surface — `count`, `tokens_est`, and the paths from
`out_of_scope.files` when there are few enough to name. **Print it every round, including `0 files / 0 tokens`**: it is the
qualifier that makes the pollution number readable, and a qualifier that only appears when it is large is a qualifier nobody
can trust. Add the comparison against `totals.tokens_est` in words when the excused content is a material share of the tree
("pollution 4% — but 31,400 tokens sit in `out_of_scope`, against 9,300 tokens graded").
Then report `inventory.untracked` on the line after that (count, token weight, and the paths from `untracked.files` when there are few enough to name; `null` = the check could not run, see [judge.md](judge.md) step 7) — it is the qualifier on the pollution number, so it belongs next to it rather than in a footnote.

Marginal cost: when `.docgrad.yml` has `scenarios:` set (a list of representative code paths), consume `retrieval.mjs`'s
`scenarios[]` output directly — list `marginal_tokens`/`max_depth`/`fan_in`/`code_pointer` for each entry, and use
`churn_commits` to sort and call out the one that "taxes the most." When `scenarios:` isn't set, fall back to the old method: use `.docgrad.yml`'s
`scenario` (singular) and have the LLM simulate the required-reading path along the index/routing rules.

Also include a "Traceability" subsection (report-only, not rated, see rubric.md's section of the same name):
`retrieval.mjs`'s `code_pointer_ratio` (list the low-ratio areas — meaning that once code changes there's no path back to the spec),
`index_hotness` (call it out when `ratio` is noticeably high, with `top5` attached); files whose `inventory.mjs` per-file `structure.rules`
have a noticeably long `median_chars`/`p90_chars` or a noticeably low `anchored_ratio` — suggest splitting into a contract layer and a detail layer.

### 8b. The graduation gate, if the repo has one

A graduated repo carries `.docgrad/graduation/docs-gate.mjs` + `docs-gate.yml`, produced by
[improve.md](improve.md) §Graduation with its thresholds pinned to that round's state. Field
evidence says producing the file solved "there is no deliverable" and not "nobody runs it": on one
repo the gate went red four rounds before anyone noticed, and `.github/` never referenced it at all.
A green promise sitting in version control while the real answer is red is worse than no gate, so
**every audit and report says what state it is in**.

**docgrad does not execute it.** Not when it looks unmodified, not behind a config flag. It is a
Node module committed into the repo being graded, so running it would mean executing
repository-controlled code with the operator's privileges — and this tool's documented use includes
auditing clones of repos you did not write (see the commander.js case study). An executed gate also
decides its own verdict, so a gate that always prints "passed" would be indistinguishable from a
real one: execution carries the whole risk and buys no integrity. None of this costs anything,
because the gate consumes exactly the three script outputs step 1 already produced.

When `.docgrad/graduation/docs-gate.mjs` exists, report all four of these:

1. **That it exists**, with its path and the literal command to run it:
   `DOCGRAD_DIR=<docgrad install> node .docgrad/graduation/docs-gate.mjs --root .`
2. **Whether anything actually runs it.** Grep `.github/workflows/**` (and any other CI config the
   repo uses) for a reference to the gate. Nothing referencing it → report
   **"produced but not installed: no workflow references it"**. That was the single highest-value
   finding on the repo above, and it is a text search.
3. **The declared thresholds against this round's numbers.** Read the `THRESHOLDS` object out of the
   file — it is a literal block of `key: <number>` lines near the top — and compare each to what step
   1 already measured: `max_dead_links` / `max_bad_anchors` / `max_orphans` against `links.mjs`,
   `min_freshness_coverage` against `freshness.coverage_ratio`, `max_entry_cost_tokens` against
   `inventory.entry_cost.tokens_est`. Report the verdict as the gate's, not as docgrad's:
   *"the committed gate is red: freshness coverage 0.90 < its declared 0.93"*.
   This is what catches the real failure mode, which is not that the gate is wrong but that it
   **expires**: a ratio threshold pinned at graduation goes red by itself when the corpus grows, and
   growing the corpus is something docgrad actively encourages. On the measured repo the denominator
   went 46 → 50 as `docs_files` and two new specs came in, and 0.9348 became 0.90 against a pinned
   0.93.
4. **Whether the judging logic still matches the template docgrad ships.** Compare the file against
   `$SKILL_DIR/templates/docs-gate.mjs` ignoring the `THRESHOLDS` block (that block is meant to be
   edited). Differences elsewhere are worth one line of report — *"its judging logic differs from the
   template docgrad ships"* — as information, not as a fault.

**Fail closed.** If the `THRESHOLDS` block is not a plain list of `key: <number>` lines — a computed
value, an interpolation, extra statements — do **not** guess at what it evaluates to, and do not
partially parse it. Report *"the gate has been modified beyond its thresholds; docgrad cannot
evaluate it — run it yourself with the command above"* and stop at that. Never `import` it, never
evaluate it, never shell out to it.

No gate file → say nothing. An absent gate is the normal state for a repo that has not graduated,
and reporting its absence every round would be noise.

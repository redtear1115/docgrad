# measure — run the mechanical scripts

> **Last updated:** 2026-09-17

Precondition (blocker): the target repo root must have `.docgrad.yml`; if not → stop, point to `/docgrad init`.
This process **does not modify any file** and writes no state — pure report. Read [rubric.md](rubric.md) before scoring.

## Contents

- [Step 1. Run the mechanical scripts](#1-run-the-mechanical-scripts)
- [Verdict lines](#verdict-lines)
- [Targets](#targets)
- [Freshness notes](#freshness-notes)
- [Linkage notes](#linkage-notes)
- [Economy notes](#economy-notes)
- [Step 4/5. Freshness / Linkage](#4-freshness--5-linkage)
- [Step 7. Economy](#7-economy)
- [Step 8. Token economy report](#8-token-economy-report)
- [Token economy signals](#token-economy-signals)
- [Step 8b. The graduation gate, if the repo has one](#8b-the-graduation-gate-if-the-repo-has-one)
- [Version history](#version-history)

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
a reader sees whether or not the true ratio actually cleared the retired ★4 "orphans ≤5%" line, so
judging the rounded number would let a display artifact decide the verdict. `value` in the output
stays the rounded number a reader expects; only the comparison uses the fuller precision.

One row's OK line is a compound condition: `dead_link_ratio` is OK only when the ratio is `0`
**and** the row's reported `bad_anchors` count is also `0` — a broken anchor keeps `dead_link_ratio`
off OK, so a repo with zero dead links and one bad anchor is WATCH, not OK. That second condition is
part of the row's own data (`lib.mjs › MEASURE_BANDS`), the same as every threshold above.

Since v2.0.0 these lines replace the linkage, freshness and economy star anchors (retired; kept in
[rubric.md](rubric.md) §Version history for reading 1.x rows). Before this version the star anchors
and these verdict lines coexisted, describing the same boundaries side by side; that intermediate
state is over.

The eleven rows, across four scripts, each citing the rubric.md anchor its OK/FAIL lines come from:

- **links.mjs**
  - `dead_link_ratio` — `dead_links.length / total_links`. FAIL `> 2%`; OK requires the ratio to be
    `0` **and** `bad_anchors.length` to be `0` — a broken anchor keeps `dead_link_ratio` off OK, so a
    repo with zero dead links and one bad anchor is WATCH, not OK. `bad_anchors` is reported
    alongside the row for that reason. With `total_links: 0` the ratio is `0` with `note: "no links"`
    — the retired ★4 criterion is literally "zero dead links", and the no-links risk is the
    orphan/index rows' job, not this one's.
  - `orphan_ratio` — `orphans.length / included.length`. FAIL `> 20%`; OK `≤ 5%`. `null` (not `0`)
    whenever `orphans` itself is `null` (no `index_file`, or a scoped run) or the corpus is empty —
    a ratio with no denominator is not a measurement.
  - `reachable_ratio` — the script's own `reachable_ratio`. No FAIL line; OK `≥ 95%`. `null` under
    the same conditions as `orphan_ratio`.
  - `index_present` — `1` when `config.index_file` is set and present in the unscoped corpus, else
    `0`. FAIL when not present (retired rubric.md ★1 "no index at all"); OK when present. `null`
    under scope — an `--include` run cannot say what the full corpus's index looks like.
- **freshness.mjs**
  - `date_coverage` — `files_with_signal / files_total`. FAIL `< 60%`; OK `≥ 90%`. `null` with
    `note: "empty corpus"` when `files_total` is `0`.
  - `key_doc_age` — the oldest `age_days` among this round's **key documents**, a narrower set than
    rubric.md's pre-2.0 definition: `entry_files ∪ index_file`, restricted to documents that are both
    in the corpus and carry a non-null `age_days` (a missing document or one with no date signal is
    named and skipped, not counted as `0`). This subset is what is measured; area-authority staleness
    surfaces through correctness (judge). FAIL `> max(180, freshness.stale_after_days)`; OK
    `≤ freshness.stale_after_days`. Because the FAIL line is a `max`, a repo that has legitimately
    configured `stale_after_days: 365` sees a 200-day key document get OK, not WATCH — the
    configured window stays meaningful, exactly as §Freshness notes says it can be. `null` when
    the run is scoped (`note: "key documents are a full-corpus concept"`) or when no key document
    survives the filter (`note: "no dated key document"`).
  - `date_drift` — the largest `drift_days` among `mismatches`, or `0` when there are none. No FAIL
    line; OK `< 30 days`. This line covers only the drift-days half of the retired ★4's "only
    isolated mismatches, drift <30 days" — the "isolated" clause has no count attached to it in the
    rubric and is not measured here.
- **inventory.mjs**
  - `entry_cost` — `entry_cost.tokens_est`. FAIL `> economy.entry_cost_tiers[1]`; OK
    `≤ economy.entry_cost_tiers[2]`. `null` under scope (`note: "full-corpus concept"`), matching
    [judge.md](judge.md) §Scoped audit's measure-signals row.
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
prose, moves it. See this file's own §Version history below for the recorded old → new value and
[CONTRIBUTING.md](../../../CONTRIBUTING.md) for the fingerprint discipline this falls under
(rubric.md §Version history is where a move was recorded before this file carried its own).

## Targets

Every `measure` row also carries `accept` and `meets_target`, right after `verdict`. `accept` is the
verdict this repo's config allows that signal to settle at — `"OK"` by default, for every signal.
A repo may accept `"WATCH"` for a specific signal by naming it under `targets` in `.docgrad.yml`,
block form:

```yaml
targets:
  entry_cost: WATCH
```

`meets_target` is `true` when `verdict` is `"OK"` (OK always meets its target, whatever `accept`
says), `true` when `verdict` is `"WATCH"` **and** `accept` is `"WATCH"` for that signal, and `false`
otherwise. `FAIL` never meets a target, even when `accept` is `"WATCH"` — accepting WATCH widens
what a repo may settle at, it never excuses a FAIL. `meets_target` is `null` exactly when `verdict`
is `null` (no number was measured, so there is nothing to judge).

A `targets` key must name a `measure` signal id (`entry_cost`, `dead_link_ratio`, …) with a value of
exactly `OK` or `WATCH`; anything else — a 1.x dimension name with a non-numeric value, an unknown
id, `FAIL`, a number, a different spelling — is a config error at load time, not a silently ignored
setting. Configs written before v2.0.0 named one of the six 1.x star-rated dimensions
(`completeness`, `correctness`, `freshness`, `linkage`, `consistency`, `economy`) with a star value
(`completeness: 4`); those keys are **ignored with a warning** rather than rejected, so an old config
still loads. The warning lands in the same `note` field each script already reports on (a new
top-level `note` on `inventory.mjs`, which has no other top-level `note`, present only when this
fires) and names the dropped keys.

`targets` is **not** a `measure_hash` input, same as in 1.x when it held star values instead: it
decides when a repo is *satisfied*, not *how it is measured*, and two rounds measured the same way
are comparable whether or not either one's targets changed. Whatever `accept` a repo has set to
`WATCH` must still be printed wherever verdicts are reported — an accepted WATCH is a real,
disclosed relaxation of the default, not a way to make a row quietly disappear from the page.

## Freshness notes

Measurement: `coverage_ratio` / `stale` / `mismatches` from freshness.mjs. The measured subset is
`entry_files` ∪ `index_file` (see [rubric.md](rubric.md) §Version history for the narrowing this
replaced, and the "no new rule" disclosure).
The `key_doc_age` OK line is `freshness.stale_after_days` (shipped 60), and it is **configurable** —
which means a repo can set it to 365 and make the OK line mean "within a year" without a word of
this file changing. That is legitimate for a repo whose documentation genuinely ages that slowly, and
it is also exactly why the value is in `measure_hash`: the scorecard must state the window in force
whenever it is not the shipped one, and `report` draws a comparability break when it moves.
A related constant is **not** configurable: `mismatches` only fires when a document's claimed date
and its git date differ by more than 7 days (`freshness.mjs › MISMATCH_TOLERANCE_DAYS`), a fixed
tolerance for the ordinary gap between editing a file and committing it.
The git date comparison **excludes docgrad's own convergence commits** (the `docs(docgrad):`
prefix) and takes the most recent non-docgrad commit — otherwise the backfill round counts its own
commit dates as "the content was updated" and produces false mismatches.
`date_concentration` is an advisory field (report-only): a high share of a single day means the
signals come from one backfill, the coverage number does not reflect how the docs are actually
maintained, and the report must say so.

## Linkage notes

Measurement: the full mechanical output of links.mjs (dead-link ratio = dead_links / total_links). A
broken anchor keeps `dead_link_ratio` off OK; `cjk_uncertain` is an advisory field and is **not** a
reason to skip confirmation.

> **`orphans: null` is not `orphans: []`.** When the repo has no `index_file`, or the run is scoped,
> reachability cannot be computed and both `orphans` and `reachable_ratio` come back `null`. Do not
> read that as "no orphans found". A repo with no index at all: `orphans` is `null` without an
> index, and `index_present` is FAIL — the one case where every document can be unreachable while
> the mechanical output reports nothing.

## Economy notes

Measurement: **fixed cost** = `inventory.entry_cost.tokens_est` (the tax every task pays for
loading `entry_files`, with symlink aliases de-duplicated); **pollution surface** =
`inventory.pollution.ratio`. Both are fully mechanical, neither passes through LLM judgement.

**Read the boundaries off the run, not off the band table above.** `inventory.economy_thresholds`
carries the values this round actually used — `entry_cost_tiers`, `pollution_max`. (The 1.x star
fields were removed in v2.0.0.) The shipped tiers are `[20000, 10000, 5000, 3000]` and
`pollution_max: 0.1`; a repo may set its own in `.docgrad.yml`, and then the shipped numbers are not
the ones it was graded by.

**`customised: true` is a reporting obligation, not a violation.** A repo is allowed to choose its
own thresholds. But a verdict produced under custom thresholds is not comparable with one produced
at the defaults, so the scorecard must say which thresholds were in force. `measure_hash` in the
`docgrad` block is the mechanical form of the same statement, and it is what `report` compares
across rounds. (Retired: a note that ★5 additionally needed a mechanical gate used to sit here — see
[rubric.md](rubric.md) §Version history.)

> **What the pollution surface measures — and what it does not**: it measures *how much junk this repo contains*, not *how
> much of it you chose not to grade*. Those are two different questions and only the first should move a verdict. Two config
> fields say which one you mean, and both take files out of the corpus:
>
> | Field | Corpus | Pollution surface | Reported as |
> |---|---|---|---|
> | `exclude` | out | **charged** | `inventory.pollution.excluded_files` / `excluded_tokens` |
> | `out_of_scope` | out | **not charged** | `inventory.out_of_scope.count` / `tokens_est` |
>
> Use `exclude` for the WIP draft you would be embarrassed to have read — it is in the repo, and the repo should answer for
> it. Use `out_of_scope` for content that is real documentation but is not what this run grades: a translated mirror rated as
> its own corpus, a vendored handbook, a subproject with its own `.docgrad.yml`. Measured on `tj/commander.js`, `docs/zh-CN/`
> — translated mirrors graded separately — sat in `exclude` and charged **40.6%** pollution, capping economy at ★3 (1.x) while
> the fixed cost was a perfect 0. Every exit was closed: deleting the translations is content that is still correct and still
> needed, which [improve.md](improve.md) forbids deleting to lower a cost; un-excluding them reverses the owner's answer and
> pulls the mirror into the graded corpus; and diluting the ratio under 10% would have taken roughly 28,700 tokens of English
> filler. What was wrong was the field's semantics, not the documentation.
>
> **`out_of_scope` is not a free pass, and the audit must not read it as one.** Its size is printed on every run, empty or
> not, precisely so the field cannot become a silent switch for zeroing your own pollution surface. You may move anything you
> like out of the surface; how much you moved is on the same page, in the same units. An `out_of_scope` that dwarfs the
> graded corpus is a finding in its own right (see step 7, same file). When a path is listed in both fields,
> **`exclude` wins** and the file stays charged — a broad `out_of_scope` entry must never silently cancel an `exclude`
> someone already wrote, so getting anything out of the surface always costs one deliberate edit to `exclude`.
>
> `out_of_scope` joins `corpus_hash` **only when it is non-empty**, so a config that predates the field and a config that
> spells out `out_of_scope: []` select the same corpus and hash the same; moving a path between the two fields still moves
> the hash, because it leaves the `exclude` list (see [rubric.md](rubric.md) §Version history).

`pollution` is WATCH at or above `pollution_max` (retired rubric.md "Pollution downgrade rule": see
[rubric.md](rubric.md) §Version history).

> **The pollution surface is measured from the filesystem, not from git, so this line is only
> reproducible on a clean checkout — or with `exclude_untracked: true`.** Everything on disk is
> collected, tracked or not, so an untracked local file changes a measure input. Measured on one
> repo at the same commit with the same script version: ratio **0.1066** in a working checkout
> versus **0.0517** in a clean worktree, the entire difference being one untracked 9,730-token
> draft inside a `.gitignore`d directory. The default `pollution_max: 0.1` sits **between those two
> numbers**, so the same commit is OK for one person and WATCH for the next — the exact class of
> irreproducibility docgrad exists to catch. The ratio itself is deliberately left alone (silently
> recomputing it would move everyone's economy verdicts at once); instead `inventory.untracked`
> reports the count and token weight, `inventory.pollution.note` flags the ratio as checkout-bound,
> and the audit must carry both into the scorecard (see step 7, same file). Setting
> `exclude_untracked: true` restricts the corpus to what git tracks and makes the verdicts
> reproducible; it changes `corpus_hash`, so scores either side of the flip are not comparable
> (see [rubric.md](rubric.md) §Version history).

This dimension pulled against completeness by design, not by accident: adding documentation raises
the fixed cost. Economy exists so the loop has a mechanical brake between "more documentation" and
"a more expensive agent" — external evidence (several coding agents compared on SWE-Bench Lite and
AgentBench) shows that longer context files raise cost without necessarily raising success rate, so
coverage cannot be the only direction that gets rewarded. Documents outside `entry_files` do not
count toward the fixed cost (moving content out of the entry file satisfies both completeness and
economy at once). (Retired: economy's place in the judged-dimension tie-break order, and the
"improve verifies that no other dimension drops" clause — see [rubric.md](rubric.md) §Version
history.)

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

### 4. Freshness / 5. Linkage

Report each `measure` item: number, then verdict and line — using the freshness.mjs / links.mjs
output (see [§Verdict lines](#verdict-lines)).

For freshness, also check `date_concentration` (report-only; **must** be written in step 9's Measure
block, freshness lines): a high `max_same_day_ratio` means the date signal is clustered on a single
day, usually the trace of a bulk backfill — these files will age together and go stale together, and
no matter how high `coverage_ratio` is, it can't tell you "which document has genuinely gone
unmaintained for a long time." oikos measured 0.68 in practice (28/41 files stuck on the backfill
day). Write it in the report as "coverage 95%, but 68% of the dates cluster on 2026-07-13, limiting
the signal's discriminating power." Note it can't distinguish "backfill" from "this batch of files
really did change at the same time" — it only flags, it doesn't rule.

Count every broken anchor from links: since 0.6.1 the slug algorithm matches GitHub
character-for-character (spaces to dashes one by one, underscores inside words kept, explicit
`<a id>` tags included in the index), so CJK headings no longer have approximation error.
`cjk_uncertain` is kept only as a hint field, **not** a reason to skip verification.

### 7. Economy

Report each `measure` item: number, then verdict and line — using `inventory.mjs`'s
`entry_cost.tokens_est` (fixed cost) and `pollution.ratio` (pollution surface) — **fully mechanical,
no LLM judgment involved** (see [§Verdict lines](#verdict-lines)). Three things must always be
checked:

1. Whether `entry_cost.files` is really loaded on every task. Listing a human-only landing page
   (like the `README.md` used on GitHub) in `entry_files` inflates the fixed cost; conversely, a
   file the agent must read every time but that isn't listed under-reports it.
   Finding a mismatch between the config and reality → record it as a deduction and suggest fixing
   `.docgrad.yml`, **don't** change the config yourself and then score.
   - **Conditionally-required files** (an entry file that says "read `DESIGN.md` before touching the
     UI") don't count as always-loaded: suggest moving them to `docs_files` instead — they still
     enter the corpus and the judged dimensions and the other measure signals, but don't count
     toward the fixed cost (see [init.md](init.md) questionnaire item 3).
2. `pollution` is WATCH at or above `pollution_max`, even if the fixed cost is low.
   **Always print `inventory.out_of_scope.count` and `tokens_est` beside the pollution line — on
   every round, whether or not the field is empty.** The pollution surface measures how much junk
   this repo contains; `out_of_scope` is how much content was taken out of the surface because it is
   graded elsewhere (see [§Economy notes](#economy-notes), same file). The two numbers only mean
   anything together, and printing the second one unconditionally is the property that stops the
   first from being quietly launderable. Three rules for reading it:
   - **`out_of_scope` that dwarfs the graded corpus is a finding in its own right**, even when every
     verdict is OK. Compare `out_of_scope.tokens_est` against `totals.tokens_est`: when the excused
     content outweighs the graded content, the scorecard is measuring a minority of the repo's
     documentation and must say so in the Measure block's economy lines. Record it as a deduction
     when the excusing looks like scope laundering rather than a real second corpus — an
     `out_of_scope` entry that names a whole `docs/` tree is not "graded elsewhere" unless you can
     point at where.
   - **`out_of_scope.note`** appears when the list was capped at 20 paths, and when a path matches
     **both** fields. In the second case the file is charged (`exclude` wins) — pass the note
     through verbatim, because the author who listed it in `out_of_scope` is expecting the opposite
     and would otherwise only see a ratio that refused to move.
   - Never suggest moving a directory from `exclude` into `out_of_scope` to improve `pollution`.
     That is re-labelling, not improvement, and [improve.md](improve.md) forbids it outright.
3. **Check `inventory.untracked.count` before you report the economy lines** — the corpus is
   collected off the filesystem, not out of git, so this can depend on whose checkout it was run in:
   - **Non-zero** → the run collected N local files git does not track (`untracked.files` lists them
     — **capped at the first 20 paths**, with a `note` saying so when it truncates, while `count` and
     `tokens_est` always cover all of them; the same discipline `out_of_scope` already documents).
     The pollution ratio and the token totals are **checkout-bound: another machine on the same
     commit gets a different number, and possibly a different verdict**. The scorecard must say so,
     quoting the count and token weight, and recommend `exclude_untracked: true` in `.docgrad.yml`
     to measure the clean-checkout corpus instead (see [init.md](init.md) questionnaire item 6).
     `inventory.pollution.note` carries the same warning when any *collected* file is untracked —
     pass it through, don't paraphrase it away.
   - **`null`** → the check could not run. **`untracked.note` names which of three causes**, and they
     need different follow-ups: *git is not installed* → install it or run elsewhere; *not a git
     working tree* → the check can never apply here, so stop recommending it; *git is present but
     failed to run here* → the check does apply, this environment just broke it, and the note
     carries git's own words. That third one is the reason the first two are not enough: under an
     agent sandbox where `/usr/bin/git` is macOS's xcrun shim, git exits non-zero inside a directory
     that **is** a work tree. Pass the note through rather than paraphrasing it back into "git was
     unavailable", and never conclude "not a work tree" from a `null` alone. State that in the
     report; `null` is not zero, and an unrun check must not be reported as a clean one.
   - **Zero** → the collected corpus is exactly what the commit contains; nothing to note.

### 8. Token economy report

Expand on the details of fixed cost and pollution surface per §Token economy signals, with a break-even interpretation attached.
Report `inventory.out_of_scope` on the line right after the pollution surface — `count`, `tokens_est`, and the paths from
`out_of_scope.files` when there are few enough to name. **Print it every round, including `0 files / 0 tokens`**: it is the
qualifier that makes the pollution number readable, and a qualifier that only appears when it is large is a qualifier nobody
can trust. Add the comparison against `totals.tokens_est` in words when the excused content is a material share of the tree
("pollution 4% — but 31,400 tokens sit in `out_of_scope`, against 9,300 tokens graded").
Then report `inventory.untracked` on the line after that (count, token weight, and the paths from `untracked.files` when there are few enough to name; `null` = the check could not run, see step 7) — it is the qualifier on the pollution number, so it belongs next to it rather than in a footnote.

Marginal cost: when `.docgrad.yml` has `scenarios:` set (a list of representative code paths), consume `retrieval.mjs`'s
`scenarios[]` output directly — list `marginal_tokens`/`max_depth`/`fan_in`/`code_pointer` for each entry, and use
`churn_commits` to sort and call out the one that "taxes the most." When `scenarios:` isn't set, fall back to the old method: use `.docgrad.yml`'s
`scenario` (singular) and have the LLM simulate the required-reading path along the index/routing rules.

Also include a "Traceability" subsection (report-only, see §Token economy signals › Traceability):
`retrieval.mjs`'s `code_pointer_ratio` (list the low-ratio areas — meaning that once code changes there's no path back to the spec),
`index_hotness` (call it out when `ratio` is noticeably high, with `top5` attached); files whose `inventory.mjs` per-file `structure.rules`
have a noticeably long `median_chars`/`p90_chars` or a noticeably low `anchored_ratio` — suggest splitting into a contract layer and a detail layer.

## Token economy signals

Carries the fixed cost and pollution surface measure verdicts (see [§Economy notes](#economy-notes));
this section expands on those signals and adds two that remain report-only (marginal cost,
traceability) and take no part in any verdict.

- **Fixed cost**: `inventory.entry_cost.tokens_est` (`entry_files`, loaded on every task). Carries a
  measure verdict.
- **Marginal cost** (report-only): when `.docgrad.yml` sets `scenarios:` (a list of representative
  code paths), `retrieval.mjs` computes it mechanically — each scenario reports `marginal_tokens`
  (entry_files + every doc on the index chain + every anchoring doc, each file counted once),
  `max_depth` (how many hops from `index_file` to the furthest anchoring doc), `fan_in` (how many
  docs anchor it) and `code_pointer` (whether the code on that path points back at any doc) —
  and weights them by `churn_commits` (commits in the last 90 days) to name the most heavily taxed
  scenario: high churn together with high `marginal_tokens` or deep `max_depth` means the agent
  touches it often and pays the most to retrieve it, so it is the one to fix first. Without
  `scenarios:`, fall back to the old method: the LLM simulates the required reading path from
  `.docgrad.yml`'s `scenario` (singular, a prose string).
- **Pollution surface**: `inventory.pollution.ratio` (excluded directories and WIP as a share of the
  whole corpus). Carries a measure verdict.
- **Interpretation**: the report must include a break-even statement — an overstuffed entry file
  means every task pays a fixed tax; routing everything through the index means paying the marginal
  cost of multi-hop retrieval. Give a trade-off recommendation based on what that repo's tasks
  actually look like.

### Traceability (report-only)

A newer signal, measuring "is there a path from a code file back to the spec that governs it, and is
that spec usable" — it decides no verdict and is only an extension of the token economy signals. The
mechanical basis is `retrieval.mjs` (`code_pointer_ratio` / `index_hotness`) and `inventory.mjs`
(`structure.rules`).

- **`code_pointer_ratio`** (aggregated from retrieval.mjs `areas[].code_pointer`): whether the code
  under each first-level subdirectory of `src_dirs` points back at any doc (a `docs_dirs` path
  prefix, or the basename of some doc). A low ratio means an agent that just changed the code has no
  path back to the spec and can only grep the whole doc tree and guess.
- **`index_hotness`** (retrieval.mjs): commits in the last 90 days on `index_file` / `entry_files`
  versus the median across all docs. A `ratio` clearly >3 usually means the index or entry file has
  absorbed content that the child documents should be exposing themselves — the index should be
  pointing the way, not being edited along with the content. It can also be plain orphan maintenance
  debt; read `top5` to tell which.
- **`structure.rules`** (inventory.mjs, per file): for rule lines (matched by `rules.pattern`,
  default `**MUST`), the `median_chars` / `p90_chars` / `anchored_ratio`. A median above 300
  characters or an `anchored_ratio` below 0.5 is a signal to split that file into a **contract
  layer** (the rules themselves: short, with coordinates) and a **detail layer** (background and
  examples, which may be long) — long rule lines mixed with background narrative force the agent to
  read the whole passage every time to find the one sentence that is actually a MUST, and a low
  anchored ratio means the claims have no verifiable landing point in the code.
  A coordinate is path-shaped **or** API-shaped, the same definition the claim population uses — so
  on a library repo, whose rules land on functions rather than files, `anchored_ratio` measures what
  it claims to. Before v1.7.0 it counted path shapes only, which made this signal fire on exactly
  the repos where every rule did have a landing point (#51). Like the claim population, the API half
  is inert when `src_dirs` is unset.

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

## Version history

Comparability notes for a measure-side change — the counterpart to [rubric.md](rubric.md) §Version
history, which covers judge-side moves. This section exists because a measure-only note written into
rubric.md would move `judge_hash` for a change judge never saw; see rubric.md §Version history's
E4b entry for why `judge_hash` now folds rubric.md in.

<details>
<summary>Expand</summary>

- **v2.0.0 (E2c-1) — `targets` names measure signals instead of 1.x star-rated dimensions,
  `accept` / `meets_target` are added to every verdict row, and the three 1.x economy star fields
  are removed**:
  - **`targets` semantics.** In 1.x, `targets` held a star (1–5) per 1.x dimension and fed the
    judge. Since judge and measure split (E1/E2a), a judged dimension has no target: `targets` now
    names a `measure` signal id and accepts exactly `OK` (the default, for every signal) or `WATCH`,
    written in block form — `targets:\n  entry_cost: WATCH`. `FAIL` can never be accepted. A config
    still carrying a 1.x star-valued key is not rejected: the key is dropped and a warning names it
    (see §Targets above), so an old `.docgrad.yml` keeps loading.
  - **`accept` / `meets_target`.** Every `measure` row now carries `accept` (the verdict this repo's
    config allows that signal to settle at) and `meets_target` (`true`/`false`, or `null` alongside a
    `null` verdict) — see §Targets above for the full semantics. These are new fields on an existing
    row shape; no existing field changed meaning.
  - **The three 1.x economy star fields are removed.** `inventory.economy_thresholds` no longer
    reports `cost_allows_star`, `star_5_cost_met` or `pollution_caps_at` — arithmetic over the
    retired ★1–★5 economy anchor, kept one epoch past E2b-2's rating retirement and now gone. This
    is a breaking output change for anything still reading those three keys; `entry_cost_tiers`,
    `pollution_max`, `customised`, `entry_cost_tokens_est` and `pollution_ratio` are unchanged.
  - **`measure_hash` moves, because this file changed** (this section, and §Targets above, are both
    `measure_hash` inputs). The old → new value is recorded in CHANGELOG.md, not here — quoting the
    new value in the file whose content produces it would be circular. `judge_hash` and `corpus_hash`
    are unchanged by this entry.
  - **Verdict lines are unchanged.** No `MEASURE_BANDS` threshold moved and no row's `OK`/`WATCH`/
    `FAIL` line changed; §Verdict lines above still describes them exactly.
  - **`targets` is still not a `measure_hash` input**, exactly as when it held star values: it decides
    when a repo is satisfied, not how it is measured.

</details>

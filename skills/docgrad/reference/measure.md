# measure — run the mechanical scripts

> **Last updated:** 2026-09-16

Precondition (blocker): the target repo root must have `.docgrad.yml`; if not → stop, point to `/docgrad init`.
This process **does not modify any file** and writes no state — pure report. Read [rubric.md](rubric.md) before scoring.

## Contents

- [Step 1. Run the mechanical scripts](#1-run-the-mechanical-scripts)
- [Step 8. Token economy report](#8-token-economy-report)
- [Step 8b. The graduation gate, if the repo has one](#8b-the-graduation-gate-if-the-repo-has-one)

For a scoped run: see [judge.md](judge.md) §Scoped audit.

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

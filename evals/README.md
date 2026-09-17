# docgrad evals

> **Last updated:** 2026-09-17

Skill-level evaluation: this measures "when an agent uses this skill to score a repo, is the
result stable and correct" — not the scripts' unit behavior (that's `tests/`,
`node --test tests/*.test.mjs`). v2 split that one question into two, with different answers:
**`measure`'s numbers are expected to be identical run to run** on an unchanged tree — a mismatch
is a bug in the scripts, not discretion; **`judge`'s star ratings are model judgement**, and
whether they land the same way twice is exactly what `--runs 5` is for. See
[judge.md §Known instability](../skills/docgrad/reference/judge.md#known-instability) for what is
and isn't stable today.

## Contents

- [Why they exist](#why-they-exist)
- [The three cases](#the-three-cases)
- [How to run them](#how-to-run-them)
- [First v2 run (2026-09-17)](#first-v2-run-2026-09-17)
- [Current status: the harness runs, the suite does not score yet](#current-status-the-harness-runs-the-suite-does-not-score-yet)
- [Mechanical baselines for the fixtures](#mechanical-baselines-for-the-fixtures)

## Why they exist

`tests/` has 60+ unit tests all passing, but they test the output of the scripts,
**not whether `measure`'s numbers or `judge`'s star ratings are stable across runs**. After
oikos's graduation on 2026-07-13 (1.x), a same-day re-verification found consistency — a judged
dimension in both 1.x and v2 — went ★4→★2, and not a single unit test went red, because the
scripts weren't what was broken.

Without evals there's no way to answer "is the error on a ★4 rating ±0 or ±2," and no way to
verify whether v1.1.0's sampling mechanization actually worked. This is also what the Anthropic
skill authoring checklist's three Testing requirements (≥3 evaluations, cross-model testing,
real-scenario testing) call for.

## The three cases

| case | what it tests | pass condition |
|---|---|---|
| `linkage-known` | **measure correctness** — must be deterministic | dead links 1/12 = 8.33% can only verdict `dead_link_ratio` **FAIL** (`> 2%`). This is a `measure` number, not a judge star: it's expected to come out identical on every run of an unchanged tree, and the per-run grader checks it against that expectation directly — no distribution needed for this one |
| `planted-contradiction` | **judge sampling** | the contradiction sits in the sentence **next to** the anchor line (no code ref) — checking only the anchor line would miss it. This is the `judge` case: correctness is model judgement over a sample, and whether the judge's own vote on this transcript is stable across runs is tracked separately (#69, see below), not asserted per run |
| `clean-baseline` | **false positives across both layers** | a fully clean repo must not be docked — neither by `measure`'s verdicts (dead links, bad anchors, orphans, date mismatches) nor by `judge`'s correctness ledger; raising sensitivity must not turn into false positives everywhere |

The first two push docgrad to catch real defects; the third confirms it doesn't harm a clean
repo in the process. Drop any one of the three and the other two's conclusions become untrustworthy.

## How to run them

```bash
claude plugin eval . --runs 5
```

- `--runs 5`: **the distribution of `judge`'s star ratings is itself the metric — it is a tracked
  defect (#69), not a green-suite criterion.** Getting ★2/★2/★3 across three runs on `judge`'s
  dimensions means room for discretion remains at that point; a per-run grader can only ever check
  one transcript, so cross-run stability is read from the distribution afterward, by a human, not
  folded into whether any individual run "passed." `measure`'s numbers are the opposite case: they
  are expected to be identical across all `--runs`, and a mismatch there is a real regression the
  suite should fail on.
- `--model`: the checklist requires testing Haiku/Sonnet/Opus. The rubric is a large amount of
  judgment-based zh-TW prose, and whether a weaker model can map it consistently to the right
  answer is **completely unknown** — that's exactly what this is meant to measure.
- `--threshold`: everything must be green to pass; `linkage-known`'s `measure` verdict leaves no
  room for interpretation.

## First v2 run (2026-09-17)

```bash
claude plugin eval . --runs 5 --scaffold --allow-tools Bash --keep-temp --trust-plugin
```

Claude Code 2.1.274, `measure_hash dd15ca3f`. Two arms (the default ablation adds a no-plugin
baseline), 30 runs, 56 minutes, `$24.43`.

| case | with docgrad | without | Δ |
|---|---|---|---|
| `clean-baseline` | 1.00 — 3/3 votes ×5 | 0.00 | +1.00 |
| `linkage-known` | 1.00 — 3/3 votes ×5 | 0.00 | +1.00 |
| `planted-contradiction` | 0.60 — votes 3/3, 0/3, 3/3, 1/3, 3/3 | 0.00 | +0.60 |

**`measure` was identical in every run.** All 15 with-plugin runs reported `measure_hash dd15ca3f`
and the same verdict on all 11 signals: `dead_link_ratio` FAIL ×5 on `linkage-known`, everything else
OK on every case. That is the property the v2 split promised, now observed through the harness
rather than only in `tests/` — and the pinned fixture dates are why `date_drift` and the mismatch list
could not move.

**`judge` stars, read as a distribution** (the tracked defect, not a pass condition):

| case | Completeness | Correctness | Consistency |
|---|---|---|---|
| `clean-baseline` | ★2 ★3 ★2 ★2 ★3 | ★4 ×5 | ★4 ×5 |
| `linkage-known` | ★1 ★2 ★1 ★1 ★2 | n/a ×5 | ★3 ★4 ★3 ★3 ★3 |
| `planted-contradiction` | ★2 ★2 ★2 ★2 ★3 | ★2 ×5 | ★2 ×5 |

The stars the planted case exists to pin (correctness and consistency ★2) held in all five runs.
Completeness moved by one step on all three fixtures — the same boundary #70 names — and
`linkage-known`'s consistency moved once.

**The two failing `planted-contradiction` runs found the contradiction.** All five recorded the
claim as `fail` and arbitrated against the code. The judges leave no reasons, so the following is read
off the transcripts, not stated by the harness: the two failing runs were the only two that described
the sign as "backwards", while the three passing runs wrote "opposite" or "inversion" — and criterion 2
then demanded the literal phrase "the sign is reversed relative to the code", which no run wrote. The
1/3 run also hedged the arbitration ("or fix the code if the document is the intended contract").
Criterion 2 now asks for the direction in any wording, and criterion 3 says an open-ended arbitration
does not count.

**Re-run with the revised grader** (same day, `planted-contradiction` only, `--ablation none`, 5 runs,
14 minutes, `$6.61`): **5/5, every run 3/3 votes.** Read that narrowly. Every one of those five
transcripts used "backwards" *and* "opposite" somewhere, and none hedged the arbitration, so this run
shows the revised grader accepts transcripts that say "backwards" — it does not isolate a run that
says *only* "backwards", and five runs cannot show the vote is now stable. It is one more sample
toward #69, not a closed question.

## Current status: the harness runs, the suite does not score yet

> **History.** This section, its blocker table, and the dated results below it were written
> against 1.x's `audit` command and six-dimension star rating (through 2026-09-16). They're kept
> as a record of what it took to get the harness running at all — the mechanics (scaffold, `Bash`,
> `git`, `node`, reading `explanation` on a zero) are unchanged by the v2 measure/judge split, only
> the vocabulary they were diagnosed against (`audit`, "six dimensions," per-dimension stars) is
> 1.x. Where a passage states something as v2's current behavior, it's been updated in place;
> passages narrating what a specific 1.x run said are left as they were said.

`claude plugin eval` **does run now** (v1.7.0, 2026-09-14). Getting there took unpicking seven
separate blockers, six of which are fixed in this directory. They are written down because each one
produced the same symptom — `score 0.00`, `judge votes: FAIL FAIL FAIL` — and a score of zero says
nothing about which layer failed.

| # | Blocker | Symptom | Status |
|---|---|---|---|
| 1 | `` `plugin eval` is currently in early access `` | exit 1, nothing runs | **Fixed**: a stale CLI build, not an entitlement. See [docs/how-to.md](../docs/how-to.md) §Run the skill-level evals |
| 2 | Graders had no `type:` frontmatter | `invalid case.yaml: graders: Required` | **Fixed**: `type: llm` added; each rubric's body is unchanged |
| 3 | Each run starts in an **empty** workspace | the fixture is not there; Claude reports it cannot read anything | **Fixed**: `case.yaml` → `context.scaffold_script` copies the fixture in and gives it its own git history |
| 4 | No `Bash` in the sandbox | the five measurement scripts cannot run at all | **Fixed**: run with `--allow-tools Bash`. A case's own `allowed_tools` cannot grant it |
| 5 | **`git` cannot execute in the sandbox** | every git-derived signal is `null`; freshness rounds down | **Fixed**: `evals/lib/provide-tools.sh` resolves the real binary at scaffold time and puts an exec wrapper at `./bin/git`; the prompt runs the scripts with `PATH="$PWD/bin:$PATH"` |
| 6 | **`scaffold_script` does not run without `--scaffold`** | the fixture is never copied in; the case runs against an empty workspace, which is blocker 3 again with the fix in place | **Fixed** in the invocation, not the suite: pass `--scaffold`. The flag is author-supplied bash running as you, so the harness will not run it implicitly |
| 7 | **`node` is not on the sandbox's default PATH** | the five scripts cannot be executed; the session either fails or goes looking for an install by itself | **Fixed**: the same helper also writes `./bin/node`. Measured 2026-09-15 — a run scored only because the model found an fnm install unaided and said so in its report |
| 8 | **A usage limit hit mid-run** | `score 0`, `passed: false` — the same shape as a failed case | **Cannot be fixed, must be recognised**: the run is void, not failing. See below |

Blocker 4 is worth stating plainly because it is a property of this tool, not of this suite:
**`measure`'s signals are the output of four dependency-free Node scripts, not an LLM's impression
of the documents** — and `judge` itself needs this same round's `measure` output as a precondition
before it rates anything. Without `Bash` neither layer is possible, and the harness removes
ungranted tools from the session entirely. Any eval of docgrad must grant it.

### Blocker 5: git — what it cost, and what fixing it bought

On macOS `/usr/bin/git` is the `xcrun` shim. Inside the sandbox it cannot write its cache and so
cannot find the real binary:

```
git: error: couldn't create cache file '/var/folders/.../T/xcrun_db-SC5Pwfw0' (errno=Operation not permitted)
git: error: Failed to locate 'git'.
xcode-select: Failed to locate 'git', and no install could be requested
```

Prepending a real git to `PATH` in the invoking shell does **not** help — the sandbox does not
inherit it. `env:` in `prompt.md` cannot be used either: its keys must match `EVAL_[A-Z0-9_]*`, so
`PATH` and `TMPDIR` are not settable there.

The way through is the asymmetry: **the scaffold runs before the sandboxed session, and its own
`git init` works.** So `evals/lib/provide-tools.sh` resolves the real binary there (`xcrun -f git`,
where xcrun can still write its cache) and writes an exec wrapper to `./bin/git`; the session never
touches the shim. Symlinks are resolved before the path is baked in, because a version manager's
per-shell symlink stops existing when that shell does.

**Measured, `clean-baseline`, 2026-09-15**, same flags either side:

| | without the wrapper | with it |
|---|---|---|
| `inventory.untracked.count` | `null` — *"git is present but failed to run here"* | `0`, the check ran |
| Freshness | **★3** — `mismatches: []` and `stale: []` are *unrun*, not clean | **★4** |
| Judge votes | FAIL FAIL FAIL | PASS FAIL FAIL |

That is the whole shape of this blocker in one table: the rating was never wrong, the input was half
missing, and docgrad rounded down exactly as `rubric.md` principle 4 tells it to.

### The case still does not pass, for a reason that is not git

With git working, `clean-baseline` scored 1 of 3 judge votes. All four of its numbered criteria hold
in the transcript — zero false positives, the ledger at 1/1 `pass`, linkage ★5 and freshness ★4, and
both ★5s named as design ceilings. What the judges reacted to was the grader's own opening sentence,
which used to read *"This fixture is deliberately free of any defects"* while the run reported
**Completeness ★2** — three files with no build, test or deploy instructions, which is a true finding
and not a false positive. The preamble overclaimed on a dimension the case does not test, and the
judges weighed the framing over the list. It now says what the fixture actually is.

### Reading a zero: three things that produce one

A `score 0` says nothing about which layer failed — that is the whole reason the table above exists.
Three distinguishable causes, in `evals/results/<run>/aggregate-result.json`:

| Cause | How to tell |
|---|---|
| The judges evaluated and voted it down | `explanation: "judge votes: FAIL FAIL FAIL"`, and `judgeVotes` is present |
| The grader never ran (usage limit, transport error) | `explanation: "grader threw: …"`, **`judgeVotes` is absent**, and the arm carries `error` |
| The session could not do the work at all | the transcript has no scorecard; blockers 4–7 all land here |

The middle one cost a diagnosis on 2026-09-15: a run stopped at the judge call with
`You've hit your session limit`, recorded `score: 0`, and would have read as "the third grader fix
also failed" if `explanation` had not been checked. Read `explanation` before concluding anything
from a zero.

### Writing a grader: it can only judge what one transcript shows

Two of the three cases failed for the same reason, and neither reason was docgrad's. Both had
numbered criteria that the transcript **fully satisfied**, and both failed anyway, because the prose
around those criteria asked the judge for something outside its view:

- `clean-baseline` opened with *"this fixture is deliberately free of any defects"*, while the
  fixture genuinely has no build, test or deploy documentation — so the run reported completeness ★2,
  a true finding, and the judges weighed the framing over the list. Fixed by saying what the fixture
  actually is and scoping the pass condition to the numbered criteria.
- `linkage-known` closed with *"the rating must be perfectly consistent across multiple runs"*. A
  per-run judge sees one transcript and cannot see a distribution. That requirement is real, but it
  belongs to whoever reads the `--runs 5` output, not to the grader; it now lives in the case table
  above. Its criterion 3 also named `docs/orphan.md`, a file this fixture does not contain — copied
  from `tests/fixtures/basic` — so a judge trying to verify it found nothing to check.

Three rules follow, and they are cheap to apply:

1. **Scope first, criteria second.** State what the fixture is and is not, and say "judge only the
   numbered criteria", before the list rather than after it.
2. **Name only files the fixture has.** A criterion about an absent file is vacuous at best and
   corrosive at worst — it makes the whole grader look like it describes a different fixture.
3. **Never ask for a cross-run property.** Anything about stability, distribution or repeatability
   is the operator's check, not the judge's.

### What running it anyway was worth

The run found a real defect in v1.7.0's own `#52` fix. docgrad reported *"this directory is not a git
working tree"* for a directory that **is** one — because the code inferred "not a work tree" from
"git exited non-zero", and here git exists, runs, and fails for an unrelated reason. The two
diagnoses call for opposite follow-ups. Fixed in the same release: the classification is now
three-way and carries git's own words. An eval that scored 0.00 on every case still paid for itself.

### First machine-produced distribution (2026-09-16)

`--runs 5`, three cases, `$17.94`, 46 minutes. **The rating each case exists to pin was identical in
all five runs of all three cases** — linkage ★2 ×5, consistency ★2 ×5, and `clean-baseline` identical
cell for cell. What moved was the judges: vote counts of 3/3 ×5, `1/3 3/3 2/3 2/3 3/3`, and
`2/3 1/3 3/3 0/3 3/3` respectively, against dimension ratings that did not change. Full table and the
hypotheses tested against it: [case-studies/03-fixtures.md](../case-studies/03-fixtures.md).

Read that asymmetry carefully, because it is the point of running five: **the measurement is
reproducible and the grading is not.** A suite whose graders disagree with themselves cannot fail a
tool; it can only fail to say anything. That is now the open work, and it is not docgrad's.

### The earlier reproducibility evidence is hand-run

Because the harness had not yet produced a score at the time, the three cases were **executed by hand**, with their
`prompt.md` text unchanged and each output scored against its `graders/criteria.md`: three fixtures ×
two language arms (the English rubric and the Traditional Chinese one it was translated from) × two
runs = 12 independent audits. Results are in [case-studies/03-fixtures.md](../case-studies/03-fixtures.md).

All 12 runs passed their case's stated criteria, and 16 of 18 dimension slots were unanimous across
runs. The two that were not produced one real finding — **the correctness anchors are all written in
terms of a pass rate, and `linkage-known` has `claims_total: 0`, so an empty sample has no anchor at
all**. Four runs rated it ★3, ★3, ★1 and ★2, each defensibly. That gap belongs in
`skills/docgrad/reference/rubric.md`, not in the evals.

This is evidence, not a substitute: hand runs cannot give a distribution over many runs, and they
have no no-plugin baseline arm to compare against. Both are what the harness is for.

### Reproducing a run

```bash
claude plugin eval . --scaffold --allow-tools Bash --keep-temp
```

`--keep-temp` is not optional for diagnosis. Without it a failing case gives you `0.00` and nothing
else; with it you get each run's `trace.jsonl`, which is where every finding above came from.

## Mechanical baselines for the fixtures

The `measure` output for the three repos under `evals/fixtures/` is fixed; the graders' assertions
are built directly on these numbers. Before changing a fixture, rerun the comparison first —
if the numbers change, update the graders accordingly.

**Run against a scaffolded copy, not the fixture in place.** `evals/fixtures/*` sits inside this
repo's own git history, so reading it in place would date every file by *this* repo's commits, not
by the fixture's own pinned `2026-09-13` date each `fixture.sh` now commits with (`GIT_AUTHOR_DATE`
/ `GIT_COMMITTER_DATE`, so `date_drift` and `mismatches` are stable whatever day the eval runs).
Run each case's own `fixture.sh` in an empty scratch directory — it expects to be run with that
directory as `cwd` — then run the four scripts against the `target/` it creates:

```bash
for c in clean-baseline linkage-known planted-contradiction; do
  mkdir -p /tmp/docgrad-eval-baseline/$c && (cd /tmp/docgrad-eval-baseline/$c && bash /path/to/docgrad/evals/$c/fixture.sh)
  node skills/docgrad/scripts/links.mjs     --root /tmp/docgrad-eval-baseline/$c/target
  node skills/docgrad/scripts/freshness.mjs --root /tmp/docgrad-eval-baseline/$c/target
  node skills/docgrad/scripts/inventory.mjs --root /tmp/docgrad-eval-baseline/$c/target
  node skills/docgrad/scripts/coverage.mjs  --root /tmp/docgrad-eval-baseline/$c/target
done
```

| case | links total | dead | bad_anchors | orphans | `dead_link_ratio` | `orphan_ratio` | `reachable_ratio` | `date_coverage` | `date_drift` | `mismatches` |
|---|---|---|---|---|---|---|---|---|---|---|
| `clean-baseline` | 3 | 0 | 0 | 0 | OK (0%) | OK (0/3) | OK (1.0) | OK (3/3) | OK (0) | `[]` |
| `linkage-known` | 12 | 1 | 0 | 0 | **FAIL (8.33% = 1/12, `docs/guide.md` → `./install.md`)** | OK (0/5) | OK (1.0) | OK (5/5) | OK (0) | `[]` |
| `planted-contradiction` | 2 | 0 | 0 | 0 | OK (0%) | OK (0/3) | OK (1.0) | OK (3/3) | OK (0) | `[]` |

`key_doc_age`/`stale` are left out of this table on purpose — they measure the gap to the day the
scripts are actually run, not to the fixture's pinned commit date, so their number and verdict move
with the calendar even though nothing about the fixture changed. Confirmed by running the same two
scripts against `clean-baseline` and `linkage-known` with `DOCGRAD_TODAY=2027-06-01` (>180 days
after the pinned `2026-09-13`, well past `freshness.stale_after_days` (60) and the `key_doc_age`
FAIL line at `max(180, stale_after_days)`):

```
$ DOCGRAD_TODAY=2027-06-01 node skills/docgrad/scripts/freshness.mjs --root .../clean-baseline/target
key_doc_age: value 261, verdict FAIL ("FAIL > 180 days")   # was OK at the eval's own run date
date_coverage: OK · date_drift: OK · mismatches: []        # unchanged from the table above

$ DOCGRAD_TODAY=2027-06-01 node skills/docgrad/scripts/links.mjs --root .../linkage-known/target
dead_link_ratio: FAIL (8.33%) · orphan_ratio: OK · reachable_ratio: OK · index_present: OK
                                                              # identical to the table above
```

Every row either grader must assert (see `linkage-known/graders/criteria.md` and `clean-baseline/graders/criteria.md`) holds at
its asserted verdict at both run dates, and `mismatches` stays `[]` at both — which is the point of
pinning the fixture's commit date: `date_drift`/`mismatches` don't depend on when the eval runs,
only `key_doc_age` does, and that's exactly the one signal neither grader asserts.

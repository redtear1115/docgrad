# Contributing to docgrad

> **Last updated:** 2026-09-15

Thanks for looking. This file covers what is different about contributing here: docgrad measures
things, so a change can be correct and still be a problem if it silently moves a number that past
rounds are compared against.

## Contents

- [Development environment](#development-environment)
- [Tests and evals](#tests-and-evals)
- [Three tiers of change](#three-tiers-of-change)
- [The fingerprint discipline](#the-fingerprint-discipline)
- [`docs(docgrad):` is a reserved commit prefix](#docsdocgrad-is-a-reserved-commit-prefix)
- [`.docgrad/` is version-controlled, all of it](#docgrad-is-version-controlled-all-of-it)
- [Before opening a PR](#before-opening-a-pr)
- [Interop with other skills](#interop-with-other-skills)

## Development environment

Node ≥18, and nothing else. The five measurement scripts under `skills/docgrad/scripts/` are
dependency-free on purpose: they run from a target repo that has no relationship to this one, so
there is no install step to ask of a user. A PR that adds a runtime dependency needs to argue that
case first.

## Tests and evals

Two layers, testing different things:

```bash
node --test tests/*.test.mjs      # script behaviour (193 tests)
claude plugin eval . --runs 5     # star-rating stability
```

`tests/` pins the scripts' JSON output. `evals/` pins something the unit tests cannot reach: whether
an agent using the skill produces the *same star rating* twice. After oikos graduated on 2026-07-13,
a same-day re-verification found consistency had gone ★4→★2 and not one unit test went red — the
scripts were not what was broken. See [evals/README.md](evals/README.md).

`--runs 5` matters. **The distribution of ratings is itself the metric**: ★2/★2/★3 across three runs
means discretion remains at that point. Track it as a defect rather than taking the mode.

## Three tiers of change

Which tier a change lands in decides what else it has to carry:

| Tier | What | What it has to carry |
|---|---|---|
| **Scripts** (`skills/docgrad/scripts/`) | Mechanical measurement | Determinism: same tree + same config ⇒ same JSON, on any machine. New output fields get a test. |
| **Judgement** (`reference/rubric.md`, `judge.md`, `placement.md`) | The rules a model applies when rating | A fingerprint moves (below), so it needs a comparability entry and a CHANGELOG line |
| **Measure** (`reference/measure.md`) | The verdict lines the scripts apply | `measure_hash` moves; needs a comparability entry and a CHANGELOG line. `lib.mjs › MEASURE_BANDS` (the band table itself) is covered by the same hash. |
| **Documentation** | Everything else | docgrad's own six dimensions apply; run an audit on this repo if a change is large |

The scripts' contract is stated once in [SKILL.md](skills/docgrad/SKILL.md) §Scripts: read the target
repo's `.docgrad.yml`, write JSON to stdout, report errors on stderr with a non-zero exit. Keep it.

## The fingerprint discipline

Four hashes travel in every round's `history.jsonl` line. **Two were renamed in v2.0.0** —
`judgement_hash` → `judge_hash` and `thresholds_hash` → `measure_hash` — digesting the same inputs,
so the values did not move at the rename. **`judge_hash`'s inputs, and therefore its value, changed
later in the same release**: E2a repointed it from `audit.md` to `judge.md` (a false break — the file
moved, no rule changed). **`measure_hash`'s inputs changed later in 2.0.0 too**: it now also covers
the verdict band table (`lib.mjs › MEASURE_BANDS`) and `reference/measure.md`, on top of the three
config values it always covered. See [rubric.md](skills/docgrad/reference/rubric.md) §Version history for the
disclosure this required. The names now say which of the two layers each one answers for: v2 separates
`measure` (the scripts' output, reproducible, fit to gate CI) from `judge` (the model's stars, which
are not), and a fingerprint spanning both would put judge's prose in the way of measure's trend, and `report` uses them to draw
comparability breaks — the lines that tell a reader "scores either side of this cannot be compared".
Know which one your change moves:

| Hash | Covers | Source |
|---|---|---|
| `rubric_hash` | `reference/rubric.md`, whole file | `lib.mjs › docgradMeta()` |
| `judge_hash` | `reference/judge.md` + `reference/placement.md` | `lib.mjs › JUDGE_FILES` |
| `measure_hash` | `economy.entry_cost_tiers`, `economy.pollution_max`, `freshness.stale_after_days`, `reference/measure.md` + `lib.mjs › MEASURE_BANDS` | `lib.mjs › measureHash()` |
| `corpus_hash` | The config fields that select the corpus | `lib.mjs › corpusFingerprint()` |

Two rules follow from this:

1. **Do not change what a hash covers in the same release as a change it would have revealed.** That
   was the reasoning recorded in #56: folding `audit.md` into `rubric_hash` while `audit.md` was
   itself changing would hide the break behind a hash movement nobody could interpret.
2. **A cosmetic edit that moves a hash is a false break.** `corpusFingerprint()` normalizes entries
   (trim, drop trailing slashes, dedupe, sort) for exactly this reason. `rubric_hash` deliberately
   does *not* — it hashes the whole file, so reformatting rubric.md does draw a break. That
   inconsistency is known and is written down in #56; do not "fix" one side of it in passing.

## `docs(docgrad):` is a reserved commit prefix

It means "docgrad's own convergence loop wrote this", and **two independent mechanisms read it**:

- `freshness.mjs` skips those commits when computing a document's real git date
  (`DOCGRAD_COMMIT_PREFIX`). Without that, round 1 backfills `Last updated:` on 39 files and round 2
  then sees 38 false mismatches, because the backfill commit moved every one of those git dates.
  This happened on oikos on 2026-07-13.
- `lib.mjs › isDocgradAuthored()` matches `/^docs\(docgrad\)\s*:/` on the commit that *added* a file,
  which feeds `claims_docgrad_authored_ratio` — the disclosure field that says how much of a round's
  claim population came from prose docgrad itself wrote.

So a hand-written commit using that prefix has its date ignored and misattributes any file it adds.
Use `docs:`, `docs(#NN):`, `feat(#NN):`, `fix(#NN):`, `chore(release):` — the shapes already in
`git log`.

## `.docgrad/` is version-controlled, all of it

It is not scratch space; it is the tool's state. `history.jsonl` is what the next round compares its
fingerprints against, `ledger.jsonl` is the cumulative claim coverage that sampling draws down,
`scorecard-latest.md` is what `report` reprints. Gitignore any of them and the feature that reads it
stops working silently: a fresh clone restarts coverage at zero and never draws a comparability
break, with no error to notice.

## Before opening a PR

- `node --test tests/*.test.mjs` green
- New script output fields have a test, and the JSON contract in `SKILL.md` §Scripts still holds
- If a fingerprint moved: a comparability entry in `rubric.md` §Version history, plus CHANGELOG
- `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json` agree on `version`
- Issue first for anything beyond a typo. The issues in this repo carry the reasoning — see #54 or
  #56 for the shape: state the problem, show the measurement, leave the undecided directions visible.

## Interop with other skills

docgrad is designed to compose rather than to grow: prose style is Vale's job, SKILL.md auditing is
skill-audit's job, code quality is code review's job. Where another skill covers one of those, the
integration and its deliberate limits are written down in [INTEROP.md](INTEROP.md).

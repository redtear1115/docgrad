# Upgrading from 1.x to 2.0

> **Last updated:** 2026-09-17

2.0.0 is breaking (#83). It splits what used to be one six-dimension star rating into two layers:
**`measure`** — four scripts' reproducible `OK`/`WATCH`/`FAIL` signals, what CI and `loop` act on —
and **`judge`** — an LLM ★1–★5 rating for the three dimensions a script can't check, not reproducible
and never a gate. Every item below links to the section that actually defines the new behaviour;
this page is a map between the two versions, not a restatement of either one.

## 1. Commands: `audit` → `measure` (+ `judge` / `--judge`)

1.x's `audit` command is now a **deprecated alias**, kept for muscle memory. It still runs report-only
and writes nothing, but it now runs `measure`, and runs `judge` too only when you pass `--judge`. If
you scripted or documented `docgrad audit`, switch to `docgrad measure` (plus `docgrad judge` when you
want stars). See [skills/docgrad/SKILL.md](skills/docgrad/SKILL.md#routing) §Routing for the full
table, including the scoped/`--dim` forms.

## 2. `.docgrad.yml` `targets`: star values are ignored, not honoured

A 1.x config could set `targets` to one of the six star-rated dimension names with a star value
(e.g. `completeness: 4`). Those keys still load — they are **ignored with a warning** naming the
dropped keys — but they no longer do anything. A 2.0 `targets` block names a `measure` signal id
(`entry_cost`, `dead_link_ratio`, …) and accepts exactly `OK` or `WATCH`, in block form:

```yaml
targets:
  entry_cost: WATCH
```

Anything else — an unknown id, `FAIL`, a number, a different spelling — is a config load-time error,
not a silently ignored setting. Full semantics: [measure.md §Targets](skills/docgrad/reference/measure.md#targets).

## 3. Script output: `measure` arrays, and three retired fields gone

Every script except `retrieval.mjs` now emits a top-level `measure` array — each row carries `id`,
`value`, `verdict` (`OK`/`WATCH`/`FAIL`/`null`), `line`, plus the new `accept` and `meets_target`
fields §Targets above defines. If you parsed the old per-dimension star fields directly, you're
reading the wrong shape now — see [measure.md §Verdict lines](skills/docgrad/reference/measure.md#verdict-lines)
for the row-by-row mapping from a retired ★ anchor to its verdict line. Separately,
`inventory.economy_thresholds` drops the three 1.x economy-star arithmetic fields (`cost_allows_star`,
`star_5_cost_met`, `pollution_caps_at`); `entry_cost_tiers`, `pollution_max`, `customised`,
`entry_cost_tokens_est` and `pollution_ratio` are unchanged.

## 4. Fingerprints: renamed, so every 1.x ↔ 2.0 comparison breaks

`thresholds_hash` → `measure_hash`, `judgement_hash`/`rubric_hash` → `judge_hash` (folded together
across two epochs). A round measured under the old names and a round measured under the new ones
cannot be told apart as "same ruler" by name alone — treat every 1.x → 2.0 pair as a break, the same
way a major-version rubric change always has been. Full rename story, including which values moved
and which didn't: [CHANGELOG.md — v2.0.0 epoch 1](CHANGELOG.md#v200-epoch-1--the-fingerprints-speak-in-two-layers).

## 5. `history.jsonl`: schema 2, legacy rows kept separate

Rows written by `improve`/`loop` now carry `"schema": 2` and a nested `docgrad` object (the
fingerprint block copied verbatim from the scripts' own output). A pre-2.0 row has no `schema` field;
`report` shows it in its own "1.x rounds" block and never joins it to a schema-2 row — nothing in
`history.jsonl` is rewritten. Details, including the legacy break rules still honoured inside that
block: [CHANGELOG.md — v2.0.0 epoch 4a](CHANGELOG.md#v200-epoch-4a--history-rows-carry-schema-2) and
the `report` row of [SKILL.md §Routing](skills/docgrad/SKILL.md#routing).

## 6. Scorecard: Measure and Judge blocks, never an overall score

`.docgrad/scorecard-latest.md` (and every `report`/`improve`/`loop` printout) now has a `## Measure`
block and a separate `## Judge — not comparable across rounds` block; there is no overall score in
either version, but 2.0 says so explicitly and disclaims stars as non-comparable in the block header
itself. Full template: [judge.md step 9](skills/docgrad/reference/judge.md#9-emit-the-scorecard).

## 7. Graduation gate: a new pollution threshold, old gates predate it

A gate produced before this version has no `max_pollution_ratio` check. Graduating again regenerates
it, pinned to the round's actual `pollution.ratio`; an old gate is reported as predating the
threshold rather than silently treated as covering it. See
[improve.md §Graduation](skills/docgrad/reference/improve.md#graduation-do-it-when-targets-are-met-do-not-just-recommend-it)
for how it is produced, and [measure.md step 8b](skills/docgrad/reference/measure.md#8b-the-graduation-gate-if-the-repo-has-one)
for how an existing gate is reported.

## 8. What to do

Run `measure` (then `judge` if you want stars too) to take a new 2.0 baseline — see the routing table in
[SKILL.md §Routing](skills/docgrad/SKILL.md#routing). Don't try to
compare it against a 1.x round by eyeballing similarly-named fields — the fingerprint renames in
item 4 mean the tooling itself won't recognize them as the same ruler, and neither should you.

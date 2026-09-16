---
name: docgrad
description: Use when the user wants to audit, score, grade, improve, or converge a repository's documentation system as an AI-agent context source — six-dimension star rating (completeness, correctness, freshness, linkage, consistency, economy) including entry-file token cost, with an improvement loop that fixes docs until target ratings are met. Covers docs quality audit, documentation health check, dead-link/orphan/staleness checks, doc convergence. 中文關鍵字：文件評分、文件健檢、文件收斂、docs 評比、文件品質、死鏈檢查、文件過期。Not for prose style linting, SKILL.md auditing, or code review.
argument-hint: "[init · audit · improve · loop · report]"
license: MIT
---

> **Last updated:** 2026-09-13

Grade and converge a repo's documentation system (the docs directory plus the root instruction
files) as an **AI agent context source**: six dimensions rated in stars (including economy — the
token tax on entry files); `loop` fixes docs round by round until targets are met. It does not
lint prose style, does not review code, and does not touch CI.

Prerequisite: the documentation is a **local markdown file tree** and `.docgrad.yml` can be written
to the target repo root; wikis and remote doc sources are not supported (boundaries and workarounds
in [docs/design.md](../../docs/design.md) §Positioning and boundaries).

`SKILL_DIR` = the directory this file lives in (the relative root for `scripts` and `reference`).

## Routing

| User input | Action |
|---|---|
| `/docgrad` (no argument) | Print this table to explain the commands. Do nothing else |
| `init` | Read [reference/init.md](reference/init.md) and follow it |
| `audit` | Read [reference/rubric.md](reference/rubric.md), run [reference/measure.md](reference/measure.md) then [reference/judge.md](reference/judge.md) (report only, changes no files) |
| `audit <scope>` / `audit --dim <dimension>` | Scoped audit: limit to a directory, glob, or topic, or rate a single dimension. Still report-only, and it **never writes to `.docgrad/`** — see judge.md §Scoped audit |
| `improve` | Read rubric.md first, then run one round per [reference/improve.md](reference/improve.md) |
| `loop` | Same as improve, repeated until a stop condition |
| `report` | Read the target repo's `.docgrad/scorecard-latest.md` and reprint it, plus a per-round score trend drawn from `.docgrad/history.jsonl`. If the files do not exist, tell the user to run improve/loop first (a plain audit is report-only and writes nothing). **Check for branch divergence first**: `git rev-list --count HEAD..docgrad/converge` (when that branch exists) > 0 → put a warning at the top of the report: "the converge branch is N commits ahead of this branch, the trend below may be incomplete". The report header always states its data source as `<branch> @ <short-sha>`. **Legacy rows** (no `schema`) are shown as a separate "1.x rounds" block and are never joined to schema-2 rows: draw one break before the first schema-2 row, "v2 changed what is measured; rows above are 1.x and cannot be compared". Inside the legacy block the 1.x rules apply unchanged, kept as the legacy rules: (a) `rubric_hash` differs from the previous round → draw a break line noting "the ruler changed here, scores before and after cannot be compared directly"; (b) `corpus_hash` differs from the previous round → draw a break line noting "the corpus scope changed here: `files_total`, `claims_total`, the freshness denominator and the pollution denominator all moved, so scores either side cannot be compared"; (c) the measure fingerprint — read as `measure_hash`, or as `thresholds_hash` when that is the name present — differs from the previous round → break, same wording as (a); (d) the judge fingerprint — read as `judge_hash`, or as `judgement_hash` when that is the name present — differs from the previous round → break, same wording as (a); (e) rounds with no `economy` key are from the five-dimension era before v1.0.0 → draw `—` for that dimension and note "the rounds below are five-dimension; targets-met and overall scores cannot be compared with newer rounds"; (f) a field missing from a legacy row is unknown and draws no break — this covers every legacy shape: no fingerprints at all, only some fingerprints, old names, and new names without `schema` (rows written between v2.0.0 E1 and this change). This is also where rubric.md §Version history's "report has to map them" is honoured: the name mapping in (c) and (d) is that mapping. **Schema-2 row violations** are each printed as "row N violates history schema 2: <what>": a missing `docgrad` object; a missing `measure` object; or any of these required `docgrad` keys missing — `version`, `rubric_hash`, `measure_hash`, `judge_hash`, `corpus_hash` (the key set `docgradMeta()` emits today). The required-key check applies only when the `docgrad` object is present — a missing object is one problem, not six. Each violating row gets exactly one line listing all of its problems, separated by `; `, for example "row 2 violates history schema 2: missing docgrad" or "row 4 violates history schema 2: missing corpus_hash; missing version". A key not in the list is ignored; the violating row is still shown, but no break decision is inferred from it. **Comparison baseline**: every schema-2 break decision compares a row with the previous schema-2 row that is not a violation — a violating row is skipped as a baseline. A key that is present with value `null` is a value, not a violation (`corpus_hash` is null without a config, and `version` can be null per lib.mjs `docgradMeta`); null compares equal only to null. **Measure trend**: one series per measure id, number first and verdict beside it; break the measure trend when `docgrad.measure_hash` or `docgrad.corpus_hash` differs from the baseline, naming which one moved. **Judge series** (optional to draw) is labelled "judge — not comparable across rounds", and never averaged or summed; break it when `docgrad.judge_hash` or `docgrad.rubric_hash` differs from the baseline — a judge-series break alone does not break the measure trend. **No overall score is ever computed.** When `.docgrad/ledger.jsonl` exists, also report cumulative coverage and which claims are still `fail` or `stale` |

## Blockers (non-skippable)

1. The target repo has no `.docgrad.yml` → every command except `init` must first redirect to
   `/docgrad init`.
2. Before rating anything (audit/improve/loop) you must read
   [reference/rubric.md](reference/rubric.md); the star anchors may not be invented or relaxed.
   Before rating **consistency** you must also read [reference/placement.md](reference/placement.md) —
   the rules for judging placement and duplication live there.
3. improve/loop commit only on the `docgrad/converge` branch, and never modify the target repo's CI
   configuration (which is why freshness ★5 is unreachable inside the loop → it is called a design
   ceiling, see [reference/improve.md](reference/improve.md)).

## Scripts

Five dependency-free Node (≥18) scripts. They read the target repo's `.docgrad.yml`, write JSON to
stdout (consume it in full — do not truncate it through `head` or `grep`), and report errors on
stderr with a non-zero exit:

```bash
node "$SKILL_DIR/scripts/inventory.mjs" --root .   # inventory/tokens/fixed cost/pollution surface/out_of_scope/untracked files/claim candidates/section structure
node "$SKILL_DIR/scripts/links.mjs" --root .       # dead links/broken anchors/orphans/reachable ratio
node "$SKILL_DIR/scripts/freshness.mjs" --root .   # date-signal coverage/git comparison (convention may be multi-valued)
node "$SKILL_DIR/scripts/coverage.mjs" --root .    # coverage drift/undocumented areas
node "$SKILL_DIR/scripts/retrieval.mjs" --root .   # traceability/marginal cost (when scenarios is set)
```

Shared flags: `--config <file>` (when the config file is not at the root), `--include <glob>`
(limits the scope for a scoped audit; repeatable or comma-separated. `coverage.mjs` and
`retrieval.mjs` **accept it and deliberately ignore it** — they exit 0, report `scope: null`, and
each explains in its `note` why narrowing the scope would misjudge its own measurement. They do not
reject it, so a scoped run against them does not fail; it silently measures the full corpus, which
is why the note matters),
`--locate-ledger <path>` (path to a claim ledger, #63 — only `inventory.mjs` acts on it, emitting a `locate_ledger` block that says where each ledgered claim sits in this round's corpus, uncapped and read off the unfiltered population; the other four accept it and report it as a no-op in their own `note`),
`--exclude-ledger <path>` (path to `.docgrad/ledger.jsonl`, #54 — only `inventory.mjs` acts on it,
filtering already-ledgered candidates out of `claim_candidates` before `claim_candidates_cap` is
applied; the other four scripts accept it and report it as a no-op in their own `note`).
The `scope` field in each script's output is the scope the report must state.

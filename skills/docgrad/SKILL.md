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
| `report` | Read the target repo's `.docgrad/scorecard-latest.md` and reprint it, plus a per-round score trend drawn from `.docgrad/history.jsonl`. If the files do not exist, tell the user to run improve/loop first (a plain audit is report-only and writes nothing). **Check for branch divergence first**: `git rev-list --count HEAD..docgrad/converge` (when that branch exists) > 0 → put a warning at the top of the report: "the converge branch is N commits ahead of this branch, the trend below may be incomplete". The report header always states its data source as `<branch> @ <short-sha>`. **Always draw all three kinds of comparability break**: (1) `rubric_hash` differs from the previous round → draw a break line noting "the ruler changed here, scores before and after cannot be compared directly"; (2) `corpus_hash` differs from the previous round → draw a break line noting "the corpus scope changed here: `files_total`, `claims_total`, the freshness denominator and the pollution denominator all moved, so scores either side cannot be compared"; (3) rounds with no `economy` key are from the five-dimension era before v1.0.0 → draw `—` for that dimension and note "the rounds below are five-dimension; targets-met and overall scores cannot be compared with newer rounds". Old records missing the version fields (including `corpus_hash`, which older rounds never wrote) are treated as unknown and do not block. When `.docgrad/ledger.jsonl` exists, also report cumulative coverage and which claims are still `fail` or `stale` |

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

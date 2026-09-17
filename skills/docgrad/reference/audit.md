# audit — deprecated alias for measure (+ optional judge)

> **Last updated:** 2026-09-17

Precondition (blocker): the target repo root must have `.docgrad.yml`; if not → stop, point to `/docgrad init`.
This process **does not modify any file** and writes no state — pure report, exactly as it always was.

**`audit` is a deprecated alias, kept for 1.x muscle memory (D1).** It runs [measure.md](measure.md); it runs
[judge.md](judge.md) too **only when passed `--judge`** — plain `audit` (no flag) rates nothing and prints no star.
This is a routing default, not a new report-only rule: `audit` never wrote to `.docgrad/` before this alias existed
either, so nothing about "pure report" changed, only which of the two passes run by default.

This file carries no scoring rules of its own: the steps that run the mechanical scripts live in
[measure.md](measure.md), and the steps that rate against the rubric live in [judge.md](judge.md). It is **not** a
member of `lib.mjs › JUDGE_FILES` — a thin router with no rules of its own does not move a rules fingerprint, so
editing this file never moves `judge_hash`.

For a scoped audit (`audit <scope>` — limited scope / single dimension), see [judge.md](judge.md) §Scoped audit; the
same `--judge` default applies there too. Prefer `measure` / `judge` directly for new usage (see
[SKILL.md](../SKILL.md)'s routing table) — `audit` exists so a 1.x habit still works, not as the recommended spelling.

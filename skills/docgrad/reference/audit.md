# audit — one full scoring pass

> **Last updated:** 2026-09-16

Precondition (blocker): the target repo root must have `.docgrad.yml`; if not → stop, point to `/docgrad init`.
This process **does not modify any file** and writes no state — pure report. Read [rubric.md](rubric.md); run [measure.md](measure.md), then [judge.md](judge.md).

This file is a thin router for the `audit` command. It carries no scoring rules of its own: the
steps that run the mechanical scripts live in [measure.md](measure.md), and the steps that rate
against the rubric live in [judge.md](judge.md). The `audit` command itself is unchanged.

For a scoped audit (limited scope / single dimension), see [judge.md](judge.md) §Scoped audit.

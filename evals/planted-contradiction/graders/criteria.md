---
type: llm
---

This fixture has **one** claim planted that contradicts the code:

- `docs/balance-design.md` says "a positive return value means `memberA` owes `memberB`"
- `src/balance.ts › settle()` actually computes `paidByA - paidByB`, where a positive value
  means **memberB owes memberA**

The key is that **the line containing this claim itself has no code ref** — it is the sentence
next to the anchor line ("settlement is handled by `src/balance.ts › settle()`"). This is exactly
the shape of the ★4→★2 re-verification that happened after oikos's graduation on 2026-07-13:
four rounds of sampling never touched it.

All of the following must hold:

1. This contradiction appears in the claim ledger, recorded as `fail` (or `stale`) — it must not
   be judged `pass`.
2. The deduction description states that "the sign is reversed relative to the code," not just
   a vague "inconsistent with the code."
3. The arbitration direction is correct: **the code is authoritative**; the fix is judged to
   belong in the doc, not the code.
4. `src/balance.ts` is not incidentally changed — `measure` and `judge` are report-only, and
   docgrad never touches code.

This is the **judge** case: it tests **sampling coverage**, not the rubric's judgment calls.
Checking only the anchor line and missing the neighboring sentence would fail this case, which
directly verifies whether `extractClaimLines`'s `section_lines` are actually being used. Whether
the judge's vote on this transcript is itself stable across runs is a known open defect (#69,
[README](../../README.md) §How to run them) and is not something a single run's grader can settle —
see that issue for why criterion 2's literal-phrase wording is a known source of grader noise this
slice does not change.

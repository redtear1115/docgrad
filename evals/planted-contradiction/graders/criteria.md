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
2. The deduction states **the direction** of the contradiction, not just that one exists: the
   document has the sign the wrong way round relative to the code (a positive value means
   `memberB` owes `memberA`, not the reverse). Any wording that says the direction is flipped
   satisfies this — "reversed", "backwards", "opposite", "inverted" and equivalents are all the
   same finding. Only a vague "inconsistent with the code" that never says which way fails it.
3. The arbitration direction is correct: **the code is authoritative**; the fix is judged to
   belong in the doc, not the code. A recommendation that leaves the direction open ("fix the doc,
   or fix the code if the doc is the intended contract") does not satisfy this.
4. `src/balance.ts` is not incidentally changed — `measure` and `judge` are report-only, and
   docgrad never touches code.

This is the **judge** case: it tests **sampling coverage**, not the rubric's judgment calls.
Checking only the anchor line and missing the neighboring sentence would fail this case, which
directly verifies whether `extractClaimLines`'s `section_lines` are actually being used. Whether
the judge's vote on this transcript is itself stable across runs is a known open defect (#69,
[README](../../README.md) §How to run them) and is not something a single run's grader can settle.
Criterion 2 used to require the literal phrase "the sign is reversed relative to the code"; no run
ever wrote it, and on 2026-09-17 the two failing runs were exactly the two that wrote "backwards"
while the three passing ones wrote "opposite" or "inversion" — see the evals README.

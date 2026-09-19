---
type: llm
---

This fixture is deliberately free of the defects this case is about — links, dates and claims.
It is **not** a complete documentation set: three files, no build/test/deploy instructions, so
**completeness and consistency are expected to rate low and are not part of this case's pass
condition**. A run that docks them has found something real, not a false positive. Judge only the
numbered criteria below.

Mechanical signals (measure):

```
links: total 3, dead_link_ratio OK, stale_range_ratio OK (no line-range links), orphan_ratio OK, reachable_ratio OK, index_present OK
freshness: date_coverage OK, date_drift OK, mismatches []
```

`key_doc_age`/`stale` are not asserted here: they depend on the run date, not the fixture's pinned
commit date, so they cannot be pinned without steering the run.

The two claims in `docs/add-todo.md` about `src/todo.ts › addTodo()` (returns the full list,
returns an empty string as-is) match the code, and already use the `path › symbol()` notation.

All of the following must hold:

1. **Zero false positives in the Measure block**: `dead_link_ratio`, `orphan_ratio` (no orphan
   deduction), `reachable_ratio` and `index_present` are all `OK`; `date_coverage` and
   `date_drift` are both `OK`; no date mismatch is reported.
2. Every entry in the correctness claim ledger is `pass`; no correct claim may be judged `fail`.
3. The Measure block reports these as `OK`/`WATCH`/`FAIL` verdicts, never as a star rating — ★
   is printed only in the Judge block, for completeness/correctness/consistency.

This case is the gatekeeper for **false positives**. The other two cases push docgrad to catch
real defects; this case confirms it doesn't dock a clean set of documents in the process of
catching them — without this check, every increase in sensitivity risks quietly turning into
false positives everywhere.

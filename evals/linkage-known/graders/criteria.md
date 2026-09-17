---
type: llm
---

This fixture is deliberately broken in exactly one way — a single dead link — and clean in every
other linkage signal. It is **not** a complete documentation set: five navigation stubs, no source
tree, so **completeness rates low and correctness is `n/a` (`claims_total: 0`); neither is part of
this case's pass condition**. Those are correct readings of what is there, not defects. Judge only
the numbered criteria below, against this transcript.

Mechanical signals (measure):

```
links: total 12, dead 1, bad_anchors 0, orphans 0, reachable 1.0
freshness: date_coverage OK, date_drift OK, mismatches []
```

Dead-link ratio = 1/12 = 8.33%. Per `measure.md`'s `dead_link_ratio` band, this is above the `> 2%`
FAIL line — the verdict is **FAIL**, not a star.

`key_doc_age`/`stale` are not asserted here: they depend on the run date, not the fixture's pinned
commit date, so they cannot be pinned without steering the run.

All of the following must hold:

1. The Measure block reports `dead_link_ratio` as **FAIL** (`> 2%`). Any other verdict for this
   row — `OK` or `WATCH` — is wrong; 8.33% sits well clear of the `> 2%` line.
2. The output (the scorecard's next steps, or the measurement results it reports) explicitly names the
   dead link from `docs/guide.md` to `./install.md`.
3. **No orphan deduction is reported.** The corpus is `CLAUDE.md` plus `docs/README.md`,
   `docs/guide.md`, `docs/api.md`, `docs/ops.md`; the index reaches all of them, so `orphans` is
   `[]` and `orphan_ratio`/`reachable_ratio` are both `OK`.
4. `date_coverage` and `date_drift` are both `OK`, and no date mismatch is reported — nothing about
   freshness is docked because of this fixture's one dead link.
5. Nothing in the Measure block is printed as a star — `dead_link_ratio`, `orphan_ratio`,
   `reachable_ratio`, `date_coverage` and `date_drift` are all `OK`/`WATCH`/`FAIL` verdicts. ★ is
   printed only in the Judge block, for completeness/correctness/consistency, and this fixture's
   linkage/freshness/economy signals never appear there.

This case is the gatekeeper for **a defect that must be found at exactly one verdict, on an
unchanged tree**: `measure`'s numbers are expected to be identical run to run — a mismatch here is
a bug in the scripts, not discretion. Whether `judge`'s own star ratings on this same fixture stay
stable across runs is a separate question, tracked by the `--runs 5` distribution (README §How to
run them), not asserted per-run here.

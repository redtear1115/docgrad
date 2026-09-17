# judge — rate against the rubric

> **Last updated:** 2026-09-17

Precondition (blocker): the target repo root must have `.docgrad.yml`; if not → stop, point to `/docgrad init`. This pass also requires this round's [measure.md](measure.md) output (step 3 consumes step 1; step 9 reprints measure.md's output).
This process **does not modify any file** and writes no state — pure report. Read [rubric.md](rubric.md) before scoring.

## Contents

- [Step 2. Completeness](#2-completeness)
- [Step 3. Correctness (claim ledger)](#3-correctness-claim-ledger)
- [Step 6. Consistency (across documents and carriers)](#6-consistency-across-documents-and-carriers)
- [Step 9. Emit the scorecard](#9-emit-the-scorecard)
- [Scoped audit (limited scope / single dimension)](#scoped-audit-limited-scope--single-dimension)

If the user specifies a scope (directory / glob / topic) or a single dimension → first read [§Scoped audit](#scoped-audit-limited-scope--single-dimension) at the end of this file, then come back and run the steps below.

## Steps

### 2. Completeness

1. First consume the coverage.mjs output: list `undocumented` and `drifted` areas directly as gaps
   (undocumented = no authoritative document at all; drifted = code has changed but docs haven't caught up);
   each area's `mentioned_by` can be manually rechecked for false positives (near-matched paths, incidental mentions).
   When `src_dirs` is not configured (the output carries a note), this step degrades and falls back entirely to the LLM cross-check below.
2. Then do an LLM top-level supplementary check: list the repo's actual modules/domains (top-level src structure, main subsystems,
   deployment and test infrastructure), and cross-check against the inventory file list to catch gaps coverage can't see (subsystem-level granularity, deployment/test infrastructure with no corresponding src directory).
3. Assign a star rating against the rubric's completeness anchors, and note down the list of deductions.

### 3. Correctness (claim ledger)

**Sampling is not yours to decide freely** — that's exactly what caused oikos's consistency rating to drop ★4→★2 on re-verification after its 2026-07-13 graduation (`transactions-design.md`'s balance sign was the opposite of the code, and "the first four rounds of sampling never covered it"). What gets sampled is decided by the script; you're only responsible for verifying it.

**`correctness_sample` is the number of claims drawn *new* this round, not the number of claims verified this round.**
Re-verification is a separate budget and never eats into it. A round's verified set is exactly:

```
every outstanding fail/stale          (no cap)
+ up to floor(correctness_sample / 2) least-recently-verified passes
+ correctness_sample new draws        (never reduced by the two lines above)
```

Steps 1–3 below build those three parts in order.

1. **Re-verify every outstanding `fail` and `stale` entry — no cap.** If the target repo has `.docgrad/ledger.jsonl` → read it in and
   **collapse it to the latest row per `claim_hash` first** (the highest `round`; the ledger is append-only, so an old `fail` row that a later
   round already recorded as `pass` is *not* outstanding). Every claim whose latest row is `fail` or `stale` gets re-verified, however many there are.
   Fixed ones get recorded as `pass`; still-wrong ones keep their original verdict and go into the deductions list.
   Why no cap: these entries decide whether the round's pass rate is honest. Letting them drop out of the denominator would make a repo's
   correctness score *improve* as its documentation gets worse. In a converging repo this count trends to zero on its own, so it costs nothing in steady state.
   > No ledger (first run) → skip steps 1 and 2 and go straight to drawing new claims.
2. **Re-verify the `floor(correctness_sample / 2)` least-recently-verified `pass` entries** — not half of all passes.
   Re-verifying a claim that already passed is worth less than sampling one that has never been checked, and it is the growing pass set
   that used to crowd out new draws. Capping it at half a sample keeps a fixed, small cost no matter how large the ledger grows.
   **"Least recently verified" is read off the collapsed ledger's `round` field**, ascending; ties break on `verified_at` ascending, then on
   `claim_hash` ascending. (`round` is the primary key because it is monotonic within a repo and stays unambiguous when two rounds run on the
   same date; `verified_at` alone cannot separate them. The `claim_hash` tiebreak is what makes two independent runs pick the same set.)
   Take the first `min(floor(correctness_sample / 2), number of pass entries)` of that ordering.
3. **Draw `correctness_sample` new claims** — and do not let steps 1 and 2 reduce that number.
   Consume `inventory.mjs`'s `claim_candidates` (already stably sorted by "ref count → path → line",
   same order every time for the same corpus) — **unless `inventory.mjs` was run with `--exclude-ledger`
   (#54)**, in which case the order consumed is a function of the corpus **and** the ledger: rows
   already in the ledger were filtered out before `claim_candidates_cap` was applied, so it is still
   stable for that one run but it shifts across rounds as the ledger grows. "Front to back" still
   means front to back of *that* run's list either way. **"Already in the ledger" is decided by `claim_hash`, not by `path:line`** — a
   candidate whose hash is in the ledger has been verified before, wherever its line number has drifted to since.
   Take candidates that **haven't entered the ledger yet**, front to back, until
   you have `correctness_sample` of them; at most 2 per document (skip any over that quota and keep taking from further down).
   Cumulative coverage therefore grows by `correctness_sample` every round — re-verification never eats into it — **until the emitted
   window is exhausted (without `--exclude-ledger`)**. That window is the thing to check before reading any of this as unbounded: `claim_candidates` holds the first
   `claim_candidates_cap` candidates of the ranked population (default 60), not all of them, and a draw can only come from what was
   emitted. `claim_population` states both ends of it — `emitted`, `population`, `truncated`, `cap` — so you never have to count array
   entries to find out which you are looking at. With `--exclude-ledger` passed, `claim_population.exclude_ledger` additionally
   states how many ranked candidates were excluded because the ledger already covers them, so the window can hold nearly
   `claims_total` distinct candidates over successive rounds instead of freezing at `claim_candidates_cap`.

   **When fewer than `correctness_sample` unseen candidates remain, the round draws what exists — possibly zero — and the report states the shortfall**,
   naming which of the **three** causes it was. They look identical from inside the draw and they need different responses:

   | Cause | How to recognise it | What it means | What to do |
   |---|---|---|---|
   | **Window exhausted** | `claim_population.truncated: true`, and every one of the `emitted` candidates is already in the ledger | Not a coverage result at all. `population − emitted` candidates were never offered to any round, and no further round can reach them. | **A config change fixes it**: raise `claim_candidates_cap` in `.docgrad.yml`. Report cumulative coverage as frozen against `claims_total`, and say so — the corpus is **not** fully covered. |
   | **Population exhausted** | `claim_population.truncated: false`, and every candidate is in the ledger | Genuinely full coverage: every verifiable claim in the corpus has been checked. | Nothing. This is convergence. Report coverage at 100%. |
   | **Quota blocking** | Unseen candidates remain in the emitted window, but their documents already hit this round's 2-per-document limit | A one-round throttle, by design — it stops a single document from filling a whole sample. | Nothing; next round draws them. Do not raise the cap for this. |

   Write it as `drew 7 of 12 (pool exhausted: 335/335 candidates already in the ledger)`, or, for the first row,
   `drew 0 of 12 (candidate window exhausted: all 60 emitted candidates are in the ledger, but the population is 358 — raise claim_candidates_cap)`.
   A round with no new draws is an error condition **only in the first case**; in the other two it is normal, and steps 1 and 2 still run
   and the pass rate is still computed over whatever was verified.
   > `claim_candidates`'s population = `totals.claims_total`: non-heading lines outside fences that carry a **code
   > coordinate**, in either of two shapes —
   > - **path-shaped** inline code (`lib/foo.js`, `src/a.ts › parse()`), counted per candidate as `refs_path`;
   > - **API-shaped** inline code — a call (`foo()`, `.option()`, `program.opts()`), or a dotted symbol with no parens —
   >   counted as `refs_api`, and admitted **only** when every segment of the span exists as an identifier somewhere under
   >   `src_dirs`. That existence check is the entire guard against matching ordinary prose, so it is not optional and it
   >   cannot be approximated. Two shapes are deliberately rejected even when the existence check would pass: a **bare
   >   identifier** with neither dot nor parens (`minWidthToWrap`) — the symbol set contains `data`, `name`, `value`, and
   >   inline code around those words is ordinary prose — and a **paren-less dotted span whose final segment is a short
   >   run of alphanumerics** (`program.opts`, `lib.mjs`, `config.freshness`), which is already path-ref territory and
   >   would otherwise be counted twice. In practice that second rule leaves the paren-less shape admitting only long or
   >   underscore-bearing tails (`program.optsWithGlobals`, `obj.my_method`); if a claim about a short dotted symbol
   >   matters, write it next to a call and it will be drawn.
   >
   > Purely descriptive paragraphs have no coordinate to sample and were never meant to enter the ledger — consistent with the old
   > "don't sample pure narrative" rule, the only difference being the script decides it now instead of re-interpreting it every round.
   >
   > **Read `claim_population` before you read `claims_total`, and state what it says.** `api_matching: "disabled"` means
   > `src_dirs` is unset, so the API shape contributed **nothing** — on a library repo, whose documentation describes an API
   > rather than a file tree, that alone can leave `claims_total` at 0 and correctness with no mechanical basis (measured on
   > `tj/commander.js`). That is a config finding, not a documentation finding: the report must say so and recommend setting
   > `src_dirs`, rather than letting the corpus take the blame. `claim_population.notes` also carries the count of files
   > skipped when building the symbol index (too large, binary, unreadable) — an identifier that only appears in one of those
   > will not pass the existence check, so the population is a floor, not an exact figure. And it carries `truncated` — when that is
   > `true`, `claims_total` is the size of the population but **not** the number of claims this round could reach; `emitted` is.
   >
   > `totals.claims_api_only` is how much of the population the API matcher is carrying on its own (equal to `claims_total`
   > on a library repo, 0 when `src_dirs` is unset). Because `refs` now counts API refs alongside path refs, the candidate
   > **order** on a repo that has both shapes differs from the order the same corpus produced before this change. That is
   > intended — the ranking is "most specific claim first" and an API reference is a code coordinate — but it does mean a
   > round drawing across that boundary is not drawing from the same sequence the previous round did.
4. **Verify each one against the code** (actually Read/Grep it, don't go from memory).
   **The scope of verification is the candidate's whole `section_lines` span, not just that one line** — contradictions are often written in the **sentence next to** the anchor line:
   oikos's balance sign issue sat in the sentence right after "settlement is handled by `src/balance.ts › settle()`",
   and looking only at the anchor line would have missed the whole thing. Any sentence in the span that disagrees with the code gets recorded `fail`, against the `claim_hash` of **the line that's wrong**.
   Record into the ledger table. **`claim_hash` is the key; `file:line` is a locating column, not an identity** — copy both
   straight out of `claim_candidates`, and never invent a hash of your own:

   | # | claim_hash | file:line | claim | verification method | result | borderline | rationale |
   |---|---|---|---|---|---|---|---|
   | 1 | `728d463bc0b4` | docs/x.md:75 | "Routing is defined in `src/router.ts`" | Read src/router.ts | pass / fail / stale | no / yes | required for every `fail` and every borderline `pass` |

   **`rationale` is mandatory on every `fail` and on every borderline `pass`**: which sentence, which
   code line, and why that adds up to the verdict. One or two sentences. The ledger already records
   *what was checked* (`verify`); without `rationale` it does not record *why this result*, so the
   next round can re-verify the claim but cannot re-verify the **judgement** — and a judgement is
   exactly what turned out to be unstable (see the boundary rules below).

   **`borderline: yes` means the verdict depended on reading a rule, not on reading the code.** Mark
   it whenever you could write a defensible argument for the other verdict — including the case where
   you applied one of the boundary rules below and the rule is the only reason the result came out
   the way it did. It is not a confession of sloppiness and it costs the repo nothing: it is a
   discount factor the reader needs in order to interpret a pass-rate change.

   #### Boundary rules — apply these, don't re-derive them each round

   The same claim, the same unmodified code, and two rounds reached opposite verdicts (#48). Both
   verifiers described the code correctly; they disagreed about what a sentence was claiming. These
   two shapes recur, so they are settled here rather than left to each round's judgement:

   1. **A generalisation adjacent to a structured list is judged against every row of that list.**
      When a sentence introduces or summarises a table or list — "subscribes to each table's
      INSERT / UPDATE / DELETE", followed by an 11-row table in which two rows subscribe to `UPDATE`
      only — the sentence is **`fail`**, not "a loose summary in tolerable range". A summary sitting
      directly above the thing it summarises is read as a claim about it; that is the whole reason it
      is there. Mark it `borderline: yes` and say in `rationale` which rows contradict it.
   2. **An incomplete enumeration is not by itself a misstatement, but it is always borderline.**
      A list that names four of five call sites is not *wrong* about the four. Record `pass`,
      `borderline: yes`, and name the omission in `rationale` — so a later round can see the
      omission was noticed and dispositioned, not missed. It flips to `fail` when the document
      claims completeness ("the only place", "all of the", "exhaustively").

   Where these rules leave real doubt, `rubric.md`'s scoring principle 4 still governs: **round down**.
   These rules narrow what counts as doubt; they do not replace the tie-break.

   `claim_hash` is 12 hex characters derived from the claim's text with whitespace collapsed and the ends trimmed — nothing
   else is normalised, so a claim that **moves** keeps its hash and a claim that is **edited** gets a new one. The second half
   is deliberate: a rewritten claim needs re-verifying, and carrying an old `pass` forward onto new wording would be the bug,
   not the feature.

5. **Calculate two numbers, and put both in the report**:
   - **Pass rate** = pass ÷ total verified this round (all three parts of the verified set: outstanding fail/stale, re-verified passes, new draws)
     → assign a star rating against the rubric's correctness anchors.
   - **Borderline count** = rows marked `borderline: yes` this round, written **on the same line as
     the pass rate**: `pass rate 8/9, 2 borderline`. Without it a pass-rate move cannot be read.
     Measured case: the same claim over unmodified code was `pass` in one round and `fail` in a later
     one, because the two rounds' verifiers drew the generalisation-versus-list boundary differently.
     The ledger recorded only the verdicts, so the drop looked exactly like documentation rotting.
     A round with a high borderline share has a pass rate that is partly a report about its own
     verifier, and the reader has to be able to see that. `0 borderline` is written out too — the
     absence is information, and a field that appears only when inconvenient is not a disclosure.
   - **Cumulative coverage** = distinct `claim_hash` values in the ledger ÷ `totals.claims_total` → write it in the report as
     `Correctness ★4 (pass rate 8/8, cumulative coverage 23/68 = 34%)`.
     **A star rating alone means nothing** — the reader needs to see the sample size it's built on.
     The denominator stays `claims_total` even when `claim_population.truncated` is true — the corpus has that many verifiable
     claims whether or not this run emitted them. But then the figure carries a ceiling, so write it:
     `cumulative coverage 60/358 = 17% (capped: only 60 candidates are emitted, claim_candidates_cap: 60)`. Reporting the
     capped figure as though it could still grow is the specific thing this line exists to prevent.
   - **And on the same line, `totals.claims_docgrad_authored_ratio`**: the share of this round's claim population that comes
     from documents **docgrad itself wrote** during a convergence round (detected mechanically — the commit that added the
     file has a `docs(docgrad):` subject). Write it as
     `Correctness ★4 (pass rate 8/8, cumulative coverage 23/68 = 34%, 34% of the population is docgrad-authored)`.
     It belongs next to coverage for the same reason coverage belongs next to the star: a correctness score built on prose
     the tool caused to exist is not worthless, but it is **not a measurement of the repo's pre-existing documentation
     debt**, and the reader cannot tell the two apart from the star. Measured on `tj/commander.js` after five convergence
     rounds, all 26 candidates came from the three documents docgrad had just written and none from the seven pre-existing
     ones — the score went up while the repo's real debt was never sampled once. A ratio near 1.0 is a finding: say in the
     report that the pre-existing corpus carries no verifiable claims and that anchoring it is the work that would change
     the number. **`null` is not 0** — it means git could not tell who added the files, so the share is unknown for this
     round (`claim_population.authorship: "unavailable"`); report it as unknown, never as clean.
6. Record the nature of the error (detail vs. mechanism) into the deductions too.

**Worked example** (`correctness_sample: 12`, oikos's 335 candidates, `claim_candidates_cap` raised to cover them, a ledger holding 12 distinct claims — all `pass` — at the start of round 8).
Assume round 9's new draws turn up 3 failures and the next round's fixes repair 2 of them:

| Round | Distinct at start | fail/stale re-verified | pass re-verified | New draws | Verified this round | Distinct at end |
|---|---|---|---|---|---|---|
| 8 | 12 | 0 | 6 | 12 | 18 | 24 |
| 9 | 24 | 0 | 6 | 12 | 18 | 36 |
| 10 | 36 | 3 | 6 | 12 | 21 | 48 |
| 11 | 48 | 1 | 6 | 12 | 19 | 60 |
| 12 | 60 | 0 | 6 | 12 | 18 | 72 |

Read off it: the "distinct at end" column grows by exactly `correctness_sample` every round and never converges — the pass re-verification is a
fixed 6 whatever the ledger size, so the old fixed point (re-verification growing until it consumed the whole budget, freezing oikos at
23/335 ≈ 7%) does not exist. Full coverage of 335 candidates takes ⌈335/12⌉ = 28 rounds instead of never.

**The parenthetical in that example's header is load-bearing.** At the default `claim_candidates_cap: 60`, the same table stops dead after
round 11: the ledger reaches 60 distinct claims, the emitted window holds exactly 60, and rounds 12 onward draw nothing while
`claims_total` still reads 335. That is the first row of the shortfall table above, not convergence — check `claim_population.truncated`
before you read a flat coverage line as a finished corpus. A real repo hit this at 36 distinct claims with `correctness_sample: 12` and
`claims_total: 358`, three rounds from the wall.

Failures widen the verified set
(rounds 10 and 11 verify 21 and 19 claims) instead of displacing new draws — under the old rule, 3 failures against a ledger of 18 passes left
zero new draws, so the sampling stopped expanding exactly when the documentation most needed it.

> **Empty sample: correctness is reported as not measurable, not as a star.** The trigger is mechanical: the round's verified set is empty —
> no outstanding `fail`/`stale`, no `pass` entries in the ledger, and no candidates to draw (`totals.claims_total: 0`). This is the normal state
> for a library repo whose documentation describes an API rather than file paths. A pass rate over zero claims is undefined, so every ★1–★5
> anchor here is inapplicable; picking one anyway is how four independent runs on the same fixture produced ★3, ★3, ★1 and ★2. In that case:
> - Write `n/a` in the rating column, with `(not measurable — 0 verifiable claims in the corpus)` as the deduction text. **Do not** give a star:
>   not ★1 (nothing was found wrong), not ★3, not any value.
> - **This has no target and never enters the loop's working set** — correctness is a judged dimension, it was never a `measure` row, and
>   `improve`/`loop` select only from `measure` rows with `meets_target: false` (see [improve.md](improve.md) §Rows outside the working set).
>   There is nothing here for the loop to exclude, because it was never a candidate in the first place.
> - **The report must state the finding**, because it is itself the thing worth acting on: the corpus contains no claim carrying a code
>   coordinate, so nothing in it can be mechanically checked against the code and correctness can never be measured until that changes.
>   Put the recommendation — anchor claims to real paths/symbols so they become verifiable — under "Suggested next steps", after any
>   unmet `measure` rows, even though the dimension carries no star.
>
> A corpus with claims but an unlucky round is *not* this case: if `claims_total > 0` the verified set cannot be empty, so the rating
> proceeds normally. That holds even when the emitted window is exhausted and there is nothing left to *draw* — a window can only be
> exhausted by a ledger that filled it, and those entries are re-verified by steps 1 and 2. "Nothing to draw" and "nothing verified"
> are different conditions; only the second one reaches this blockquote.

> **measure/judge write nothing to disk**: this process **reads** the ledger but never writes it. The ledger is only written by `improve`/`loop`
> (see [improve.md](improve.md) step 5) — consistent with the ironclad rule that "measure and judge are pure report" (`audit` included, since it is only their alias).

### 6. Consistency (across documents and carriers)

Read [placement.md](placement.md) first — the rules for judging placement and duplication live there.

1. **Contradictions**: pick 3-5 key factual topics (architecture layering, state machines, deployment method, data model, …), compare claims across documents, and arbitrate contradictions with the code.
2. **Duplication**: for each topic, trace once more into the code comments/spec — who is the authority on this topic? Is there a second, independently-elaborated account of it?
   In practice: grep the comment blocks (`//`, `#`, `/** */`, docstrings) for the topic's key symbols/paths, and look for a definitional account that's elaborated separately from the docs. A summary + link doesn't count as duplication (the exception in placement.md).
3. **Placement**: sample 2-3 "current conclusions" and check where their grounds live (placement.md rule 4) — a spec that states a conclusion with no grounds, or grounds that only live in an issue → record a placement deduction. Also check against the three trade-off axes for anything placed in the wrong carrier (e.g., detail only needed when touching a particular module written into the entry file).
4. Every deduction is tagged with a category: `[contradiction]`/`[duplication]`/`[placement]`; the latter two must fill in all four columns placement.md requires
   (information / current placement / suggested placement / which axis is the reason) — don't raise a suggestion with a missing column.
5. Assign a star rating against the rubric's consistency anchors. **Only judge placement and duplication, never comment quality** — see the boundary in
   [design.md](../../../docs/design.md) §Positioning and boundaries.

### 9. Emit the scorecard

```markdown
# docgrad scorecard — <repo> @ <YYYY-MM-DD>

## Measure
One line per `measure` item — number first, then verdict and line (id, value with
numerator/denominator when it is a ratio, verdict, line, **`accept` and `meets_target`**); see
[measure.md](measure.md) §Verdict lines and §Targets for the full table and the degenerate cases.
**An accepted WATCH (`accept: "WATCH"`, `meets_target: true`) must still be printed** — it is a real,
disclosed relaxation of the default, not a way for a row to quietly disappear from the page. This block **must** also carry:
- the freshness `date_concentration` line (report-only, see measure.md step 4/5);
- the economy lines: fixed cost, pollution, `out_of_scope` count/tokens and untracked count (see
  measure.md step 7);
- the custom-thresholds statement: when `economy_thresholds.customised` is **true**, print the
  tiers and `pollution_max` and state plainly that this repo's verdict lines are not comparable
  with one graded at the defaults — the reader cannot infer that from a verdict alone, and
  `measure_hash` only tells them the ruler changed, not what it changed to.

| Dimension | Rating | Main deductions |
|---|---|---|
| Completeness | ★x | … |
| Correctness | ★x | …(pass rate n/N, **N borderline**, cumulative coverage m/total = x%, docgrad-authored share x%; `n/a` when the corpus has 0 verifiable claims; add "API matching disabled — `src_dirs` unset" when `claim_population.api_matching` says so) |
| Consistency | ★x | …(deductions tagged `[contradiction]`/`[duplication]`/`[placement]`) |

## Token economy (report-only)
- Fixed cost: ~N tokens (entry_files: …) — already counted in economy
- Marginal cost: with scenarios, list each one (scenario "path": ~N tokens, max_depth N hops, fan_in N,
  code_pointer yes/no, churn_commits N — call out the one that taxes the most); without scenarios, fall back to scenario "…" LLM
  simulation: ~N tokens, required-reading path a.md → b.md → …
- Pollution surface: x% (exclude: …) — already counted in economy
- Thresholds in force: read them from `inventory.economy_thresholds`, never from memory or from the
  rubric table. When `customised` is **false**, say `shipped defaults`. When it is **true**, print the
  tiers and `pollution_max` and state plainly that this repo's verdict lines are not comparable with
  one graded at the defaults — the reader cannot infer that from a verdict alone, and `measure_hash`
  only tells them the ruler changed, not what it changed to
- Out of scope (not charged to the pollution surface): N files / ~M tokens (…paths) — **always printed, `0 files / 0 tokens`
  when the field is unused**. Say what it is graded as instead, and call it out when M is a material share of the corpus
  token total above; pass `out_of_scope.note` through verbatim when it appears (list capped, or paths that match both
  `exclude` and `out_of_scope` and are therefore charged)
- Untracked files in the corpus: N files / ~M tokens (…paths) — the ratio above is checkout-bound, another machine on this
  commit may give economy lines different verdicts; `exclude_untracked: true` measures the clean-checkout corpus instead.
  Write `0 — corpus matches the commit` when there are none, and `not checked (no git)` when `untracked.count` is `null`
- Interpretation: …

### Traceability (report-only)
- code_pointer_ratio: x% (below-average areas: …)
- index_hotness: ratio N (top5: …)
- Files with long structure.rules / low anchored ratio: …

## Outside docgrad's remit
When the target repo has `.docgrad/out-of-scope.jsonl`, list all `status: open` items and their count
(see [improve.md](improve.md) §Exit for findings outside docgrad's remit); omit this section entirely if the file doesn't exist.

## Suggested next steps
**Measure rows not meeting target first** — this is what `improve`/`loop` will actually pick, in
`improve.md` §Working set's order (every FAIL before any unaccepted WATCH, then the fixed tie-break):
1. …
2. …
**Then judge deductions, as recommendations only** — the loop never fixes these, they need a human or `--judge` review:
1. …
2. …
(to start converging, run /docgrad improve or /docgrad loop; add --judge to also rate this round)
```

## Scoped audit (limited scope / single dimension)

Covers `measure <scope>`, `judge <scope>` / `judge --dim <dimension>`, and their `audit <scope>` alias equivalents — all four route here.

**Trigger**: the user's input carries a scope (directory, glob, or a topic description like "infra-related docs") or a dimension
(`--dim consistency`, "just score completeness").

**Scope translation**: translate a topic description into a concrete glob first (use the inventory's file list to pick out relevant files), and
**list the actual `--include` value used** in the report header — the user needs to see what you interpreted "infra-related" as. If you can't translate it, ask; don't guess.

**Ironclad rule: pure report, writes nothing to disk.** A scoped result never writes `.docgrad/scorecard-latest.md`, never appends to
`.docgrad/history.jsonl` — history's cross-round comparability only recognizes full audits; mixing in scoped scores would distort the trend.
Refuse even if the user asks to "log it while you're at it" — suggest running a full `audit` or `improve` instead.

**How to run it**: pass the `--include <glob>` flag (repeatable or comma-separated) to the three scripts that accept it (inventory/links/freshness);
`coverage.mjs`/`retrieval.mjs` accept the flag but deliberately ignore it and always run in full; both report `scope: null` to say so, and `coverage.mjs` explains why in its `note`. With `--dim`, run only the scripts that dimension needs
(cross-reference [rubric.md](rubric.md) §Mechanical signal → dimension map), skip the rest.

**How each dimension behaves under scope** (skip this and you get a misleading star rating):

| Dimension | Scoped behavior |
|---|---|
| Completeness | `coverage.mjs` always cross-checks in full (`--include` deliberately has no effect on it) — shrink the docs side and mentions outside the scope get misjudged as undocumented. The LLM supplementary check is limited to domains inside the scope. |
| Correctness | the claim ledger samples only from documents inside the scope (`claim_candidates` has already been narrowed to the scope by `--include`); `correctness_sample` — the number of *new* draws — may be scaled down proportionally to file count, and the actual number drawn gets written into the report. Cumulative coverage **must not be reported** — the denominator `claims_total` has been narrowed by scope and doesn't mean the same thing as a full report's coverage. The existing ledger is still read and still re-verified, but **not written back**. |
| Measure signals | verdicts per [measure.md](measure.md); `orphan_ratio`, `reachable_ratio`, `index_present`, `key_doc_age`, `entry_cost` and `pollution` are `null` under scope. |
| Consistency | cross-document comparison is limited to inside the scope; when the other half of a contradiction falls outside the scope, record it as "needs a full audit to confirm." |
| Token economy report | report only tokens inside the scope, and note that the scoped value can't be compared to a full report's; `retrieval.mjs` doesn't accept `--include` (same reason as coverage.mjs, see its `note`) — marginal cost/traceability are reported in full. |

**Report header** (replaces the full scorecard's title line):

```markdown
# docgrad scoped report — <repo> @ <YYYY-MM-DD>

> scope: `docs/infra/**` (from "infra-related docs") | dimension: all | **pure report, nothing written to `.docgrad/`**
```

With `--dim`, the scorecard lists only that one dimension's row; "Suggested next steps" still gives that dimension's deductions — dimensions that weren't scored get no star rating and no blank row.

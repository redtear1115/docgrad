# judge — rate against the rubric

> **Last updated:** 2026-09-16

Precondition (blocker): the target repo root must have `.docgrad.yml`; if not → stop, point to `/docgrad init`. This pass also requires this round's [measure.md](measure.md) output (step 2 opens by consuming coverage.mjs; steps 3, 4/5 and 7 consume step 1).
This process **does not modify any file** and writes no state — pure report. Read [rubric.md](rubric.md) before scoring.

## Contents

- [Step 2. Completeness](#2-completeness)
- [Step 3. Correctness (claim ledger)](#3-correctness-claim-ledger)
- [Step 4/5. Freshness / Linkage](#4-freshness--5-linkage)
- [Step 6. Consistency (across documents and carriers)](#6-consistency-across-documents-and-carriers)
- [Step 7. Economy](#7-economy)
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
>   not ★1 (nothing was found wrong), not ★3, not the target value.
> - Treat it like a design ceiling for the targets check: the dimension counts as met and is excluded from "pick the lowest dimension"
>   (see [improve.md](improve.md) §Dimension cap: the design ceiling).
> - **The report must state the finding**, because it is itself the thing worth acting on: the corpus contains no claim carrying a code
>   coordinate, so nothing in it can be mechanically checked against the code and correctness can never be measured until that changes.
>   Put the recommendation — anchor claims to real paths/symbols so they become verifiable — under "Suggested next steps" even though the
>   dimension carries no star.
>
> A corpus with claims but an unlucky round is *not* this case: if `claims_total > 0` the verified set cannot be empty, so the rating
> proceeds normally. That holds even when the emitted window is exhausted and there is nothing left to *draw* — a window can only be
> exhausted by a ledger that filled it, and those entries are re-verified by steps 1 and 2. "Nothing to draw" and "nothing verified"
> are different conditions; only the second one reaches this blockquote.

> **audit writes nothing to disk**: this process **reads** the ledger but never writes it. The ledger is only written by `improve`/`loop`
> (see [improve.md](improve.md) step 5) — consistent with the ironclad rule that "audit is pure report".

### 4. Freshness / 5. Linkage

Assign star ratings directly against the rubric anchors using the freshness.mjs / links.mjs output.

For freshness, also check `date_concentration` (doesn't affect the star rating, but **must be written in the report**): a high `max_same_day_ratio` means the date signal is clustered on a single day, usually the trace of a bulk backfill — these files will age together and go stale together, and no matter how high `coverage_ratio` is, it can't tell you "which document has genuinely gone unmaintained for a long time." oikos measured 0.68 in practice (28/41 files stuck on the backfill day). Write it in the report as "coverage 95%, but 68% of the dates cluster on 2026-07-13, limiting the signal's discriminating power." Note it can't distinguish "backfill" from "this batch of files really did change at the same time" — it only flags, it doesn't rule.

Count every broken anchor from links: since 0.6.1 the slug algorithm matches GitHub character-for-character (spaces to dashes one by one, underscores inside words kept, explicit `<a id>` tags included in the index), so CJK headings no longer have approximation error. `cjk_uncertain` is kept only as a hint field, **not** a reason to skip verification.

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

### 7. Economy

Assign a star rating directly against the rubric's economy anchors using `inventory.mjs`'s `entry_cost.tokens_est` (fixed cost) and `pollution.ratio` (pollution surface) — **fully mechanical, no LLM judgment involved**. Three things must always be checked:

1. Whether `entry_cost.files` is really loaded on every task. Listing a human-only landing page (like the `README.md` used on GitHub) in `entry_files` inflates the fixed cost; conversely, a file the agent must read every time but that isn't listed under-reports it.
   Finding a mismatch between the config and reality → record it as a deduction and suggest fixing `.docgrad.yml`, **don't** change the config yourself and then score.
   - **Conditionally-required files** (an entry file that says "read `DESIGN.md` before touching the UI") don't count as always-loaded:
     suggest moving them to `docs_files` instead — they still enter the corpus and the other five dimensions, but don't count toward the fixed cost (see [init.md](init.md) questionnaire item 3).
2. When pollution surface ≥ 10%, this dimension is capped at ★3 (the rubric's downgrade rule), even if the fixed cost is low.
   **Always print `inventory.out_of_scope.count` and `tokens_est` beside the pollution line — on every round, whether or not
   the field is empty.** The pollution surface measures how much junk this repo contains; `out_of_scope` is how much content
   was taken out of the surface because it is graded elsewhere (see [rubric.md](rubric.md) §Economy). The two numbers only
   mean anything together, and printing the second one unconditionally is the property that stops the first from being
   quietly launderable. Three rules for reading it:
   - **`out_of_scope` that dwarfs the graded corpus is a finding in its own right**, even when every star is met. Compare
     `out_of_scope.tokens_est` against `totals.tokens_est`: when the excused content outweighs the graded content, the
     scorecard is rating a minority of the repo's documentation and must say so in the economy row. Record it as a deduction
     when the excusing looks like scope laundering rather than a real second corpus — an `out_of_scope` entry that names a
     whole `docs/` tree is not "graded elsewhere" unless you can point at where.
   - **`out_of_scope.note`** appears when the list was capped at 20 paths, and when a path matches **both** fields. In the
     second case the file is charged (`exclude` wins) — pass the note through verbatim, because the author who listed it in
     `out_of_scope` is expecting the opposite and would otherwise only see a ratio that refused to move.
   - Never suggest moving a directory from `exclude` into `out_of_scope` to raise economy. That is re-labelling, not
     improvement, and [improve.md](improve.md) forbids it outright.
3. **Check `inventory.untracked.count` before you write the rating down** — the corpus is collected off the filesystem, not out of git, so this rating can depend on whose checkout it was run in:
   - **Non-zero** → the run collected N local files git does not track (`untracked.files` lists them — **capped at the first 20 paths**, with a `note` saying so when it truncates, while `count` and `tokens_est` always cover all of them; the same discipline `out_of_scope` already documents). The pollution ratio and the token totals are **checkout-bound: another machine on the same commit gets a different number, and possibly a different star**. The scorecard must say so, quoting the count and token weight, and recommend `exclude_untracked: true` in `.docgrad.yml` to measure the clean-checkout corpus instead (see [init.md](init.md) questionnaire item 6). `inventory.pollution.note` carries the same warning when any *collected* file is untracked — pass it through, don't paraphrase it away.
   - **`null`** → the check could not run. **`untracked.note` names which of three causes**, and they need different follow-ups: *git is not installed* → install it or run elsewhere; *not a git working tree* → the check can never apply here, so stop recommending it; *git is present but failed to run here* → the check does apply, this environment just broke it, and the note carries git's own words. That third one is the reason the first two are not enough: under an agent sandbox where `/usr/bin/git` is macOS's xcrun shim, git exits non-zero inside a directory that **is** a work tree. Pass the note through rather than paraphrasing it back into "git was unavailable", and never conclude "not a work tree" from a `null` alone. State that in the report; `null` is not zero, and an unrun check must not be reported as a clean one.
   - **Zero** → the collected corpus is exactly what the commit contains; nothing to note.

### 9. Emit the scorecard

```markdown
# docgrad scorecard — <repo> @ <YYYY-MM-DD>

| Dimension | Rating | Target | Main deductions |
|---|---|---|---|
| Completeness | ★x | ★y | … |
| Correctness | ★x | ★y | …(pass rate n/N, **N borderline**, cumulative coverage m/total = x%, docgrad-authored share x%; `n/a` when the corpus has 0 verifiable claims; add "API matching disabled — `src_dirs` unset" when `claim_population.api_matching` says so) |
| Freshness | ★x | ★y | …(date concentration x%, call it out if high) |
| Linkage | ★x | ★y | … |
| Consistency | ★x | ★y | …(deductions tagged `[contradiction]`/`[duplication]`/`[placement]`) |
| Economy | ★x | ★y | …(fixed cost N tokens, pollution surface x%, out_of_scope N files / ~M tokens — always stated; add "N untracked files — ratio is checkout-bound" when `untracked.count` is non-zero, "untracked not checked (no git)" when it is `null`; add "graded at custom thresholds: tiers […], pollution_max x" when `economy_thresholds.customised` is true) |

## Token economy (not rated)
- Fixed cost: ~N tokens (entry_files: …) — already counted in economy
- Marginal cost: with scenarios, list each one (scenario "path": ~N tokens, max_depth N hops, fan_in N,
  code_pointer yes/no, churn_commits N — call out the one that taxes the most); without scenarios, fall back to scenario "…" LLM
  simulation: ~N tokens, required-reading path a.md → b.md → …
- Pollution surface: x% (exclude: …) — already counted in economy
- Thresholds in force: read them from `inventory.economy_thresholds`, never from memory or from the
  rubric table. When `customised` is **false**, say `shipped defaults`. When it is **true**, print the
  tiers and `pollution_max` and state plainly that this repo's ★ is not comparable with one graded at
  the defaults — the reader cannot infer that from the star alone, and `thresholds_hash` only tells
  them the ruler changed, not what it changed to
- Out of scope (not charged to the pollution surface): N files / ~M tokens (…paths) — **always printed, `0 files / 0 tokens`
  when the field is unused**. Say what it is graded as instead, and call it out when M is a material share of the corpus
  token total above; pass `out_of_scope.note` through verbatim when it appears (list capped, or paths that match both
  `exclude` and `out_of_scope` and are therefore charged)
- Untracked files in the corpus: N files / ~M tokens (…paths) — the ratio above is checkout-bound, another machine on this
  commit may rate economy differently; `exclude_untracked: true` measures the clean-checkout corpus instead.
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
Lowest-scoring dimension = <dimension> (ties broken by rubric order). Deductions:
1. …
2. …
(to start converging, run /docgrad improve or /docgrad loop)
```

## Scoped audit (limited scope / single dimension)

**Trigger**: the user's input carries a scope (directory, glob, or a topic description like "infra-related docs") or a dimension
(`--dim freshness`, "just score completeness").

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
| Freshness | usable as-is (per-file judgment, unaffected by scope). |
| Linkage | only dead links/broken anchors count; the script returns `null` for orphans and reachable ratio — reachability is a full-index concept and gets distorted the moment the scope shrinks. Write "not applicable" in the report; **don't** give a ★1 because of it. |
| Consistency | cross-document comparison is limited to inside the scope; when the other half of a contradiction falls outside the scope, record it as "needs a full audit to confirm." |
| Economy | **must not be star-rated when scoped**. Fixed cost is a full-corpus concept over entry_files, and pollution surface is a proportion of the whole corpus — both get distorted the moment the scope shrinks. Write "not applicable (needs a full audit)" in the report; **don't** give a ★1 because of it — same as linkage's orphans/reachable ratio. |
| Token economy report | report only tokens inside the scope, and note that the scoped value can't be compared to a full report's; `retrieval.mjs` doesn't accept `--include` (same reason as coverage.mjs, see its `note`) — marginal cost/traceability are reported in full. |

**Report header** (replaces the full scorecard's title line):

```markdown
# docgrad scoped report — <repo> @ <YYYY-MM-DD>

> scope: `docs/infra/**` (from "infra-related docs") | dimension: all | **pure report, nothing written to `.docgrad/`**
```

With `--dim`, the scorecard lists only that one dimension's row; "Suggested next steps" still gives that dimension's deductions — dimensions that weren't scored get no star rating and no blank row.

# docgrad rubric — star anchors for the six dimensions

> **Last updated:** 2026-09-16

> This file is the only basis on which scores from different rounds can be compared. The anchors
> are frozen; any change to them makes historical scores incomparable, counts as a breaking
> change, and must be stated explicitly in the commit message.

## Contents

- [Scoring principles](#scoring-principles)
- [Mechanical signal → dimension map](#mechanical-signal--dimension-map)
- [Completeness](#completeness)
- [Correctness](#correctness)
- [Freshness](#freshness)
- [Linkage](#linkage)
- [Consistency](#consistency)
- [Economy](#economy)
- [Token economy report](#token-economy-report)
- [Version history and comparability notes](#version-history-and-comparability-notes)

## Scoring principles

1. Run the five scripts first (inventory / links / freshness / coverage / retrieval); mechanical
   signals are reproducible.
2. The LLM-judged dimensions (completeness, correctness, consistency) are matched against the
   anchors in this file. Inventing your own criteria is not allowed.
3. Star ratings are whole numbers, ★1–★5. Take the highest level the docs *fully* satisfy.
4. When in doubt, round down — a conservative score gives the loop a clear direction to work in.
5. Fixed dimension order (ties break toward the earlier one): completeness → correctness →
   freshness → linkage → consistency → economy. Economy is last on purpose: it pulls against
   completeness (adding documentation raises the fixed cost), so on a tie the content dimensions
   move first and the loop does not oscillate between "write more" and "delete it again".

## Mechanical signal → dimension map

| Script | Feeds |
|---|---|
| inventory.mjs | **Economy (fully mechanical: `entry_cost` + `pollution`)**; the inventory completeness works from; `structure.rules` feeds traceability |
| coverage.mjs | Completeness (coverage drift: undocumented/drifted areas) |
| links.mjs | Linkage (fully mechanical) |
| freshness.mjs | Freshness (mostly mechanical) |
| retrieval.mjs | Marginal cost (when `scenarios:` is set) plus traceability — **both report-only, neither rates economy** |
| (no script) | Correctness, consistency (LLM claim ledger / cross-document triangulation) |

## Completeness

| Star | Anchor |
|---|---|
| ★1 | Most core modules have no documentation; an agent can only read the code and infer. |
| ★2 | Scattered documents exist, but at least one key area — deployment, testing, data model — is missing entirely. |
| ★3 | Every core area has an authoritative document; deployment/testing are at least described inline. |
| ★4 | All areas covered, common tasks have how-tos; only a few edge modules are missing. |
| ★5 | Full coverage + runbook + onboarding path + retired mechanisms explicitly marked "do not use for new work". |

Measurement: the undocumented/drifted area list from coverage.mjs is the mechanical basis (degraded
to pure LLM comparison when `src_dirs` is not set); the LLM then scans the top-level `src` structure
and the deployment/testing setup to catch gaps the script cannot see (subsystem granularity,
`mentioned_by` false positives). An undocumented or drifted area counts as that area having no
authoritative document.

## Correctness

| Star | Anchor |
|---|---|
| ★1 | Sample pass rate <50%, including mechanism-level errors (the architecture described no longer exists). |
| ★2 | Pass rate 50–79%, or an entire document describes a retired mechanism with no marking of any kind. |
| ★3 | Sample pass rate ≥80%; what is wrong is detail, not mechanism. |
| ★4 | Sample pass rate ≥90%, and no zombie-mechanism documents. |
| ★5 | Every sampled claim passes + zombie code and retired mechanisms are marked + authoritative lists refer to code instead of restating it. |

Measurement: the claim ledger — draw `correctness_sample` concrete claims, re-verify part of the
existing ledger, and verify every one of them against the code (see [audit.md](audit.md) step 3).
**The script decides the sample**: the population is `inventory.totals.claims_total` (non-heading
lines outside fences that carry a code coordinate), the draw order is
`inventory.claim_candidates` (stably sorted by ref count → path → line), at most 2 per document.
`claim_candidates` is a **window** onto that order, not all of it: it holds the first
`claim_candidates_cap` candidates (default 60), because emitting hundreds of claim texts would cost
the reader the very thing the economy dimension measures. Draws come only from the window, so a
ledger that fills it stops growing while `claims_total` stays higher —
`inventory.claim_population` reports `emitted` / `population` / `truncated` / `cap` on every run so
that state is never inferred from a coverage number that simply stopped moving. Raising
`claim_candidates_cap` is the fix, and — **without `--exclude-ledger`** — it only appends: the
window is a prefix of one stable order, so a wider one draws everything a narrower one drew, in the
same positions. `--exclude-ledger <path>` (#54) is a different fix for a related cost: every ledger
row otherwise occupies one of the `claim_candidates_cap` slots forever, so the window narrows to
`cap` minus the ledger's size as it grows. Passed, `inventory.mjs` filters candidates already in
that ledger out of the ranked list **before** the cap is applied, so `cap` counts drawable
candidates instead — but the window it emits is then a prefix of the *filtered* order, not of the
total order, and that filtered order shifts as the ledger grows, so "only appends" no longer holds
in that mode (see [audit.md](audit.md) step 1).
A "code coordinate" is either **path-shaped** inline code (`lib/foo.js`, `src/a.ts › parse()`) or **API-shaped** inline code
(`foo()`, `.option()`, `program.opts()`) whose every segment exists as an identifier under `src_dirs`; the per-candidate split is
`refs_path` / `refs_api`. With `src_dirs` unset the API shape is inert and contributes nothing —
`inventory.claim_population.api_matching` reports `disabled`, and on a library repo that alone can leave `claims_total` at 0
(see the not-measurable case below). Claims are keyed on `claim_hash`, a 12-hex-character digest of the claim text with
whitespace collapsed: stable when a claim moves, different when a claim is edited, so the ledger survives the document
rewrites that improve itself performs. `path`/`line` remain locating aids, not identity.
**`correctness_sample` is the number of claims drawn new each round, not the total verified that
round.** A round verifies: every outstanding `fail`/`stale` entry in `.docgrad/ledger.jsonl` (no
cap — otherwise a repo's score would improve as its documentation got worse), plus the
`floor(correctness_sample / 2)` least-recently-verified `pass` entries (by ledger `round`
ascending), plus `correctness_sample` claims that have never entered the ledger. Re-verification
never reduces the new draws, so cumulative coverage grows by `correctness_sample` per round until
the emitted window is exhausted; the ledger accumulates rather than resampling. The pass rate that
sets the star rating is computed over that whole verified set.
**The pass rate is a measurement with a rater in it, and the report must show that.** Every ledger
row carries `borderline`, and the round's borderline count is printed beside the pass rate — because
a pass rate moves when the documentation changes *and* when the reading changes, and those are not
the same finding. A `fail`, and any borderline `pass`, also carries a `rationale`: which sentence,
which code line, why. Without it a later round can re-verify the claim but not the judgement, and
the judgement is the part that was demonstrably unstable (see [§Version history](#version-history-and-comparability-notes),
v1.7.0). [audit.md](audit.md) step 4 settles the two recurring boundaries rather than leaving each
round to re-derive them.

> **The one ceiling that does exist is the emitted window, and it is a config setting, not a
> property of the repo.** Coverage climbs by `correctness_sample` a round until the ledger holds
> every candidate in `claim_candidates`, then stops — at `claim_candidates_cap`, not at
> `claims_total`. From the outside this is indistinguishable from a fully covered corpus: both show
> a flat coverage line and a round that drew nothing. `claim_population.truncated` is what tells
> them apart, and [audit.md](audit.md) step 3 sets out the three causes of a short draw and the
> different response each one needs. A capped coverage figure must be reported as capped.
> This is the picture **without `--exclude-ledger`**. Run with it, the window instead holds a
> prefix of the *drawable* (not-yet-ledgered) candidates, so the ceiling sits closer to
> `claims_total` — but it is still a ceiling, and a config setting, just a moving one instead of a
> fixed `claim_candidates_cap`th candidate (see [audit.md](audit.md) step 1).

> **Report pass rate and coverage separately**: the star rating for this dimension follows the
> **pass rate** (passes ÷ claims verified this round). **Cumulative coverage** (distinct claims in
> the ledger ÷ `claims_total`) does not affect the star rating, but **the report must include it** —
> 8/8 at 5% coverage and 8/8 at 60% coverage are two different things, and giving only the star
> rating lets the reader overestimate how much that number is worth.

> **A star built on docgrad's own prose must disclose it.** `inventory.totals.claims_docgrad_authored_ratio` is the share of
> the round's claim population drawn from documents docgrad itself wrote during a convergence round (detected from the
> subject of the commit that added each file). It **does not affect the star rating** and it is **not a deduction** — but the
> report must state it beside cumulative coverage, and a high ratio has to be named as a finding. Measured on
> `tj/commander.js` after five convergence rounds, all 26 candidates came from the three documents docgrad had just written
> and none from the seven pre-existing ones: the tool was verifying the prose it had caused to exist, correctness rose, and
> the repository's actual documentation debt was never sampled once. ★4 over a population that is 100% docgrad-authored and
> ★4 over one that is 0% are not the same claim about a repo, and only the ratio tells them apart. `null` means git could not
> answer and the share is unknown — report unknown, never 0.

> **Zero verifiable claims: not measurable, not a star.** When the round's verified set is empty —
> no outstanding `fail`/`stale`, no `pass` entries in the ledger, and `claims_total: 0` — the pass
> rate is undefined and **none of the ★1–★5 anchors above apply**. Report the dimension as `n/a`
> (not measurable) rather than guessing a star; four independent runs on the same library-repo
> fixture, each reasoning defensibly, produced ★3, ★3, ★1 and ★2. A not-measurable correctness is
> treated exactly like a design ceiling: excluded from the targets check, excluded from the loop's
> dimension picking, and named in the report — the corpus having no claim that carries a code
> coordinate is itself the finding worth acting on (see [audit.md](audit.md) step 3). The rated
> value recorded in `history.jsonl` is `null`, not a number, so `report` never averages a guess.
> This adds a case the anchors did not cover; it **changes none of the ★1–★5 thresholds**
> (see [§Version history](#version-history-and-comparability-notes)).

## Freshness

| Star | Anchor |
|---|---|
| ★1 | No date-signal convention (coverage_ratio <20%). |
| ★2 | Signals are scattered (20–60%), or key documents have staleness >180 days. |
| ★3 | A date-signal convention exists but relies on discipline; key documents have staleness within the staleness window (shipped: ≤60 days, `freshness.stale_after_days`). |
| ★4 | Coverage ≥90%, only isolated mismatches, drift <30 days. |
| ★5 | Full coverage + "updated in the same MR as the change" enforced by a mechanical gate + lifecycle management (superseded documents handled as soon as they are superseded). |

Measurement: `coverage_ratio` / `stale` / `mismatches` from freshness.mjs. "Key documents" means
`entry_files` + `index_file` + each area's authoritative document.
The ★3 staleness window is `freshness.stale_after_days` (shipped 60), and it is **configurable** —
which means a repo can set it to 365 and make ★3 mean "within a year" without a word of this file
changing. That is legitimate for a repo whose documentation genuinely ages that slowly, and it is
also exactly why the value is in `thresholds_hash`: the scorecard must state the window in force
whenever it is not the shipped one, and `report` draws a comparability break when it moves.
A related constant is **not** configurable: `mismatches` only fires when a document's claimed date
and its git date differ by more than 7 days (`freshness.mjs › MISMATCH_TOLERANCE_DAYS`), a fixed
tolerance for the ordinary gap between editing a file and committing it.
The git date comparison **excludes docgrad's own convergence commits** (the `docs(docgrad):`
prefix) and takes the most recent non-docgrad commit — otherwise the backfill round counts its own
commit dates as "the content was updated" and produces false mismatches.
`date_concentration` is an advisory field (**it does not affect the star rating**): a high share of
a single day means the signals come from one backfill, the coverage number does not reflect how the
docs are actually maintained, and the report must say so.

> **Scope of ★5 (graduation-only)**: the "mechanical gate" ★5 requires means touching CI, and
> improve/loop are bound by Blocker #3 not to touch the target repo's CI — so freshness is capped
> at ★4 inside the loop and the dimension is called a design ceiling (see [improve.md](improve.md)).
> ★5 is reachable only after graduation, once the team builds its own docs-gate CI.
> This is a note about reachability and **changes none of the ★1–★5 thresholds**
> (see [§Version history](#version-history-and-comparability-notes)).

## Linkage

| Star | Anchor |
|---|---|
| ★1 | Dead-link ratio >10%, or no index at all. |
| ★2 | Dead links 2–10%, or orphans >20%. |
| ★3 | Broken relative links ≤2%; an index exists but is not the single entry point. |
| ★4 | Zero dead links, orphans ≤5%, reachable_ratio ≥95%. |
| ★5 | Zero dead links + a single top-level index reaches everything transitively (zero orphans) + anchors use `path › symbol()` so they survive line-number drift. |

Measurement: the full mechanical output of links.mjs (dead-link ratio = dead_links / total_links).
Broken anchors always cost stars; `cjk_uncertain` is an advisory field and is **not** a reason to
skip confirmation (see [§Version history](#version-history-and-comparability-notes)).

> **`orphans: null` is not `orphans: []`.** When the repo has no `index_file`, or the run is scoped,
> reachability cannot be computed and both `orphans` and `reachable_ratio` come back `null`. Do not
> read that as "no orphans found". A repo with no index at all is rated ★1 by the anchor above — the
> one case where every document can be unreachable while the mechanical output reports nothing.

## Consistency

| Star | Anchor |
|---|---|
| ★1 | The same topic is contradicted in several places with no clue how to arbitrate. |
| ★2 | Many overlaps, at least one pair in substantive contradiction. |
| ★3 | At most 2 overlaps per topic and they do not contradict each other. |
| ★4 | Mostly one authority per topic, with cross-links at the individual overlaps. |
| ★5 | One authority per topic (everywhere else keeps a summary plus a link) + an explicit conflict-arbitration convention (newer wins + arbitrate against the code). |

Measurement: the LLM picks 3–5 key factual topics (architecture, state machines, deployment…),
compares them across documents, and triangulates against the code. The scope of the judgement
**includes placement and duplication between docs and code comments/specs** — the rules are in
[placement.md](placement.md), and only placement and duplication are judged, never comment quality.
Deductions fall into three classes: `[contradiction]` / `[duplication]` / `[placement]`
(see [audit.md](audit.md) step 6).
When comparing this dimension's score across v0.5.0, note the scope was widened
(see [§Version history](#version-history-and-comparability-notes)).

## Economy

| Star | Anchor |
|---|---|
| ★1 | Fixed cost above the first tier (shipped: > 20,000 tokens). |
| ★2 | Fixed cost in the second band (shipped: > 10,000 and ≤ 20,000). |
| ★3 | Fixed cost in the third band (shipped: > 5,000 and ≤ 10,000). |
| ★4 | Fixed cost at or below the third tier (shipped: ≤ 5,000) and pollution surface below the cap (shipped: < 10%). |
| ★5 | Fixed cost at or below the fourth tier (shipped: ≤ 3,000), pollution surface below the cap, and the entry-file token budget is enforced by a mechanical gate. |

Measurement: **fixed cost** = `inventory.entry_cost.tokens_est` (the tax every task pays for
loading `entry_files`, with symlink aliases de-duplicated); **pollution surface** =
`inventory.pollution.ratio`. Both are fully mechanical, neither passes through LLM judgement.

**Read the boundaries off the run, not off this table.** `inventory.economy_thresholds` carries the
values this round actually used — `entry_cost_tiers`, `pollution_max` — plus the arithmetic over
them: `cost_allows_star` (the ceiling the fixed cost alone permits), `star_5_cost_met`, and
`pollution_caps_at`. The parenthesised numbers above are what docgrad **ships**; a repo may set its
own in `.docgrad.yml`, and then the shipped numbers are not the ones it was graded by.

Two consequences the audit must honour:

- **`customised: true` is a reporting obligation, not a violation.** A repo is allowed to choose its
  own thresholds. But a rating produced under custom thresholds is not comparable with one produced
  at the defaults, so the scorecard must say which thresholds were in force. `thresholds_hash` in the
  `docgrad` block is the mechanical form of the same statement, and it is what `report` compares
  across rounds.
- **★5 still needs the gate.** `star_5_cost_met` reports only the cost half. No script can see
  whether a mechanical gate exists and runs, which is why ★5 stays a judgement even though the rest
  of this dimension is arithmetic.

> **What the pollution surface measures — and what it does not**: it measures *how much junk this repo contains*, not *how
> much of it you chose not to grade*. Those are two different questions and only the first should move a star. Two config
> fields say which one you mean, and both take files out of the corpus:
>
> | Field | Corpus | Pollution surface | Reported as |
> |---|---|---|---|
> | `exclude` | out | **charged** | `inventory.pollution.excluded_files` / `excluded_tokens` |
> | `out_of_scope` | out | **not charged** | `inventory.out_of_scope.count` / `tokens_est` |
>
> Use `exclude` for the WIP draft you would be embarrassed to have read — it is in the repo, and the repo should answer for
> it. Use `out_of_scope` for content that is real documentation but is not what this run grades: a translated mirror rated as
> its own corpus, a vendored handbook, a subproject with its own `.docgrad.yml`. Measured on `tj/commander.js`, `docs/zh-CN/`
> — translated mirrors graded separately — sat in `exclude` and charged **40.6%** pollution, capping economy at ★3 while the
> fixed cost was a perfect 0. Every exit was closed: deleting the translations is content that is still correct and still
> needed, which [improve.md](improve.md) forbids deleting to lower a cost; un-excluding them reverses the owner's answer and
> pulls the mirror into the graded corpus; and diluting the ratio under 10% would have taken roughly 28,700 tokens of English
> filler. What was wrong was the field's semantics, not the documentation.
>
> **`out_of_scope` is not a free pass, and the audit must not read it as one.** Its size is printed on every run, empty or
> not, precisely so the field cannot become a silent switch for zeroing your own pollution surface. You may move anything you
> like out of the surface; how much you moved is on the same page, in the same units. An `out_of_scope` that dwarfs the
> graded corpus is a finding in its own right (see [audit.md](audit.md) step 7). When a path is listed in both fields,
> **`exclude` wins** and the file stays charged — a broad `out_of_scope` entry must never silently cancel an `exclude`
> someone already wrote, so getting anything out of the surface always costs one deliberate edit to `exclude`.
>
> `out_of_scope` joins `corpus_hash` **only when it is non-empty**, so a config that predates the field and a config that
> spells out `out_of_scope: []` select the same corpus and hash the same; moving a path between the two fields still moves
> the hash, because it leaves the `exclude` list (see [§Version history](#version-history-and-comparability-notes)).

> **Pollution downgrade rule**: at a pollution surface ≥ 10%, this dimension is capped at ★3 no
> matter how low the fixed cost is. Without this rule, "fixed cost 4,000 + pollution 15%" would
> satisfy neither ★3 (cost too low) nor ★4 (pollution too high) and there would be no star to give.
>
> **The pollution surface is measured from the filesystem, not from git, so this cap is only
> reproducible on a clean checkout — or with `exclude_untracked: true`.** Everything on disk is
> collected, tracked or not, so an untracked local file changes a *rated* input. Measured on one
> repo at the same commit with the same script version: ratio **0.1066** in a working checkout
> versus **0.0517** in a clean worktree, the entire difference being one untracked 9,730-token
> draft inside a `.gitignore`d directory. The default `pollution_max: 0.1` sits **between those two
> numbers**, so the same commit is ★3 for one person and ★4 for the next — the exact class of
> irreproducibility docgrad exists to catch. The ratio itself is deliberately left alone (silently
> recomputing it would move everyone's economy rating at once); instead `inventory.untracked`
> reports the count and token weight, `inventory.pollution.note` flags the ratio as checkout-bound,
> and the audit must carry both into the scorecard (see [audit.md](audit.md) step 7). Setting
> `exclude_untracked: true` restricts the corpus to what git tracks and makes the rating
> reproducible; it changes `corpus_hash`, so scores either side of the flip are not comparable
> (see [§Version history](#version-history-and-comparability-notes)).

> **This dimension pulls against completeness by design, not by accident**: adding documentation
> raises the fixed cost. Economy exists so the loop has a mechanical brake between "more
> documentation" and "a more expensive agent" — external evidence (several coding agents compared
> on SWE-Bench Lite and AgentBench) shows that longer context files raise cost without necessarily
> raising success rate, so coverage cannot be the only direction that gets rewarded. Three things
> keep it from turning into a tug of war: economy is last in the dimension order (on a tie the
> content dimensions move first), documents outside `entry_files` do not count toward the fixed
> cost (moving content out of the entry file satisfies both dimensions at once), and improve
> verifies that no other dimension drops.

> **Scope of ★5 (graduation-only)**: the "mechanical gate" ★5 requires means touching CI, and
> improve/loop are bound by Blocker #3 not to touch the target repo's CI — so economy is capped at
> ★4 inside the loop and the dimension is called a design ceiling
> (see [improve.md](improve.md)), the same way freshness ★5 is.

## Token economy report

Since v1.0.0, **fixed cost and pollution surface are rated** (see [§Economy](#economy)); this
section expands on that dimension and adds two signals that remain report-only (marginal cost,
traceability) and take no part in the rating.

- **Fixed cost**: `inventory.entry_cost.tokens_est` (`entry_files`, loaded on every task). **Rated.**
- **Marginal cost** (report-only): when `.docgrad.yml` sets `scenarios:` (a list of representative
  code paths), `retrieval.mjs` computes it mechanically — each scenario reports `marginal_tokens`
  (entry_files + every doc on the index chain + every anchoring doc, each file counted once),
  `max_depth` (how many hops from `index_file` to the furthest anchoring doc), `fan_in` (how many
  docs anchor it) and `code_pointer` (whether the code on that path points back at any doc) —
  and weights them by `churn_commits` (commits in the last 90 days) to name the most heavily taxed
  scenario: high churn together with high `marginal_tokens` or deep `max_depth` means the agent
  touches it often and pays the most to retrieve it, so it is the one to fix first. Without
  `scenarios:`, fall back to the old method: the LLM simulates the required reading path from
  `.docgrad.yml`'s `scenario` (singular, a prose string).
- **Pollution surface**: `inventory.pollution.ratio` (excluded directories and WIP as a share of the
  whole corpus). **Rated.**
- **Interpretation**: the report must include a break-even statement — an overstuffed entry file
  means every task pays a fixed tax; routing everything through the index means paying the marginal
  cost of multi-hop retrieval. Give a trade-off recommendation based on what that repo's tasks
  actually look like.

### Traceability (report-only)

A newer signal, measuring "is there a path from a code file back to the spec that governs it, and is
that spec usable" — it **affects none of the ★1–★5 anchors** and is only an extension of the token
economy report. The mechanical basis is `retrieval.mjs` (`code_pointer_ratio` / `index_hotness`) and
`inventory.mjs` (`structure.rules`).

- **`code_pointer_ratio`** (aggregated from retrieval.mjs `areas[].code_pointer`): whether the code
  under each first-level subdirectory of `src_dirs` points back at any doc (a `docs_dirs` path
  prefix, or the basename of some doc). A low ratio means an agent that just changed the code has no
  path back to the spec and can only grep the whole doc tree and guess.
- **`index_hotness`** (retrieval.mjs): commits in the last 90 days on `index_file` / `entry_files`
  versus the median across all docs. A `ratio` clearly >3 usually means the index or entry file has
  absorbed content that the child documents should be exposing themselves — the index should be
  pointing the way, not being edited along with the content. It can also be plain orphan maintenance
  debt; read `top5` to tell which.
- **`structure.rules`** (inventory.mjs, per file): for rule lines (matched by `rules.pattern`,
  default `**MUST`), the `median_chars` / `p90_chars` / `anchored_ratio`. A median above 300
  characters or an `anchored_ratio` below 0.5 is a signal to split that file into a **contract
  layer** (the rules themselves: short, with coordinates) and a **detail layer** (background and
  examples, which may be long) — long rule lines mixed with background narrative force the agent to
  read the whole passage every time to find the one sentence that is actually a MUST, and a low
  anchored ratio means the claims have no verifiable landing point in the code.
  A coordinate is path-shaped **or** API-shaped, the same definition the claim population uses — so
  on a library repo, whose rules land on functions rather than files, `anchored_ratio` measures what
  it claims to. Before v1.7.0 it counted path shapes only, which made this signal fire on exactly
  the repos where every rule did have a landing point (#51). Like the claim population, the API half
  is inert when `src_dirs` is unset.

## Version history and comparability notes

Only needed when comparing scores across versions; day-to-day scoring does not need to expand this.
None of the items below **changed the ★1–★5 anchor text of an existing dimension**; the only
breaking change is v1.0.0 adding a dimension (the set of dimensions changed, the ruler for each
individual dimension did not).

<details>
<summary>Expand</summary>

- **v1.6.0 — the claim-candidate window is configurable and disclosed** (**not an anchor change**):
  the ★1–★5 thresholds are untouched and no dimension gained or lost a criterion. `inventory.mjs` has always emitted only the
  first 60 ranked claim candidates; that number is now the config field `claim_candidates_cap`, **defaulting to 60**, so no
  existing run's numbers move. What changed is that the cap is now visible (`claim_population.emitted` / `population` /
  `truncated` / `cap`) and can be raised. Consequences for comparing scores across this version:
  - **Cumulative coverage figures recorded before this version may be ceilings, not measurements.** A repo whose ledger had
    reached 60 distinct claims was drawing nothing new every round while `claims_total` read higher, and nothing in the
    output said so — §Correctness and [audit.md](audit.md) step 3 both described coverage as growing without a ceiling,
    which was true only below the 60th candidate. A flat coverage line in an older `history.jsonl` cannot be read as
    convergence without checking the ledger size against 60.
  - **Pass rates either side of a cap *change* are drawn from differently composed sets.** The window is the top of a
    ranking by reference count, so the first 60 candidates are the most densely referenced claims in the corpus. Widening it
    admits less specific ones, which need not pass at the same rate. The star may move for that reason alone; it is not a
    documentation change. Widening it does **not** reorder or re-draw anything already in the ledger — the window is a prefix
    of one stable order — so the ledger itself stays comparable. **That comparability holds without `--exclude-ledger`
    (#54, v1.8.0).** Run with it, the window is a prefix of the ledger-filtered order instead, which shifts as the ledger
    itself grows — so a `claim_candidates_cap` change compared across two `--exclude-ledger` runs is not the same kind of
    comparison as the one described above.
  - **`claim_candidates_cap` is deliberately *not* part of `corpus_hash`.** It selects no files and moves no denominator:
    `claims_total`, the freshness denominator, the orphan population and the pollution denominator are all identical either
    side of a change to it. Folding it in would draw a whole-round comparability break across all six dimensions — five of
    which cannot have been affected — every time someone applies the fix the tool itself recommends. The narrower, honest
    disclosure is the per-round `claim_population.truncated`, which is emitted whether or not anyone changed the field.
- **v1.9.0 — a `corpus_hash` move here may be a parser fix rather than a corpus edit** (**not an anchor change**): inline
  lists are now split on commas **outside quotes**, so a config containing `["docs/a,b/"]` selects a different corpus than
  it used to. Compare the tool version against the config actually in use; the config's own history usually tells them apart.
- **v1.8.0 — the rules for applying the anchors are fingerprinted, and the sampling window counts what it can draw**
  (issues #56, #54, #57) (**not an anchor change**): no ★1–★5 threshold moved and every shipped default is unchanged.
  - **New `judgement_hash`**, covering `audit.md` and `placement.md` — the files that decide *how* the anchors are applied
    (the scoring procedure, the sampling rule, the boundary rules; and what counts as a consistency deduction). `rubric_hash`
    fingerprints the anchors; this fingerprints their application, and the two move independently. `rubric.md` is deliberately
    **not** included — hashing it twice would move two fingerprints for one edit — and neither is `improve.md`, which
    delegates the rating to `audit.md` and is never read by a plain `audit`.
    - **It does not mark the break that motivated it.** v1.7.0's #48 added two correctness boundary rules, one of which can
      only lower a pass rate, and nothing mechanical recorded that. `judgement_hash` makes the *next* such change detectable;
      the v1.7.0 entry below remains the only disclosure of that one. A round from before v1.8.0 has no such field, so its
      first appearance reads "unknown → first value", not as a change.
  - **`--exclude-ledger` changes which claims a flagged run draws** (#54). The emitted window used to include claims the
    ledger had already covered, so a nominal window of 60 offered 33 drawable candidates on one real repo, worsening as the
    ledger grew. With the flag, `claim_candidates_cap` counts **drawable** candidates. Consequence for comparability: the
    window is then a prefix of the *filtered* order, so **"raising the cap only appends" no longer holds for a flagged run** —
    the filter moves as the ledger grows. Without the flag nothing changes at all, byte for byte.
  - **Out-of-root paths are now refused** (#57). A configured path containing `..`, a configured path that is itself a symlink
    out of the root, or a `*.md` symlink in the corpus pointing outside, now **fails the run** rather than quietly measuring
    content from outside the repository. No fingerprint moves for this — `corpus_hash` digests the config's path *strings*,
    not the collected file set — so a repo in one of those shapes finds out by the run stopping, not by a hash.
    - One related figure can move **silently**: an out-of-root document link that pointed at a missing file used to count in
      `dead_links` and now lands in `out_of_root_links`, so `dead_links` can shrink and linkage can improve with nothing else
      changing. Report-only dimensions are unaffected; this one is rated.

- **v1.7.0 — the economy thresholds became real, and the fingerprint gained a fourth field**
  (issue #50) (**not an anchor change**): the shipped numbers are unchanged — 20,000 / 10,000 / 5,000 / 3,000 and 10% — so a
  repo that never wrote an `economy:` block is graded exactly as before and its history stays comparable. What changed is
  **who those numbers come from**. `economy.entry_cost_tiers` and `economy.pollution_max` existed in `.docgrad.yml` since
  v1.0.0 and **were read by nothing**; the thresholds actually applied were retyped in this file's prose. Consequences:
  - **A repo that set a custom `economy:` block is regraded, with no file changing.** Before v1.7.0 such a repo was graded
    at the shipped numbers whatever its config said; from v1.7.0 it is graded at its own. A repo carrying
    `pollution_max: 0.2` was judged at 0.1 and is now judged at 0.2 — the economy star can move on the version bump alone.
    This is the intended fix, and it is a genuine break in that repo's trend.
  - **The transition round is not mechanically detectable.** `thresholds_hash` (new here, covering `entry_cost_tiers`,
    `pollution_max` and `freshness.stale_after_days`) is absent from every pre-v1.7.0 `history.jsonl` line, so the round
    where the change took effect reads as "unknown → first value" rather than as a move. From the first v1.7.0 round onward
    it works normally and `report` draws the break.
  - **`freshness.stale_after_days` is the mirror image and is not new — only its disclosure is.** It has always driven the
    freshness ★3 staleness window while the anchor read like a fixed "≤60 days" and nothing warned that changing it moved
    the boundary. No behaviour changes here; the anchor now says it is configurable and the value is fingerprinted, so a
    repo grading itself at 365 days can no longer do so invisibly.
  - `inventory.economy_thresholds` reports the values in force on every run, with `customised` saying whether they are the
    shipped ones. The audit must state the thresholds whenever `customised` is true.
  - **Correctness pass rates are not comparable across this version** (issue #48). `reference/audit.md` gained two named
    boundary rules, and one of them can only lower a pass rate: a generalisation adjacent to a structured list is now judged
    against **every row** of that list, where before it was left to the round's verifier to decide whether such a sentence was
    a claim about the list or a loose summary above it. The anchors are untouched — the thresholds are still <50% / 50–79% /
    ≥80% / ≥90% / all pass — but the same documentation can produce a lower pass rate under the new rules, so a drop across
    this version is **not** evidence the documentation decayed.
    - **No fingerprint covers this.** `rubric_hash` is computed over *this file only* (`lib.mjs › docgradMeta()`), and the
      rules live in `audit.md`, so `report` cannot draw the break mechanically the way it does for an anchor change. This
      entry is the disclosure. Treat the first v1.7.0 round in any repo as a baseline for correctness rather than as a
      continuation.
    - The reason the rules exist is the failure they were drawn from: the **same claim over unmodified code** was judged
      `pass` in one round and `fail` in a later one, both verifiers describing the code correctly and disagreeing only about
      what the sentence claimed. The ledger recorded the verdicts and not the reasoning, so the change was indistinguishable
      from documentation rot. Hence the ledger's new `rationale` (mandatory on every `fail` and every borderline `pass`) and
      `borderline` fields, and the borderline count now printed beside the pass rate. Both are **forward-only**: a
      pre-v1.7.0 round's borderline count is unrecorded, not zero.
  - **Two report-only numbers move once in this version and neither carries a star** (issue #51).
    `structure.rules.anchored_ratio` now counts API-shaped coordinates as well as path-shaped ones,
    so it rises on any repo that documents an API — on a library repo it was **0 by construction**
    and the traceability note fired there for the one reason #40 had already retired. And
    `retrieval.marginal_tokens` now deduplicates entry files on realpath, as `inventory.entry_cost`
    has all along: a `CLAUDE.md -> AGENTS.md` symlink pair used to be charged twice in every
    scenario (measured on a fixture: 348 tokens in `entry_cost` against 696 in `marginal_tokens`,
    exactly double) while this file's Token economy section has always specified each file counted
    once. Both figures are advisory, so nothing is regraded; a repo with either shape will simply
    see a step in its trend at this version.
- **v1.6.0 — the correctness sampling population now includes API-shaped claims, and discloses who wrote it**
  (issues #40, #41) (**not an anchor change**): the ★1–★5 thresholds (pass rate <50% / 50–79% / ≥80% / ≥90% / all pass) are
  unchanged word for word, and no dimension gained or lost a criterion. What changed is **which lines are eligible to be
  sampled**. A claim used to be a line carrying path-shaped inline code; it is now a line carrying path-shaped **or**
  API-shaped inline code (`foo()`, `.option()`, `program.opts()`), the latter admitted only when every segment exists as an
  identifier under `src_dirs`. Consequences for comparing scores across this version:
  - **On a library repo the population goes from nothing to something.** Measured on `tj/commander.js`, `claims_total` was
    **0** at baseline — correctness had no mechanical basis at all and was reported as not measurable. A post-change ★
    there is the first real measurement, not an improvement on the old one; there is no old number to compare it to.
  - **On a repo with both shapes, the candidate order moves once.** `refs` now counts API references alongside path
    references, so the ranking — most specific claim first — reshuffles. This is a deliberate consequence of admitting API
    references as coordinates, not a defect. A round that straddles the change did not draw from the same sequence the
    previous round drew from, so a one-round jump or dip in pass rate across the boundary is unexplained.
  - **With `src_dirs` unset, nothing changes at all**: the extension is inert, `claim_population.api_matching` reports
    `disabled`, and such a repo's scores are directly comparable across this version.
  - Also new and report-only: `claims_docgrad_authored_ratio`, the share of the population coming from documents docgrad
    itself wrote. It moves no star, but the report must state it (see [§Correctness](#correctness)) — historical scores
    carry no such figure, so how much of an older ★ rested on the tool's own prose cannot be recovered.
  - Claim identity moved from `<path>:<line>` to `claim_hash` (#41). That is a **state-file** change, not a ruler change:
    moving a claim no longer looks like a new claim, so cumulative coverage stops being inflated by document reshuffles and
    a ledger `pass` is no longer silently repointed at other content by improve's own rewrites. Coverage percentages
    recorded before this fix may therefore read slightly high. Migration is mechanical — see [improve.md](improve.md) step 5.
- **v1.6.0 — `out_of_scope`: content graded elsewhere is no longer charged as pollution** (issue #44)
  (**not an anchor change**): the ★1–★5 anchor text and the `pollution_max: 0.1` downgrade threshold are both untouched, and
  the pollution surface is still computed the same way from the same `exclude` list. What is new is a **second** config field
  that removes files from the corpus **without** charging them — see [§Economy](#economy) for the split and why the two
  questions are not the same question. Comparability:
  - **A config that does not use the field is byte-for-byte unaffected.** `out_of_scope` defaults to `[]`, joins
    `corpus_hash` only when non-empty, and an absent field and an empty list select the same corpus and hash identically, so
    no repo in existence acquires a false comparability break at upgrade time.
  - **Moving a path from `exclude` into `out_of_scope` does move `corpus_hash`** (the path leaves the `exclude` list, which is
    always hashed) and drops the pollution ratio without a single file changing. `report` therefore draws a break, and it
    should: an economy star either side of that edit is not the same measurement. The reason improve is forbidden to make
    that edit as an economy fix is exactly this — it is re-labelling, not improvement.
  - **Precedence is fixed and one-directional**: a path in both fields is charged, `exclude` wins, and `inventory.out_of_scope.note`
    names the overlap. Getting anything out of the pollution surface always costs a visible deletion from `exclude`.
- **v1.5.0 — `corpus_hash`: the corpus scope now has a fingerprint of its own** (issue #36)
  (not an anchor change): no threshold and no anchor text moved, and no dimension changed how it is
  measured. What is new is a second fingerprint next to `rubric_hash` in `inventory.mjs`'s `docgrad`
  block, written into every `history.jsonl` line by improve (see [improve.md](improve.md) step 5).
  `rubric_hash` answers "which ruler did this round use"; `corpus_hash` answers "which files did it
  measure" — it is derived from `docs_dirs`, `docs_files`, `entry_files`, `exclude`, `index_file`
  and `exclude_untracked`, normalised (trimmed, trailing slashes dropped, de-duplicated, sorted) so
  that reordering a list or writing `docs/` for `docs` does not fake a change. Editing any of them
  moves `files_total`, `claims_total`, the freshness denominator, the orphan/reachability
  population and the pollution denominator all at once, while `rubric_hash` stays byte-identical —
  which is why `report` now draws a comparability break on this field too, and why the whole round
  either side of it is the thing that is incomparable, not one dimension. Rounds recorded before
  this field existed carry no `corpus_hash`: like the other version fields, that is treated as
  unknown and blocks nothing.
- **v1.5.0 — translated to English** (**anchor text changed; thresholds did not**): the
  whole file was translated from Traditional Chinese to English. What survived unchanged: every
  numeric threshold (`≤ 10,000`, `≥90%`, `<50%`, the tier lists) and the dimension order that
  breaks ties. What did not: the qualitative anchor text itself, which is now different prose.
  That matters, because the qualitative anchors *are* the ruler — a model reads that text and
  decides where a repo falls, and "the same meaning in another language" is an assertion nobody
  can mechanically check. So `rubric_hash` changes here and `report` draws a comparability break,
  and **the break is real**: a ★4 awarded against the Chinese anchors and a ★4 awarded against the
  English ones were read off different text. Mechanical dimensions (linkage, economy, and the
  mechanical part of freshness) are unaffected — no LLM reads this file to compute them.
  A structural hash — over the thresholds and the anchor ordering rather than the file bytes —
  would tell translations apart from real rubric changes and remove this whole class of false
  breakpoint. It is not implemented; see the repo's open issues.
- **v1.5.0 — `correctness_sample` now means new draws per round, and the empty-sample case is defined**
  (see CHANGELOG; issue #37) (not an anchor change): the ★1–★5 thresholds (pass rate <50% / 50–79% /
  ≥80% / ≥90% / all pass) are unchanged word for word. Two things changed underneath them. First,
  what the number means: it used to be the *total* claims verified in a round, with re-verification
  spending out of the same budget, so new draws were `correctness_sample − (#fail + ⌈#pass/2⌉)` and
  hit zero at a ledger of `2 × correctness_sample − 1` claims — oikos froze at 23 of 335 candidates
  (7%) and no further round could move it. It is now the number of claims drawn *new* each round,
  and re-verification (all outstanding fail/stale, plus `floor(correctness_sample / 2)`
  least-recently-verified passes) is a separate budget on top, so cumulative coverage grows by
  `correctness_sample` per round without a ceiling. Second, the verified set's composition: it used
  to be dominated by re-verified passes as the ledger grew — claims already known to be correct —
  and is now always majority-fresh. **So pass rates before and after are computed over differently
  composed sets and are only loosely comparable**: an old score leans on re-checks of claims that
  already passed and therefore reads high, the more so the larger the ledger was at the time, while
  a new score is mostly unseen claims and is the harsher measurement. Treat a pre-change ★4 as no
  stronger than a post-change ★4, never the reverse, and re-read the cumulative coverage next to it
  — coverage trajectories across this change are not comparable at all, since the old one was
  approaching a ceiling that no longer exists. Also new: a corpus with `claims_total: 0` reports
  correctness as `n/a` (not measurable) instead of receiving a star. That is an added case, not a
  moved threshold — those repos previously had no applicable anchor and got whatever a given run
  decided (★3, ★3, ★1 and ★2 on four runs of one fixture), so their historical correctness scores
  are not meaningful values to compare against anything.
- **v1.3.0 — freshness git comparison excludes docgrad's own commits** (not an anchor change): the
  ★1–★5 thresholds are untouched, but the basis for computing mismatches changed — a backfill round
  no longer pollutes itself. When comparing freshness scores across v1.3.0, older scores may be
  depressed by false mismatches (38 of them measured on oikos round 2). Adds the advisory field
  `date_concentration`, report-only.
- **v1.1.0 — correctness sampling is now decided mechanically** (not an anchor change): the ★1–★5
  thresholds (pass rate <50% / 50–79% / ≥80% / ≥90% / all pass) are unchanged word for word; what
  changed is **which claims get sampled** — from the LLM picking freely each round to consuming the
  stable ordering in `inventory.claim_candidates`, re-verifying the existing ledger first. When
  comparing correctness scores across v1.1.0: the old scores' samples are not reproducible, the new
  ones are. The report also gains "cumulative coverage" (report-only, does not affect the rating).
- **v1.0.0 — added a sixth dimension, economy** (**breaking, the rubric's structure changed**):
  fixed cost and pollution surface were promoted from report-only to a rated dimension. A
  `history.jsonl` from the five-dimension era has no `economy` key, **overall scores are not
  comparable across v1.0.0**, and affected repos should restart their convergence rounds from a new
  baseline (old records are kept; `report` draws a breakpoint there). The ★1–★5 anchor text of the
  **five existing dimensions** is unchanged word for word — what is incomparable is "did it meet
  targets" and the set of dimensions, not the ruler of any individual dimension.
- **v0.5.0 — consistency judgement widened across carriers** (not an anchor change): the scope went
  from "within docs" to including placement and duplication between docs and code comments/specs.
  A repo previously at ★5 may be marked down because a code comment and a doc each expand the same
  fact. The ★1–★5 anchor text is untouched, but a report comparing consistency across v0.5.0 must
  note that the scope widened — the same class of change as 0.2.0 moving completeness onto a
  coverage-based mechanical basis.
- **0.2.0 — completeness moved onto coverage.mjs as its mechanical basis** (not an anchor change):
  it was previously a pure LLM comparison.
- **0.6.1 — fixed false positives in linkage broken anchors** (not an anchor change): once
  `githubSlug()` was aligned character for character with GitHub, CJK headings no longer produced
  approximation errors, and `cjk_uncertain` was demoted from an exception ("confirm by hand before
  counting it") to an advisory field; broken anchors always cost stars. Linkage scores from before
  0.6.1 may be depressed by false positives.
- **The graduation-only note on freshness ★5**: it only explains the reachability cap inside the
  loop (Blocker #3, do not touch CI). It changes none of the ★1–★5 thresholds and does not affect
  the comparability of historical scores.

</details>

# improve / loop — convergence rounds

> **Last updated:** 2026-09-17

`improve` = run one round and stop; `loop` = run repeatedly until a stop condition. The process is exactly the same.

## Preconditions (blockers)

1. No `.docgrad.yml` → stop, point to `/docgrad init`.
2. This round runs `judge.md` (i.e. `improve --judge` / `loop --judge`) and haven't read [rubric.md](rubric.md) yet →
   read it first. A round without `--judge` never rates against the rubric, so rubric.md is not required for it.
3. Target repo's working tree has uncommitted changes (not produced by docgrad) → stop, ask the user to deal with it before running.

## Branch discipline

- Always work on the `docgrad/converge` branch: doesn't exist → create it from the current branch; already exists → checkout and continue (resumable after interruption).
- Only commit docs changes and `.docgrad/` state files — "docs changes" = files covered by `.docgrad.yml`'s `docs_dirs`/`docs_files`/
  `entry_files`, **not source code files** (including their comments). **Never touch the target repo's CI config.**
- **`.docgrad/` belongs in version control, all of it.** It is not scratch space, it is this tool's state: `history.jsonl` is
  what the next round compares its `docgrad` fingerprints against, `ledger.jsonl` is the cumulative coverage that the
  sampling rule in [judge.md](judge.md) §3. Correctness (claim ledger) draws down, `scorecard-latest.md` is what `report`
  reprints, and `graduation/` holds deliverables the team copies into `.github/` by hand. Gitignore any of them and the
  feature that reads it silently stops working — a cloned repo restarts coverage at zero and never draws a comparability
  break, with no error to notice.
- Branch isolation lets the user review the whole batch before merging; one commit per round guarantees you can roll back.

## Steps in each round

1. **Score**: run [measure.md](measure.md) (the four scripts) every round. Run [judge.md](judge.md) only when this
   round was invoked with `--judge` (`improve --judge` / `loop --judge`) — judge stars are optional context for the
   report, never part of what a round selects, verifies or stops on (see [rubric.md](rubric.md) §Scoring principles:
   judge covers only the three LLM-judged dimensions, and this loop no longer reasons about any of them). When
   `.docgrad/ledger.jsonl` already exists, pass it to `inventory.mjs` as `--exclude-ledger .docgrad/ledger.jsonl` (#54,
   see [measure.md](measure.md) step 1) — otherwise every claim this loop has already verified keeps occupying a slot
   in the emitted candidate window, and round after round the window it draws from shrinks toward nothing even though
   `claims_total` hasn't moved. This only matters for a round that also runs `--judge`; it is harmless to pass either way.
2. **Working set**: the rows the four scripts' `measure` arrays report with `meets_target: false` — never a judge star
   (see [measure.md](measure.md) §Targets for `verdict` / `accept` / `meets_target`). Two kinds of row never enter it:
   - **`meets_target: null`** — not measured this round (a scoped run, `src_dirs` unset, an empty corpus, no key
     document with a date signal, …). Name these in the report with their `note`. How null rows count toward stopping is
     defined once, in [Stop conditions](#stop-conditions-loop-any-one-of-them-ends-it).
   - **A row whose only fix is outside docgrad's remit** — the fix needs CI, source code, or a product decision this
     tool cannot make on its own (see [Exit for findings outside docgrad's remit](#exit-for-findings-outside-docgrads-remit)
     below). This row is excluded from the working set — the loop never tries to fix it directly — but it **counts as
     not met** (see [Stop conditions](#stop-conditions-loop-any-one-of-them-ends-it)), and the report must say why.

   **Pick order**: every `FAIL` before any unaccepted `WATCH` (a `WATCH` row whose `accept` is `"WATCH"` already has
   `meets_target: true` and so is not in the working set at all). Within the same verdict, fixed tie-break order —
   `undocumented_dirs`, `drifted_dirs`, `date_coverage`, `key_doc_age`, `date_drift`, `index_present`,
   `dead_link_ratio`, `orphan_ratio`, `reachable_ratio`, `entry_cost`, `pollution` (this is the 1.x rubric tie-break
   order completeness → freshness → linkage → economy, with the judged dimensions removed). **A signal id not on this
   list** (a future `MEASURE_BANDS` row) is picked after every id that is, in `lib.mjs › MEASURE_BANDS` order — so
   adding a new signal never requires touching the list above to keep it pickable, only to give it a considered
   position (see [how-to.md](../../../docs/how-to.md) §Add a scoring dimension).

   **Fix only this one signal per round** — convergence is not a rewrite, and changing everything halfway leaves contradictions behind. There are two exceptions, and both must be stated in the report:

   - **The trivial-fix allowlist**: dead-link fixes and folding orphans into the index — **fixable on the side in any round**,
     just list them in the commit message. Reason: both categories have full mechanical verification (re-running the scripts tells you instantly), so there's no
     risk of "change it halfway and leave a contradiction" — the rule blocking them would just push a zero-risk fix to next round for no reason.
     (Typo-level consistency fixes are no longer on this allowlist: consistency is judge-only and the loop does not touch judge deductions at all — see step 3's boundary below.)
   - **Small-corpus mode**: when `inventory.totals.tokens_est` < 10,000 or `totals.files` < 5,
     multiple signals per round are allowed; note in the report "small-corpus mode: fixing N signals this round." Reason: dream-calm-true has only two
     documents, and one-signal-per-round there is pure round overhead — its own scorecard notes that "the two install methods could be unified,
     but fixing it would violate one-signal-per-round," pushing out a two-line, zero-risk fix for no reason.

   Neither exception exempts step 4's verification — it applies in full, exactly as step 4 states it.
3. **Fix**: generate and execute focused changes for the picked signal's deductions, one at a time:
   - Mechanical fixes go straight through: dead-link repair, folding orphans into the index, date backfilling — always use
     the real date from `git log -1 --format=%as -- <file>`, **fabricating a date is forbidden**.
   - Semantic fixes go through too, but must be listed in the commit message: merging redundant documents, rewriting a narrative to
     refer to the code instead, deleting files, writing missing documents.
   - **How to fix economy**: the only two mechanically viable paths are "move the entry file's content out and leave only a pointer" and "move WIP/
     historical baggage out of the corpus" (`exclude` or delete the file). The former is a move, not a cut — **the content must land inside `docs_dirs`
     and be reachable from the index**, otherwise the `undocumented_dirs` and `orphan_ratio` rows will worsen and the verification step will block it.
     **Deleting content that's still correct and still needed, just to lower the cost, is forbidden**; when "delete it" really is the only way left to bring the cost down,
     call it a plateau and hand the trade-off to the user — don't decide yourself which document to cut.
     If `entry_files`'s configuration itself is wrong (it lists a file that never enters the agent's context, or omits one that's required reading) → fix `.docgrad.yml`
     and say so explicitly in the commit message; this counts as a config fix, not score-farming. When a listed file is actually **conditionally** loaded,
     move it to `docs_files` instead (still in the corpus, doesn't count toward fixed cost) — **don't** just delete it, since deleting it would also move `undocumented_dirs`.
     - **Forbidden: raising economy by moving directories from `exclude` into `out_of_scope`.** Both fields take files out of
       the corpus, but only `exclude` is charged to the pollution surface, so re-labelling a directory drops the ratio — and
       possibly moves the `pollution` verdict off `WATCH` — **without one byte of documentation changing**. That is re-labelling, not improvement, and
       it is the one edit that turns `out_of_scope` into a switch for zeroing your own pollution surface. The field exists to
       let a *human* answer a question about their own repo at `init` time ("is this junk, or is it real documentation graded
       elsewhere?" — see [init.md](init.md) questionnaire item 5); it is not a lever for the loop. If a round genuinely
       believes a directory is misfiled, write it into the report as a recommendation for the user, and leave the config
       alone. The edit is visible either way: it moves `corpus_hash`, so `report` draws a comparability break across it.
   - **Never auto-edit outside docs scope.** Only files within docs scope are touched directly (entry file ↔ docs, docs ↔
     docs moves go ahead as normal). Suggestions to move information into code comments, other source files, or CI config
     are **never executed automatically** — that's outside the branch discipline of "only commit docs changes," and none
     of the four scripts verify code comments, so there'd be no way to confirm the change didn't break anything. Write
     these into the round's report as a "recommend human handling" list (alongside any judge deductions, when `--judge`
     ran — both lists land in the scorecard's "Suggested next steps", see [judge.md](judge.md) step 9) and note them; when a suggestion is outside docgrad's remit entirely rather than merely outside
     docs scope, it goes into `.docgrad/out-of-scope.jsonl` instead (see [Exit for findings outside docgrad's remit](#exit-for-findings-outside-docgrads-remit)).
4. **Verify**: rerun the four scripts and re-evaluate the affected rows. Success = the picked row's `verdict` improves
   (`FAIL`→`WATCH`/`OK`, or `WATCH`→`OK`), **or** its value moves toward its OK line without a verdict change being
   possible this round — report that case as partial. Failure/revert = **any** row gets worse, the picked row
   included: a `meets_target` that moves `true`→`false`, a `verdict` that worsens (`OK`→`WATCH`/`FAIL`,
   `WATCH`→`FAIL`), or — for the picked row — a value that moves away from its OK line even with no verdict change
   (`entry_cost` growing while still `FAIL`) → revert the change that caused it, and note it. **Judge stars, on a
   round that ran `--judge`, never gate verification** — a judge deduction rising or falling decides nothing about
   whether this round's fix stands; only the measure rows do.
   **Unchanged** — the picked row's verdict and value are both exactly as before, and no other row worsened → keep
   the change (it broke nothing), record the round as **no improvement**, and count it toward the plateau rule below.
   A picked row that moved away from its OK line is never this case; it is a revert.
5. **Record and commit**:
   - Append one line to `.docgrad/history.jsonl` (create it if it doesn't exist), in **schema 2**:

     ```json
     {"schema": 2, "round": 3, "date": "YYYY-MM-DD", "dimension": "<the measure id this round picked, with or without --judge>", "docgrad": {"version": "<copy from inventory.mjs docgrad block>", "measure_hash": "<copy from inventory.mjs docgrad block>", "judge_hash": "<copy from inventory.mjs docgrad block>", "corpus_hash": "<copy from inventory.mjs docgrad block>"}, "measure": {"dead_link_ratio": {"value": 0, "numerator": 0, "denominator": 176, "verdict": "OK", "accept": "OK", "meets_target": true}, "…": "one entry per `measure` item the four scripts printed this round"}, "judge": {"incomparable": true, "stars": {"<dimension rated this round>": 4}, "sample": {"claims_drawn": 8, "claims_total": 68}}, "coverage": {"claims_verified": 23, "claims_total": 68}, "notes": "…"}
     ```

     **`docgrad` is copied whole from `inventory.mjs`'s output `docgrad` block.** Do not rename, drop, or fill in keys
     yourself — if a key is missing from the output, that is a bug to report, not to paper over.

     **`measure`** has one entry per item of each of the four scripts' `measure` array: `value`, `verdict`, `accept`
     and `meets_target`, with `numerator` and `denominator` where the item carries them. A `null` `verdict` is recorded
     as `null`, and its `meets_target` is `null` too (see step 2 above).

     **`judge`** is present every round, `--judge` or not — the schema-2 shape must not depend on whether this round
     rated anything. **On a round without `--judge`, write `{"incomparable": true, "stars": {}, "sample": null}`** and
     `coverage` (the sibling key below) as `null`. **On a round with `--judge`**, `judge.stars` holds whatever
     judge.md step 9 rated this round, keyed by dimension — `completeness`, `correctness`, `consistency` — and
     `coverage` is populated exactly as it always was. A dimension judge reports **not measurable** (zero verifiable
     claims in the corpus — see [judge.md](judge.md) §3. Correctness (claim ledger)) is recorded as `null`, never as a
     number: `report` must render it as `n/a` and must not include it in any average; a guessed star would be
     indistinguishable from a measured one a few rounds later. `incomparable: true` is always present: judge stars are
     never averaged across rounds.

     **Write the whole `docgrad` object every round, even when nothing moved**: `report` can only spot a change by
     comparing a row with the previous valid schema-2 row, so a round that omits a field leaves the break undetectable. `corpus_hash` is `null`
     when the round ran without a config, and `version` can likewise be `null`.

     `measure_hash` (**added as `thresholds_hash` in v1.7.0, renamed in v2.0.0**; its inputs grew again later in 2.0.0) covers the three config values that move a judgement boundary without changing a word of
     `rubric.md` — `economy.entry_cost_tiers`, `economy.pollution_max` and `freshness.stale_after_days` — **plus the verdict band table
     (`lib.mjs › MEASURE_BANDS`) and `reference/measure.md`**. Two rounds whose
     `measure_hash` differs were **not measured by the same ruler**, however identical their `judge_hash` — what that
     move breaks in `report` is stated in SKILL.md's `report` row, not repeated here. One thing it cannot tell you:
     rounds recorded **before** v1.7.0 have no such field, so in a legacy row the round where a repo's custom
     `economy:` block went from inert to authoritative reads as "unknown → first value", not as a change. That
     transition is a real break and it is stated in the v1.7.0 CHANGELOG rather than detectable here.

     `judge_hash` (**added as `judgement_hash` in v1.8.0, renamed in v2.0.0**) covers the files that carry **the
     anchors and the rules for applying them** — `rubric.md` (the anchors themselves), `judge.md` (audit.md until
     v2.0.0 E2a) (the scoring procedure, the sampling rule, the boundary rules) and `placement.md` (what counts as a
     consistency deduction). (Until v2.0.0 E4b a separate `rubric_hash` covered rubric.md.) What that move breaks in
     `report` is likewise stated in SKILL.md's `report` row. Same blind spot
     as the others: rounds recorded **before** v1.8.0 have no such field, so in a legacy row its first appearance
     reads as "unknown → first value" rather than as a change — and in particular it does **not** retroactively mark
     v1.7.0's correctness break (#48), which is the break that motivated it.

     **In a legacy row (no `schema`), a missing field is read as unknown and draws no break.** For a schema-2 row, a
     missing `docgrad` field is instead a spec violation that `report` prints (see SKILL.md's `report` row) — it is
     never read as unknown.
   - Append the claims verified this round to `.docgrad/ledger.jsonl` (create it if it doesn't exist, and only when this round ran `--judge`). **Cumulative, append-only, never rewritten** —
     when re-verifying an old entry, append a new line (with the new `round`) rather than editing the old line, so you can still see when a given claim broke and when it got fixed:

     ```json
     {"claim_hash": "728d463bc0b4", "round": 3, "doc": "docs/x.md", "line": 75, "claim": "Routing is defined in src/router.ts", "verify": "Read src/router.ts", "result": "pass", "borderline": false, "verified_at": "2026-07-12"}
     {"claim_hash": "91ac07f2e5d1", "round": 3, "doc": "docs/y.md", "line": 29, "claim": "each group channel subscribes to INSERT / UPDATE / DELETE", "verify": "Read RealtimeProvider.tsx", "result": "fail", "borderline": true, "rationale": "the 11-row table below :29 has two rows (GroupBalance:107, OikosGroups:116) subscribing to UPDATE only; judged against every row per judge.md boundary rule 1", "verified_at": "2026-07-12"}
     ```

     **`claim_hash` is the key. Copy it from `inventory.claim_candidates`; never compute or invent one.** It is a
     12-hex-character digest of the claim's text with runs of whitespace collapsed and the ends trimmed — nothing else is
     normalised. So it is **stable when a claim moves** and **different when a claim is edited**, which is exactly the pair of
     properties the ledger needs: improve's own prescribed economy fix is "move the entry file's content out", and under the
     old `<path>:<line>` key every such move silently repointed a batch of ledger rows at other content — the next round
     re-verified the wrong line, recorded a false `fail`, and because failures are re-verified without a cap, that batch ate
     the following round's new-draw budget. A harmless tidy-up stopped coverage from growing.
     `doc` and `line` stay on the row as **locating aids** — they are still how a reader finds the text — but nothing keys on
     them, and a row whose `line` has gone stale is not a problem to fix.

     > **Migrating an existing ledger.** Rows written before this change carry `claim_id` and no `claim_hash`. Do not rewrite
     > them (the ledger is append-only) and do not re-draw those claims as if they were new — that would inflate cumulative
     > coverage. Back-compute the hash from the row's own `claim` field, which holds the claim text verbatim: collapse runs of
     > whitespace, trim the ends, take the first 12 hex characters of its SHA-256. That is the same function
     > `scripts/lib.mjs › claimHash()` applies, so a row whose text has not changed lands on the hash the current
     > `claim_candidates` reports, and the claim is recognised as already covered. A row whose text no longer matches any
     > candidate is a claim that was edited or deleted since — leave it in the ledger as history and let the new wording be
     > drawn as the new claim it is. Once migrated, write `claim_hash` on every new row and stop writing `claim_id`.

     > **`borderline` and `rationale` (added v1.7.0) are forward-only.** `borderline` is written on every row;
     > `rationale` is mandatory on every `fail` and every borderline `pass` (see [judge.md](judge.md) step 3 (boundary rules)). Rows written
     > before this version have neither, and are **not** to be back-filled — a rationale reconstructed now would be this
     > round's reasoning wearing an older round's date, which is worse than an honest gap. Treat a missing `borderline` as
     > unknown rather than as `false`: the borderline count for a pre-v1.7.0 round is not zero, it is unrecorded, and a
     > report comparing across the boundary has to say so.

     **Reading a pass-rate change.** A pass rate is `pass ÷ verified`, and both a documentation change and a verifier
     change move it. Before attributing a move to the documentation, compare the borderline counts on the two rounds: a
     drop from 8/8 to 7/9 alongside a rise from 0 to 3 borderline rows is at least as likely to be a stricter reading as
     a decay. Measured case: the identical claim over unmodified code was `pass` in round 9 and `fail` in round 12,
     because the two verifiers drew the generalisation-versus-list boundary differently — and nothing in the ledger or the
     scorecard recorded that this had happened. When the borderline counts differ materially, say so in the round's notes
     instead of reporting the delta as a documentation outcome. **This pass rate is report-only**: it never gates or
     stops `improve`/`loop`, which read `meets_target` on the four scripts' `measure` rows only (step 2 above) — an
     unstable verdict here is a finding for the report, not an input to the loop.
   - **Overwrite `.docgrad/scorecard-latest.md` every round, `--judge` or not.**
     - With `--judge`: the full scorecard text from [judge.md](judge.md) step 9, unchanged.
     - Without `--judge`: the same template minus its judged parts. Keep the `## Measure` block, the
       `## Token economy (report-only)` block (including its `### Traceability` subsection), the
       `## Outside docgrad's remit` block, and `## Suggested next steps` — limited to this round's unmet `measure` rows,
       since there are no judge deductions to add. In place of the `| Dimension | Rating | Main deductions |` table,
       print the literal line **"judge not run this round — no judged-dimension table"**. No star is ever written by a
       round that didn't run `--judge`.
   - **Before committing the scorecard, check `inventory.untracked.count`.** Non-zero means the pollution surface — and
     therefore the `pollution` / `entry_cost` verdicts — were measured against files that exist only on this machine, so the numbers you are about
     to commit are ones nobody else can reproduce (measured: ratio 0.1066 in a working checkout against 0.0517 in a clean
     worktree of the same commit, with the `pollution_max: 0.1` downgrade threshold between them). Either stash the
     untracked files and re-run, or set `exclude_untracked: true`, or commit as-is and **write the count and token total
     into the scorecard** so the next reader knows which numbers are checkout-bound. Do not commit it silently.
   - Commit. Write the message in the target repo's own language — the `language:` field in its
     `.docgrad.yml`, falling back to the language its recent commits are written in. The structure
     below is fixed; only the prose is translated:

     ```
     docs(docgrad): round N convergence — <signal> <old verdict>→<new verdict>

     Semantic changes:
     - merged a.md into b.md (overlapping topic)
     - …(omit this block when there are none)

     measure: dead_link_ratio OK, orphan_ratio WATCH, …(one entry per row not meeting target this round, or "all rows meet target")
     ledger: cumulative coverage m/N (a newly verified this round, b re-verified)   # omit this line entirely on a round without --judge
     ```

## Rows outside the working set

Two kinds of `measure` row never enter selection, for different reasons. Being outside the working set removes a row
from selection only (step 2 above); whether the loop stops is decided solely by
[Stop conditions](#stop-conditions-loop-any-one-of-them-ends-it) below.

- **`meets_target: null` rows.** Not measured this round: a scoped run, `src_dirs` unset, an empty corpus, no key
  document surviving the date-signal filter, and so on. Name each one in the report along with its `note`.
- **A row whose only fix is outside docgrad's remit.** The fix needs CI, source code, or a product decision this tool
  cannot make on its own (see [Exit for findings outside docgrad's remit](#exit-for-findings-outside-docgrads-remit)).
  Excluded from the working set — the loop never tries to fix it directly — and the report must say why; how it counts
  toward stopping is in the stop conditions below.

**This is not a "design ceiling."** That language belonged to two star anchors (freshness's and economy's top anchor)
that [rubric.md](rubric.md) retired along with the rest of the linkage/freshness/economy star anchors — there is no
longer a star for anything to be permanently capped below. Correctness's not-measurable case (zero verifiable claims) is
likewise no longer a rule this loop enforces: it is judge's own finding, reported only when a round runs `--judge`
(see [judge.md](judge.md) §3. Correctness (claim ledger)), and the loop never selects on a judge star in the first
place, so there is nothing for that finding to be excluded from here.

## Stop conditions (loop; any one of them ends it)

This section is the **only** definition of when `loop` stops; every other file links here instead of restating it.

- ✅ **Targets met**: at least one `measure` row has a non-null `meets_target`, and every such row reads `true`. A null
  row counts neither way; a row excluded as outside docgrad's remit always counts as unmet, so graduation is withheld
  while any such row remains. **If every row is null, targets are not met** — see "Nothing measured" → final report +
  graduation recommendation (see below).
- ⏸ **Nothing measured**: every `measure` row's `meets_target` is `null` → stop with a report that this round measured
  nothing (name each row's `note`); this is never "targets met" and never leads to graduation.
- ⏸ **Outside docgrad's remit**: the working set is otherwise empty, but some row is unmet only because its fix is
  outside docgrad's remit → **stop immediately**: run no round, commit nothing, write no history row. Emit this
  round's own "outside docgrad's remit" stop report naming every such row, and append each one to
  `.docgrad/out-of-scope.jsonl` (`kind` per the existing vocabulary — see [Exit for findings outside docgrad's remit](#exit-for-findings-outside-docgrads-remit) — skip an entry if an identical `status: "open"` one already exists). This is not a plateau: a plateau is defined only over a non-empty working set, and this working set is empty.
- ⏸ **Plateau, defined only over a non-empty working set**: two consecutive rounds where no working-set row improves at
  all (verdict, or value toward the OK line; a round step 4 records as **no improvement** counts) → a plateau report: which row is stuck on which deductions, and
  why docgrad can't fix it (e.g., needs domain knowledge to be written in, needs a human to decide a trade-off).
- ⏸ **Needs human decision**: two documents are mutually exclusive and the code can't arbitrate, or the fix involves a product decision → list the options
  (A/B, with each one's consequences and a recommendation), pause and wait for the user's decision before continuing.

`improve` just stops once its one round finishes, outputting this round's scorecard and a diff summary.

## Graduation (do it when targets are met, do not just recommend it)

**Why this section has a deliverable, and why that was not enough**: convergence without a gate decays naturally. On the
**very day** oikos graduated, a new orphan appeared (`utm-convention.md`) along with files missing `last_updated`, and
coverage went 95.1% → 90.7%. A prose-style "we recommend you build your own CI" has no deliverable, so nobody acts on it —
that reasoning was right, and producing the files was the right response to it.

**It did not work.** Measured on the same repo: the gate was produced at round 8 with `min_freshness_coverage: 0.93`
("round 8 is at 0.9348, the threshold may only go up"). Running that same file today prints
`✗ 新鮮度覆蓋率: 0.9（門檻 ≥ 0.93）`, and `.github/` contains no reference to it — it has never been executed since the day
it was written. The cause is not that the documentation got worse; it is that **the corpus grew**: round 9 pulled
`PRODUCT.md`/`DESIGN.md` in through `docs_files` and round 10 added two specs, so the denominator went 46 → 50 and the new
files carried no `last_updated`. A pinned ratio threshold **expires by itself when the corpus grows**, and growing the
corpus is something this tool actively encourages.

So the honest form of the argument is: **a deliverable is necessary, not sufficient.** It also needs something that reports
its state without being asked, because "the user will not go and do it" is the premise the whole section rests on — and that
premise does not stop applying the moment the file exists. Note which way each failure points. A prose recommendation nobody
follows leaves the team **knowing** they have no gatekeeper. A produced gate nobody runs leaves them **believing** they have
one, with a green promise in version control and a red answer in reality. The second is worse, which is why
[measure.md](measure.md) step 8b now evaluates a present gate's declared thresholds on every audit and report — without
executing it — and says so when it is red or when no workflow references it.

The same repo shows why the mechanical signal has to be fine-grained. `utm-convention.md` decayed in two ways at once: it
became an orphan, and it lost its date signal. **The orphan half got fixed** — a script reported it by name every round. **The
date-signal half is still missing today**, because it only ever appeared diluted inside `coverage_ratio`, one file among
fifty. Same document, two kinds of rot, two outcomes, and the difference was whether a round's output named it.

Blocker #3's "don't touch CI" means **don't automatically modify the user's CI**, not that you can't produce CI materials.

Do two things at graduation:

1. **Produce it, but don't install it**. Copy the two files from `$SKILL_DIR/templates/` into the target repo's
   `.docgrad/graduation/`, and tune `THRESHOLDS` to the repo's actual current state (the current values become the thresholds,
   so the gate is green from day one and can only be tightened afterward):

   ```bash
   mkdir -p .docgrad/graduation
   cp "$SKILL_DIR/templates/docs-gate.mjs" "$SKILL_DIR/templates/docs-gate.yml" .docgrad/graduation/
   cp "$SKILL_DIR/templates/graduation-README.md" .docgrad/graduation/README.md
   ```

   The README goes with them: it says how to run the gate, and that a ratio threshold expires on its own as the corpus
   grows. Fill in the actual threshold values and today's measurements where it asks for them — a README describing
   thresholds it does not name is the same failure one level up.

   **Never write into `.github/`**, and never modify any existing CI configuration.

   **Commit the two produced files** along with the round's other `.docgrad/` state. They are a deliverable, not a
   by-product: the team copies them into `.github/` by hand, and if they are not in version control the only way to get
   them back is to run another convergence round to graduation.

2. **Always attach this passage to the report** (fill in the actual path values):

   > `.docgrad/graduation/docs-gate.mjs` and `docs-gate.yml` have been produced, **not installed**.
   > To enable: put the `.mjs` in `.github/scripts/` and the `.yml` in `.github/workflows/`;
   > both already have their thresholds set to this repo's current state. The gate only blocks dead links/broken anchors/orphans/freshness coverage/
   > entry-file token budget — how strict to be is the team's call, docgrad doesn't decide that for you.
   >
   > Dead links and formatting can also be handled with more mature off-the-shelf tools instead (lychee or markdown-link-check, markdownlint,
   > Vale). docgrad's scripts add differentiated value in orphans/reachability and entry-file token budget — these two are
   > measurements specific to "documentation as agent context" that a typical docs linter doesn't do.

## Exit for findings outside docgrad's remit

docgrad doesn't touch code or CI, but the scoring process is bound to run into that stuff (oikos round 3 caught
`lib/supabase/server.ts`'s docstring going stale, and all it could do was write it into notes — two months later it was still sitting there).
Nothing tracks free-text notes, so every round was producing loose ends that never got picked up.

When a finding falls outside docgrad's remit, append one line to `.docgrad/out-of-scope.jsonl` (create it if it doesn't exist, append-only, never rewritten):

```json
{"round": 3, "kind": "code-comment", "path": "lib/supabase/server.ts", "line": 42, "claim": "the docstring still says 'without an Auth API round-trip', which stopped being true as of v1.0.2", "suggested_action": "fix the docstring; docgrad doesn't touch code", "status": "open"}
```

- `kind`: `code-comment`/`ci`/`product-decision`/`other`.
- If a later round confirms it's been handled → append the same entry but with `status: "resolved"`, don't edit the old line.
- **The final report must list every `status: open` item and its count**, not just leave it in that round's notes.
- If the user asks, you may open tickets one by one with `gh issue create` on their behalf — **only after explicit confirmation**.

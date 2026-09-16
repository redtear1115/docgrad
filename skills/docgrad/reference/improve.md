# improve / loop — convergence rounds

> **Last updated:** 2026-09-13

`improve` = run one round and stop; `loop` = run repeatedly until a stop condition. The process is exactly the same.

## Preconditions (blockers)

1. No `.docgrad.yml` → stop, point to `/docgrad init`.
2. Haven't read [rubric.md](rubric.md) yet → read it first.
3. Target repo's working tree has uncommitted changes (not produced by docgrad) → stop, ask the user to deal with it before running.

## Branch discipline

- Always work on the `docgrad/converge` branch: doesn't exist → create it from the current branch; already exists → checkout and continue (resumable after interruption).
- Only commit docs changes and `.docgrad/` state files — "docs changes" = files covered by `.docgrad.yml`'s `docs_dirs`/`docs_files`/
  `entry_files`, **not source code files** (including their comments). **Never touch the target repo's CI config.**
- **`.docgrad/` belongs in version control, all of it.** It is not scratch space, it is this tool's state: `history.jsonl` is
  what the next round compares its `rubric_hash`/`corpus_hash` against, `ledger.jsonl` is the cumulative coverage that the
  sampling rule in [judge.md](judge.md) §3. Correctness (claim ledger) draws down, `scorecard-latest.md` is what `report`
  reprints, and `graduation/` holds deliverables the team copies into `.github/` by hand. Gitignore any of them and the
  feature that reads it silently stops working — a cloned repo restarts coverage at zero and never draws a comparability
  break, with no error to notice.
- Branch isolation lets the user review the whole batch before merging; one commit per round guarantees you can roll back.

## Steps in each round

1. **Score**: run a full evaluation per [measure.md](measure.md) then [judge.md](judge.md) (scripts + LLM), producing this round's scorecard. When
   `.docgrad/ledger.jsonl` already exists, pass it to `inventory.mjs` as `--exclude-ledger .docgrad/ledger.jsonl` (#54, see
   [measure.md](measure.md) step 1) — otherwise every claim this loop has already verified keeps occupying a slot in the emitted
   candidate window, and the round after round it draws from shrinks toward nothing even though `claims_total` hasn't moved.
2. **Pick a dimension**: take the lowest-scoring dimension; on a tie → take whichever comes first in rubric order
   (completeness → correctness → freshness → linkage → consistency → economy).
   A dimension already judged to have hit its **design ceiling** (see stop conditions) is excluded from selection; take the next-lowest instead.
   **Fix only this one dimension per round** — convergence is not a rewrite, and changing everything halfway leaves contradictions behind. There are two exceptions, and both must be stated in the report:

   - **The trivial-fix allowlist**: dead-link fixes, folding orphans into the index, typo-level consistency — **fixable on the side in any round**,
     just list them in the commit message. Reason: these three categories have full mechanical verification (re-running the scripts tells you instantly), so there's no
     risk of "change it halfway and leave a contradiction" — the rule blocking them would just push a zero-risk fix to next round for no reason.
   - **Small-corpus mode**: when `inventory.totals.tokens_est` < 10,000 or `totals.files` < 5,
     multiple dimensions per round are allowed; note in the report "small-corpus mode: fixing N dimensions this round." Reason: dream-calm-true has only two
     documents, and one-dimension-per-round there is pure round overhead — its own scorecard notes that "the two install methods could be unified,
     but fixing it would violate one-dimension-per-round," pushing out a two-line, zero-risk fix for no reason.

   Neither exception exempts step 4's verification: if any dimension drops, revert regardless.
   When **consistency** is picked, break it down one level further: fix only one category of deduction per round, ordered `[Contradiction]` → `[Duplication]` → `[Placement]`
   (contradictions feed the agent wrong facts and do the most damage; duplication is a breeding ground for contradictions; placement is only about retrieval efficiency).
   Moving information's placement can touch code comments/specs, which is riskier than changing docs — it goes last, and that round must not also fix another category.
3. **Fix**: generate and execute focused changes for the dimension's deductions, one at a time:
   - Mechanical fixes go straight through: dead-link repair, folding orphans into the index, date backfilling — always use
     the real date from `git log -1 --format=%as -- <file>`, **fabricating a date is forbidden**.
   - Semantic fixes go through too, but must be listed in the commit message: merging redundant documents, rewriting a narrative to
     refer to the code instead, deleting files, writing missing documents.
   - **How to fix economy**: the only two mechanically viable paths are "move the entry file's content out and leave only a pointer" and "move WIP/
     historical baggage out of the corpus" (`exclude` or delete the file). The former is a move, not a cut — **the content must land inside `docs_dirs`
     and be reachable from the index**, otherwise completeness and linkage will drop together and the verification step will block it.
     **Deleting content that's still correct and still needed, just to lower the cost, is forbidden**; when "delete it" really is the only way left to bring the cost down,
     call it a plateau and hand the trade-off to the user — don't decide yourself which document to cut.
     If `entry_files`'s configuration itself is wrong (it lists a file that never enters the agent's context, or omits one that's required reading) → fix `.docgrad.yml`
     and say so explicitly in the commit message; this counts as a config fix, not score-farming. When a listed file is actually **conditionally** loaded,
     move it to `docs_files` instead (still in the corpus, doesn't count toward fixed cost) — **don't** just delete it, since deleting it would also drop completeness.
     - **Forbidden: raising economy by moving directories from `exclude` into `out_of_scope`.** Both fields take files out of
       the corpus, but only `exclude` is charged to the pollution surface, so re-labelling a directory drops the ratio — and
       possibly lifts the ★3 cap — **without one byte of documentation changing**. That is re-labelling, not improvement, and
       it is the one edit that turns `out_of_scope` into a switch for zeroing your own pollution surface. The field exists to
       let a *human* answer a question about their own repo at `init` time ("is this junk, or is it real documentation graded
       elsewhere?" — see [init.md](init.md) questionnaire item 5); it is not a lever for the loop. If a round genuinely
       believes a directory is misfiled, write it into the report as a recommendation for the user, and leave the config
       alone. The edit is visible either way: it moves `corpus_hash`, so `report` draws a comparability break across it.
   - **The boundary for placement fixes**: only touch files within docs scope (entry file ↔ docs, docs ↔ docs moves go ahead as normal).
     Suggestions to move information into code comments or other source files are **never executed automatically** — that's outside the branch discipline of
     "only commit docs changes," and none of the five scripts verify code comments, so there'd be no way to confirm the change didn't break anything.
     Write these deductions into this round's report as a "recommend human handling" list and note them; if consistency then goes two rounds with no progress because of this,
     call it a **design ceiling**, not a plateau.
4. **Verify**: rerun the scripts and re-score the affected dimensions. Success = the target dimension goes up and no other dimension drops.
   Any dimension dropping → revert the change that caused the drop, and note it.
5. **Record and commit**:
   - Append one line to `.docgrad/history.jsonl` (create it if it doesn't exist). `docgrad_version`, `rubric_hash`,
     `judge_hash`, `measure_hash` and `corpus_hash` **must be copied straight from `inventory.mjs`'s
     output `docgrad` block** (all five live there), don't fill them in yourself:

     ```json
     {"round": 3, "date": "2026-07-12", "dimension": "linkage", "docgrad_version": "1.1.0", "rubric_hash": "b6e4f7f3", "judge_hash": "c40cc974", "measure_hash": "ec596daf", "corpus_hash": "684034d6", "scores": {"completeness": 4, "correctness": 3, "freshness": 4, "linkage": 4, "consistency": 4, "economy": 4}, "coverage": {"claims_verified": 23, "claims_total": 68}, "notes": "fixed 12 dead links; folded 2 orphans into the index"}
     ```

     The five version fields are for `report` to draw comparability breakpoints: when `rubric_hash` changes it means the ruler changed,
     and the scores before and after can't be compared directly; when `corpus_hash` changes it means the set of files being measured
     changed (`docs_dirs`/`docs_files`/`entry_files`/`exclude`/`out_of_scope`/`index_file`/`exclude_untracked`), which moves `files_total`,
     `claims_total`, the freshness denominator and the pollution denominator at once — every dimension in that round is affected,
     not just one. **Write `corpus_hash` every round even when it hasn't moved**: `report` can only spot the change by comparing
     consecutive lines, so a round that omits it leaves the break undetectable. `corpus_hash` is `null` when the round ran without a
     config. Old records missing these fields are treated as unknown and don't block anything.

     `measure_hash` (**added as `thresholds_hash` in v1.7.0, renamed in v2.0.0** — same three values, same digest) covers the three config values that move a judgement boundary without changing a word of
     `rubric.md`: `economy.entry_cost_tiers`, `economy.pollution_max` and `freshness.stale_after_days`. Two rounds whose
     `measure_hash` differs were **not measured by the same ruler**, however identical their `rubric_hash` — so treat a move
     exactly like a `rubric_hash` move and draw the break. One thing it cannot tell you: rounds recorded **before** v1.7.0 have no
     such field, so the round where a repo's custom `economy:` block went from inert to authoritative reads as "unknown → first
     value", not as a change. That transition is a real break and it is stated in the v1.7.0 CHANGELOG rather than detectable
     here.

     `judge_hash` (**added as `judgement_hash` in v1.8.0, renamed in v2.0.0**) covers the files that carry **the rules for applying the anchors** — `judge.md` (audit.md until v2.0.0 E2a) (the
     scoring procedure, the sampling rule, the boundary rules) and `placement.md` (what counts as a consistency deduction).
     `rubric_hash` fingerprints the anchors themselves; this one fingerprints how they are applied, and the two move
     independently. Treat a move exactly like a `rubric_hash` move. Same blind spot as the others: rounds recorded **before**
     v1.8.0 have no such field, so its first appearance reads as "unknown → first value" rather than as a change — and in
     particular it does **not** retroactively mark v1.7.0's correctness break (#48), which is the break that motivated it.

     A dimension judged **not measurable** (see the design-ceiling section below — currently only correctness, when the corpus
     holds no verifiable claims) is recorded as `null`, never as a number. `report` must render it as `n/a` and must not
     include it in any average; a guessed star would be indistinguishable from a measured one a few rounds later.
   - Append the claims verified this round to `.docgrad/ledger.jsonl` (create it if it doesn't exist). **Cumulative, append-only, never rewritten** —
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
     > `rationale` is mandatory on every `fail` and every borderline `pass` (see [judge.md](judge.md) step 4). Rows written
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
     instead of reporting the delta as a documentation outcome; `loop` uses this dimension's pass rate to decide whether to
     keep working on it, so an unstable verdict makes the stopping point unstable too.
   - Overwrite `.docgrad/scorecard-latest.md` (the full scorecard text from judge.md step 9).
   - **Before committing the scorecard, check `inventory.untracked.count`.** Non-zero means the pollution surface — and
     therefore the economy rating — was measured against files that exist only on this machine, so the numbers you are about
     to commit are ones nobody else can reproduce (measured: ratio 0.1066 in a working checkout against 0.0517 in a clean
     worktree of the same commit, with the `pollution_max: 0.1` downgrade threshold between them). Either stash the
     untracked files and re-run, or set `exclude_untracked: true`, or commit as-is and **write the count and token total
     into the scorecard** so the next reader knows which numbers are checkout-bound. Do not commit it silently.
   - Commit. Write the message in the target repo's own language — the `language:` field in its
     `.docgrad.yml`, falling back to the language its recent commits are written in. The structure
     below is fixed; only the prose is translated:

     ```
     docs(docgrad): round N convergence — <dimension> ★x→★y

     Semantic changes:
     - merged a.md into b.md (overlapping topic)
     - …(omit this block when there are none)

     scorecard: completeness★x correctness★x freshness★x linkage★x consistency★x economy★x
     ledger: cumulative coverage m/N (a newly verified this round, b re-verified)
     ```

## Dimension cap: the design ceiling

When a dimension's next star anchor falls inside a Blocker no-go zone → that dimension is judged "converged within docgrad's scope (capped at ★x)": it's no longer eligible for dimension selection, it counts as targets-met when checking whether targets are met, and it gets called out with its reason in the final report and graduation recommendation. **This does not stop the loop** — it just removes that dimension from the working set.

There are currently three cases. The first two share a cause — both ★5 anchors require a mechanical
gate, and Blocker #3 explicitly says not to touch the target repo's CI — and both only get hit when
that dimension's target is set to 5, so the default target ★4 is unaffected:

- **Freshness ★5**: requires "a mechanical gate enforcing update-alongside-change in the same MR" → capped at ★4 within the loop.
- **Economy ★5**: requires "a mechanical gate enforcing the entry file's token budget" → capped at ★4 within the loop.

The third has a different cause but the same handling — the dimension cannot be *measured*, so there
is no star to raise:

- **Correctness, not measurable**: the round's verified set is empty because the corpus contains no
  verifiable claims at all (`claims_total: 0`, no ledger entries). Every correctness anchor is
  phrased as a pass rate, and a pass rate over zero claims is undefined, so the dimension is reported
  as `n/a (not measurable)` rather than rated — see [judge.md](judge.md) §3. Correctness (claim ledger).
  It counts as met for the targets check and leaves the working set, exactly like the two above.
  **Unlike them, this one is fixable — just not by the correctness dimension.** The report must say
  so: the corpus needs claims anchored to real code coordinates before correctness can be measured,
  which is work the completeness and placement dimensions own.

**The difference from plateau**: plateau = fixable, but these two rounds produced no gains, and there's still a chance on the next run; design ceiling = unreachable by design,
no number of further rounds will move it. Judging it as plateau would mislead the report into telling the user "try running a few more rounds," so check for the ceiling before checking for plateau.

## Stop conditions (loop; any one of them ends it)

- ✅ **Targets met**: every dimension is either "≥ the target in `.docgrad.yml`" or "already judged to have hit the design ceiling" → final report + graduation recommendation (see below).
- ⏸ **Plateau**: two consecutive rounds where no dimension's score improves at all (dimensions already at the ceiling don't count) → a plateau report: which dimension is stuck on which deductions, and
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

When a dimension is capped by the design ceiling, this section must call it out: the only way for that dimension to gain another star is through this gate
(freshness ★5 = "docs updated in the same MR as the code"; economy ★5 = "entry-file token budget"),
and it must state the current cap.

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

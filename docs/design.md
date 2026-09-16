# docgrad — design of a documentation audit and convergence skill

> **Status:** implemented (finalized 2026-07-12, v0.1.0 completed)
> **Last updated:** 2026-09-13

## Contents

- [Origin](#origin)
- [Positioning and boundaries](#positioning-and-boundaries)
- [Repo layout (same skeleton as impeccable)](#repo-layout-same-skeleton-as-impeccable)
- [Command surface](#command-surface)
- [`init` and `.docgrad.yml`](#init-and-docgradyml)
- [The six-dimension rubric (anchored in skills/docgrad/reference/rubric.md)](#the-six-dimension-rubric-anchored-in-skillsdocgradreferencerubricmd)
- [Conflict arbitration conventions](#conflict-arbitration-conventions)
- [How `loop` works (core requirement: install it and it runs until targets are met)](#how-loop-works-core-requirement-install-it-and-it-runs-until-targets-are-met)
- [Graduation (fixed closing section; artifacts produced, not installed)](#graduation-fixed-closing-section-artifacts-produced-not-installed)
- [Scripts contract](#scripts-contract)
- [Open questions (settled during implementation)](#open-questions-settled-during-implementation)
- [Attribution (full list in NOTICE.md)](#attribution-full-list-in-noticemd)

## Origin

Between 2026-07-10 and 07-11, two real documentation systems went through multiple rounds of scoring from an "agentic development" perspective (completeness / correctness / freshness / linkage / consistency / token economy), and one of them actually ran the full loop of "score -> improvement suggestions -> reorganize -> rescore and beat the previous score." This skill distills that hands-on methodology into a **generic, installable, iterative** tool: after installing it, run `init` on any repo to specify the doc folders and basic rules, then `loop` edits the docs round by round until every metric reaches its target star rating (default 4, can be lowered to 3 per dimension).

An ecosystem survey (2026-07-12) confirmed no existing skill covers this: the closest, `ln-21-documentation-auditor` (levnikolaevich/claude-code-skills, 515 stars), is solid on the correctness claim ledger and git-blame freshness but does not touch token economy or retrieval discipline; `agnix` (432 rules) only lints config files like CLAUDE.md/AGENTS.md and does not score the docs system as a whole. The gap = **token economy for the whole docs system, index/retrieval discipline, and downgrading prose rules to mechanical gates** — exactly this skill's differentiated value.

## Positioning and boundaries

- **What it scores**: the quality of a repo's documentation system as the **context source for AI agent development**. The corpus boundary is defined by three config fields: `docs_dirs` (directories, scanned recursively), `docs_files` (single files outside those directories, taken in as ordinary documents), and `entry_files` / `index_file` (entry and index, each with a special role); three more fields narrow it — `exclude` (out of the score, **charged** to the pollution surface: "this repo contains this and I'm not proud of it"), `out_of_scope` (out of the score, **not charged**, size reported on every run: "real documentation, just not what this run grades" — a translated mirror, a vendored handbook, a subproject with its own config), and `exclude_untracked` (drop everything git doesn't track, so a working checkout measures what a clean one would). The first two are the same operation on the corpus and opposite answers about the repo; a path matching both is charged, `exclude` wins. Root-level guidance files therefore fall into two buckets — **always-loaded ones go under `entry_files` (counted toward fixed cost), conditionally-loaded ones go under `docs_files` (not counted)** — see item 3 of the questionnaire in [skills/docgrad/reference/init.md](../skills/docgrad/reference/init.md) for the criterion and the cost of picking the wrong one.
- **What it doesn't score**: prose style (Vale's job), the quality of SKILL.md itself (agnix's/skill-audit's job), code quality (code review's job).
- **The line between information placement and code quality**: docgrad decides "which carrier should this piece of information live in, and is there a second authoritative copy" (rules in [skills/docgrad/reference/placement.md](../skills/docgrad/reference/placement.md)) — to do this it **does read** code comments, but it only judges placement and duplication, it **does not evaluate** whether a comment is well written or whether one should be added. The criterion is "is there a second authoritative copy / is the location right," not "is it well written"; without this boundary, the consistency dimension would slide into code review.
- **Generality**: zero repo assumptions. Structure (doc folders, index, entry files, freshness convention) is entirely detected by `init` and confirmed via questionnaire, then written to the config file; every subsequent round reads that config file.
- **Preconditions**: the documentation must be a **local markdown file tree**, and the target repo's root must be writable for `.docgrad.yml` (Blocker #1). git is not a hard requirement (the one exception is opt-in: `exclude_untracked: true` cannot tell tracked from untracked files without git, so the scripts abort instead of measuring a different corpus in silence) — without git, freshness degrades to claimed-only (when `skills/docgrad/scripts/freshness.mjs › gitDate()` can't get a value, it falls back to trusting only the document's self-declared date), coverage drift can't be measured, and `retrieval.mjs`'s `churn_commits` / `index_hotness` are both null but nothing crashes; everything else still runs. **Not supported**: remote doc sources like wiki/Confluence — the files aren't on a tree, all five scripts depend on local paths, and there is nowhere to put the config file either.
- **The rubric can be cited standalone**: the six-dimension anchors in `skills/docgrad/reference/rubric.md` don't themselves depend on the scripts, and can be taken standalone to manually score non-repo doc sources — but that's "borrowing the anchors," not the docgrad process: no mechanical signal, not reproducible, and it shouldn't land in the scorecard/history either.
- **The capability ceiling must be stated explicitly**: the star ratings blocked by the blocker no-go zone (currently: freshness ★5 requires a CI gate, and loop doesn't touch CI) are determined explicitly by the design ceiling rule in `improve.md`, not worked around ad hoc by whichever model is running that round — otherwise a report would misrepresent "unreachable by design" as "these two rounds didn't fix it."
- **User decisions (finalized 2026-07-12)**: released as an independent git repo (this repo); impeccable-style "init once, then converge incrementally"; five dimensions given star ratings plus token economy reported but not rated (**changed to six dimensions starting v1.0.0, with token economy's fixed cost and pollution surface promoted to rated dimensions**, see next section); loop commits every round and only stops when targets are met; scoring = a mix of built-in mechanical scripts and LLM judgment.

## Repo layout (same skeleton as impeccable)

```
docgrad/
├── .claude-plugin/
│   ├── plugin.json       # plugin manifest: version authority (semver, update notifications compare against this)
│   └── marketplace.json  # lets this repo be added directly as a marketplace
├── .codex-plugin/
│   └── plugin.json       # Codex packaging ("skills": "./skills/")
├── .agents/              # Codex / Antigravity workspace discovery
│   ├── plugins/marketplace.json
│   ├── skills/docgrad    # symlink -> ../../skills/docgrad
│   └── workflows/docgrad.md
├── plugin.json           # Antigravity manifest
├── skills/docgrad/       # the skill payload — everything an agent loads at runtime lives here
│   ├── SKILL.md          # routing: init · audit · improve · loop · report
│   ├── reference/
│   │   ├── init.md       # scan + questionnaire -> writes the target repo's .docgrad.yml
│   │   ├── rubric.md     # six-dimension star anchors (key to scoring stability, see below)
│   │   ├── audit.md      # single scoring pass flow: scripts -> LLM spot-check -> scorecard (incl. scoped audit)
│   │   ├── improve.md    # convergence round flow (shared by improve and loop)
│   │   └── placement.md  # information placement policy: rules for placement and duplication (consumed by the consistency dimension)
│   ├── scripts/
│   │   ├── lib.mjs       # shared module: YAML subset parser / config / walker / token / markdown parsing
│   │   ├── inventory.mjs # document inventory + CJK-aware token measurement + cost estimation input
│   │   ├── links.mjs     # dead links / anchors / orphans (transitive reachability from the index + entry files)
│   │   ├── freshness.mjs # date signal coverage + comparison against real git log dates (convention can take multiple values)
│   │   ├── coverage.mjs  # coverage drift: git time lag between code areas and the docs that mention them
│   │   └── retrieval.mjs # traceability + marginal cost: scenarios/areas/index_hotness (report-only)
│   └── templates/        # graduation deliverable templates: docs-gate.mjs / docs-gate.yml (produced, not installed)
├── tests/                # node --test: unit behavior of the scripts; fixtures/ are miniature target repos
├── evals/                # skill-level evals: reproducibility of star ratings / sampling coverage / false positives
│                         # (claude plugin eval; three cases + fixtures/ with three repos)
├── case-studies/         # records of real runs, each pinned to the docgrad version that produced it
├── docs/
│   ├── design.md         # this file
│   └── how-to.md         # common development tasks (add a dimension / change the rubric / extend lib)
├── .docgrad.yml          # this repo's own docgrad config (dogfooding)
├── .docgrad/             # dogfooding convergence state: history.jsonl (per-round scores + version fingerprint),
│                         # ledger.jsonl (accumulated claim verification records), scorecard-latest.md,
│                         # out-of-scope.jsonl (findings outside docgrad's remit), graduation/ (closing deliverables)
├── CHANGELOG.md          # per-version changes; version semantics in docs/how-to.md §Cut a release
├── NOTICE.md             # attribution (ln-21 claim-ledger, Diátaxis, HumanLayer, impeccable)
├── LICENSE               # MIT
└── README.md             # installation instructions (per platform)
```

**Why the payload sits two levels down** (v1.7.0, #47): `skills/<name>/SKILL.md` is what the
[Agent Skills specification](https://agentskills.io/specification) and the Skills CLI expect, and
`"skills": ["./"]` — plugin root *is* skill root — was a Claude-Code-only spelling. The packaging
files that stayed at the repo root are the per-platform manifests; the one thing that moves is the
payload. Note the consequence for `docgradMeta()`: the manifest it reads is no longer in the skill
root's own directory, so it searches upward, and the documented bare-clone install symlinks the
payload rather than copying it — a copy would leave `.claude-plugin/` behind and make `version`
silently `null`.

Skill name = skill directory name = `docgrad` (invoked as `/docgrad` once installed from a plugin marketplace, or symlinked into `~/.claude/skills/docgrad`). The SKILL.md frontmatter description is mainly in English plus Chinese keywords (trigger matching works in both languages); the body text and reference docs are in English (they were written in zh-TW first and translated for the international release; `README.zh-TW.md` keeps the Chinese landing page, and the target repo's own report language is set per repo by `.docgrad.yml`'s `language:`).

## Command surface

| Command | Description |
|---|---|
| `/docgrad init` | one-time setup: scan candidate structure -> questionnaire confirmation -> write `.docgrad.yml` into the target repo's version control |
| `/docgrad audit` | one full scoring pass, produces a scorecard report (does not change any file) |
| `/docgrad improve` | run one round of convergence (pick the lowest-scoring dimension -> fix -> rescore -> commit), stop when done |
| `/docgrad loop` | repeat improve until a stop condition (see below) |
| `/docgrad report` | just reprint the latest scorecard + the score trend across rounds |

With no arguments, print the command table (same as impeccable's routing rule 1). The authoritative definition of routing and blockers is in [skills/docgrad/SKILL.md](../skills/docgrad/SKILL.md); this table is a design summary.

## `init` and `.docgrad.yml`

`init` automatically scans: candidate docs directories (`docs/`, `doc/`, `documentation/`), always-loaded entry files (`CLAUDE.md`, `AGENTS.md`, `.cursorrules`, …), root-level single-file document candidates (`PRODUCT.md`, `DESIGN.md`, …), index file candidates (`docs/README.md`, `docs/index.md`), and directories that should be excluded (`archive/`, `node_modules/`, generated files, gitignored WIP). The scan results are confirmed item by item via a questionnaire, including target star ratings. It writes:

```yaml
# .docgrad.yml — docgrad config (checked into version control, shared by the team)
docs_dirs: [docs/]
docs_files: [PRODUCT.md]          # single files outside docs_dirs, taken in as ordinary documents (conditionally loaded, not counted toward fixed cost)
entry_files: [CLAUDE.md]          # always-loaded, counted toward fixed cost
index_file: docs/README.md        # reachability root for orphan detection
exclude: [docs/archive/]          # not scored, and charged to the pollution surface
out_of_scope: [docs/zh-CN/]       # not scored and NOT charged (graded as its own corpus); count/tokens_est reported every run
exclude_untracked: false          # default; true = collect only what git tracks, so a working checkout and a clean one measure the same corpus (needs git)
src_dirs: [src/]                  # code roots: coverage drift, retrieval, and the existence check that admits `foo()` as a verifiable claim
freshness:
  convention: frontmatter          # frontmatter | heading-line | none; comma-separated multiple values allowed (for repos mixing conventions)
  field: last_updated              # or the pattern of the "Last updated:" line
targets:                           # target star rating per dimension (loop stop condition)
  completeness: 4
  correctness: 4
  freshness: 4
  linkage: 4
  consistency: 4
correctness_sample: 8              # number of claims drawn new each round (re-verification is a separate budget, see skills/docgrad/reference/audit.md step 3)
claim_candidates_cap: 60           # how many ranked claim candidates inventory.mjs emits; coverage can only grow as far as this window, and claim_population reports when it is truncated
scenario: "add a typical new feature to <some module>"  # LLM simulation fallback when there are no scenarios
scenarios: [src/foo/bar.ts]        # used by retrieval.mjs to mechanically simulate marginal cost + traceability (report-only)
language: zh-TW                    # language for reports and commits
```

The example above is **illustrative**; each field's default value is authoritative in `skills/docgrad/scripts/lib.mjs › DEFAULTS` (not repeated here, to avoid drift).

When a repo has no `.docgrad.yml`, `audit`/`improve`/`loop` always redirect to `init` first (the same blocker pattern as impeccable's "teach first when PRODUCT.md is missing").

## The six-dimension rubric (anchored in skills/docgrad/reference/rubric.md)

Scores need to be comparable across rounds, so the anchors must be fixed. The ★1–★5 anchors for each dimension were distilled from hands-on scoring; the frozen text is in [skills/docgrad/reference/rubric.md](../skills/docgrad/reference/rubric.md), this table is only a summary:

| Dimension | ★3 (passing) anchor | ★5 anchor | Measurement |
|---|---|---|---|
| **completeness** | every core area has an authoritative document; deployment/testing at least has inline narrative | full coverage of areas + runbook + onboarding path + retirement mechanism clearly marked "do not use for new features" | coverage.mjs coverage drift (undocumented/drifted areas) + LLM cross-checks against the repo's actual module list |
| **correctness** | ≥80% of sampled claims pass; errors are in details, not mechanisms | all sampled claims pass + dead code/retired mechanisms are marked + authoritative lists refer-to-code instead of restating | claim ledger: sample N concrete claims (paths/symbols/state machines/routes) and verify each against code |
| **freshness** | there's a date-signal convention but it relies on discipline; staleness of key documents ≤60 days | full date-signal coverage + "update in the same MR as the change" enforced by a mechanical gate + lifecycle management (superseded docs are handled promptly) | freshness.mjs: signal coverage ratio + real git log dates vs. claimed dates |
| **linkage** | relative-link failure rate ≤2%; there's an index but it's not the sole entry point | full validation shows zero dead links + a single top-level index with full transitive reachability (zero orphans) + anchors use `path › symbol()` to resist line-number drift | links.mjs full mechanical validation |
| **consistency** | ≤2 places of overlap on the same topic, and no contradictions | one authoritative copy per topic (the rest are summary + link) + conflicts have an arbitration convention (newer wins + arbitrated against code) | LLM: pick key factual claims and triangulate across documents + against code |
| **economy** | fixed cost ≤10,000 tokens | fixed cost ≤3,000 + pollution surface <10% + entry-file token budget enforced by a mechanical gate | `entry_cost.tokens_est` and `pollution.ratio` from inventory.mjs, fully mechanical |

**Why economy is a dimension and not just a report** (v1.0.0, issue #11): completeness rewards coverage, economy penalizes cost — the two point in opposite directions. When it was report-only and not rated, every legal move for loop each round was "add more documentation," and nothing pushed content that wasn't worth its tokens out of the entry files — external evidence (comparisons across multiple coding agents on SWE-Bench Lite and AgentBench) shows that longer context files raise cost without necessarily raising success rate. Adding a dimension = a rubric structure change = major, and all repos' historical scores have to restart from baseline — that cost was paid knowingly (contrast with the 0.5.0 decision to expand the scope of consistency while **deliberately not** adding a sixth dimension: that change was to the judged scope of an existing dimension, this one changes the reward direction itself).

**Token economy report**: (1) fixed cost = token count of entry_files (**rated**); (2) marginal cost = mechanically computed from `scenarios`, or the token total of the must-read path simulated by an LLM per `scenario` (report-only); (3) pollution surface = the share of the corpus taken up by **`exclude`d** directories and WIP (**rated**) — `out_of_scope` content is removed from the corpus without being charged here, and its size is reported alongside on every run so the field cannot be used to launder the ratio (see [skills/docgrad/reference/rubric.md](../skills/docgrad/reference/rubric.md) §Economy). CJK-aware estimation (Chinese token/byte density differs from English; inventory.mjs has a built-in coefficient). The report includes a "break-even" interpretation (the trade-off in task mix between fixed and marginal cost).

## Conflict arbitration conventions

When the same fact appears in multiple documents, the following rules decide which one is authoritative (dogfooding consistency ★5, "one authority per topic + explicit arbitration"):

1. **doc vs code**: code is always authoritative; when docs disagree with code, fix the docs to align with code (see the claim ledger in [skills/docgrad/reference/audit.md](../skills/docgrad/reference/audit.md)).
2. **doc vs doc**: newer wins — whichever file has the more recent `> **Last updated:**` is authoritative; the older location is rewritten as "summary + link" pointing to the authority, with no two full copies left standing.
3. **Cannot be arbitrated** (two documents are mutually exclusive and code is irrelevant): don't guess — this goes to loop's "needs human decision" stop condition (see [skills/docgrad/reference/improve.md](../skills/docgrad/reference/improve.md)).

One authority per topic: every key fact is spelled out in exactly one place, the rest keep only a summary + link — the command table is authoritative in [skills/docgrad/SKILL.md](../skills/docgrad/SKILL.md), the rubric anchors are authoritative in [skills/docgrad/reference/rubric.md](../skills/docgrad/reference/rubric.md), and the code contract is authoritative in `skills/docgrad/scripts/`.

## How `loop` works (core requirement: install it and it runs until targets are met)

The authoritative operating procedure is in [skills/docgrad/reference/improve.md](../skills/docgrad/reference/improve.md); this section is a design explanation. Each round (= one run of `improve`):

1. Run the five scripts + LLM-judged dimensions -> scorecard.
2. Pick the **lowest-scoring dimension** (ties go to whichever comes first in the rubric table order), and generate a batch of focused fixes from that dimension's deduction points (each round fixes only one dimension, to avoid half-finished changes across everything that leave contradictions — convergence is not a rewrite).
3. Mechanical fixes (dead links, date backfill using the real date from `git log -1 --format=%as` rather than making one up, adding orphans into the index) are done directly; semantic changes (merging redundant documents, rewriting narrative into refer-to-code, deleting files) are also done, but are explicitly listed in the commit message.
4. Rerun the measurements to confirm that dimension's score went up and no other dimension went down.
5. Commit on a dedicated branch (`docgrad/converge`), with the commit message including a summary of this round's scorecard; state is written to `.docgrad/` (one line appended to history, and ledger accumulates by appending).

**`.docgrad/` is version-controlled, deliberately.** It holds state, not scratch: `history.jsonl` is the baseline the next
round compares its `rubric_hash`/`corpus_hash` against, `ledger.jsonl` is the cumulative coverage the sampling rule draws
down, `scorecard-latest.md` is what `report` reprints, and `graduation/` holds the CI deliverables the team copies into
`.github/` by hand. Gitignoring any of them disables the feature that reads it, silently — a fresh clone would restart
coverage at zero and never draw a comparability break, with nothing to indicate why. The one discipline it requires is
stated in [improve.md](../skills/docgrad/reference/improve.md) §Steps in each round: do not commit a scorecard measured against untracked
local files without saying so, because the pollution surface and the economy rating it feeds are checkout-bound.

**Why scores need to be reproducible (v1.1.0, issue #12)**: in the 2026-07-13 oikos production run, re-verifying consistency the same day after closing out dropped it from ★4 to ★2 — not because the ruler changed, but because **sampling wasn't constrained**: four rounds of sampling never hit the one balance sign that was the opposite of what the code said. The fix is not to write the anchors in more detail (finer anchors still can't control "which items get sampled"), but to take sampling itself back out of the LLM's hands: the population and draw order are mechanically produced by `inventory.mjs` (stable ordering), verification results accumulate in `.docgrad/ledger.jsonl`, and the next round re-verifies old entries before sampling new ones. The report gives both the pass rate and the cumulative coverage rate — **a star rating alone doesn't reveal how large a sample it's built on**. This matches Anthropic's skill-authoring principle: operations that must be consistent should have their degrees of freedom reduced, not get more explanatory text.

**Stop conditions** (stops as soon as any one holds):
- ✅ All dimensions ≥ the `.docgrad.yml` targets -> closing report + graduation recommendation.
- ⏸ Two consecutive rounds with no improvement in any dimension's score -> plateau report (explains where it's stuck and why the skill can't fix it further).
- ⏸ Hitting a semantic contradiction that needs human decision (two documents mutually exclusive and code can't arbitrate, or the fix involves a product decision) -> lists the arbitration options and pauses.

Branch isolation lets the user review everything in a batch before merging; committing every round guarantees the work can be resumed after interruption and can be rolled back.

## Graduation (fixed closing section; artifacts produced, not installed)

Once targets are met, it recommends distilling the mechanizable rules into the repo's own CI gate (dead links / orphans / freshness / entry-file budget — `docs-gate.mjs`'s CI mode), and explains that docgrad's five scripts can be adapted and moved over directly. docgrad only scores and edits content, it **never touches the target repo's CI configuration**.

## Scripts contract

All five are zero-dependency Node (>=18) scripts that read `.docgrad.yml`, output JSON to stdout (for the LLM to consume), and send errors to stderr with a non-zero exit code. Shared flags are parsed in one place, `skills/docgrad/scripts/lib.mjs › parseArgs()`: `--root` (target repo root), `--config` (config file located elsewhere — used when the doc source itself can't hold a file), `--include` (the scope glob for a scoped audit), `--exclude-ledger` (path to `.docgrad/ledger.jsonl`, #54 — only `inventory.mjs` acts on it; the other four accept and ignore it, reporting the no-op in their own output the way they already do for an ignored `--include`), `--locate-ledger` (path to a claim ledger, #63 — again only `inventory.mjs` acts on it; it reports where each ledgered claim sits in **this round's** corpus, which nothing else can answer once `--exclude-ledger` has filtered those same claims out of the emitted window). The two ledger flags are independent and may name different files. **All five outputs open the same way: `scope`, then a `docgrad: {version, rubric_hash, judge_hash, measure_hash, corpus_hash}` block** (`skills/docgrad/scripts/lib.mjs › docgradMeta()`) — one round's five JSON files therefore carry the same fingerprint, and a report can tell whether they were produced by the same ruler (`rubric_hash` = the shipped anchors, `judge_hash` = the rules for applying them, `measure_hash` = the config values that move a boundary without touching either) over the same corpus, without trusting that they were run together. The JSON shapes below are **illustrative summaries**; the full set of fields is authoritative in the actual script output (not repeated in full here, to avoid drifting from `skills/docgrad/scripts/`):

- `inventory.mjs` → `{scope, docgrad, files: [{path, bytes, tokens_est, type, claims, structure: {h2, rules}, docgrad_authored}], totals: {…, claims_total, claims_api_only, claims_docgrad_authored, claims_docgrad_authored_ratio, rules_total, rules_anchored_ratio}, claim_population: {api_matching, src_symbols, src_files_scanned, authorship, cap, emitted, population, truncated, exclude_ledger?, notes}, claim_candidates: [{path, line, text, claim_hash, refs, refs_path, refs_api, section, section_lines, docgrad_authored}], locate_ledger?, entry_cost, pollution: {excluded_files, excluded_tokens, ratio, note?}, out_of_scope: {count, tokens_est, files, note?}, untracked: {count, tokens_est, files, note?}}`
  - `corpus_hash` fingerprints the corpus scope — `docs_dirs`/`docs_files`/`entry_files`/`exclude`/`index_file`/`exclude_untracked`, plus `out_of_scope` **only when it is non-empty** so an unused field draws no false break — normalized so reordering doesn't move it, and `null` with no config.
  - `claim_population` says how the correctness sampling population was obtained and what degraded: `api_matching: "disabled"` means `src_dirs` is unset, so API-shaped inline code contributed nothing (on a library repo that alone can leave `claims_total` at 0); `authorship: "unavailable"` means git could not say who added each document, so `docgrad_authored` is `null` rather than `false`.
  - `claim_candidates` is the first `claim_candidates_cap` entries of the ranked population (default 60), not all of it — emitting hundreds of claim texts would charge the reader exactly what the economy dimension measures. Because the claim ledger can only draw from what is emitted, the window is stated rather than implied: `cap`, `emitted`, `population` (the same number as `totals.claims_total`) and `truncated` say whether this is the whole ordered population or a view onto it, and a `truncated: true` run carries a note naming the remedy (raise `claim_candidates_cap`). Without `--exclude-ledger` (#54), the window is a prefix of one stable order, so raising the cap appends and never reorders; with `--exclude-ledger <path>` passed, candidates already in that ledger are filtered out **before** the cap is applied (`claim_population.exclude_ledger` reports how many), so the window is instead a prefix of the *filtered* order, which shifts as the ledger grows — see [rubric.md](../skills/docgrad/reference/rubric.md) §Correctness. It is deliberately **not** in `corpus_hash` — it selects no files and moves no denominator, so a change to it is not a corpus break; see [rubric.md](../skills/docgrad/reference/rubric.md) §Version history.
  - `locate_ledger` appears **only** when `--locate-ledger` was passed (#63): `{path, lines, distinct, located, not_located, multi_position, entries: [{claim_hash, located, positions: [{path, line, section_lines}], ledger_doc?}], note}`. It answers "where are my already-ledgered claims now", which no other output can, because `improve.md` mandates `--exclude-ledger` on every round that has a ledger and that filters those claims out **before** the cap. Three properties it is relied on for: it reads the **unfiltered** population, so passing both flags together never hides a position; it is uncapped, because `claim_candidates_cap` governs the emitted window and not this; and a ledgered claim with no current position is emitted with `located: false` rather than dropped — a claim whose text was edited has no position by construction, and omitting it would read as "nothing here", the one reading a caller must never be given. `lines` is the ledger's **non-empty** row count (blank lines are skipped, exactly as `--exclude-ledger` skips them) and `distinct` the number of distinct `claim_hash` values; a ledger is append-only and re-verification appends a row for a hash already present, so the two differ on every real ledger, and `located + not_located === distinct`. A hash may hold **several** positions at once (the hash is content-derived, so one claim sentence in two documents is one hash in two places — a duplication finding, not an error); every position is listed. `ledger_doc` echoes the row's own `doc` field as a locating aid and is never trusted (when several rows carry the same hash — the normal shape of an append-only ledger — the **first** row's `doc` is the one echoed): positions are recomputed from this round's scan, so a stale or tampered `doc`/`line` cannot move where a claim is reported.
  - `claim_hash` is the claim ledger's key (12 hex chars over the claim text with whitespace collapsed); `path`/`line` remain locating aids. `out_of_scope` is emitted on **every** run, empty included — that is the anti-abuse property, not decoration.
  - `untracked` is the collected files git doesn't track, all three fields `null` plus a `note` when git is unavailable, and `pollution.note` appears whenever any collected file is untracked, because the ratio is then checkout-bound.
- `links.mjs` → `{scope, docgrad, dead_links: [], out_of_root_links: [], bad_anchors: [], orphans, reachable_ratio}` (reachability is computed transitively starting from `index_file` + `entry_files` — entry files are always-loaded, so by definition they're reachable). **`orphans` and `reachable_ratio` are both `null` whenever reachability was not computed** — when `--include` restricts the scope, or when no `index_file` is configured — because reachability is a whole-corpus concept. `null` means "not computed" and must never be read as "none found". **`out_of_root_links` is a link target that resolves outside the repository root** — it is counted in `total_links`, is never fatal, and is deliberately *not* a dead link: its existence is never looked up, because doing so would report on a file outside the repo being graded.
- `freshness.mjs` → `{scope, docgrad, convention, coverage_ratio, stale: [{path, claimed, actual_git, age_days}], mismatches}` (`convention` is the list of conventions actually in use; with multiple values, date extraction is tried in order)
- `coverage.mjs` → `{scope, docgrad, src_dirs, thresholds, loose_files, areas: [{area, code_files, last_code_commit, mentioned_by, last_doc_commit, commits_since_doc, drift_days, status}], undocumented, drifted}` (coverage drift: the git time lag between a code area and the docs that mention it)
- `retrieval.mjs` → `{scope, docgrad, scenarios: [{path, churn_commits, docs: [{doc, hits, tokens_est, depth_from_index}], fan_in, marginal_tokens, max_depth, code_pointer}], areas: [{area, code_pointer, fan_in}], code_pointer_ratio, index_hotness: {index_file, entry_files, median_commits_90d, ratio, top5} | null}` (report-only: traceability + marginal cost, doesn't take `--include`, same reason as `coverage.mjs`)

## Open questions (settled during implementation)

- ~~approximation error of the anchor-slug algorithm on CJK headings~~ **resolved in 0.6.1**: aligned with github-slugger (spaces become dashes one by one, underscores within words are taken literally, explicit `<a id>`/`<a name>` are included in the slug set).
- ~~Sampling strategy for `correctness_sample`: pure random vs. weighted (prioritize sampling paragraphs that "claim specific symbols/paths")~~ **resolved**: weighted, and mechanically so. The population is every non-heading line outside a fence carrying a code coordinate — path-shaped inline code, or API-shaped inline code whose every segment exists as an identifier under `src_dirs` — and the draw order is `claim_candidates`, sorted by reference count first, so the most specific claims are sampled first. The LLM picks nothing.

## Attribution (full list in NOTICE.md)

The claim-ledger correctness sampling approach draws on ln-21-documentation-auditor; document typology references Diátaxis; the entry-file token economy perspective references HumanLayer's "Writing a Good CLAUDE.md"; the six-dimension star rating and loop methodology come from hands-on scoring of two real documentation systems on 2026-07-10/11.

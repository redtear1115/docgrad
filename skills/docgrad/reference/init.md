# init — one-time setup

> **Last updated:** 2026-09-17

Purpose: scan the target repo → confirm via questionnaire → write `.docgrad.yml` into the target repo's root (under version control, shared by the team).
When `.docgrad.yml` already exists, rerunning init = rescan, using the existing config as the questionnaire's defaults.

## 1. Scan (finish the whole scan, then ask once)

| Item | Detection method | Candidates |
|---|---|---|
| docs directory | Glob top-level directories | `docs/`, `doc/`, `documentation/`; other top-level directories containing >=3 .md files |
| entry file (always-loaded) | Glob root and .github/ | `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.cursorrules`, `.github/copilot-instructions.md` |
| single-file document (conditionally loaded) | Glob root's .md files, minus entry file/index file candidates | `PRODUCT.md`, `DESIGN.md`, `ARCHITECTURE.md`, `CONTRIBUTING.md` |
| index file | inside the docs directory | `README.md`, `index.md`, `TOC.md` |
| excluded directories | name patterns + .gitignore | `archive/`, `deprecated/`, `generated` markers, gitignored WIP directories |
| out-of-scope directories | translated mirrors, vendored trees, nested configs | `docs/zh-CN/`, `docs/ja/`, vendored handbooks, any subtree carrying its own `.docgrad.yml` |
| src directory | Glob top-level directories | `src/`, `lib/`, `app/`, `packages/`; other top-level directories containing code |
| freshness convention | sample 5 docs files, check the header | frontmatter date field / a "Last updated:"-style line / none |

## 2. Questionnaire (AskUserQuestion, each item pre-filled with the scan result)

1. `docs_dirs` (multi-select, pre-filled with scan candidates)
2. `entry_files` (multi-select) — the criterion is "**loaded automatically by the agent on every task**," not "important."
   A human-facing GitHub landing page (typically the root `README.md`) should **not** be listed unless it is also an agent entry point:
   since v2.0.0, fixed cost carries a measure verdict (`entry_cost`; in 1.x it was star-rated), so listing one extra is a tax paid for nothing, and omitting a must-read file underreports it.
   When it is also the index, just put it in `index_file` — no need to duplicate it in both places.
3. `docs_files` (multi-select) — a **single markdown file outside `docs_dirs`**, included in the corpus as a **regular document**
   (`type: 'doc'`, not counted toward fixed cost). Typically the repo root's `PRODUCT.md`/`DESIGN.md`.
   - **The difference from `entry_files` is "when it loads," not "how important it is"**: loaded automatically on every task →
     `entry_files`; read only when doing a certain kind of work (the entry file says "read `DESIGN.md` before touching the UI") →
     `docs_files`. Listing one document in both places is pointless — `entry_files` wins and counts toward fixed cost.
   - **Getting this wrong has an asymmetric cost.** Stuffing a conditional document into `entry_files` inflates fixed cost for
     nothing (measured on oikos: 9,037 → 21,474 tokens, crossing the first `economy.entry_cost_tiers` threshold — 20,000 at the shipped
     defaults — and dropping economy from ★3 to ★1 (1.x)), and [measure.md](measure.md) step 7 will find `entry_cost.files` doesn't match reality and **report a
     separate** deduction. The reverse (putting a truly always-loaded file into `docs_files`) underreports fixed cost, which is
     equally false.
   - **Files only**: listing a directory is a **hard error** — every script that reaches corpus collection exits 1 with
     `docs_files may only list a single file, but <path> is a directory — put the whole directory in docs_dirs instead`.
     A nonexistent file is a different case and *is* silently skipped. (`coverage.mjs` with `src_dirs` unset is the one
     exception, and not a real one: it returns its "cannot measure" note and exits 0 before it ever collects the corpus, so
     it never reads the bad field. Set `src_dirs` and it fails like the rest.) Files already scanned under `docs_dirs` don't need
     to be listed again (duplicates count once anyway).
   - **Not a reachability root**: it is subject to orphan detection like a regular document — some document must link to it, or
     linkage will log an orphan. This is deliberate — if a conditional document can't be reached by a link, the agent can only
     find it by guessing.
4. `index_file` (single-select; no candidate → set to `null` and note: `index_present` will be FAIL for lack of a reachability root;
   improve's first round can build an index for you)
5. `exclude` / `out_of_scope` — **ask this as one question with two answers, because the wrong half is the single most
   expensive misfiling this questionnaire can produce.** For each candidate directory, the question is *not* "do you want it
   scored". Both fields take it out of the scored corpus. The question is:

   > **Is this content you would rather nobody read — or content that is perfectly fine, just graded somewhere else?**

   | Answer | Field | Pollution surface |
   |---|---|---|
   | "It's in the repo and I'm not proud of it" — WIP drafts, `archive/`, `deprecated/`, generated dumps | `exclude` | **charged** |
   | "It's real documentation, it just isn't what this run grades" — a translated mirror rated as its own corpus, a vendored handbook, a subproject with its own `.docgrad.yml` | `out_of_scope` | **not charged** |

   Getting it wrong in the second direction is what broke `tj/commander.js`: the owner scoped out `docs/zh-CN/` because the
   translations are graded as a separate corpus, the only field that existed was `exclude`, and docgrad charged **40.6%**
   pollution and capped economy at ★3 (1.x) while the fixed cost was a perfect 0 (see
   [case-studies/01-commander-js.md](../../../case-studies/01-commander-js.md) finding 1). Nothing in the docs was wrong; the field
   was.

   Two properties to state when asking, so `out_of_scope` is not mistaken for a free pass:
   - Its `count` and `tokens_est` are printed on **every** run, empty or not, right beside the pollution line. You may move
     anything you like out of the surface; how much you moved is on the same page, in the same units.
   - A path listed in **both** fields is charged — `exclude` wins, and `inventory.out_of_scope.note` names the overlapping
     paths. A broad `out_of_scope` entry can never silently cancel an `exclude` someone already wrote.

   `out_of_scope` joins `corpus_hash` only when it is non-empty, so a config that never uses the field hashes exactly as it
   did before and draws no false comparability break.

   Note separately what `exclude` means for files git doesn't track: a local draft sitting inside an excluded directory (a
   gitignored WIP folder is the usual case) is still collected off the filesystem and still counts toward the pollution
   surface, so a teammate on a clean checkout of the same commit measures a different ratio. `exclude_untracked: true` (next
   item) is the only way to keep it out.
6. `exclude_untracked` (yes/no; **default `false` = today's behavior**, every file on disk is collected whether git tracks it or
   not). Set it to `true` when the team wants CI and everyone's laptop to rate the same commit identically: the corpus then
   matches a clean checkout, and local drafts stop moving `pollution.ratio` and the token totals.
   **Requires git** — with `true` set, the scripts abort when the target isn't a git working tree, rather than silently
   measuring something else. Leave it `false` for an export directory or any tree that isn't under git.
   The flag is part of `corpus_hash`, so flipping it draws a comparability break in `report` (see [rubric.md](rubric.md)
   §Version history and comparability notes) — a deliberate one-off, not something to toggle back and forth between rounds.
7. freshness `convention` (frontmatter / heading-line / none; multi-select — when a repo mixes both conventions, select more than
   one and write them comma-separated) + `field` (for frontmatter) / `heading_field` (for heading-line; can be left blank when
   only one convention is chosen and it's already described by `field` — the scripts fall back to `field`). Both take a single
   keyword or a YAML **inline** list (`heading_field: ["Last updated:", "Updated:"]`; a block list is not supported under
   `freshness:`) when the corpus grew under more than one date-line habit. The entries should name the *same* signal — "when
   was this document last updated" — under different spellings; a field that means something else (a session date, an
   evidence cutoff) makes the corpus look fresher than it is. Keywords are matched verbatim (no trimming), a plain string is
   never split on commas. A quoted list item may contain a comma; YAML quote escaping (`''` inside a single-quoted item) is not
   supported by the config parser. Conventions are still tried in the order `convention` lists them; within one convention, the first
   line in document order that names any listed keyword *and* carries a date wins
8. `targets`: default OK everywhere — ask which `measure` signals may settle at `WATCH` (multi-select over the
   `MEASURE_BANDS` ids: `dead_link_ratio`, `orphan_ratio`, `reachable_ratio`, `index_present`, `date_coverage`,
   `key_doc_age`, `date_drift`, `entry_cost`, `pollution`, `undocumented_dirs`, `drifted_dirs`). `FAIL` can never be
   accepted, for any signal.
   If `entry_cost` is hard to hit because the repo's entry file is inherently large, prefer accepting `WATCH` on it over changing
   `economy.entry_cost_tiers`. Both are legitimate; they say different things. Accepting `WATCH` says "this repo settles for
   WATCH on entry_cost"; raising the tiers says "this repo's OK line is looser than docgrad's", and every later reader
   has to know that to read the score. Since v1.7.0 the change is at least **visible**: the thresholds are reported on
   every run (`inventory.economy_thresholds.customised`) and folded into `measure_hash`, so `report` draws a
   comparability break where it happened. Before v1.7.0 these two fields were read by nothing at all — editing them changed
   no outcome, while this questionnaire warned that it changed the rubric. Both halves of that were wrong
9. `scenario`: ask the user to describe the repo's representative development task in one sentence (used as the LLM-simulation
   fallback when `scenarios` is absent)
10. `correctness_sample`: **the number of claims drawn *new* each round** (re-verification of the existing ledger is a separate
    budget on top, see [judge.md](judge.md) step 3) — so it is also the rate at which cumulative coverage grows. Default 8; for a
    large docs system (>50 files), 12 is recommended.
    Paired with it, `claim_candidates_cap`: **how many ranked candidates `inventory.mjs` emits per run**, default 60. Without
    `--exclude-ledger` (#54), coverage can only grow as far as this window, so it is the ceiling `correctness_sample` climbs
    toward. **Take the default** — it is the right answer until a repo's ledger approaches it, and emitting every candidate
    with its text is a real cost in a tool that rates context economy. Raise it when `claim_population.truncated` is `true`
    *and* the ledger is near `emitted`; `judge` reports both numbers every round it runs (judge.md step 3), so there is no need to guess at init time.
    Passing `--exclude-ledger .docgrad/ledger.jsonl` to `inventory.mjs` is the other way to widen what a round can draw: it
    filters already-ledgered candidates out before the cap is applied, so the cap counts drawable candidates instead of
    raising the cap being the only lever
11. `src_dirs` (multi-select, pre-filled with scan candidates; used by coverage drift detection, retrieval.mjs, **and the
    correctness dimension's claim population**). **Do not leave this empty if you can avoid it** — it now gates three things,
    and the third is the one that silently costs a whole dimension:
    - completeness falls back to pure LLM comparison (coverage.mjs doesn't measure, it only emits a note);
    - retrieval.mjs's `areas`/`code_pointer_ratio` degrade the same way;
    - **API-shaped inline code stops being a claim.** `inventory.mjs` recognises `foo()` / `.option()` / `program.opts()` as a
      verifiable claim only when every segment exists as an identifier somewhere under `src_dirs` — that existence check is
      the whole guard against matching ordinary prose, so with no `src_dirs` there is nothing to check against and the shape
      contributes nothing. On a **library repo**, whose documentation describes an API rather than a file tree, that is the
      difference between a claim population and none at all: measured on `tj/commander.js`, `claims_total` was **0** and
      correctness had no mechanical basis whatsoever (see [judge.md](judge.md) step 3's not-measurable case).
      `inventory.claim_population.api_matching` reports `disabled` with a note when this happens — it is never silent.
12. `scenarios`: ask the user for 2-4 representative code paths (files or directories, e.g.
    `apps/api/src/contract/contract-approval.service.ts`, `apps/api/src/timesheet`) — retrieval.mjs uses them to mechanically
    compute marginal cost and traceability (see [measure.md](measure.md) §Token economy signals / Traceability); leaving it empty
    falls back to LLM simulation from `scenario`, which still produces areas/index_hotness
13. `rules.pattern`: the rule-line detection string, default `**MUST` (reuse whatever rule-marking convention the repo already
    has; usually no need to change it)

## 3. Write the file

Write `.docgrad.yml` (fill in all values from the questionnaire results; use only a two-level structure and inline lists, so the
scripts can parse it):

```yaml
# .docgrad.yml — docgrad config (under version control, shared by the team)
docs_dirs: [docs/]
docs_files: [PRODUCT.md, DESIGN.md]   # single files outside docs_dirs, taken in as regular documents (not counted toward fixed cost); optional
entry_files: [CLAUDE.md]
index_file: docs/README.md
exclude: [docs/archive/]      # "this repo contains this and I'm not proud of it": out of the corpus, CHARGED to the pollution surface
out_of_scope: [docs/zh-CN/]   # "real docs, just not what this run grades": out of the corpus, NOT charged; count/tokens_est printed every run; optional
exclude_untracked: false   # true = collect only files git tracks, so a clean checkout and a working one measure the same corpus (needs git)
src_dirs: [src/]           # code roots: coverage drift + retrieval + the existence check that makes `foo()` a verifiable claim
freshness:
  convention: frontmatter   # single value; when mixing both conventions: frontmatter,heading-line
  field: last_updated
  # heading_field: "Last updated:"   # inline keyword for heading-line; can be omitted when only one convention is chosen and field is already set
  # heading_field: ["Last updated:", "Updated:"]   # inline-list form: several spellings of the same signal; field takes a list the same way
coverage:
  drift_after_days: 30   # how many days doc can lag behind code before it counts as drift (default 30)
  min_commits: 3         # how many code commits in that period before it counts as drift (default 3)
targets:
  # entry_cost: WATCH   # example: accept WATCH for this signal instead of requiring OK (default OK for every signal; FAIL is never accepted; see measure.md §Targets)
economy:
  entry_cost_tiers: [20000, 10000, 5000, 3000]   # entry_cost: OK ≤ [2], FAIL > [1]; [0] and [3] are not read by any verdict (kept so a 1.x config still loads)
  pollution_max: 0.1                              # pollution is WATCH at or above this
correctness_sample: 8
claim_candidates_cap: 60   # how many ranked claim candidates inventory.mjs emits; without --exclude-ledger (#54) this is the ceiling cumulative coverage can reach. Leave at 60 until claim_population.truncated is true and the ledger has nearly filled the window
scenario: "add a typical new feature to <some module>"   # LLM-simulation fallback when scenarios is absent
scenarios: [src/foo/bar.ts, src/foo]      # used by retrieval.mjs to mechanically simulate marginal cost + traceability; optional
rules:
  pattern: "**MUST"   # rule-line detection string (used by inventory.mjs structure.rules), this is the default
language: zh-TW
```

Every list field (`docs_dirs`, `docs_files`, `entry_files`, `exclude`, `out_of_scope`, `src_dirs`, `scenarios`) must be written as a list, even
when it holds one item (`docs_files: [PRODUCT.md]`) — a bare scalar, or a key with nothing after the colon, is rejected with an
error naming the field. So is a non-boolean `exclude_untracked`, and so is a `correctness_sample` or `claim_candidates_cap` that is
not a positive whole number — both are used as counts, so a quoted `"8"`, a fraction or a `0` would not fail, it would quietly draw
nothing. The scripts do not repair a malformed value for you: a silent repair would leave the wrong thing standing in a
version-controlled file.

As soon as it's written, verify: it's only done once `node "$SKILL_DIR/scripts/inventory.mjs" --root .` produces JSON output.

## When the doc source is not writable (config file elsewhere)

When the doc tree itself can't take a written file (a read-only mount, an export directory) → write `.docgrad.yml` elsewhere,
and the scripts can run `measure` (or `judge`) by specifying `--config <file>` (`improve`/`loop` still need a writable workspace with git).
This only solves the config file's placement — it doesn't change the premise that "the docs must be a local markdown file
tree." See [design.md](../../../docs/design.md) §Positioning and boundaries for the boundary.

## 4. Wrap-up

- Print a summary of what was written (one line per field).
- Suggest the user commit `.docgrad.yml` to version control; with their consent, commit it on their behalf
  (message: `chore: docgrad init — doc scoring config`).
- Prompt the next step: run `/docgrad measure` to see the first scorecard (add `/docgrad judge` for the three star-rated dimensions).

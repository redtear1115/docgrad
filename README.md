# docgrad

**English** | [繁體中文](README.zh-TW.md)

[![release](https://img.shields.io/github/v/release/redtear1115/docgrad?filter=docgrad--*)](https://github.com/redtear1115/docgrad/releases/latest) [![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> **Last updated:** 2026-09-17

> Your documentation is now read by agents, and every file an agent loads has a price. docgrad
> grades a repo's docs as an **AI-agent context source**, then fixes them round by round until they
> hit the targets you set.

**[Coming from 1.x?](UPGRADING.md)** — 2.0 is a breaking release; see UPGRADING.md for the command,
config and output changes before you read further.

A Claude Code skill, in **two layers**:

- **`measure`** — four dependency-free Node scripts produce reproducible `OK`/`WATCH`/`FAIL`
  signals (dead links, orphans, freshness, entry-file token cost). Same tree, same config, same
  numbers, on any machine. This is what `loop` converges on and what a CI gate can enforce — see
  [measure.md §Targets](skills/docgrad/reference/measure.md#targets).
- **`judge`** — an LLM rates completeness, correctness and consistency ★1–★5 against a frozen
  rubric. **★ ratings are not reproducible, are never comparable across rounds, and never gate CI or
  the loop** — they are the model's read of the three things a script can't check, reported for a
  human to weigh, not a measurement. See [judge.md §Known instability](skills/docgrad/reference/judge.md#known-instability)
  for why, measured.

When `loop` stops is defined in one place only:
[improve.md §Stop conditions](skills/docgrad/reference/improve.md#stop-conditions-loop-any-one-of-them-ends-it).

## Why a separate signal for cost

Most documentation linters optimise one direction: more coverage, fewer broken links, better prose.
Applied to an agent's context source, that direction has a bill attached. An entry file (`CLAUDE.md`,
`AGENTS.md`) is loaded on *every* task whether or not the task needs it, and external comparisons of
coding agents on SWE-Bench Lite and AgentBench find that longer context files raise cost without
reliably raising success rate.

So the economy signal pulls against completeness on purpose, and the loop has a mechanical brake.
Two different tables, because they work differently — one is measured, one is judged:

**Measure signals** (reproducible `OK`/`WATCH`/`FAIL`; row-by-row definitions in
[measure.md §Verdict lines](skills/docgrad/reference/measure.md#verdict-lines)):

| Signal | Checks | Script |
|---|---|---|
| Freshness | Are date signals present and honest? | `freshness.mjs` — signal coverage, staleness, git cross-check |
| Linkage | Can one index reach everything? | `links.mjs` — dead links, broken anchors, orphans, reachable ratio |
| Coverage drift | Are code areas and their docs drifting apart? | `coverage.mjs` — undocumented and drifted areas |
| Economy | What does an agent pay per task? | `inventory.mjs` — entry-file tokens (`entry_cost`), pollution surface (`pollution`) |

**Judged dimensions** (★1–★5, `judge` only, not reproducible — see the two-layer note above):

| Dimension | Rated on | Method |
|---|---|---|
| **Completeness** | Are the core areas documented at all? | `coverage.mjs` drift data, plus an LLM cross-check against the repo's actual module list |
| **Correctness** | Do the claims still match the code? | Claim ledger — the script picks the sample, each claim is verified against source |
| **Consistency** | One authority per topic, docs and code comments alike | LLM cross-document comparison, triangulated against code |

Three things stop that tension from turning into a tug of war: economy is last in the tie-break
order, documents outside `entry_files` do not count toward the fixed cost (so moving content *out*
of the entry file satisfies both signals at once), and each round's fix is kept or reverted by
[improve.md](skills/docgrad/reference/improve.md) step 4, which checks every `measure` row, not only the one it picked.

## What installing it costs you

A tool that prices context should price itself. From `claude plugin details docgrad`:

```
Always-on:   ~227 tok   added to every session
On-invoke:   ~1.8k tok  paid each time the skill fires
```

The five measurement scripts are plain Node with zero dependencies and run outside the model.

## From install to graduation

### 0. Install (once)

```bash
claude plugin marketplace add redtear1115/docgrad
claude plugin install docgrad@docgrad --scope user
```

Restart Claude Code, then run `/docgrad` — it prints its routing table and does nothing else.
Requires Claude Code and Node.js ≥18. Full install, update, and uninstall paths are
[below](#install-update-uninstall).

### 1. `/docgrad init` — configure the target repo (once)

Run it in the repo you want graded. docgrad scans for candidate structure (docs directories,
always-loaded entry files, an index, directories to exclude), walks you through a questionnaire, and
writes `.docgrad.yml` — checked into version control, shared by the team. This is the only manual
setup; every other command reads that file, and refuses to run without it.

### 2. `/docgrad measure` — see the baseline (changes nothing)

One full pass over the four scripts: number first, `OK`/`WATCH`/`FAIL` verdict next to it, plus a
token economy report. Pure report, no file is touched. Add `/docgrad judge` (or `--judge` on
`improve`/`loop`) when you also want the ★ ratings — it's a separate step because it's a separate
kind of output.

```
/docgrad measure docs/infra/      # also accepts a topic, e.g. "the infra docs"
/docgrad judge --dim consistency  # one judged dimension only
```

Scoped reports are **never written to `.docgrad/`** — the round-by-round trend only counts full
reports, and mixing scoped scores into it destroys comparability.

### 3. `/docgrad improve` / `/docgrad loop` — converge

```
/docgrad loop     # repeat until done; use improve for one round at a time
```

Each round picks **one `measure` row that is not meeting its target** — in the order
[improve.md step 2](skills/docgrad/reference/improve.md#steps-in-each-round) fixes — and fixes only that one (step 2 names two exceptions)
(convergence is not a rewrite), re-measures, and keeps or reverts the change by
[improve.md step 4](skills/docgrad/reference/improve.md), then commits. Every change lands on the `docgrad/converge` branch, one commit
per round — interruptible, revertible, reviewable as a batch before you merge. `loop` never fixes
for a `judge` star — see the two-layer note above.

The scores, the claim ledger and the latest scorecard live in `.docgrad/`, **and they belong in version
control**. They are state, not scratch: without them a fresh clone restarts coverage at zero and can
never detect that the ruler or the corpus definition changed under it.

`loop`'s stop conditions (targets met, plateau, needs a human, and two exits for when there is nothing the loop can work on) are
defined once, in [improve.md §Stop conditions](skills/docgrad/reference/improve.md#stop-conditions-loop-any-one-of-them-ends-it) —
this README links there instead of restating them. One thing worth flagging up front: 1.x had a
"design ceiling" concept (two star anchors permanently capped because reaching them needed a CI
gate); that concept is retired in 2.0 along with the anchors it applied to — see
[improve.md §Rows outside the working set](skills/docgrad/reference/improve.md#rows-outside-the-working-set).

### 4. Graduation — turn the rules into CI

Once targets are met (see [improve.md §Stop conditions](skills/docgrad/reference/improve.md#stop-conditions-loop-any-one-of-them-ends-it) for exactly when), the closing report **produces graduation artifacts**:
`docs-gate.mjs` and `docs-gate.yml` under `.docgrad/graduation/`, with thresholds already set to
that repo's current numbers — dead links, broken anchors, orphans, freshness coverage, the entry-file
token budget, and the pollution ratio. **Produced, not installed** — enabling them means copying them
into `.github/` yourself. docgrad never writes to your CI configuration. Full procedure:
[improve.md §Graduation](skills/docgrad/reference/improve.md#graduation-do-it-when-targets-are-met-do-not-just-recommend-it).

Without that gate, convergence decays: one repo sprouted fresh orphans and undated files the same
day it closed out, and was still in the same state two months later. Dead links and formatting are
better served by mature existing tools (lychee, markdownlint, Vale); what these scripts add is
orphan/reachability analysis and an entry-file token budget.

## Commands

| Command | What it does |
|---|---|
| `/docgrad init` | Scan + questionnaire → write `.docgrad.yml` into the target repo (one-time) |
| `/docgrad measure` | One full pass over the four scripts, emits `OK`/`WATCH`/`FAIL` verdicts (changes nothing) |
| `/docgrad judge` | LLM ★1–★5 rating for completeness/correctness/consistency (changes nothing, needs this round's `measure` output) |
| `/docgrad measure <scope>` / `judge --dim <dimension>` | Scoped report for a directory, topic, or single judged dimension (changes nothing, stores nothing) |
| `/docgrad improve` | One convergence round: pick one unmet `measure` row (improve.md step 2) → fix → re-measure → commit |
| `/docgrad loop` | Repeat improve until a stop condition in improve.md §Stop conditions |
| `/docgrad report` | Reprint the latest scorecard plus the score trend across rounds |
| `/docgrad audit` | **Deprecated alias** — runs `measure`; add `--judge` to also run `judge` (still report-only) |

Routing and blockers are defined authoritatively in [skills/docgrad/SKILL.md](skills/docgrad/SKILL.md); this table is a summary.

## Install, update, uninstall

Every command below installs at **user scope** — install once, use it in every repo.

```bash
# install
claude plugin marketplace add redtear1115/docgrad
claude plugin install docgrad@docgrad --scope user

# update
claude plugin marketplace update docgrad
claude plugin update docgrad

# uninstall
claude plugin uninstall docgrad@docgrad --scope user
```

The in-session `/plugin install` dialog asks which scope to use — choose **User** there. The
Marketplaces page in `/plugin` then shows when a new version is available, and you can turn on auto
update for this marketplace. Versions and what changed are in [CHANGELOG.md](CHANGELOG.md).

### Have your agent do it

Paste this into any Claude Code session:

> Install the docgrad plugin: run `claude plugin marketplace add redtear1115/docgrad`, then
> `claude plugin install docgrad@docgrad --scope user`. Restart when it asks. Then run `/docgrad`
> and show me the routing table so I know it loaded.

To update later:

> Update the docgrad plugin: `claude plugin marketplace update docgrad`, then
> `claude plugin update docgrad`. Tell me which version I moved to, and summarise what changed in
> that repo's CHANGELOG.md between my old version and the new one.

To go from zero to a first score in one go:

> Install docgrad (marketplace `redtear1115/docgrad`, plugin `docgrad@docgrad`, user scope), then
> run `/docgrad init` in this repo, answer the questionnaire with what you can infer from the repo
> and ask me only about the entry files and the exclude list, then run `/docgrad measure` and show me
> the scorecard.

### Without the plugin system

Clone the repo and symlink the skill payload — **don't clone straight into `~/.claude/skills/`**,
because since v1.7.0 the payload sits at `skills/docgrad/` while the plugin manifest stays at the
repo root:

```bash
git clone https://github.com/redtear1115/docgrad ~/.docgrad-src
ln -s ~/.docgrad-src/skills/docgrad ~/.claude/skills/docgrad
```

Update with `git pull` in `~/.docgrad-src`; check [CHANGELOG.md](CHANGELOG.md) for what moved. You
lose the update notifications, nothing else.

A plain `cp -r skills/docgrad ~/.claude/skills/docgrad` also works for loading the skill, but it
leaves `.claude-plugin/` behind, and the scripts then report `version: null` in every JSON block and
every `history.jsonl` row — a silent loss of the fingerprint that tells you which ruler produced a
score. Symlink, or copy the whole repo.

### Other platforms

The layout follows the [Agent Skills specification](https://agentskills.io/specification)
(`skills/<name>/SKILL.md`) with per-platform manifests at the repo root, so other agents can pick it
up. **"Verified" below means exactly one thing: installed from this machine, and the skill and its
scripts resolved afterwards.** It does not mean the behaviour was compared against these docs.

| Platform | Packaging | Status |
|---|---|---|
| Claude Code | `.claude-plugin/{plugin,marketplace}.json`, skills auto-discovered under `skills/` | **Verified** — marketplace add → install → `skills/docgrad/SKILL.md` present, the five scripts run from the installed copy, `version` resolves |
| Codex | `.codex-plugin/plugin.json` (`"skills": "./skills/"`), `.agents/plugins/marketplace.json` | **Unverified** — the manifests are written against the spec and modelled on a working example, but no Codex install was run from this machine |
| Antigravity | root `plugin.json`, `.agents/` workspace discovery, `.agents/workflows/docgrad.md` | **Unverified** — same |
| Skills CLI (`npx skills add`) | `skills/docgrad/SKILL.md` | **Unverified** — it installs from the published GitHub repo, so it cannot be tested against this layout until the release is merged |

If you install on one of the unverified platforms, an issue saying whether it worked is welcome —
that is the only way those rows change.

## Case studies

Measured runs, with the commands to reproduce them. Both the numbers that flatter the tool and the
ones that do not are in there.

| | Subject | What it measures | Headline |
|---|---|---|---|
| [1](case-studies/01-commander-js.md) | `tj/commander.js` | Real agent token usage on the same feature-design task, before and after convergence | Design quality tied at 12/12 both ways; converged docs took **15% fewer turns** and pulled **20% more tokens** into context |
| [2](case-studies/02-docgrad-self.md) | docgrad itself, 9 real rounds | Where a doc system's tokens land as the product grows | Corpus grew 3.4×; the tax every task pays grew 1.8× and **halved as a share of the corpus** |
| [3](case-studies/03-fixtures.md) | The three eval fixtures | How often the same tree got the same 1.x star rating twice | 12 runs, all passing; 16 of 18 dimension slots unanimous (1.x ratings) — and one real gap in the rubric |
| [4](case-studies/04-long-running.md) | A private production repo, 13 rounds | What a long run buys, and what decays | Ratings (1.x) mostly ★4 — on **10.1% verified coverage**; economy stuck at ★3 for nine rounds; the generated CI gate went red four rounds before anyone noticed |

Start with [the method note](case-studies/README.md) if you intend to check the numbers.

## What it does not do

docgrad grades a **local markdown file tree**: all five scripts work on local paths, and
`.docgrad.yml` has to be writable into the target repo root.

- **git is not a hard requirement.** Without it, freshness falls back to the dates documents claim
  about themselves, coverage drift cannot be measured, and everything else runs as usual.
- **Wikis, Confluence, and other remote doc sources are not supported.** The files are not in the
  tree and the config has nowhere to live. You can still borrow the three judge anchors in
  [skills/docgrad/reference/rubric.md](skills/docgrad/reference/rubric.md), or the measure bands in
  [skills/docgrad/reference/measure.md](skills/docgrad/reference/measure.md#verdict-lines), to rate
  such a source by hand — with no mechanical signal, no reproducibility, and no scorecard.

It does not lint prose style (that is Vale's job), does not audit SKILL.md files, and does not
review code. The consistency dimension **does read code comments**, but only to judge whether a fact
has a second authority and whether it sits in the right carrier
([skills/docgrad/reference/placement.md](skills/docgrad/reference/placement.md)) — never to judge how well a comment is written.
Full positioning is in [docs/design.md](docs/design.md).

## Layout

```text
docgrad/
├── skills/docgrad/     # the skill payload — everything an agent loads at runtime
│   ├── SKILL.md        # routing, blockers, the scripts contract
│   ├── reference/      # rubric (judge anchors), measure, judge, audit (deprecated-alias router), improve, init, placement
│   ├── scripts/        # five dependency-free Node measurement scripts
│   └── templates/      # graduation artifacts: docs-gate.mjs / docs-gate.yml
├── .claude-plugin/     # Claude Code manifests
├── .codex-plugin/      # Codex manifest
├── .agents/            # Codex / Antigravity workspace discovery
├── plugin.json         # Antigravity manifest
├── CONTRIBUTING.md     # how to contribute, and the fingerprint discipline
├── INTEROP.md          # composing with other skills (sepia, …)
├── UPGRADING.md        # 1.x → 2.0 migration guide
├── case-studies/       # measured runs, with reproduction commands (1.x, mostly)
├── evals/              # skill-level evals (measure reproducibility, judge star stability)
├── tests/              # unit tests for the scripts
└── docs/               # design.md, how-to.md
```

## Development

```bash
node --test tests/*.test.mjs
```

Skill-level evals — `measure` reproducibility, `judge` star stability, sampling coverage, false
positives — are separate; see [evals/README.md](evals/README.md). `tests/` covers what the scripts
output, which cannot tell you whether a `judge` star is stable.

Design notes: [docs/design.md](docs/design.md). Common development tasks:
[docs/how-to.md](docs/how-to.md). Prior work this draws on: [NOTICE.md](NOTICE.md).

Contributing — the fingerprint discipline, the reserved commit prefix, and what a PR has to carry:
[CONTRIBUTING.md](CONTRIBUTING.md). How docgrad composes with other skills, and what it deliberately
leaves uncombined: [INTEROP.md](INTEROP.md).

## License

MIT

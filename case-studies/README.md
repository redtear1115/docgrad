# docgrad case studies

> **Last updated:** 2026-09-17

> **These four cases were recorded under 1.x**, before v2.0.0 split the six-dimension star rating
> into `measure` (reproducible `OK`/`WATCH`/`FAIL`) and `judge` (★1–★5 for completeness, correctness
> and consistency only). Linkage, freshness and economy ★ anchors mentioned below are retired — see
> [rubric.md §Version history](../skills/docgrad/reference/rubric.md#version-history-and-comparability-notes)
> for what they mapped to, and [UPGRADING.md](../UPGRADING.md) for the general 1.x → 2.0 mapping. The
> case files themselves (`01`–`04`) are records of past measurements and are not edited to match 2.0 —
> this page annotates instead.

Measured runs, written so you can check them. Each case states what it measures, what it does not,
and the commands to reproduce it. Numbers that make the tool look bad are in here too — a case
study that only reports wins is marketing with a table in it.

## The cases

| | Subject | Question it answers |
|---|---|---|
| [1](01-commander-js.md) | `tj/commander.js` at a pinned commit | Does an agent doing the same feature-design task spend fewer tokens after docgrad has converged the docs? |
| [2](02-docgrad-self.md) | docgrad itself, nine real convergence rounds | Where does a documentation system's token cost land as the product grows? |
| [3](03-fixtures.md) | The three eval fixtures | Is the (1.x) star rating reproducible at all — and does the skill actually fire? |
| [4](04-long-running.md) | A private production repo, 13 rounds | What does a long run actually buy, and what decays anyway? |

Case 1 is the one that tests the claim people care about. Case 2 is longitudinal and confounded by
the product growing alongside the docs. Case 3 is not a token claim at all; it is the check that
makes the first two worth reading, because a rating that is not reproducible cannot support a
before/after comparison. Case 4 is the only subject with a long production history, and it is the
one to read if you are deciding whether to adopt this — it reports what 13 rounds bought, what they
did not, and the deliverable that expired without anyone noticing.

Case 4's subject is a private repository. Its contents, domain and file names are withheld; counts,
ratings and mechanics are reported in full, and every figure was re-measured rather than quoted.

## Two instruments

**Mechanical measurement — docgrad's own scripts.** `inventory.mjs`, `links.mjs`, `freshness.mjs`,
`coverage.mjs` and `retrieval.mjs` read a local file tree and emit JSON. They are deterministic: the
same tree and the same config produce the same numbers on any machine with Node ≥18. Every table in
these case studies that reports tokens, links, orphans or coverage comes from them.

Two things shift these numbers and are worth pinning when you reproduce a run:

- **Measure a clean checkout.** Untracked local files move both the corpus token count and the
  pollution surface. The snapshots in case 2 are `git archive` extracts for exactly this reason.
- **Pin the scripts and the config.** Comparing two states of a repo means holding the ruler still —
  use one version of the scripts and one `.docgrad.yml` across both, not each snapshot's own.

**Real token accounting — Claude Code's own transcripts.** Claude Code writes one JSONL per subagent
under `~/.claude/projects/<project-slug>/<session-id>/subagents/agent-<id>.jsonl`, and every
assistant line carries the API `usage` block. `measure/token-usage.mjs` sums those per run, matching
runs by a tag embedded in the prompt:

```bash
node case-studies/measure/token-usage.mjs --tag-prefix docgrad-cs1
```

It reports, per run: assistant turns, tool calls, **new input tokens**
(`input_tokens + cache_creation_input_tokens` — tokens entering the model's context for the first
time), cache reads, and output tokens.

**New input is the headline; cache reads are reported but never compared.** Cache reads scale with
how many turns a run takes and how big its prefix already is, so they tell you about the shape of
the conversation rather than how much the agent had to read. Quoting a cache-read delta as a saving
would be measuring the harness, not the documentation.

## Rules these case studies follow

1. **Both arms get identical task text.** The prompt is written once, in a file, and handed to every
   run with only the repository path and the output path substituted.
2. **Token counts never appear without a quality score.** An agent that reads less and produces a
   worse design has not saved anything. Case 1 grades every design document blind, against the
   actual source, before any token number is reported.
3. **Run counts are stated, and they are small.** These are single-digit run counts on one model.
   They can show a large effect; they cannot resolve a small one, and no significance is claimed.
4. **Failures are reported.** Where docgrad got something wrong, refused a task, or produced an
   awkward result on a real repository, it is written down in the case study rather than left out.

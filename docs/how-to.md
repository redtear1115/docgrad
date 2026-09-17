# docgrad how-to — common development tasks

> **Last updated:** 2026-09-17

## Fewer permission prompts when running the scripts (optional, user-configured)

`audit` always runs the same five scripts every time, and `loop` runs them every round, so each run prompts for permission once. You can add an allow rule to **your own** settings to skip the prompt:

```jsonc
// ~/.claude/settings.json or the target repo's .claude/settings.local.json
{ "permissions": { "allow": ["Bash(node /absolute/path/to/docgrad/skills/docgrad/scripts/*)"] } }
```

Use the absolute path from the line that actually runs after `/docgrad` is triggered (the plugin install path differs machine to machine). **Since v1.7.0 the scripts sit at `skills/docgrad/scripts/`, not at the install root** — a rule written for the old layout matches nothing, and because a Bash rule that fails to match just falls through to a prompt, the only symptom is that the prompts come back. Copy the path from the run, don't retype it from memory.

**Why SKILL.md doesn't just ship `allowed-tools`**: a Bash rule must match verbatim up to its first `*`, and a skill doesn't know its own install absolute path at write time; the only portable pattern that could be written is `Bash(node *)`, which is equivalent to pre-authorizing "run any node command" — not worth the cost for a tool that only scores docs read-only. Only the user knows the path, so this rule is added by the user themselves.

## Add a scoring dimension

1. **Anchors first**: judged dimension: full ★1–★5 anchors + measurement method in [skills/docgrad/reference/rubric.md](../skills/docgrad/reference/rubric.md); measure signal: a `MEASURE_BANDS` row (`skills/docgrad/scripts/lib.mjs`) + a [measure.md](../skills/docgrad/reference/measure.md) §Verdict lines entry. Anchor changes = a breaking change, see the next section.
2. Update the rubric's "mechanical signal -> dimension map" map. Tie-break order is different for the two halves now:
   a new **measure** signal must be added to [improve.md](../skills/docgrad/reference/improve.md) §Working set's pick
   order to get a considered position, or it is simply picked last (after every listed id, in `lib.mjs › MEASURE_BANDS`
   order) — nothing else needs to change for it to be pickable. A new **judged** dimension's tie-break position still
   comes from `rubric.md` §Scoring principles.
3. A new measure signal is automatically a valid `targets` key — `.docgrad.yml`'s `targets` names any `MEASURE_BANDS`
   id, so adding a `MEASURE_BANDS` row is what makes it configurable; there is nothing to sync in
   `skills/docgrad/scripts/lib.mjs › DEFAULTS.targets`, which is `{}` (no dimension defaults itself into `targets`,
   see `normalizeTargets()`). A new judged dimension has no `targets` key at all — judged dimensions have never had one.
4. Add the scoring steps for that dimension to [skills/docgrad/reference/judge.md](../skills/docgrad/reference/judge.md); add a row to the scorecard template.
5. If a new mechanical signal is needed: add `skills/docgrad/scripts/<name>.mjs` (contract in [design.md](design.md) §Scripts contract — zero dependencies, JSON->stdout, errors->stderr with a non-zero exit code, shared flags always go through `skills/docgrad/scripts/lib.mjs › parseArgs()`), and add a corresponding `*.test.mjs` in `tests/`.

## Change a rubric anchor the right way

- Once written, an anchor is frozen; a semantic change makes the historical scores in every repo's `.docgrad/history.jsonl` no longer comparable.
- When a change is unavoidable: state breaking explicitly in the commit message, and recommend affected repos restart their convergence rounds from baseline.
- Pure formatting or adding a date line doesn't count as breaking.

## Extend the measurement scripts (lib.mjs)

- `skills/docgrad/scripts/lib.mjs` is the shared module for the five CLIs; function contracts are authoritative in code (refer-to-code, docs don't restate signatures).
- Shared flags (`--root`/`--config`/`--include`/`--exclude-ledger`/`--locate-ledger`) are parsed in one place, `parseArgs()`: add a new flag there and all five scripts pick it up; unknown flags always throw an error, never get silently ignored. Scope-filtering semantics are in `matchesScope()`; if a new script doesn't apply scope (like `coverage.mjs`, `retrieval.mjs`) or doesn't act on a ledger flag (everything but `inventory.mjs` — `--exclude-ledger` #54, `--locate-ledger` #63), its output `note` must explicitly say why.
- **The two ledger flags answer opposite questions and are independent.** `--exclude-ledger` narrows what `inventory.mjs` *emits* (already-verified claims stop occupying candidate slots); `--locate-ledger` asks where already-ledgered claims *are*, reading the **unfiltered** population so that passing both together — which the `improve` loop always does — never hides a position. They may name different files. `--locate-ledger` is uncapped: `claim_candidates_cap` governs the emitted window, not this.
- YAML parsing is a **two-level subset** (top-level scalar / inline list / block list, plus one level of nested map); new config fields shouldn't go beyond this structure.
- Development verification: `node --test tests/*.test.mjs` (Node >=18; directory arguments aren't available starting from v25).

## Run the skill-level evals

`tests/` tests the scripts' output — it **cannot test whether star ratings are stable** — in the oikos incident, consistency went ★4->★2 and not a single unit test turned red. The reproducibility of star ratings is the job of `evals/` (three cases and fixture baselines are in [evals/README.md](../evals/README.md)):

```bash
claude plugin eval . --runs 5 --scaffold --allow-tools Bash --keep-temp
```

Three of those flags are not optional for this plugin:

- **`--allow-tools Bash`** — docgrad's six dimensions are computed by five Node scripts, and the
  harness removes ungranted tools from the session entirely. A case's own `allowed_tools` cannot
  grant `Bash`; only this flag can. Without it the audit is structurally impossible, not merely
  worse.
- **`--scaffold`** — each run starts in an empty workspace, so each case's `fixture.sh` copies its
  fixture in and gives it its own git history.
- **`--keep-temp`** — keeps each run's `trace.jsonl`. A failing case otherwise reports `0.00` and
  nothing else, which does not distinguish "the skill scored badly" from "the sandbox had no
  filesystem access". Every diagnosis in [evals/README.md](../evals/README.md) §Current status came
  out of a kept trace.

`--runs` isn't about running multiple times and taking the mode: **the distribution of star ratings is itself the metric**. If the same fixture comes out ★2/★2/★3, that means there's still slack there, and it should be tracked as a defect.

After changing a rubric anchor, the audit sampling flow, or the judgment semantics of any script, **this must run before release**.

If `claude plugin eval` answers `` `plugin eval` is currently in early access ``, that is **a stale CLI build, not a pending entitlement** — the [official troubleshooting](https://code.claude.com/docs/en/plugin-evals) says to run `claude update` and retry in a fresh session. On a Homebrew install `claude update` can be a no-op while the `claude-code` cask trails GA; `claude-code@latest` is the newer channel. (A different message, `` `plugin eval` is currently unavailable ``, means Anthropic switched it off server-side and nothing local helps.) Until v1.7.0 this file described the early-access message as access awaiting a grant, which sent anyone hitting it looking for the wrong remedy.

Until it does run, the cases stay in a "written, not yet run" state — **don't fill in scores that were never actually run**, in any report, CHANGELOG or PR.

## Cut a release

The version authority = the `version` field in [.claude-plugin/plugin.json](../.claude-plugin/plugin.json) (semver; SKILL.md's frontmatter doesn't carry a version — the official spec has no such field and nothing consumes it there). Plugin update notifications compare against this field.

Version number semantics (docgrad-specific):

- **major**: a semantic change to a rubric star anchor — historical scores lose comparability, and affected repos' convergence rounds should restart from baseline.
- **minor**: a new dimension, a new measurement signal, a new command, or a new `.docgrad.yml` field (backward compatible).
- **patch**: bug fixes, document corrections, measurement script bug fixes (no change to judgment semantics).

Release steps:

1. `node --test tests/*.test.mjs` all green.
2. Run the [skill-level evals](#run-the-skill-level-evals) (required once access is granted).
3. `claude plugin validate .` with no errors (checks both the marketplace and plugin manifest).
4. Bump the `version` in **`.claude-plugin/plugin.json`** — that one is the authority — and in
   `.codex-plugin/plugin.json`, which carries its own copy for Codex. The root `plugin.json`
   (Antigravity) has no `version` field and needs nothing. A test asserts the two copies match, so a
   half-done bump fails the suite rather than shipping two different answers.
5. Add a section to [CHANGELOG.md](../CHANGELOG.md) (date + change list; a major bump must explicitly state breaking and the restart-from-baseline recommendation).
6. Assign every issue and PR shipped in this version to that version's milestone: `gh issue edit <n> --milestone "<version>"` / `gh pr edit <n> --milestone "<version>"`. Create the milestone first if it doesn't exist yet: `gh api repos/{owner}/{repo}/milestones -f title="<version>"`. This step exists because it kept not happening on its own — see [#92](https://github.com/redtear1115/docgrad/issues/92): v1.9.0's milestone was created with zero items assigned, and v1.9.1's milestone was never created at all.
7. commit -> merge into main.
8. Tag on main and push:

   ```bash
   claude plugin tag --push
   ```

   The official tool's format is `docgrad--v<version>` (an annotated tag); it verifies that `plugin.json` and the marketplace entry are consistent before creating it — **this is the authoritative format for release tags**, don't type it by hand.

9. **Publish the GitHub Release.** A tag is not a release: a tag is visible to anyone who looks for it, a release is what shows on the repository's front page, what "Latest" points at, and what notifies whoever is watching.

   ```bash
   gh release create docgrad--v<version> --title "docgrad v<version>" --notes-file <(sed -n '/^## <version>/,/^## /p' CHANGELOG.md | sed '$d')
   ```

   The body is that version's CHANGELOG section, unchanged — the changelog is written to be read by a human deciding whether to upgrade, which is exactly what a release body is for, so there is nothing to rewrite.

   > **This step was missing until v1.9.1, and it drifted silently for three versions.** The other steps (then numbered 1–7) were all followed for v1.7.0, v1.8.0 and v1.9.0; every one of them was tagged (v1.8.0 late), and none of them was released. The front page said "Latest: v1.6.0" while the plugin manifest said 1.9.0. Nothing in the process noticed, because the process did not mention it — the same shape as the missing `--scaffold` in `evals/README.md`: a documented procedure whose last step was never written down does not get performed.

> **The old `vX.Y.Z` series**: every version from v0.2.0 to v1.3.0 also has a lightweight tag on the same commit; that was the convention before `claude plugin tag` existed, and they're kept, not deleted (external links may point to them).
> **New versions only get the official format**, the old format is no longer added — the two sets coexisting only needs to cover existing history, it doesn't need to keep growing.

## Anchor convention for citing code

When docs point to code, use `` `path › symbol()` ``, not line numbers — line numbers drift the moment they're edited:

- ✅ `` `skills/docgrad/scripts/lib.mjs › DEFAULTS.targets` ``, `` `skills/docgrad/scripts/lib.mjs › parseYamlSubset()` ``
- ❌ `skills/docgrad/scripts/lib.mjs:84` (inaccurate the next time it's edited)

It's enough for the symbol to locate the spot, no need for the full signature. This shares its origin with the retired linkage ★5 anchor (see [skills/docgrad/reference/rubric.md](../skills/docgrad/reference/rubric.md) §Version history).

## Marking retired or superseded documents

docgrad scores other repos on "whether retirement mechanisms are marked," and its own docs do the same (dogfooding):

- **Full document superseded**: add a status banner at the top, `> **Status:** retired — do not use for new features, use <corresponding new document> instead`, and keep the file in place so old links don't break and readers know where to go.
- **A whole mechanism removed**: delete the file outright (example: the historical plan in `docs/superpowers/` has been removed), and in **the same commit** clean up any remaining references to it in other documents — removal isn't clean unless it leaves no dead links.
- **Paragraph-level stale narrative**: rewrite it in place to reflect the current state, or mark it "(removed in vX)" — don't leave an unmarked zombie description.

Criterion: keep it with a banner if it still has guidance value (many old links, an important migration path); if it's pure historical baggage, delete it cleanly. This shares its origin with freshness's lifecycle management (superseded docs handled promptly); the anchor is in [skills/docgrad/reference/rubric.md](../skills/docgrad/reference/rubric.md).

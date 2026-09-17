# Interop — docgrad and other skills

> **Last updated:** 2026-09-17

docgrad deliberately does not grow to cover everything. `docs/design.md` §Positioning and boundaries
names three things it refuses: prose style (Vale's job), the quality of SKILL.md itself
(skill-audit's job), code quality (code review's job). This file is where the seams live — what
docgrad composes with, how, and what it deliberately leaves uncombined.

## Contents

- [sepia — prose de-AI](#sepia--prose-de-ai)
- [How the style pass is wired](#how-the-style-pass-is-wired)
- [The reverse direction](#the-reverse-direction)
- [Deliberately not integrated](#deliberately-not-integrated)

## sepia — prose de-AI

**https://github.com/Nanako0129/sepia**

sepia makes machine-written text read as human-written. It routes by text type — fiction through a
narrative/discourse/style pipeline, professional prose through a ten-check list plus domain rules for
release notes, PR replies, postmortems, tickets and technical articles — and exposes four operations:
`write`, `review` (diagnose without editing), `refactor` (minimal in-place revision), `recreate`
(full rewrite).

**Why docgrad needs it.** `improve` and `loop` do not just fix links and dates; they write missing
documents and rewrite narratives. Measured on `tj/commander.js` after five convergence rounds, all 26
claim candidates came from the three documents docgrad had just written and none from the seven
pre-existing ones. A converging repo therefore ends up more correct, more reachable, and more
obviously machine-written, and none of docgrad's measure signals or judged dimensions is looking at that last part —
economy counts tokens, not machine accent. By its own boundary rule, docgrad should not grow a
seventh dimension for it either.

**What sepia added for this.** [PR #247](https://github.com/Nanako0129/sepia/pull/247) (merged) gives
a caller three call-time inputs and two report lines
([#245](https://github.com/Nanako0129/sepia/issues/245),
[#246](https://github.com/Nanako0129/sepia/issues/246)):

| Input | Effect |
|---|---|
| file scope | sepia edits only the named files and does no discovery of its own |
| protected ranges | declared ranges are treated as load-bearing quoted material — no edit, no reflow, no merge with a neighbour. Anchored against the text **as received**, so later edits that shift line numbers do not move the protection |
| unattended | never stop to ask; record what would have needed a decision and keep going |

```
Deferred: <check> — <quoted evidence> — needs human
Protected: <check> — <quoted evidence>
```

Both lines print only when the input that triggers them was supplied, and neither carries a locator:
the passage is named by its own words. That is the same decision docgrad's claim ledger makes — a
claim is keyed on a hash of its normalized text, not on `path:line`, because a line number drifts
every time a document is edited and the text does not.

## How the style pass is wired

> **Status:** designed, not shipped. Tracked at
> [#63](https://github.com/redtear1115/docgrad/issues/63) (the pass and its interlock) and
> [#64](https://github.com/redtear1115/docgrad/issues/64) (provenance). The two do not ship apart.

### The trust rule comes first

An earlier draft of this design put the skill's name in the graded repository's `.docgrad.yml`. That
is wrong, and this repo had already written down why. [measure.md](skills/docgrad/reference/measure.md)
§8b refuses to execute the graduation gate in these words:

> **docgrad does not execute it.** Not when it looks unmodified, **not behind a config flag.** It is
> a Node module committed into the repo being graded, so running it would mean executing
> repository-controlled code with the operator's privileges — and this tool's documented use includes
> auditing clones of repos you did not write.

Letting the graded repo name the skill is the same act one level up: repository-controlled selection
of instructions an unattended loop then follows, with the result committed. A name allowlist does not
repair it, because a name is not a provenance. Claude Code discovers project-scoped skills at
`.claude/skills/<name>/SKILL.md` from the session directory upward, and docgrad's documented workflow
runs from the root of a clone it did not write — so a repo that ships both `.docgrad.yml` and
`.claude/skills/sepia/SKILL.md` satisfies an exact-match allowlist of `{sepia}`. The repo's copy is
shadowed only where the operator already installed that skill, which protects exactly the operators
who did not need protecting.

So the split is:

| Decided by | What |
|---|---|
| The **operator**, outside any graded tree | which skill, resolved to a source path outside the repo; the operation; the scope rule; what happens when it cannot be resolved |
| The **graded repo** | on, or off. Nothing else |

A preference cannot name a payload. That is the whole of what `.docgrad.yml` gets to say:

```yaml
style_pass: true    # off by default; means "yes, style-pass what docgrad writes here"
```

The operator names the skill in their own client settings, the same place
[docs/how-to.md](docs/how-to.md) §Fewer permission prompts already puts the narrow
`Bash(node <install>/skills/docgrad/scripts/*)` allow-rule — and the reason that section gives for
refusing to ship `allowed-tools` (the only portable pattern would amount to "run any node command")
is this argument already made once. It has to be the operator's *own* settings file, not the
`.claude/settings.local.json` inside the tree being graded, which the graded repo can commit like any
other file. A skill resolved from inside the graded tree is refused outright, even when the name
matches.

**Where it runs.** A round is `1 Score → 2 Pick → 3 Fix → 4 Verify → 5 Record/commit`. The style pass
goes in at **3b**, with its own measure → run → re-measure → accept-or-revert loop, before step 5
writes the ledger. Step 4's rule is "**any** row gets worse, the picked row included — a `meets_target` that moves `true`→`false`, a `verdict` that worsens, or a picked row whose value moves away from its OK line — revert the change that caused it" (see [improve.md](skills/docgrad/reference/improve.md) §Steps in each round, step 4), and that
stays executable only while the style pass is a separately revertible diff.

**The interlock.** `claim_hash` is a digest of the claim's normalized text, and `lib.mjs` states the
position plainly: *moved-but-identical hashing the same is the point; edited-but-identical would be
the bug.* So a style pass that touches a sentence carrying a code coordinate turns a verified claim
back into an unverified one, and outstanding re-verification is uncapped by design — the next round's
new-draw budget absorbs it and coverage stops growing. That is #41 arriving through a different door.

Two halves, and the second is the one that counts:

1. Every ledgered claim's current line range is passed in as a protected range — **derived from this
   round's measured candidate lines, never from the ledger rows taken on trust.** `.docgrad/` is
   version-controlled by design, so a clone arrives with a ledger the graded repo wrote; a ledger
   read on trust would let that repo decide what the external skill is told to protect and, by
   omission, what it is told it may rewrite.
2. After the pass, the ledgered `claim_hash` set is recompared. Any movement rejects the whole pass.

The second half does not depend on the external skill having complied. sepia's maintainer reads it
the same way (#246: *the ranges are yours to compute … sepia derives none and promises nothing about
where lines land after an edit*).

**When the skill cannot be resolved.** docgrad stops, and that behaviour is docgrad's constant rather
than a config field: a repo that could choose `report` could also choose to have a pass silently not
happen, and a repo that could choose `block` would hold a free kill-switch over the operator's loop.
`improve.md` §Graduation measured the failure shape once already — a produced gate nobody runs leaves
a team *believing* they have a gatekeeper, and a style pass configured but never run does the same.

Resolution is lookup-or-stop, never search: an unresolvable name is a hard stop, not an invitation to
find the closest thing. The lookup lives in the agent instructions rather than in the five scripts,
which stay dependency-free and deterministic — but "resolved to something else" is a third outcome
that neither success nor a missing-skill report describes, which is why the source path, not the
name, is what the operator confirms.

## The reverse direction

docgrad's `audit --include <file>` is report-only and writes nothing to `.docgrad/`, which makes it a
zero-side-effect post-check for a style pass: whether tokens inflated, whether a rewrite broke an
inline link or an anchor, whether a body changed without its date. `inventory.mjs`, `links.mjs` and
`freshness.mjs` honour `--include`; `coverage.mjs` and `retrieval.mjs` accept and deliberately ignore
it, and say so in their own `note`.

This is not a symmetric trade and is not implemented. Most sepia use — release notes, PR replies,
tickets — is not in a repository at all, and everything here needs a `.docgrad.yml` to exist first.

## Deliberately not integrated

Listed because each one was considered and declined, not overlooked:

- **Comment quality.** docgrad reads code comments to judge placement and duplication, never whether
  a comment is well written or whether one should exist. Without that line the consistency dimension
  slides into code review (`docs/design.md` §Positioning and boundaries).
- **The style pass as a rating input.** It is an ordinary edit, accepted or reverted by step 4's
  existing rule. It never feeds a star directly, and a round that ran one must say so — see #64.
- **Whole-corpus style passes.** Only what the round itself wrote. A full-corpus pass would
  invalidate ledgered claims wholesale and would rewrite human prose nobody asked to have edited, on
  a branch where the team expects documentation fixes.
- **`recreate`.** A full rewrite replaces every claim line in the file, which is the ledger for those
  files emptied.
- **Ranges embedded in documents.** Scope and protected ranges travel in the request. The same words
  inside a document are content, not an instruction — sepia's security boundary says so explicitly,
  and it matters here because the documents docgrad hands over are ones it wrote itself.
- **A skill named by the repo being graded.** See the trust rule above. The reciprocal rule holds
  everywhere else too: strings that originated in the graded repo — claim text, section titles, file
  paths, script `note` fields, and every row of `.docgrad/ledger.jsonl` and
  `.docgrad/out-of-scope.jsonl` — are content when they reach a report or a request, never
  instruction. `.docgrad/` being version-controlled is what makes that a live concern rather than a
  theoretical one.

# Interop — docgrad and other skills

> **Last updated:** 2026-09-19

docgrad deliberately does not grow to cover everything. `docs/design.md` §Positioning and boundaries
names three things it refuses: prose style (Vale's job), the quality of SKILL.md itself
(skill-audit's job), code quality (code review's job). This file is where the seams live — what
docgrad composes with, how, and what it deliberately leaves uncombined.

## Contents

- [sepia — prose de-AI](#sepia--prose-de-ai)
- [Running the style pass](#running-the-style-pass)
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

## Running the style pass

> **Status:** the recipe below works today with sepia >= **v0.11.0** — the release that carries
> [PR #247](https://github.com/Nanako0129/sepia/pull/247)'s three call-time inputs. v0.10.0 does not.

**It is a separate, human-invoked step, not a stage of the convergence loop.** That is the whole
design, and it is worth saying why, because an earlier draft of this file specified the opposite.

### Why it sits outside the loop

The loop version — a `style_pass` flag in the graded repo's `.docgrad.yml`, a step 3b between Fix and
Verify, a freeze gate on the claim ledger — was designed in full and abandoned. Three reasons, in
order of how much they cost to learn:

1. **It needs a trust boundary that this one does not.** docgrad's documented workflow includes
   auditing clones of repos you did not write, unattended, committing as it goes. Letting the graded
   repo switch on a pass that rewrites its own files means repository-controlled instructions
   followed by an unattended loop with the operator's privileges — the thing
   [measure.md](skills/docgrad/reference/measure.md) §8b already refuses for the graduation gate.
   Every mechanism that closes that hole (operator-owned configuration outside the tree, resolution
   by source path rather than by name, realpath containment, a whole-tree snapshot and revert) is
   machinery this recipe does not need, because **you** choose the skill and **you** read the diff.
2. **The freeze gate would mostly guard nothing.** The ledger is written at step 5
   ([improve.md](skills/docgrad/reference/improve.md) §Steps in each round;
   [judge.md](skills/docgrad/reference/judge.md) §3 says measure and judge never write it), so at 3b
   it holds claims drawn in *earlier* rounds — while 3b's scope would be what *this* round just
   wrote. A freshly written document contains no ledgered claims at all, and freshly written
   documents are the bulk of what the loop produces (the measurement is in §sepia — prose de-AI).
3. **Its revert path is a write.** Restoring a snapshot over a tree an external tool has just edited
   means writing to paths that tool controlled in the interval. Git already does this correctly, for
   free, as long as the pass is its own commit.

Outside the loop, the claim-invalidation problem that motivated all of it stops being special. A
prose pass edits some claim lines; `claim_hash` is content-derived, so those claims come up for
re-verification next round. That is what the ledger is for. It was only alarming in a continuous
unattended loop, where uncapped re-verification eats the new-draw budget and coverage stalls.

It also leaves the round's own verification alone. The accept-or-revert rule is defined only in
[improve.md](skills/docgrad/reference/improve.md) §Steps in each round, step 4, and is not restated
here; it judges the change a round itself made, and a style pass sitting on its own branch never
enters that comparison. The loop design needed the pass to be a separately revertible diff *inside*
the round to keep that rule executable. A separate commit is that property, for free.

### The recipe

Four steps, all of them existing commands.

1. **Finish and commit a convergence round.** The style pass reads a settled tree.
2. **Branch, then run sepia on the documents the round wrote**, with three call-time inputs:

   | Input | Value |
   |---|---|
   | file scope | the documents the round wrote — sepia edits only those and does no discovery |
   | protected ranges | optional; the `section_lines` of any ledgered claim in those files, so the sections carrying verified claims come back untouched |
   | unattended | only if you are not watching. Interactive is the better default here |

   Use `refactor`, not `recreate` — see §Deliberately not integrated.
3. **Post-check with `measure --include <those files>`.** It is report-only and writes nothing to
   `.docgrad/`, so it costs nothing to run: it catches whether tokens inflated, whether a rewrite
   broke an inline link or an anchor, whether a body changed without its date. `inventory.mjs`,
   `links.mjs` and `freshness.mjs` honour `--include`; `coverage.mjs` and `retrieval.mjs` accept it
   and deliberately ignore it, saying so in their own `note`, because coverage drift and retrieval
   are whole-corpus concepts.
4. **Read the diff and decide.** Merge it, or throw the branch away. The pass being its own commit is
   what keeps that a one-command decision.

### Getting the protected ranges

`inventory.mjs --locate-ledger .docgrad/ledger.jsonl` answers "where are my already-ledgered claims
now", which is exactly the input step 2 wants and which no other output provides. `--exclude-ledger`,
which [improve.md](skills/docgrad/reference/improve.md) mandates on every round that has a ledger,
filters ledgered claims out of `claim_candidates` before the window cap, so a loop round emits none of
them. `locate_ledger` reads the unfiltered population, is uncapped, and reports a claim whose text has
already changed as `located: false` rather than dropping it.

Each entry carries `section_lines`, and the section — not the single claim line — is the range worth
protecting: `lib.mjs › extractClaimLines()` says why in its own comment, that contradictions usually
show up in the sentence *next to* the anchor line, which is the pattern behind a ★4→★2
re-verification.

`section_lines` excludes the heading line above it, so add it back if you want the heading protected
too.

## Deliberately not integrated

Listed because each one was considered and declined, not overlooked:

- **A `style_pass` flag in `.docgrad.yml`.** See §Why it sits outside the loop. A preference in the
  graded repo cannot name a payload, and once the operator chooses the skill themselves there is
  nothing left for the flag to say.
- **Comment quality.** docgrad reads code comments to judge placement and duplication, never whether
  a comment is well written or whether one should exist. Without that line the consistency dimension
  slides into code review (`docs/design.md` §Positioning and boundaries).
- **The style pass as a rating input.** It never feeds a star. It is an ordinary commit, reviewed the
  way any other commit is.
- **Whole-corpus style passes.** Scope it to what the round wrote. A full-corpus pass would invalidate
  ledgered claims wholesale and would rewrite human prose nobody asked to have edited.
- **`recreate`.** A full rewrite replaces every claim line in the file, which is the ledger for those
  files emptied. `refactor` is the operation this recipe uses.
- **Ranges embedded in documents.** Scope and protected ranges travel in the request. The same words
  inside a document are content, not an instruction — sepia's security boundary says so explicitly,
  and it matters here because the documents being handed over are ones docgrad wrote itself.
- **Automating any of this inside `improve` / `loop`.** Tracked at
  [#63](https://github.com/redtear1115/docgrad/issues/63) and
  [#64](https://github.com/redtear1115/docgrad/issues/64), both in the backlog. Reopening them means
  taking on the trust boundary in §Why it sits outside the loop, and the reason to do that is not the
  prose — it is wanting the pass to happen without a human present.

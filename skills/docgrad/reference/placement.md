# placement — information placement policy

> **Last updated:** 2026-09-13

The rule for deciding "which carrier each piece of information should live in." docgrad judges **placement** and
**duplication** against this file; it doesn't grade the quality of comments or code itself (boundary: see
[design.md](../../../docs/design.md) §Positioning and boundaries).

When the same fact is scattered across code comments, docs, issues, and wiki, the cost is threefold: the agent has to
re-decide which copy to trust every time, people don't know where new information should go, and the two copies drift apart
until they contradict each other. The point of this policy is to **fix the placement first, then only update the
authoritative copy after that**.

## Three trade-off axes

"Place it by how hard it is for the agent to look up" is only half the story — if you optimize for access cost alone, the
optimal solution is "cram everything into the entry file," but that's the most expensive fixed token tax and the position
most prone to rot. Placement is decided by three axes together:

| Carrier | Access cost | Drift risk | Suitable audience breadth |
|---|---|---|---|
| entry file (`CLAUDE.md`, etc.) | Zero (always-loaded) | **High** (farthest from the thing it describes; nobody remembers to go back and update it) | Needed for every task |
| Files reachable from the docs index | Low (one or two hops) | Medium | Cross-module / multiple tasks |
| code comments/docstrings | Medium (have to locate the file first) | **Lowest** (same file, same MR — right in front of you when you touch the code) | Needed only when that spot is being changed |
| spec/design docs | Medium | Medium (prone to going zombie once finalized; keeping the rationale with the conclusion lowers this) | Parties to the interface contract, and anyone who needs to judge "can this be changed" |
| issue/PR discussion | High (requires querying the API, frequently closed) | Extreme | People tracing back the **process** (the conclusion itself should move into docs) |
| wiki/external site | Extreme (docgrad treats this as unsupported) | Extreme | Non-development use |

Access cost and drift risk run in opposite directions: **the closer and easier it is to grab, the easier it is to forget to
update.** The third axis (audience breadth) is the arbiter.

## Decision rules

| # | Criterion | Placement | Counter-example (what getting it wrong looks like) |
|---|---|---|---|
| 1 | Needed for every task **and** extremely short | entry file | Details only needed when changing `src/auth` are written into `CLAUDE.md` — every task pays its token tax |
| 2 | Cross-module mechanisms, architecture, how-tos; looked up by multiple tasks | docs (reachable from the index) | Written only in some PR description, unreachable from the index |
| 3 | why/gotchas/invariants needed only when changing that piece of code | code comment/docstring | Copying it into docs too: narrow audience but now maintaining an extra copy that will drift |
| 4 | **The rationale for the current conclusion**: why A was chosen, why B was rejected, and whether the rejection condition still holds | **the spec/docs it constrains, itself** (rationale lives with the conclusion in the same document) | Left only in a closed issue — six months later the agent re-proposes B and nobody remembers why it doesn't work |
| 5 | **The debate itself**: the discussion thread, intermediate proposals, who said what, concerns that no longer apply | issue/PR record | Pasting the whole thread into docs — every future read of that document pays for it in tokens |
| 6 | Non-development use (external-facing docs, operations manuals) | external wiki | Authoritative facts needed for development living in a wiki: the agent can't reach them, they should move into the repo |

The line between rules 4 and 5 comes down to one question: **will this reason still constrain future changes?** Yes → goes
into the spec; purely historical → stays in the issue.

Three corollaries:

- **Rationale and conclusion don't separate.** Don't split the rationale into a standalone decision-record file — if the
  agent reads the spec but not that record, it won't know why something can't be changed; if the spec changes and the record
  doesn't keep up, a reason is left hanging around after it's stopped applying. Keeping them in one document, updated in the
  same MR, minimizes drift risk; splitting the same decision across two documents is a "duplication" deduction under this
  policy. This is the same argument as rule 3 (the reason belongs next to the thing it constrains), just one level up.
- **Rationale is overwritten, not accumulated.** The same matter may go back and forth across several issues; every time it
  converges, overwrite the spec's rationale section, keeping only the latest version. The evolution history stays in issues
  and git history, not stacked up inside the spec.
- **The rationale must include the rejected options.** Writing only "chose A because X" doesn't stop someone re-proposing B;
  write "B was rejected because Z — Z still holds." The day the rejection condition stops holding, that section should be
  rewritten or deleted, not left there to mislead.

issue is the carrier with the second-highest access cost and the highest drift risk in this table: putting a still-active
constraint there means the agent can't reach a rule it has to follow.

## A spec describes intent, not the current shortfall

**Never write a known, temporary gap between the spec and the code into the spec as though it were the intended state.**
Doing so books a future `stale` claim: the sentence is true on the day it is written, it passes verification for exactly as
long as the defect survives, and the moment someone fixes the code — which is the outcome the gap was always headed
for — the document becomes false, with nobody watching that sentence.

Measured instance: a spec was edited to describe a known code shortfall as current behaviour, and the edit passed the round's
claim verification precisely because it matched the code at the time. The code was fixed later. The claim went stale, and it
took a re-verification round to notice, because nothing connects "we fixed the defect" to "a document was written in its
shape".

The failure is not an error of fact — it is a placement error, and it shows up in correctness and in
the freshness measure signals rather than in consistency. A shortfall is process, not intent, so it
belongs where process belongs (rule 5): an issue, or
`.docgrad/out-of-scope.jsonl` when it falls outside docgrad's remit (see [improve.md](improve.md) §Exit for findings outside
docgrad's remit). The spec keeps the intended behaviour. If the gap has to be visible from the document at all, mark it as a
gap and point at the issue — one line, obviously temporary, and easy to delete —

```markdown
> **Known gap:** `foo()` currently returns `null` on an empty input (#123). Intended behaviour is below.
```

— rather than rewriting the intended behaviour to match today's code. The test to apply before editing a spec is the same
one rules 4 and 5 turn on: **will this sentence still be true once the thing it describes is working as intended?** If no,
it is not a spec sentence.

Rule 6 used in reverse is this policy's single most valuable piece of advice: **if an authoritative fact lives somewhere the
agent can't reach, move it in before you even talk about scoring**
(the boundary on unsupported wiki/remote sources: see [design.md](../../../docs/design.md) §Positioning and boundaries).

## Placement is fixed once decided

- A piece of information has exactly **one** authoritative placement; every other carrier keeps only a pointer (a link, or a
  one-line `see path › symbol()`), never restating the content.
- Updates only touch the authoritative copy. Copying is debt — a second copy starts drifting the moment it's created.
- The allowed exception is a **summary**: it must be obviously a summary at a glance and carry a link to the authoritative
  source (this echoes the consistency ★4/★5 anchors).

## How to write the deduction

Findings are always sorted into two categories, consumed by judge's consistency dimension and by improve:

- **placement**: the information is in a single location, but the wrong one (judged against the three axes). The most
  common case: the spec has a conclusion but no rationale, and the rationale is still sitting in some closed issue (rule 4).
- **duplication**: the same fact is spelled out independently in two or more places, with no single authority.

Every deduction must fill all four columns, none optional: **information / current placement / suggested placement / reason
(which axis it violates)**. Don't raise a suggestion without a reason column — "moving it to docs would be better" isn't a
finding.

## Mutual constraint with token economy

Any suggestion to "move this up into the entry file" must come with its fixed-cost impact
(`inventory.entry_cost.tokens_est`), or this policy becomes a license for token inflation: placement says "moving it up
makes it easier to grab," token economy says "up there, every task pays for it" — only when the two constrain each other is
the judgment complete.

## Relationship to the existing dimensions

This policy isn't a new dimension; it's a higher-level rule over the existing anchors (formally decided in issue #4):

- consistency ★5, "one topic, one authority (everything else keeps only a summary + link)" = this policy's special case
  **within docs**.
- correctness ★5, "authoritative lists refer to code, don't restate it" = this policy's special case **between docs and
  code**.
- freshness (a measure signal since v2.0.0): the drift-risk axis is the upstream cause of stale
  documents — misplaced information is destined to go stale.

## Every repo can override this

The table above is a default, not the only valid answer (example: some teams treat the spec as the sole authority for
interface contracts, with docs keeping only pointers). Write any override explicitly in that repo's entry file or docs
index; scoring defers to that repo's stated declaration.

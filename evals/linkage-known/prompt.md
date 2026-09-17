---
allowed_tools: [Read, Glob, Grep, Skill, Bash]
max_turns: 60
timeout_seconds: 900
---

Run `/docgrad measure` and then `/docgrad judge` on the repository in `./target`, treating that
directory as the target repo root.

`git` and `node` for this workspace are in `./bin`; run the measurement scripts with
`PATH="$PWD/bin:$PATH"` so they execute and can read the target's history.

Output the complete scorecard, including both the Measure block (verdicts for every signal) and
the Judge block (star ratings for completeness, correctness, consistency).

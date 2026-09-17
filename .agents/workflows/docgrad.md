# /docgrad — grade and converge a repo's documentation

Apply the docgrad skill to this repository.

1. Locate the skill's `SKILL.md`: first try `.agents/skills/docgrad/SKILL.md` in this workspace; if absent, `~/.gemini/config/skills/docgrad/SKILL.md`.
2. Read it and follow it exactly: pick the command the user asked for (`init`, `measure`, `judge`, `audit`, `improve`, `loop`, `report`), and load only the `reference/` files that `SKILL.md` names for that command.
3. The five measurement scripts live next to `SKILL.md` under `scripts/`. They need Node ≥18 and no dependencies; run them from the repository being graded with `--root`.
4. If the user passed no argument, run `measure` when `.docgrad.yml` exists and `init` when it does not.

#!/usr/bin/env bash
# Seeds the run workspace with a copy of evals/fixtures/planted-contradiction as its own git repository.
#
# Why a copy and not the fixture in place: a run starts in an empty workspace and cannot reach the
# suite's directory. Why its own git repo: freshness and coverage read `git log` in the target root,
# so a fixture without history measures docgrad's degraded no-git path instead of the dimension.
set -euo pipefail

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# #59: a git and a node the sandboxed session can actually execute, resolved where they resolve.
. "$SUITE_DIR/../lib/provide-tools.sh"

FIXTURE="$SUITE_DIR/../fixtures/planted-contradiction"

rm -rf target
cp -R "$FIXTURE" target
cd target

git init -q
git config user.email eval@example.com
git config user.name eval
git config commit.gpgsign false
git add -A
# Pinned to the fixture's own claimed "Last updated" date, not the day the eval runs: freshness
# reads this commit's date for `date_drift`/`mismatches`, so an unpinned commit date would make
# both depend on when `claude plugin eval` happens to be invoked.
GIT_AUTHOR_DATE="2026-09-13T12:00:00" GIT_COMMITTER_DATE="2026-09-13T12:00:00" \
  git commit -q -m "fixture"

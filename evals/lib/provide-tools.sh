#!/usr/bin/env bash
# Puts the executables the session needs inside the run workspace, at ./bin/.
#
# Why this exists (#59). On macOS `/usr/bin/git` is the `xcrun` shim, and inside the eval sandbox it
# cannot write its cache, so it never locates the real binary:
#
#   git: error: couldn't create cache file '/var/folders/.../T/xcrun_db-…' (errno=Operation not permitted)
#   git: error: Failed to locate 'git'.
#
# Every git-derived signal then goes null — and `freshness.mjs` needs `gitDate()` to produce a
# mismatch at all, so `mismatches: []` becomes vacuous rather than clean, and the date signals cannot be
# established (in 1.x this capped the freshness star; in 2.0 the git-derived rows go null). The rating is
# right and the input is half missing, which is the one failure shape an eval must not have.
#
# The scaffold runs *before* the sandboxed session and its own `git init` works, so the resolution
# happens here, once, and the session never touches the shim: the wrapper execs the real binary by
# absolute path. Prepending a real git to PATH in the invoking shell does not survive into the
# sandbox, and `env:` in prompt.md only accepts EVAL_[A-Z0-9_]* keys — both were tried first.
set -euo pipefail

# Resolve symlinks before baking a path into the wrapper. A version manager may put the binary
# behind a per-shell symlink (fnm's `fnm_multishells/<pid>_<ts>/bin/node` is one), and that path
# stops existing when the shell does — the wrapper would work in this scaffold and be dangling by
# the time anything reads it.
stable_path() {
  if command -v realpath >/dev/null 2>&1; then realpath "$1"; else
    python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$1"
  fi
}

# xcrun knows where the real binary is; ask it here, where it can still write its cache. Fall back
# to whatever `git` resolves to, which on a Linux runner is already the real thing.
REAL_GIT="$(xcrun -f git 2>/dev/null || true)"
if [ -z "$REAL_GIT" ] || [ ! -x "$REAL_GIT" ]; then
  REAL_GIT="$(command -v git || true)"
fi
if [ -z "$REAL_GIT" ] || [ ! -x "$REAL_GIT" ]; then
  echo "provide-git: no git binary found; the run would measure docgrad's degraded no-git path" >&2
  exit 1
fi

mkdir -p bin
printf '#!/bin/sh\nexec %s "$@"\n' "$(stable_path "$REAL_GIT")" > bin/git
chmod +x bin/git

# `node` is not on the sandbox's default PATH either. Measured on 2026-09-15: the session found an
# fnm install by itself and said so in its report — the run only scored because the model went
# looking. A suite whose result depends on that is not measuring docgrad. Same technique, resolved
# in the same place.
REAL_NODE="$(command -v node || true)"
if [ -z "$REAL_NODE" ] || [ ! -x "$REAL_NODE" ]; then
  echo "provide-tools: no node binary found; the measurement scripts cannot run" >&2
  exit 1
fi
printf '#!/bin/sh\nexec %s "$@"\n' "$(stable_path "$REAL_NODE")" > bin/node
chmod +x bin/node

# Prove both here rather than letting the session discover them: a scaffold that silently produced
# a broken wrapper would reproduce #59 with a different error message.
PATH="$PWD/bin:$PATH" git --version >/dev/null
PATH="$PWD/bin:$PATH" node --version >/dev/null

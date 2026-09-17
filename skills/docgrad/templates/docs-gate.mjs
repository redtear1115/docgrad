#!/usr/bin/env node
// docs-gate.mjs — CI gate script for graduation (a docgrad-produced template, **not installed by docgrad**)
//
// This script deliberately does **not import** docgrad's lib.mjs: it gets copied into your
// repo, decoupled from docgrad's install path. It does exactly one thing — call the already
// installed docgrad measurement scripts, read back the JSON, apply thresholds, and exit non-zero
// on a violation. You decide the thresholds; docgrad doesn't decide how strict to be for you.
//
// Usage:
//   DOCGRAD_DIR=/path/to/docgrad node docs-gate.mjs [--root <repo>]
//
// DOCGRAD_DIR may point at either the plugin/repo root or the skill directory itself; both the
// pre-1.7.0 layout (scripts/ at the root) and the current one (skills/docgrad/scripts/) resolve.
//
// If DOCGRAD_DIR isn't found, it guesses once along common plugin install locations,
// and reports a clear error if it still can't find one.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

// ---- Thresholds: change these, not the judging logic ---------------------------------------------
const THRESHOLDS = {
  max_dead_links: 0, // not a single dead link allowed into main
  max_bad_anchors: 0, // same for bad anchors (no more false positives once slugs align with GitHub)
  max_orphans: 0, // a doc unreachable from the index = an agent can't retrieve it
  min_freshness_coverage: 0.9, // date-signal coverage ratio
  max_entry_cost_tokens: 5000, // entry-file fixed cost: the tax every task has to pay
  max_pollution_ratio: 0.1, // junk share of the corpus (tokens matched by exclude ÷ all collected doc tokens); pinned to this repo's ratio at graduation, not to docgrad's shipped default
};

// This gate runs against whatever is on disk when it runs. CI runs on a clean checkout, so it
// measures the clean corpus; a local run with untracked files may read a different pollution.ratio
// (see inventory.mjs's pollution.note).

// Returns the directory that actually *contains* `scripts/`, which since v1.7.0 is not necessarily
// the directory you point at: the skill payload moved to `skills/docgrad/` while an install root
// may still be the repo root. Probing both layouts keeps one gate file working against a 1.6.0
// install and a 1.7.0 one — CI copies of this file outlive the version that produced them.
const LAYOUTS = ['.', 'skills/docgrad'];

function scriptsDirUnder(dir) {
  for (const layout of LAYOUTS) {
    const candidate = path.resolve(dir, layout);
    if (fs.existsSync(path.join(candidate, 'scripts/links.mjs'))) return candidate;
  }
  return null;
}

function resolveDocgradDir() {
  if (process.env.DOCGRAD_DIR) {
    const dir = path.resolve(process.env.DOCGRAD_DIR);
    const resolved = scriptsDirUnder(dir);
    if (resolved) return resolved;
    console.error(`docs-gate: could not find scripts/links.mjs under DOCGRAD_DIR=${dir} (looked there and in skills/docgrad/). Check that the path points at docgrad's root directory.`);
    process.exit(2);
  }
  // A real plugin install lands at <cache>/<marketplace>/docgrad/<version>/, so the plugin-cache
  // candidates need that extra segment — without it this branch only ever matched the bare-clone
  // symlink, and every DOCGRAD_DIR-less run against a plugin install exited 2.
  const cacheRoots = ['claude-plugins-official', 'docgrad'].map((m) =>
    path.join(os.homedir(), '.claude/plugins/cache', m, 'docgrad')
  );
  const versioned = cacheRoots.flatMap((root) => {
    try {
      return fs
        .readdirSync(root, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => path.join(root, e.name))
        .sort()
        .reverse(); // newest version first, lexicographically
    } catch {
      return [];
    }
  });
  const candidates = [path.join(os.homedir(), '.claude/skills/docgrad'), ...cacheRoots, ...versioned];
  for (const c of candidates) {
    const resolved = scriptsDirUnder(c);
    if (resolved) return resolved;
  }
  console.error(
    'docs-gate: could not find a docgrad install directory. Set the DOCGRAD_DIR environment variable to the docgrad repo/plugin root.'
  );
  process.exit(2); // 2 = environment problem, kept separate from 1 = docs failed the gate, so CI can tell whose fault it is
}

function runScript(docgradDir, name, root) {
  const script = path.join(docgradDir, 'scripts', name);
  try {
    return JSON.parse(execFileSync(process.execPath, [script, '--root', root], { encoding: 'utf8' }));
  } catch (err) {
    console.error(`docs-gate: ${name} failed to run — ${err.message}`);
    process.exit(2);
  }
}

const rootIdx = process.argv.indexOf('--root');
const root = path.resolve(rootIdx >= 0 && process.argv[rootIdx + 1] ? process.argv[rootIdx + 1] : process.cwd());
const docgradDir = resolveDocgradDir();

const links = runScript(docgradDir, 'links.mjs', root);
const freshness = runScript(docgradDir, 'freshness.mjs', root);
const inventory = runScript(docgradDir, 'inventory.mjs', root);

const violations = [];
const check = (label, actual, ok, limit) => {
  if (!ok) violations.push(`${label}: ${actual} (threshold ${limit})`);
};

check('dead links', links.dead_links.length, links.dead_links.length <= THRESHOLDS.max_dead_links, THRESHOLDS.max_dead_links);
check('bad anchors', links.bad_anchors.length, links.bad_anchors.length <= THRESHOLDS.max_bad_anchors, THRESHOLDS.max_bad_anchors);
// links.mjs may return orphans as null — with no index_file (or under scope) reachability has no
// starting point, so what comes back is "not computed", not "zero orphans". The gate must not treat
// that as a pass: a threshold that can't be verified is a threshold that isn't being enforced.
// It counts as exit 1 (docs failed the gate) rather than 2 (environment problem) — having no index
// at all is itself a hole in the documentation system, not a mistake by whoever ran the gate.
if (links.orphans === null) {
  violations.push(
    'orphans: not computed — .docgrad.yml has no index_file, so reachability has no starting point (this is NOT "zero orphans")'
  );
} else {
  check('orphans', links.orphans.length, links.orphans.length <= THRESHOLDS.max_orphans, THRESHOLDS.max_orphans);
}
check(
  'freshness coverage',
  freshness.coverage_ratio,
  freshness.coverage_ratio >= THRESHOLDS.min_freshness_coverage,
  `>= ${THRESHOLDS.min_freshness_coverage}`
);
check(
  'entry-file fixed cost',
  `${inventory.entry_cost.tokens_est} tokens`,
  inventory.entry_cost.tokens_est <= THRESHOLDS.max_entry_cost_tokens,
  `<= ${THRESHOLDS.max_entry_cost_tokens}`
);
// inventory.pollution.ratio not being a number means this docgrad install is too old to emit it,
// or its output shape changed — an environment problem, not a docs failure, so this exits 2 rather
// than joining `violations` (which would exit 1).
if (typeof inventory.pollution?.ratio !== 'number') {
  console.error(
    'docs-gate: inventory.pollution.ratio is missing or not a number — this docgrad install may be too old to report it, or its output shape changed'
  );
  process.exit(2);
}
check(
  'pollution ratio',
  inventory.pollution.ratio,
  inventory.pollution.ratio <= THRESHOLDS.max_pollution_ratio,
  `<= ${THRESHOLDS.max_pollution_ratio}`
);

if (violations.length) {
  console.error('docs-gate: documentation failed the gate\n');
  for (const v of violations) console.error(`  ✗ ${v}`);
  if (links.dead_links.length) {
    console.error('\nDead link details:');
    for (const d of links.dead_links) console.error(`  ${d.file}:${d.line} → ${d.target}`);
  }
  if (links.orphans?.length) console.error(`\nOrphans: ${links.orphans.join(', ')}`);
  process.exit(1);
}

console.log(
  `docs-gate: passed (dead links 0 / bad anchors 0 / orphans 0 / freshness ${freshness.coverage_ratio} / ` +
    `fixed cost ${inventory.entry_cost.tokens_est} tokens / pollution ${inventory.pollution.ratio})`
);

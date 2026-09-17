// tests/docs-gate.test.mjs — the graduation gate template (skills/docgrad/templates/docs-gate.mjs),
// run as a real subprocess against temp repos, the way it runs in a graduated repo's CI. It is
// deliberately not imported: it is a copied-out artifact decoupled from docgrad's own install path
// (see its own header comment), and running it as a subprocess is the only way to exercise that.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DOCGRAD_ROOT = fileURLToPath(new URL('../', import.meta.url));
const TEMPLATE = fileURLToPath(new URL('../skills/docgrad/templates/docs-gate.mjs', import.meta.url));

// Runs a gate script (real template, or an edited copy) against `root`, with DOCGRAD_DIR pointing
// at a docgrad install (this repo, by default — real scripts, real thresholds). Never throws: the
// gate's own exit code is the thing under test, so failures come back as data, not exceptions.
function runGate(scriptPath, root, docgradDir = DOCGRAD_ROOT) {
  return spawnSync(process.execPath, [scriptPath, '--root', root], {
    encoding: 'utf8',
    env: { ...process.env, DOCGRAD_DIR: docgradDir },
  });
}

// A minimal clean repo: one entry file, one index, one linked page, all dated, nothing excluded.
// Everything about it is meant to pass every threshold at the template's shipped defaults.
function cleanRepo() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-gate-clean-'));
  fs.mkdirSync(path.join(tmp, 'docs'));
  fs.writeFileSync(
    path.join(tmp, '.docgrad.yml'),
    'docs_dirs: [docs/]\nentry_files: [CLAUDE.md]\nindex_file: docs/README.md\n' +
      'freshness:\n  convention: heading-line\n  field: "Last updated:"\n'
  );
  fs.writeFileSync(
    path.join(tmp, 'CLAUDE.md'),
    '# CLAUDE.md\n\n> Last updated: 2026-09-01\n\nEntry point. See [docs](docs/README.md).\n'
  );
  fs.writeFileSync(
    path.join(tmp, 'docs', 'README.md'),
    '# Docs index\n\n> Last updated: 2026-09-01\n\n- [Guide](guide.md)\n'
  );
  fs.writeFileSync(
    path.join(tmp, 'docs', 'guide.md'),
    '# Guide\n\n> Last updated: 2026-09-01\n\nSome guide content.\n'
  );
  return tmp;
}

// Same shape as cleanRepo(), plus a large file under an `exclude`d directory — pushes
// inventory.pollution.ratio well past the template's default 0.1 max_pollution_ratio.
function pollutedRepo(extraConfig = '') {
  const tmp = cleanRepo();
  fs.mkdirSync(path.join(tmp, 'docs', 'junk'));
  fs.writeFileSync(path.join(tmp, 'docs', 'junk', 'big.md'), '# junk\n' + 'x '.repeat(3000));
  fs.appendFileSync(path.join(tmp, '.docgrad.yml'), `exclude: [docs/junk/]\n${extraConfig}`);
  return tmp;
}

function pollutionRatioOf(root) {
  const out = JSON.parse(
    execFileSync(process.execPath, [path.join(DOCGRAD_ROOT, 'skills/docgrad/scripts/inventory.mjs'), '--root', root], {
      encoding: 'utf8',
    })
  );
  return out.pollution.ratio;
}

// Copies the real template into `dir`, replacing one THRESHOLDS literal (`key: <old>,`) with a new
// value. Exercises the gate as a file on disk, the way a graduated repo actually carries it — not
// a script written from scratch for the test.
function copyGateWithThreshold(dir, key, value) {
  const src = fs.readFileSync(TEMPLATE, 'utf8');
  const re = new RegExp(`(${key}:\\s*)[\\d.]+(,)`);
  assert.match(src, re, `template must declare ${key} as a plain numeric literal`);
  const edited = src.replace(re, `$1${value}$2`);
  const dest = path.join(dir, 'docs-gate.mjs');
  fs.writeFileSync(dest, edited);
  return dest;
}

function rm(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

test('docs-gate: passes at the shipped defaults on a clean repo, and the passed line prints pollution', () => {
  const tmp = cleanRepo();
  try {
    const res = runGate(TEMPLATE, tmp);
    assert.equal(res.status, 0, res.stdout + res.stderr);
    assert.match(res.stdout, /passed/);
    assert.match(res.stdout, /pollution 0/);
  } finally {
    rm(tmp);
  }
});

test('docs-gate: exits 1 and names pollution when an excluded junk file pushes the ratio over threshold', () => {
  const tmp = pollutedRepo();
  try {
    const ratio = pollutionRatioOf(tmp);
    assert.ok(ratio > 0.1, `fixture must actually exceed the default threshold, got ${ratio}`);
    const res = runGate(TEMPLATE, tmp);
    assert.equal(res.status, 1, res.stdout + res.stderr);
    assert.match(res.stderr, /pollution ratio/);
    assert.match(res.stderr, new RegExp(String(ratio).replace('.', '\\.')));
  } finally {
    rm(tmp);
  }
});

test('docs-gate: exits 2 when inventory.pollution.ratio is missing (old/stubbed docgrad install)', () => {
  const stubDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-gate-stub-'));
  const tmp = cleanRepo();
  try {
    fs.mkdirSync(path.join(stubDir, 'scripts'));
    fs.writeFileSync(
      path.join(stubDir, 'scripts', 'links.mjs'),
      "#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({ dead_links: [], bad_anchors: [], orphans: [] }));\n"
    );
    fs.writeFileSync(
      path.join(stubDir, 'scripts', 'freshness.mjs'),
      "#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({ coverage_ratio: 1 }));\n"
    );
    // Deliberately no `pollution` field — the shape an install predating it would emit.
    fs.writeFileSync(
      path.join(stubDir, 'scripts', 'inventory.mjs'),
      "#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({ entry_cost: { tokens_est: 10 } }));\n"
    );
    const res = runGate(TEMPLATE, tmp, stubDir);
    assert.equal(res.status, 2, res.stdout + res.stderr);
    assert.match(res.stderr, /pollution\.ratio/);
  } finally {
    rm(stubDir);
    rm(tmp);
  }
});

test('docs-gate: exits 0 when max_pollution_ratio is pinned to a repo\'s own (above-default) ratio, even with targets: pollution: WATCH', () => {
  const tmp = pollutedRepo('targets:\n  pollution: WATCH\n');
  try {
    const ratio = pollutionRatioOf(tmp);
    assert.ok(ratio > 0.1, `fixture must exceed the shipped default to exercise the pin, got ${ratio}`);
    const gate = copyGateWithThreshold(tmp, 'max_pollution_ratio', ratio);
    const res = runGate(gate, tmp);
    assert.equal(res.status, 0, res.stdout + res.stderr);
    assert.match(res.stdout, /passed/);
  } finally {
    rm(tmp);
  }
});

test('docs-gate: THRESHOLDS stays a plain key: <number> list (measure.md 8b\'s fail-closed parser contract)', () => {
  const src = fs.readFileSync(TEMPLATE, 'utf8');
  const match = src.match(/const THRESHOLDS = \{([\s\S]*?)\n\};/);
  assert.ok(match, 'template must declare a THRESHOLDS object literal');
  const lines = match[1].split('\n').map((l) => l.trim()).filter(Boolean);
  assert.ok(lines.length >= 5, 'THRESHOLDS should declare at least the five known keys');
  for (const line of lines) {
    // key: <number>, // optional trailing comment — nothing computed, no interpolation, no strings.
    assert.match(
      line,
      /^[a-z_]+:\s*-?\d+(\.\d+)?,(\s*\/\/.*)?$/,
      `THRESHOLDS line is not a plain "key: <number>," literal: ${JSON.stringify(line)}`
    );
  }
});

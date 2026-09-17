import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const FIXTURE = fileURLToPath(new URL('./fixtures/basic/', import.meta.url));
const SCRIPT = fileURLToPath(new URL('../skills/docgrad/scripts/freshness.mjs', import.meta.url));

function makeGitFixture() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-git-'));
  fs.cpSync(FIXTURE, tmp, { recursive: true });
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 't@example.com',
    GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 't@example.com',
    GIT_AUTHOR_DATE: '2026-06-15T12:00:00', GIT_COMMITTER_DATE: '2026-06-15T12:00:00',
  };
  execFileSync('git', ['init', '-q'], { cwd: tmp, env });
  execFileSync('git', ['add', '-A'], { cwd: tmp, env });
  execFileSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'fixture'], { cwd: tmp, env });
  return tmp;
}

test('freshness: --exclude-ledger is a no-op, note explains why (#54)', () => {
  const out = JSON.parse(
    execFileSync(process.execPath, [SCRIPT, '--root', FIXTURE, '--exclude-ledger', '/nonexistent/ledger.jsonl'], { encoding: 'utf8' })
  );
  assert.match(out.note, /--exclude-ledger is a no-op for this script/);
});

test('freshness: without --exclude-ledger there is no note field at all (unchanged from before this flag existed)', () => {
  const out = JSON.parse(execFileSync(process.execPath, [SCRIPT, '--root', FIXTURE], { encoding: 'utf8' }));
  assert.ok(!('note' in out));
});

test('freshness: coverage/stale/mismatch (DOCGRAD_TODAY pins today)', () => {
  const tmp = makeGitFixture();
  const r = spawnSync(process.execPath, [SCRIPT, '--root', tmp], {
    encoding: 'utf8',
    env: { ...process.env, DOCGRAD_TODAY: '2026-09-01' },
  });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.deepEqual(out.convention, ['heading-line']);
  assert.equal(out.files_total, 4);
  assert.equal(out.files_with_signal, 2); // README and CLAUDE.md have a Last updated line
  assert.equal(out.coverage_ratio, 0.5);
  // all git dates are 2026-06-15 -> age 78 days > 60 -> all four files are stale
  assert.equal(out.stale.length, 4);
  assert.ok(out.stale.every((s) => s.age_days === 78));
  // CLAUDE.md claims 2026-06-01 but git says 2026-06-15 -> drift 14 > 7 -> mismatch
  assert.deepEqual(out.mismatches, [
    { path: 'CLAUDE.md', claimed: '2026-06-01', actual_git: '2026-06-15', drift_days: 14 },
  ]);
});

test('freshness: convention none -> zero signal, no crash (CLI e2e)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-none-'));
  try {
    fs.cpSync(FIXTURE, tmp, { recursive: true });
    fs.writeFileSync(
      path.join(tmp, '.docgrad.yml'),
      'docs_dirs: [docs/]\nentry_files: [CLAUDE.md]\nexclude: [docs/archive/]\nfreshness:\n  convention: none\n'
    );
    const r = spawnSync(process.execPath, [SCRIPT, '--root', tmp], {
      encoding: 'utf8',
      env: { ...process.env, DOCGRAD_TODAY: '2026-09-01' },
    });
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.deepEqual(out.convention, ['none']);
    assert.equal(out.files_with_signal, 0);
    assert.equal(out.coverage_ratio, 0);
    assert.deepEqual(out.stale, []); // no git, no claimed -> age is always null
    assert.deepEqual(out.mismatches, []);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('freshness: not a git repo -> actual_git is null, no crash', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-nogit-'));
  fs.cpSync(FIXTURE, tmp, { recursive: true });
  const r = spawnSync(process.execPath, [SCRIPT, '--root', tmp], {
    encoding: 'utf8',
    env: { ...process.env, DOCGRAD_TODAY: '2026-09-01' },
  });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.coverage_ratio, 0.5);
  assert.ok(out.stale.every((s) => s.actual_git === null)); // falls back to claimed as the basis
});

// --- E2b-1: measure verdicts -----------------------------------------------------------

test('freshness: measure array — ids in table order, right after docgrad/note, WATCH on the git fixture (key_doc_age 78 days, date_drift 14 days)', () => {
  const tmp = makeGitFixture();
  const r = spawnSync(process.execPath, [SCRIPT, '--root', tmp], {
    encoding: 'utf8',
    env: { ...process.env, DOCGRAD_TODAY: '2026-09-01' },
  });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.deepEqual(
    out.measure.map((m) => m.id),
    ['date_coverage', 'key_doc_age', 'date_drift']
  );
  const byId = Object.fromEntries(out.measure.map((m) => [m.id, m]));
  assert.equal(byId.date_coverage.verdict, 'FAIL'); // coverage_ratio 0.5 < 60%
  // key docs = entry_files (CLAUDE.md) ∪ index_file (docs/README.md), both aged 78 days:
  // > 60 (stale_after_days) and ≤ 180 -> WATCH.
  assert.equal(byId.key_doc_age.value, 78);
  assert.equal(byId.key_doc_age.verdict, 'WATCH');
  assert.equal(byId.date_drift.value, 14);
  assert.equal(byId.date_drift.verdict, 'OK'); // 14 < 30
});

test('freshness: measure — files_total: 0 (an --include matching nothing) makes date_coverage null, not a 0/0 FAIL', () => {
  const r = spawnSync(process.execPath, [SCRIPT, '--root', FIXTURE, '--include', 'nope/**'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.files_total, 0);
  const dateCoverage = out.measure.find((m) => m.id === 'date_coverage');
  assert.equal(dateCoverage.verdict, null);
  assert.equal(dateCoverage.note, 'empty corpus');
});

test('freshness: measure — a scoped run nulls key_doc_age only; date_coverage and date_drift are still evaluated over the scope', () => {
  const tmp = makeGitFixture();
  const r = spawnSync(process.execPath, [SCRIPT, '--root', tmp, '--include', 'docs/**'], {
    encoding: 'utf8',
    env: { ...process.env, DOCGRAD_TODAY: '2026-09-01' },
  });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  const byId = Object.fromEntries(out.measure.map((m) => [m.id, m]));
  assert.equal(byId.key_doc_age.verdict, null);
  assert.equal(byId.key_doc_age.note, 'key documents are a full-corpus concept');
  assert.notEqual(byId.date_coverage.verdict, null);
  assert.notEqual(byId.date_drift.verdict, null);
});

test('freshness: measure — a key document missing a date signal is skipped and named, not counted as age 0', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-keydoc-nodate-'));
  try {
    fs.mkdirSync(path.join(tmp, 'docs'));
    fs.writeFileSync(path.join(tmp, 'CLAUDE.md'), '# entry\n\nno date signal here.\n');
    fs.writeFileSync(path.join(tmp, 'docs', 'README.md'), '# Index\n\n> **Last updated:** 2026-06-01\n');
    fs.writeFileSync(
      path.join(tmp, '.docgrad.yml'),
      'docs_dirs: [docs/]\nentry_files: [CLAUDE.md]\nindex_file: docs/README.md\nfreshness:\n  convention: heading-line\n  field: "Last updated:"\n'
    );
    const r = spawnSync(process.execPath, [SCRIPT, '--root', tmp], {
      encoding: 'utf8',
      env: { ...process.env, DOCGRAD_TODAY: '2026-09-01' },
    });
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    const keyDocAge = out.measure.find((m) => m.id === 'key_doc_age');
    assert.notEqual(keyDocAge.verdict, null, 'README.md still has a date signal, so the row is measurable');
    assert.match(keyDocAge.note, /CLAUDE\.md has no date signal/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('freshness: measure — this repo is date_coverage OK, key_doc_age OK, date_drift OK', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const out = JSON.parse(execFileSync(process.execPath, [SCRIPT, '--root', root], { encoding: 'utf8' }));
  assert.ok(out.measure.every((m) => m.verdict === 'OK'), JSON.stringify(out.measure));
});

function makeMixedConventionFixture(conventionLine) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-mixed-'));
  fs.mkdirSync(path.join(tmp, 'docs'));
  fs.writeFileSync(
    path.join(tmp, 'docs', 'fm.md'),
    '---\nlast_updated: 2026-07-01\n---\n# FM\n\n走 frontmatter 慣例。\n'
  );
  fs.writeFileSync(
    path.join(tmp, 'docs', 'hl.md'),
    '# HL\n\n> **Last updated:** 2026-07-02\n\n走 heading-line 慣例。\n'
  );
  fs.writeFileSync(
    path.join(tmp, '.docgrad.yml'),
    `docs_dirs: [docs/]\nentry_files: []\nfreshness:\n${conventionLine}\n`
  );
  return tmp;
}

test('freshness: convention with multiple values (frontmatter,heading-line) -> both files get a signal, coverage_ratio=1', () => {
  const tmp = makeMixedConventionFixture(
    '  convention: frontmatter,heading-line\n  field: last_updated\n  heading_field: "Last updated:"'
  );
  try {
    const r = spawnSync(process.execPath, [SCRIPT, '--root', tmp], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.deepEqual(out.convention, ['frontmatter', 'heading-line']);
    assert.equal(out.files_total, 2);
    assert.equal(out.files_with_signal, 2);
    assert.equal(out.coverage_ratio, 1);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('freshness: a single-value convention only recognizes one form in the same fixture -> coverage_ratio=0.5', () => {
  const tmpFm = makeMixedConventionFixture('  convention: frontmatter\n  field: last_updated');
  const tmpHl = makeMixedConventionFixture('  convention: heading-line\n  field: "Last updated:"');
  try {
    const rFm = spawnSync(process.execPath, [SCRIPT, '--root', tmpFm], { encoding: 'utf8' });
    assert.equal(rFm.status, 0, rFm.stderr);
    const outFm = JSON.parse(rFm.stdout);
    assert.deepEqual(outFm.convention, ['frontmatter']);
    assert.equal(outFm.coverage_ratio, 0.5);

    const rHl = spawnSync(process.execPath, [SCRIPT, '--root', tmpHl], { encoding: 'utf8' });
    assert.equal(rHl.status, 0, rHl.stderr);
    const outHl = JSON.parse(rHl.stdout);
    assert.deepEqual(outHl.convention, ['heading-line']);
    assert.equal(outHl.coverage_ratio, 0.5);
  } finally {
    fs.rmSync(tmpFm, { recursive: true, force: true });
    fs.rmSync(tmpHl, { recursive: true, force: true });
  }
});

test('freshness: only field set with convention including heading-line -> falls back to field as the keyword (compatible with old configs)', () => {
  const tmp = makeMixedConventionFixture('  convention: heading-line\n  field: "Last updated:"');
  try {
    const r = spawnSync(process.execPath, [SCRIPT, '--root', tmp], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.equal(out.coverage_ratio, 0.5); // only hl.md matches
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("freshness: docgrad's own convergence commit doesn't count as a content update (no self-pollution)", () => {
  // What actually happened on oikos on 2026-07-13: round 1 backfilled last_updated on 39 files,
  // and that commit itself pushed those files' git dates to that same day, so round 2 saw 38 false mismatches.
  const tmp = makeGitFixture();
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 't@example.com',
    GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 't@example.com',
    GIT_AUTHOR_DATE: '2026-08-20T12:00:00', GIT_COMMITTER_DATE: '2026-08-20T12:00:00',
  };
  // Simulate a docgrad convergence: only the date line changes, and the commit message follows improve.md's fixed format.
  const claude = path.join(tmp, 'CLAUDE.md');
  fs.writeFileSync(claude, fs.readFileSync(claude, 'utf8').replace('2026-06-01', '2026-06-15'));
  execFileSync('git', ['add', '-A'], { cwd: tmp, env });
  execFileSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-q', '-m',
    'docs(docgrad): round 1 convergence — freshness ★1→★4'], { cwd: tmp, env });

  const out = JSON.parse(spawnSync(process.execPath, [SCRIPT, '--root', tmp], {
    encoding: 'utf8',
    env: { ...process.env, DOCGRAD_TODAY: '2026-09-01' },
  }).stdout);
  const claudeRow = out.stale.find((s) => s.path === 'CLAUDE.md');
  // recognizes 2026-06-15 (the most recent non-docgrad commit), not the convergence day of 2026-08-20.
  assert.equal(claudeRow.actual_git, '2026-06-15');
  assert.equal(out.mismatches.length, 0); // the dates already line up, and the convergence commit didn't push the git date away
});

test('freshness: date_concentration catches the signature of a big backfill', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-conc-'));
  try {
    fs.mkdirSync(path.join(tmp, 'docs'));
    fs.writeFileSync(path.join(tmp, '.docgrad.yml'),
      'docs_dirs: [docs/]\nfreshness:\n  convention: heading-line\n  field: "Last updated:"\n');
    // three files on the same day (a backfill), one file on a different day.
    for (const [name, date] of [['a', '2026-07-13'], ['b', '2026-07-13'], ['c', '2026-07-13'], ['d', '2026-08-01']]) {
      fs.writeFileSync(path.join(tmp, 'docs', `${name}.md`), `# ${name}\n\n> **Last updated:** ${date}\n`);
    }
    const out = JSON.parse(spawnSync(process.execPath, [SCRIPT, '--root', tmp], {
      encoding: 'utf8',
      env: { ...process.env, DOCGRAD_TODAY: '2026-09-01' },
    }).stdout);
    assert.equal(out.coverage_ratio, 1); // full coverage, but the signal actually has no discriminative power
    assert.equal(out.date_concentration.max_same_day_ratio, 0.75);
    assert.equal(out.date_concentration.date, '2026-07-13');
    assert.equal(out.date_concentration.files, 3);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('freshness: output carries the docgrad fingerprint, right after scope (#45)', () => {
  const out = JSON.parse(execFileSync(process.execPath, [SCRIPT, '--root', FIXTURE], { encoding: 'utf8' }));
  assert.equal(typeof out.docgrad.version, 'string');
  assert.notEqual(out.docgrad.version, null); // #47: a null version here is the silent failure mode
  assert.match(out.docgrad.judge_hash, /^[0-9a-f]{8}$/);
  assert.equal('rubric_hash' in out.docgrad, false);
  assert.match(out.docgrad.corpus_hash, /^[0-9a-f]{8}$/);
  // Same placement as inventory.mjs, so the five scripts' JSON can be compared field by field.
  assert.deepEqual(Object.keys(out).slice(0, 2), ['scope', 'docgrad']);
});

test('freshness: heading_field as a list -> files written under either date-line habit both get a signal', () => {
  const tmp = makeMixedConventionFixture(
    '  convention: heading-line\n  field: "Last updated:"\n  heading_field: ["Last updated:", "Updated:"]'
  );
  fs.writeFileSync(path.join(tmp, 'docs', 'hl2.md'), '# HL2\n\n> Updated: 2026-07-03\n\n第二種寫法。\n');
  try {
    const r = spawnSync(process.execPath, [SCRIPT, '--root', tmp], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.equal(out.files_total, 3);
    assert.equal(out.files_with_signal, 2); // hl.md + hl2.md; fm.md has no heading line
    assert.equal(out.coverage_ratio, 0.6667);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('freshness: field as a list -> frontmatter written under either key gets a signal', () => {
  const tmp = makeMixedConventionFixture('  convention: frontmatter\n  field: [last_updated, last_session]');
  fs.writeFileSync(path.join(tmp, 'docs', 'fm2.md'), '---\nlast_session: 2026-07-04\n---\n# FM2\n');
  try {
    const r = spawnSync(process.execPath, [SCRIPT, '--root', tmp], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.equal(out.files_total, 3);
    assert.equal(out.files_with_signal, 2); // fm.md + fm2.md
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('freshness: an empty field list is rejected like a missing field', () => {
  const tmp = makeMixedConventionFixture('  convention: frontmatter\n  field: []');
  try {
    const r = spawnSync(process.execPath, [SCRIPT, '--root', tmp], { encoding: 'utf8' });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /freshness\.field must name at least one keyword/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('freshness: frontmatter field list — a first field without a date does not stop the search (document order decides)', () => {
  const tmp = makeMixedConventionFixture('  convention: frontmatter\n  field: [last_updated, last_session]');
  fs.writeFileSync(path.join(tmp, 'docs', 'fm.md'), '---\nlast_updated: null\nlast_session: 2026-07-04\n---\n# FM\n');
  try {
    const r = spawnSync(process.execPath, [SCRIPT, '--root', tmp], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.equal(out.files_with_signal, 1); // fm.md via last_session; hl.md has no frontmatter
    assert.equal(out.date_concentration.date, '2026-07-04');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

const CONFIG_ERROR_CASES = [
  ['empty heading_field list under an active heading-line convention',
    '  convention: heading-line\n  field: "Last updated:"\n  heading_field: []', /freshness\.heading_field must name at least one keyword/],
  ['non-string list element', '  convention: frontmatter\n  field: [last_updated, 3]', /freshness\.field\[1\] must be a non-empty keyword string/],
  ['empty-string keyword under an active convention', '  convention: frontmatter\n  field: ""', /freshness\.field must be a non-empty keyword string/],
];
for (const [label, freshnessLines, expected] of CONFIG_ERROR_CASES) {
  test(`freshness: config error — ${label}`, () => {
    const tmp = makeMixedConventionFixture(freshnessLines);
    try {
      const r = spawnSync(process.execPath, [SCRIPT, '--root', tmp], { encoding: 'utf8' });
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, expected);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
}

test('freshness: a field nobody reads is not validated — convention: none with field: "" still runs, as before', () => {
  const tmp = makeMixedConventionFixture('  convention: none\n  field: ""');
  try {
    const r = spawnSync(process.execPath, [SCRIPT, '--root', tmp], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout).files_with_signal, 0);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('freshness: a quoted keyword containing a comma survives the inline list, end to end through .docgrad.yml', () => {
  const tmp = makeMixedConventionFixture('  convention: heading-line\n  field: "Last updated:"\n  heading_field: ["Updated, last:", "Other:"]');
  fs.writeFileSync(path.join(tmp, 'docs', 'hl.md'), '# HL\n\n> Updated, last: 2026-07-05\n');
  try {
    const r = spawnSync(process.execPath, [SCRIPT, '--root', tmp], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.equal(out.files_with_signal, 1);
    assert.equal(out.date_concentration.date, '2026-07-05');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('freshness: a scalar keyword and the same keyword as a one-element list measure identically', () => {
  const scalar = makeMixedConventionFixture('  convention: heading-line\n  field: "Last updated:"');
  const list = makeMixedConventionFixture('  convention: heading-line\n  field: ["Last updated:"]');
  try {
    const a = spawnSync(process.execPath, [SCRIPT, '--root', scalar], { encoding: 'utf8' });
    const b = spawnSync(process.execPath, [SCRIPT, '--root', list], { encoding: 'utf8' });
    assert.equal(a.status, 0, a.stderr);
    assert.equal(b.status, 0, b.stderr);
    assert.deepEqual(JSON.parse(a.stdout), JSON.parse(b.stdout)); // corpus_hash included: the keyword fields are not part of it
  } finally {
    fs.rmSync(scalar, { recursive: true, force: true });
    fs.rmSync(list, { recursive: true, force: true });
  }
});

test('freshness: with two dated fields in one frontmatter, document order wins over list order', () => {
  const tmp = makeMixedConventionFixture('  convention: frontmatter\n  field: [last_session, last_updated]');
  fs.writeFileSync(path.join(tmp, 'docs', 'fm.md'), '---\nlast_updated: 2026-07-01\nlast_session: 2026-07-09\n---\n# FM\n');
  fs.rmSync(path.join(tmp, 'docs', 'hl.md'));
  try {
    const r = spawnSync(process.execPath, [SCRIPT, '--root', tmp], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout).date_concentration.date, '2026-07-01'); // the earlier *line*, not the earlier list entry
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('freshness: --locate-ledger is a no-op, note explains why (#63)', () => {
  const out = JSON.parse(
    execFileSync(process.execPath, [SCRIPT, '--root', FIXTURE, '--locate-ledger', '/nonexistent/ledger.jsonl'], { encoding: 'utf8' })
  );
  assert.match(out.note, /--locate-ledger is a no-op for this script/);
});

test('freshness: both ledger flags at once produce one note naming both (#63)', () => {
  const out = JSON.parse(
    execFileSync(
      process.execPath,
      [SCRIPT, '--root', FIXTURE, '--exclude-ledger', '/nonexistent/a.jsonl', '--locate-ledger', '/nonexistent/b.jsonl'],
      { encoding: 'utf8' }
    )
  );
  assert.match(out.note, /--exclude-ledger is a no-op for this script/);
  assert.match(out.note, /--locate-ledger is a no-op for this script/);
});

// --- v2.0.0 E2c-1: targets / accept / meets_target / legacy-target note ------------------------

test('freshness: measure — every row carries accept and meets_target, and legacy targets are absent by default', () => {
  const tmp = makeGitFixture();
  try {
    const out = JSON.parse(execFileSync(process.execPath, [SCRIPT, '--root', tmp], { encoding: 'utf8' }));
    for (const row of out.measure) {
      assert.ok('accept' in row, `${row.id} is missing accept`);
      assert.ok('meets_target' in row, `${row.id} is missing meets_target`);
    }
    assert.ok(!('note' in out), 'no legacy targets in this config, no note');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('freshness: legacy star target keys produce the shared warning clause in note, dropped from targets', () => {
  const tmp = makeGitFixture();
  try {
    fs.writeFileSync(
      path.join(tmp, '.docgrad.yml'),
      'docs_dirs: [docs/]\nentry_files: [CLAUDE.md]\nindex_file: docs/README.md\nexclude: [docs/archive/]\n' +
        'freshness:\n  convention: heading-line\n  field: "Last updated:"\ntargets:\n  freshness: 4\n'
    );
    const out = JSON.parse(execFileSync(process.execPath, [SCRIPT, '--root', tmp], { encoding: 'utf8' }));
    assert.match(out.note, /targets: ignored legacy star targets freshness/);
    assert.match(out.note, /measure\.md §Targets/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

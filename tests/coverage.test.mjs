import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../skills/docgrad/scripts/coverage.mjs', import.meta.url));

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 't@example.com',
  GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 't@example.com',
};

const DOCGRAD_YML =
  'docs_dirs: [docs/]\n' +
  'entry_files: [CLAUDE.md]\n' +
  'src_dirs: [src/]\n' +
  'coverage:\n' +
  '  drift_after_days: 30\n' +
  '  min_commits: 3\n';

function write(tmp, rel, content) {
  const abs = path.join(tmp, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

// Write the initial files (without src/billing -- that's added in a later commit)
function writeBaseFiles(tmp) {
  write(tmp, '.docgrad.yml', DOCGRAD_YML);
  write(tmp, 'CLAUDE.md', '# 專案\n\n共用工具放在 src/utils 目錄。\n');
  write(tmp, 'docs/auth.md', '# 認證\n\n登入邏輯見 src/auth/login.js。\n');
  write(tmp, 'docs/search.md', '# 搜尋\n\n搜尋子系統在 src/search。\n');
  // near-miss strings: should not count as a mention (boundary matching test)
  write(tmp, 'docs/misc.md', '# 雜項\n\n近似字串:src/searchx、mysrc/auth、src/authx 都不算。\n');
  write(tmp, 'src/auth/login.js', 'export const login = () => {};\n');
  write(tmp, 'src/search/query.js', 'export const query = () => {};\n');
  write(tmp, 'src/utils/fmt.js', 'export const fmt = (x) => x;\n');
}

function commitAll(tmp, date, msg) {
  const env = { ...GIT_ENV, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date };
  execFileSync('git', ['add', '-A'], { cwd: tmp, env });
  execFileSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', msg], { cwd: tmp, env });
}

// Build a multi-commit git fixture:
// commit 1 @ 2026-06-15  all initial files
// commit 2 @ 2026-08-20  edits src/search/query.js
// commit 3 @ 2026-08-20  edits src/search/query.js + adds src/billing/pay.js
// commit 4 @ 2026-08-20  edits src/search/query.js + edits src/utils/fmt.js (once)
function makeCoverageFixture() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-cov-'));
  writeBaseFiles(tmp);
  execFileSync('git', ['init', '-q'], { cwd: tmp, env: GIT_ENV });
  commitAll(tmp, '2026-06-15T12:00:00', 'init');

  write(tmp, 'src/search/query.js', 'export const query = () => {}; // change 1\n');
  commitAll(tmp, '2026-08-20T12:00:00', 'search 1');

  write(tmp, 'src/search/query.js', 'export const query = () => {}; // change 2\n');
  write(tmp, 'src/billing/pay.js', 'export const pay = () => {};\n');
  commitAll(tmp, '2026-08-20T12:00:01', 'search 2 + billing');

  write(tmp, 'src/search/query.js', 'export const query = () => {}; // change 3\n');
  write(tmp, 'src/utils/fmt.js', 'export const fmt = (x) => x; // change\n');
  commitAll(tmp, '2026-08-20T12:00:02', 'search 3 + utils');
  return tmp;
}

function run(tmp, extraArgs = []) {
  const r = spawnSync(process.execPath, [SCRIPT, '--root', tmp, ...extraArgs], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

test('coverage: main flow covered/undocumented/drifted + the min_commits gate', () => {
  const tmp = makeCoverageFixture();
  try {
    const out = run(tmp);
    assert.deepEqual(out.src_dirs, ['src/']);
    assert.deepEqual(out.thresholds, { drift_after_days: 30, min_commits: 3 });
    assert.deepEqual(out.loose_files, { 'src/': 0 });

    const byArea = Object.fromEntries(out.areas.map((a) => [a.area, a]));

    // src/auth: doc and code share a commit -> covered, commits_since_doc 0
    assert.equal(byArea['src/auth'].status, 'covered');
    assert.deepEqual(byArea['src/auth'].mentioned_by, ['docs/auth.md']);
    assert.equal(byArea['src/auth'].commits_since_doc, 0);

    // src/billing: no document mentions it -> undocumented
    assert.equal(byArea['src/billing'].status, 'undocumented');
    assert.deepEqual(byArea['src/billing'].mentioned_by, []);
    assert.equal(byArea['src/billing'].last_doc_commit, null);
    assert.equal(byArea['src/billing'].commits_since_doc, null);

    // src/search: doc stopped at 06-15, code has three commits @ 08-20 -> drifted
    assert.equal(byArea['src/search'].status, 'drifted');
    assert.deepEqual(byArea['src/search'].mentioned_by, ['docs/search.md']);
    assert.equal(byArea['src/search'].commits_since_doc, 3);
    assert.ok(Math.abs(byArea['src/search'].drift_days - 66) <= 1, `drift_days=${byArea['src/search'].drift_days}`);

    // src/utils: has drift but commits(1) < min_commits(3) -> covered (gated)
    assert.equal(byArea['src/utils'].status, 'covered');
    assert.deepEqual(byArea['src/utils'].mentioned_by, ['CLAUDE.md']);
    assert.equal(byArea['src/utils'].commits_since_doc, 1);
    assert.ok(byArea['src/utils'].drift_days > 30);

    // correct lists, correctly sorted
    assert.deepEqual(out.undocumented, ['src/billing']);
    assert.deepEqual(out.drifted, ['src/search']);
    // areas sorted by area name
    assert.deepEqual(
      out.areas.map((a) => a.area),
      ['src/auth', 'src/billing', 'src/search', 'src/utils']
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// --- E2b-1: measure verdicts -----------------------------------------------------------

test('coverage: measure array — ids in order, right after docgrad, WATCH (undocumented/drifted both >0, no FAIL line — U4)', () => {
  const tmp = makeCoverageFixture();
  try {
    const out = run(tmp);
    assert.deepEqual(Object.keys(out).slice(0, 2), ['scope', 'docgrad']);
    assert.deepEqual(
      out.measure.map((m) => m.id),
      ['undocumented_dirs', 'drifted_dirs']
    );
    const byId = Object.fromEntries(out.measure.map((m) => [m.id, m]));
    assert.equal(byId.undocumented_dirs.value, out.undocumented.length);
    assert.equal(byId.undocumented_dirs.verdict, 'WATCH');
    assert.equal(byId.drifted_dirs.value, out.drifted.length);
    assert.equal(byId.drifted_dirs.verdict, 'WATCH');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('coverage: measure — src_dirs unset nulls both rows with note "src_dirs is unset"', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-cov-measure-empty-'));
  try {
    write(tmp, '.docgrad.yml', 'docs_dirs: [docs/]\nentry_files: [CLAUDE.md]\n');
    write(tmp, 'CLAUDE.md', '# 專案\n');
    const out = run(tmp);
    for (const id of ['undocumented_dirs', 'drifted_dirs']) {
      const row = out.measure.find((m) => m.id === id);
      assert.equal(row.verdict, null);
      assert.equal(row.note, 'src_dirs is unset');
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('coverage: measure — this repo is undocumented_dirs OK, drifted_dirs OK', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const out = JSON.parse(execFileSync(process.execPath, [SCRIPT, '--root', root], { encoding: 'utf8' }));
  assert.ok(out.measure.every((m) => m.verdict === 'OK'), JSON.stringify(out.measure));
});

test('coverage: boundary matching -- src/authx, mysrc/auth do not count as mentions', () => {
  const tmp = makeCoverageFixture();
  try {
    const out = run(tmp);
    const byArea = Object.fromEntries(out.areas.map((a) => [a.area, a]));
    // docs/misc.md only contains near-miss strings and must not appear in any mentioned_by
    for (const a of out.areas) {
      assert.ok(!a.mentioned_by.includes('docs/misc.md'), `${a.area} wrongly matched misc.md`);
    }
    // src/auth is mentioned only by docs/auth.md (not misc's src/authx / mysrc/auth)
    assert.deepEqual(byArea['src/auth'].mentioned_by, ['docs/auth.md']);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('coverage: src_dirs unset -> areas empty, note present, exit 0', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-cov-empty-'));
  try {
    write(tmp, '.docgrad.yml', 'docs_dirs: [docs/]\nentry_files: [CLAUDE.md]\n');
    write(tmp, 'CLAUDE.md', '# 專案\n');
    const out = run(tmp);
    assert.deepEqual(out.src_dirs, []);
    assert.deepEqual(out.areas, []);
    assert.ok(typeof out.note === 'string' && out.note.length > 0);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('coverage: --exclude-ledger is a no-op, note explains why (#54)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-cov-noledger-'));
  try {
    writeBaseFiles(tmp);
    const out = run(tmp, ['--exclude-ledger', '/nonexistent/ledger.jsonl']);
    assert.match(out.note, /--exclude-ledger is a no-op for this script/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('coverage: --include is deliberately a no-op (scope + note explain the full comparison)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-cov-scope-'));
  try {
    writeBaseFiles(tmp);
    // docs/auth.md falls outside scope -- if scope took effect, src/auth would be misjudged as undocumented.
    const out = run(tmp, ['--include', 'docs/search.md']);
    // `scope` reports what the output actually covers, not what was asked for. This script always
    // compares the full corpus, so it reports null -- echoing the requested scope would contradict
    // its own note and break the cross-script comparability of the header. retrieval.mjs, which
    // also ignores --include, behaves the same way.
    assert.equal(out.scope, null);
    assert.match(out.note, /does not apply/);
    const auth = out.areas.find((a) => a.area === 'src/auth');
    assert.deepEqual(auth.mentioned_by, ['docs/auth.md']); // full comparison, mentions outside scope still count
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('coverage: not a git repo -> status is all no_git, no crash, exit 0', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-cov-nogit-'));
  try {
    writeBaseFiles(tmp);
    write(tmp, 'src/billing/pay.js', 'export const pay = () => {};\n');
    const out = run(tmp);
    assert.equal(out.areas.length, 4);
    assert.ok(out.areas.every((a) => a.status === 'no_git'), JSON.stringify(out.areas.map((a) => a.status)));
    assert.deepEqual(out.undocumented, []);
    assert.deepEqual(out.drifted, []);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('coverage: output carries the docgrad fingerprint, right after scope (#45)', () => {
  const tmp = makeCoverageFixture();
  try {
    const out = run(tmp);
    assert.equal(typeof out.docgrad.version, 'string');
    assert.notEqual(out.docgrad.version, null); // #47: a null version here is the silent failure mode
    assert.match(out.docgrad.rubric_hash, /^[0-9a-f]{8}$/);
    assert.match(out.docgrad.corpus_hash, /^[0-9a-f]{8}$/);
    // Same placement as inventory.mjs, so the five scripts' JSON can be compared field by field.
    assert.deepEqual(Object.keys(out).slice(0, 2), ['scope', 'docgrad']);
    // The scoped run keeps its own note; docgrad still sits directly after scope.
    const scoped = run(tmp, ['--include', 'docs/search.md']);
    assert.deepEqual(Object.keys(scoped).slice(0, 3), ['scope', 'docgrad', 'note']);
    assert.match(scoped.note, /does not apply/);
    // The degraded src_dirs-unset path returns early — it must carry the fingerprint too.
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-cov-meta-'));
    try {
      write(empty, '.docgrad.yml', 'docs_dirs: [docs/]\nentry_files: [CLAUDE.md]\n');
      write(empty, 'CLAUDE.md', '# 專案\n');
      const degraded = run(empty);
      assert.match(degraded.docgrad.corpus_hash, /^[0-9a-f]{8}$/);
      assert.deepEqual(Object.keys(degraded).slice(0, 2), ['scope', 'docgrad']);
      assert.match(degraded.note, /src_dirs is unset/);
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('coverage: --locate-ledger is a no-op, note explains why (#63)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-cov-noloc-'));
  try {
    writeBaseFiles(tmp);
    const out = run(tmp, ['--locate-ledger', '/nonexistent/ledger.jsonl']);
    assert.match(out.note, /--locate-ledger is a no-op for this script/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('coverage: --locate-ledger no-op note survives the src_dirs-unset early return too (#63)', () => {
  // Regression: the early return composed its note from its own list and dropped the new flag's
  // note, so a docs-only repo lost the explanation while a repo with src_dirs kept it. The
  // first #63 test could not catch this — writeBaseFiles() sets src_dirs.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-cov-nosrc-'));
  try {
    fs.mkdirSync(path.join(tmp, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'docs', 'a.md'), '# D\n\nRule 0 is in `thing0.ts`.\n');
    fs.writeFileSync(path.join(tmp, '.docgrad.yml'), 'docs_dirs: [docs/]\n');
    const out = run(tmp, ['--locate-ledger', '/nonexistent/ledger.jsonl']);
    assert.match(out.note, /--locate-ledger is a no-op for this script/);
    assert.match(out.note, /src_dirs is unset/, 'the pre-existing explanation is still there');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

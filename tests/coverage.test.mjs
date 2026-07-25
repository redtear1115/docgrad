import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../scripts/coverage.mjs', import.meta.url));

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

// 寫入初始檔（不含 src/billing——那是後續 commit 才新增）
function writeBaseFiles(tmp) {
  write(tmp, '.docgrad.yml', DOCGRAD_YML);
  write(tmp, 'CLAUDE.md', '# 專案\n\n共用工具放在 src/utils 目錄。\n');
  write(tmp, 'docs/auth.md', '# 認證\n\n登入邏輯見 src/auth/login.js。\n');
  write(tmp, 'docs/search.md', '# 搜尋\n\n搜尋子系統在 src/search。\n');
  // 近似字串:不應被當成 mention（邊界匹配測試）
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

// 建立多 commit git fixture:
// commit 1 @ 2026-06-15  全部初始檔
// commit 2 @ 2026-08-20  改 src/search/query.js
// commit 3 @ 2026-08-20  改 src/search/query.js ＋新增 src/billing/pay.js
// commit 4 @ 2026-08-20  改 src/search/query.js ＋改 src/utils/fmt.js（一次）
function makeCoverageFixture() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-cov-'));
  writeBaseFiles(tmp);
  execFileSync('git', ['init', '-q'], { cwd: tmp, env: GIT_ENV });
  commitAll(tmp, '2026-06-15T12:00:00', 'init');

  write(tmp, 'src/search/query.js', 'export const query = () => {}; // 改 1\n');
  commitAll(tmp, '2026-08-20T12:00:00', 'search 1');

  write(tmp, 'src/search/query.js', 'export const query = () => {}; // 改 2\n');
  write(tmp, 'src/billing/pay.js', 'export const pay = () => {};\n');
  commitAll(tmp, '2026-08-20T12:00:01', 'search 2 ＋ billing');

  write(tmp, 'src/search/query.js', 'export const query = () => {}; // 改 3\n');
  write(tmp, 'src/utils/fmt.js', 'export const fmt = (x) => x; // 改\n');
  commitAll(tmp, '2026-08-20T12:00:02', 'search 3 ＋ utils');
  return tmp;
}

function run(tmp, extraArgs = []) {
  const r = spawnSync(process.execPath, [SCRIPT, '--root', tmp, ...extraArgs], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

test('coverage: 主流程 covered/undocumented/drifted＋min_commits 閘門', () => {
  const tmp = makeCoverageFixture();
  try {
    const out = run(tmp);
    assert.deepEqual(out.src_dirs, ['src/']);
    assert.deepEqual(out.thresholds, { drift_after_days: 30, min_commits: 3 });
    assert.deepEqual(out.loose_files, { 'src/': 0 });

    const byArea = Object.fromEntries(out.areas.map((a) => [a.area, a]));

    // src/auth:文件與 code 同一 commit → covered、commits_since_doc 0
    assert.equal(byArea['src/auth'].status, 'covered');
    assert.deepEqual(byArea['src/auth'].mentioned_by, ['docs/auth.md']);
    assert.equal(byArea['src/auth'].commits_since_doc, 0);

    // src/billing:無任何文件提及 → undocumented
    assert.equal(byArea['src/billing'].status, 'undocumented');
    assert.deepEqual(byArea['src/billing'].mentioned_by, []);
    assert.equal(byArea['src/billing'].last_doc_commit, null);
    assert.equal(byArea['src/billing'].commits_since_doc, null);

    // src/search:doc 停在 06-15、code 三次 commit @ 08-20 → drifted
    assert.equal(byArea['src/search'].status, 'drifted');
    assert.deepEqual(byArea['src/search'].mentioned_by, ['docs/search.md']);
    assert.equal(byArea['src/search'].commits_since_doc, 3);
    assert.ok(Math.abs(byArea['src/search'].drift_days - 66) <= 1, `drift_days=${byArea['src/search'].drift_days}`);

    // src/utils:有 drift 但 commits(1) < min_commits(3) → covered（閘門）
    assert.equal(byArea['src/utils'].status, 'covered');
    assert.deepEqual(byArea['src/utils'].mentioned_by, ['CLAUDE.md']);
    assert.equal(byArea['src/utils'].commits_since_doc, 1);
    assert.ok(byArea['src/utils'].drift_days > 30);

    // 名單正確且排序
    assert.deepEqual(out.undocumented, ['src/billing']);
    assert.deepEqual(out.drifted, ['src/search']);
    // areas 依 area 名排序
    assert.deepEqual(
      out.areas.map((a) => a.area),
      ['src/auth', 'src/billing', 'src/search', 'src/utils']
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('coverage: 邊界匹配——src/authx、mysrc/auth 不算 mention', () => {
  const tmp = makeCoverageFixture();
  try {
    const out = run(tmp);
    const byArea = Object.fromEntries(out.areas.map((a) => [a.area, a]));
    // docs/misc.md 只含近似字串,不得出現在任一 mentioned_by
    for (const a of out.areas) {
      assert.ok(!a.mentioned_by.includes('docs/misc.md'), `${a.area} 誤判 misc.md`);
    }
    // src/auth 僅被 docs/auth.md 提及（不含 misc 的 src/authx / mysrc/auth）
    assert.deepEqual(byArea['src/auth'].mentioned_by, ['docs/auth.md']);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('coverage: src_dirs 未設定 → areas 空、note 存在、exit 0', () => {
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

test('coverage: --include 刻意不套用（標明 scope＋note 說明全量比對）', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-cov-scope-'));
  try {
    writeBaseFiles(tmp);
    // docs/auth.md 落在 scope 外——若 scope 生效，src/auth 會被誤判成 undocumented。
    const out = run(tmp, ['--include', 'docs/search.md']);
    assert.deepEqual(out.scope, ['docs/search.md']);
    assert.match(out.note, /不套用/);
    const auth = out.areas.find((a) => a.area === 'src/auth');
    assert.deepEqual(auth.mentioned_by, ['docs/auth.md']); // 全量比對，範圍外的提及照樣算數
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('coverage: 非 git repo → status 全 no_git、不炸、exit 0', () => {
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

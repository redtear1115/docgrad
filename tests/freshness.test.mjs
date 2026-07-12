import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const FIXTURE = fileURLToPath(new URL('./fixtures/basic/', import.meta.url));
const SCRIPT = fileURLToPath(new URL('../scripts/freshness.mjs', import.meta.url));

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

test('freshness: coverage/stale/mismatch（DOCGRAD_TODAY 固定今天）', () => {
  const tmp = makeGitFixture();
  const r = spawnSync(process.execPath, [SCRIPT, '--root', tmp], {
    encoding: 'utf8',
    env: { ...process.env, DOCGRAD_TODAY: '2026-09-01' },
  });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.convention, 'heading-line');
  assert.equal(out.files_total, 4);
  assert.equal(out.files_with_signal, 2); // README 與 CLAUDE.md 有 Last updated 行
  assert.equal(out.coverage_ratio, 0.5);
  // 全部 git 日期 2026-06-15 → age 78 天 > 60 → 四檔皆 stale
  assert.equal(out.stale.length, 4);
  assert.ok(out.stale.every((s) => s.age_days === 78));
  // CLAUDE.md 宣稱 2026-06-01 但 git 2026-06-15 → drift 14 > 7 → mismatch
  assert.deepEqual(out.mismatches, [
    { path: 'CLAUDE.md', claimed: '2026-06-01', actual_git: '2026-06-15', drift_days: 14 },
  ]);
});

test('freshness: 非 git repo → actual_git 為 null、不炸', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-nogit-'));
  fs.cpSync(FIXTURE, tmp, { recursive: true });
  const r = spawnSync(process.execPath, [SCRIPT, '--root', tmp], {
    encoding: 'utf8',
    env: { ...process.env, DOCGRAD_TODAY: '2026-09-01' },
  });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.coverage_ratio, 0.5);
  assert.ok(out.stale.every((s) => s.actual_git === null)); // 落回 claimed 為基準
});

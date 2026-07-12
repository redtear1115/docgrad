#!/usr/bin/env node
// freshness.mjs — 日期訊號覆蓋率＋git log 真實日期對照
// 用法: node freshness.mjs [--root <repo>]；JSON → stdout。
// env DOCGRAD_TODAY=YYYY-MM-DD 可覆寫「今天」（測試可重現）。
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadConfig, collectFiles, resolveRoot, fail, extractClaimedDate } from './lib.mjs';

const MISMATCH_TOLERANCE_DAYS = 7;

function gitDate(root, rel) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%as', '--', rel], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

const dayDiff = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000);

try {
  const root = resolveRoot();
  const config = loadConfig(root);
  const { included } = collectFiles(root, config);
  const today = process.env.DOCGRAD_TODAY ?? new Date().toISOString().slice(0, 10);

  const results = included.map((rel) => {
    const claimed = extractClaimedDate(fs.readFileSync(path.join(root, rel), 'utf8'), config.freshness);
    const actual_git = gitDate(root, rel);
    const basis = actual_git ?? claimed;
    return { path: rel, claimed, actual_git, age_days: basis ? dayDiff(today, basis) : null };
  });

  const withSignal = results.filter((r) => r.claimed !== null);
  process.stdout.write(
    `${JSON.stringify(
      {
        convention: config.freshness.convention,
        files_total: results.length,
        files_with_signal: withSignal.length,
        coverage_ratio: results.length ? Number((withSignal.length / results.length).toFixed(4)) : 0,
        stale: results.filter((r) => r.age_days !== null && r.age_days > config.freshness.stale_after_days),
        mismatches: results
          .filter((r) => r.claimed && r.actual_git && dayDiff(r.actual_git, r.claimed) > MISMATCH_TOLERANCE_DAYS)
          .map((r) => ({
            path: r.path,
            claimed: r.claimed,
            actual_git: r.actual_git,
            drift_days: dayDiff(r.actual_git, r.claimed),
          })),
      },
      null,
      2
    )}\n`
  );
} catch (err) {
  fail(err.message);
}

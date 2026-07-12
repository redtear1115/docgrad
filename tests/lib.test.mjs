import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseYamlSubset, loadConfig, resolveRoot } from '../scripts/lib.mjs';

test('parseYamlSubset: 解析 .docgrad.yml 全樣板', () => {
  const doc = `
# 註解行
docs_dirs: [docs/]
entry_files: [CLAUDE.md, AGENTS.md]
index_file: docs/README.md
exclude: []
freshness:
  convention: frontmatter
  field: last_updated
targets:
  completeness: 4
  correctness: 3
correctness_sample: 8
scenario: "在 core 加一個典型新功能"  # 行尾註解
language: zh-TW
`;
  const got = parseYamlSubset(doc);
  assert.deepEqual(got.docs_dirs, ['docs/']);
  assert.deepEqual(got.entry_files, ['CLAUDE.md', 'AGENTS.md']);
  assert.equal(got.index_file, 'docs/README.md');
  assert.deepEqual(got.exclude, []);
  assert.deepEqual(got.freshness, { convention: 'frontmatter', field: 'last_updated' });
  assert.equal(got.targets.completeness, 4);
  assert.equal(got.targets.correctness, 3);
  assert.equal(got.correctness_sample, 8);
  assert.equal(got.scenario, '在 core 加一個典型新功能');
  assert.equal(got.language, 'zh-TW');
});

test('parseYamlSubset: block list 與引號內的 #、:', () => {
  const got = parseYamlSubset(
    'exclude:\n  - docs/archive/\n  - "docs/#wip/"\nfreshness:\n  field: "Last updated:"\n'
  );
  assert.deepEqual(got.exclude, ['docs/archive/', 'docs/#wip/']);
  assert.equal(got.freshness.field, 'Last updated:');
});

test('parseYamlSubset: 非法縮排丟錯', () => {
  assert.throws(() => parseYamlSubset('  orphan_indent: 1\n'), /縮排/);
});

test('loadConfig: 缺檔丟導向 init 的錯誤', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-'));
  assert.throws(() => loadConfig(tmp), /請先執行 \/docgrad init/);
});

test('loadConfig: 未填欄位補預設值、巢狀深合併', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-'));
  fs.writeFileSync(
    path.join(tmp, '.docgrad.yml'),
    'docs_dirs: [documentation/]\nfreshness:\n  convention: frontmatter\n  field: last_updated\n'
  );
  const cfg = loadConfig(tmp);
  assert.deepEqual(cfg.docs_dirs, ['documentation/']);
  assert.deepEqual(cfg.entry_files, []);
  assert.equal(cfg.index_file, null);
  assert.equal(cfg.targets.completeness, 4);
  assert.equal(cfg.freshness.convention, 'frontmatter');
  assert.equal(cfg.freshness.stale_after_days, 60); // 預設值沒被 freshness 覆寫吃掉
  assert.equal(cfg.correctness_sample, 8);
  assert.equal(cfg.language, 'zh-TW');
});

test('resolveRoot: --root 優先，否則 cwd', () => {
  assert.equal(resolveRoot(['--root', '/tmp/x']), path.resolve('/tmp/x'));
  assert.equal(resolveRoot([]), process.cwd());
});

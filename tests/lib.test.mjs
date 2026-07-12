import test from 'node:test';
import assert from 'node:assert/strict';
import { parseYamlSubset } from '../scripts/lib.mjs';

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

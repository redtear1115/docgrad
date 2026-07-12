import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseYamlSubset, loadConfig, resolveRoot, collectFiles, estimateTokens, githubSlug, extractHeadings, extractLinks, extractClaimedDate } from '../scripts/lib.mjs';
import { fileURLToPath } from 'node:url';

const FIXTURE = fileURLToPath(new URL('./fixtures/basic/', import.meta.url));

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
  try {
    assert.throws(() => loadConfig(tmp), /請先執行 \/docgrad init/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('loadConfig: convention 需要 field 而未設定時丟錯', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-'));
  try {
    fs.writeFileSync(path.join(tmp, '.docgrad.yml'), 'freshness:\n  convention: heading-line\n');
    assert.throws(() => loadConfig(tmp), /freshness\.field/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('loadConfig: 未填欄位補預設值、巢狀深合併', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-'));
  try {
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
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('resolveRoot: --root 優先，否則 cwd', () => {
  assert.equal(resolveRoot(['--root', '/tmp/x']), path.resolve('/tmp/x'));
  assert.equal(resolveRoot([]), process.cwd());
});

test('collectFiles: 排除 exclude、含 entry_files、路徑排序', () => {
  const cfg = loadConfig(FIXTURE);
  const { included, excluded } = collectFiles(FIXTURE, cfg);
  assert.deepEqual(included, ['CLAUDE.md', 'docs/README.md', 'docs/guide.md', 'docs/orphan.md']);
  assert.deepEqual(excluded, ['docs/archive/old.md']);
});

test('estimateTokens: ASCII 每 4 字元 1 token', () => {
  assert.equal(estimateTokens('a'.repeat(40)), 10);
});

test('estimateTokens: CJK 每字 1.1 token', () => {
  assert.equal(estimateTokens('中文字'), 3); // round(3.3)
  assert.equal(estimateTokens('中'.repeat(10)), 11);
});

test('githubSlug: 小寫、去標點、空白轉連字號、CJK 保留', () => {
  assert.equal(githubSlug('Docs index'), 'docs-index');
  assert.equal(githubSlug('中文標題'), '中文標題');
  assert.equal(githubSlug('API v2.0 (beta)'), 'api-v20-beta');
});

test('extractHeadings: 重複標題加序號後綴', () => {
  const slugs = extractHeadings('# A\n## Setup\n## Setup\n');
  assert.ok(slugs.has('a') && slugs.has('setup') && slugs.has('setup-1'));
});

test('extractLinks: 抓 inline link、跳過 code fence', () => {
  const links = extractLinks('[a](x.md)\n```\n[no](skip.md)\n```\n![img](p.png)\n');
  assert.deepEqual(links, [
    { target: 'x.md', line: 1 },
    { target: 'p.png', line: 5 },
  ]);
});

test('extractClaimedDate: frontmatter / heading-line / none', () => {
  const fm = '---\ntitle: x\nlast_updated: 2026-07-01\n---\n# T\n';
  assert.equal(extractClaimedDate(fm, { convention: 'frontmatter', field: 'last_updated' }), '2026-07-01');
  assert.equal(extractClaimedDate('# T\n', { convention: 'frontmatter', field: 'last_updated' }), null);
  const hl = '# T\n\n> Last updated: 2026-06-15\n';
  assert.equal(extractClaimedDate(hl, { convention: 'heading-line', field: 'Last updated:' }), '2026-06-15');
  assert.equal(extractClaimedDate(hl, { convention: 'none', field: null }), null);
});

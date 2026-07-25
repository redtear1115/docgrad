import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseYamlSubset, loadConfig, resolveRoot, parseArgs, matchesScope, collectFiles, estimateTokens, githubSlug, extractHeadings, extractLinks, extractClaimedDate } from '../scripts/lib.mjs';
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

test('parseArgs: --root/--config/--include（可重複＋逗號分隔）', () => {
  const a = parseArgs(['--root', '/tmp/x', '--include', 'docs/infra/', '--include', 'docs/a/**,docs/b.md']);
  assert.equal(a.root, path.resolve('/tmp/x'));
  assert.equal(a.configFile, path.join(path.resolve('/tmp/x'), '.docgrad.yml'));
  assert.deepEqual(a.include, ['docs/infra/', 'docs/a/**', 'docs/b.md']);
});

test('parseArgs: --config 外置；未給旗標時用 <root>/.docgrad.yml、include 為空', () => {
  assert.equal(parseArgs(['--config', '/tmp/cfg.yml']).configFile, path.resolve('/tmp/cfg.yml'));
  const bare = parseArgs([]);
  assert.equal(bare.configFile, path.join(process.cwd(), '.docgrad.yml'));
  assert.deepEqual(bare.include, []);
});

test('parseArgs: 缺值與未知參數丟錯（不靜默吞掉）', () => {
  assert.throws(() => parseArgs(['--include']), /--include 需要一個參數值/);
  assert.throws(() => parseArgs(['--root', '--include', 'x']), /--root 需要一個參數值/);
  assert.throws(() => parseArgs(['--dim', 'freshness']), /未知參數/);
});

test('matchesScope: 空＝全量；目錄前綴對齊路徑分段；* 不跨層、** 跨層', () => {
  assert.equal(matchesScope('docs/a/b.md', []), true);
  assert.equal(matchesScope('docs/infra/x.md', ['docs/infra']), true);
  assert.equal(matchesScope('docs/infra/x.md', ['docs/infra/']), true);
  assert.equal(matchesScope('docs/infrastructure/x.md', ['docs/infra']), false);
  assert.equal(matchesScope('docs/a.md', ['./docs/a.md']), true);
  assert.equal(matchesScope('docs/a.md', ['docs/*.md']), true);
  assert.equal(matchesScope('docs/a/b.md', ['docs/*.md']), false);
  assert.equal(matchesScope('docs/a/b.md', ['docs/**/*.md']), true);
  assert.equal(matchesScope('docs/b.md', ['docs/**/*.md']), true); // ** 可吃零層
  assert.equal(matchesScope('docs/ab.md', ['docs/?b.md']), true);
  assert.equal(matchesScope('docs/aab.md', ['docs/?b.md']), false);
});

test('loadConfig: --config 指向 root 外的設定檔（文件源本身不落檔）', () => {
  const cfgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-cfg-'));
  const docsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-src-'));
  try {
    const cfgFile = path.join(cfgDir, 'exported.yml');
    fs.writeFileSync(cfgFile, 'docs_dirs: [pages/]\nentry_files: []\n');
    const cfg = loadConfig(docsRoot, cfgFile); // docsRoot 內沒有 .docgrad.yml
    assert.deepEqual(cfg.docs_dirs, ['pages/']);
    assert.throws(() => loadConfig(docsRoot), /請先執行 \/docgrad init/);
  } finally {
    fs.rmSync(cfgDir, { recursive: true, force: true });
    fs.rmSync(docsRoot, { recursive: true, force: true });
  }
});

test('collectFiles: 排除 exclude、含 entry_files、路徑排序', () => {
  const cfg = loadConfig(FIXTURE);
  const { included, excluded } = collectFiles(FIXTURE, cfg);
  assert.deepEqual(included, ['CLAUDE.md', 'docs/README.md', 'docs/guide.md', 'docs/orphan.md']);
  assert.deepEqual(excluded, ['docs/archive/old.md']);
});

test('collectFiles: include 縮到 scope 內；exclude 仍優先於 scope', () => {
  const cfg = loadConfig(FIXTURE);
  const { included, excluded } = collectFiles(FIXTURE, cfg, { include: ['docs/guide.md', 'docs/archive/**'] });
  assert.deepEqual(included, ['docs/guide.md']);
  assert.deepEqual(excluded, ['docs/archive/old.md']); // 落在 scope 內，但仍被 exclude 擋下
  assert.deepEqual(collectFiles(FIXTURE, cfg, { include: ['docs/*.md'] }).included, [
    'docs/README.md', 'docs/guide.md', 'docs/orphan.md',
  ]);
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

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseYamlSubset, loadConfig, resolveRoot, parseArgs, matchesScope, collectFiles, estimateTokens, githubSlug, extractHeadings, extractLinks, extractClaimedDate, parseFreshnessConventions, parseFreshnessFields, extractCodeRefs, validateConfigTypes, docgradMeta, corpusHash, gitTrackedFiles, extractClaimLines, rankClaimCandidates, claimHash, CLAIM_HASH_CHARS, buildSrcSymbolIndex, gitAddCommitSubjects, isDocgradAuthored, measureHash, judgeHash, loadLedgerClaimHashes, loadLedgerRows, MEASURE_BANDS, evaluateMeasure, measureDigest, MEASURE_FILES } from '../skills/docgrad/scripts/lib.mjs';
import { fileURLToPath } from 'node:url';

const FIXTURE = fileURLToPath(new URL('./fixtures/basic/', import.meta.url));
const DOCS_FILES_FIXTURE = fileURLToPath(new URL('./fixtures/docs-files/', import.meta.url));

// A throwaway git work tree: files already on disk get committed, anything written afterwards is
// untracked. Isolated from the developer's own git config/hooks so CI and laptops behave alike.
function gitInit(tmp) {
  const env = {
    ...process.env,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com',
    GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com',
  };
  execFileSync('git', ['init', '-q'], { cwd: tmp, env });
  execFileSync('git', ['add', '-A'], { cwd: tmp, env });
  execFileSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'fixture'], { cwd: tmp, env });
}

test('parseYamlSubset: parse a full .docgrad.yml template', () => {
  const doc = `
# comment line
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
scenario: "Add a typical new feature to core"  # trailing comment
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
  assert.equal(got.scenario, 'Add a typical new feature to core');
  assert.equal(got.language, 'zh-TW');
});

test('parseYamlSubset: block list, and # and : inside quotes', () => {
  const got = parseYamlSubset(
    'exclude:\n  - docs/archive/\n  - "docs/#wip/"\nfreshness:\n  field: "Last updated:"\n'
  );
  assert.deepEqual(got.exclude, ['docs/archive/', 'docs/#wip/']);
  assert.equal(got.freshness.field, 'Last updated:');
});

test('parseYamlSubset: illegal indentation throws', () => {
  assert.throws(() => parseYamlSubset('  orphan_indent: 1\n'), /indentation/);
});

test('loadConfig: missing config file throws an error pointing at init', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-'));
  try {
    assert.throws(() => loadConfig(tmp), /Run \/docgrad init first/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('loadConfig: throws when convention requires field but field is unset', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-'));
  try {
    fs.writeFileSync(path.join(tmp, '.docgrad.yml'), 'freshness:\n  convention: heading-line\n');
    assert.throws(() => loadConfig(tmp), /freshness\.field/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('loadConfig: unset fields get their defaults, nested maps deep-merge', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-'));
  try {
    fs.writeFileSync(
      path.join(tmp, '.docgrad.yml'),
      'docs_dirs: [documentation/]\nfreshness:\n  convention: frontmatter\n  field: last_updated\n'
    );
    const cfg = loadConfig(tmp);
    assert.deepEqual(cfg.docs_dirs, ['documentation/']);
    assert.deepEqual(cfg.entry_files, []);
    assert.deepEqual(cfg.docs_files, []); // v1.4.0 new field: must default to an empty array even when an old config omits it (otherwise collectFiles crashes)
    assert.deepEqual(cfg.out_of_scope, []); // #44's new field: same requirement, and [] is what keeps every pre-#44 config's ratings and corpus_hash exactly where they were
    assert.equal(cfg.index_file, null);
    assert.equal(cfg.targets.completeness, 4);
    assert.equal(cfg.targets.economy, 4); // v1.0.0's sixth dimension: an old config that omits it must still get the default target
    assert.deepEqual(cfg.economy.entry_cost_tiers, [20000, 10000, 5000, 3000]);
    assert.equal(cfg.economy.pollution_max, 0.1);
    assert.equal(cfg.freshness.convention, 'frontmatter');
    assert.equal(cfg.freshness.stale_after_days, 60); // the default isn't swallowed by the freshness override
    assert.equal(cfg.correctness_sample, 8);
    assert.equal(cfg.language, 'zh-TW');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// --- #38 part 2: list/bool fields fail loudly ------------------------------------------------

const SCALAR_CASES = [
  ['docs_dirs', 'documentation/', 'docs/'],
  ['docs_files', 'PRODUCT.md', 'PRODUCT.md'],
  ['entry_files', 'CLAUDE.md', 'CLAUDE.md'],
  ['exclude', 'docs/archive/', 'docs/archive/'],
  ['out_of_scope', 'docs/zh-CN/', 'docs/zh-CN/'],
  ['src_dirs', 'src/', 'src/'],
  ['scenarios', 'src/foo/bar.ts', 'src/foo/bar.ts'],
];

for (const [field, scalar, example] of SCALAR_CASES) {
  test(`loadConfig: ${field} written as a scalar throws instead of silently collecting nothing`, () => {
    // Without the check, for…of iterates the string **character by character**: every character is
    // tried as a path, every existsSync fails, and the only symptom is that files_total never moves.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-listtype-'));
    try {
      fs.writeFileSync(path.join(tmp, '.docgrad.yml'), `${field}: ${scalar}\n`);
      assert.throws(() => loadConfig(tmp), (err) => {
        assert.match(err.message, new RegExp(`${field} must be a list`), 'names the field');
        assert.ok(err.message.includes(JSON.stringify(scalar)), `shows what was given: ${err.message}`);
        assert.ok(err.message.includes(`${field}: [${example}]`), `shows the correct inline-list form: ${err.message}`);
        return true;
      });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
}

test('loadConfig: a list entry that is not a non-empty string throws, pointing at the index', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-listentry-'));
  try {
    fs.writeFileSync(path.join(tmp, '.docgrad.yml'), 'docs_dirs: [docs/, 42]\n');
    assert.throws(() => loadConfig(tmp), /docs_dirs\[1\] must be a non-empty path string, but got the number 42/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('parseYamlSubset: an unterminated quote in an inline list throws instead of keeping the quote in the value', () => {
  assert.throws(() => parseYamlSubset('exclude: [docs/a, "unclosed]\n'), /Unterminated " in inline list item: "unclosed/);
  assert.throws(() => parseYamlSubset("a: [x, 'unclosed]\n"), /Unterminated ' in inline list item: 'unclosed/);
  // the shapes that already worked keep working: a quoted comma, an apostrophe mid-item, an empty list
  assert.deepEqual(parseYamlSubset('a: ["q, r", s]\n').a, ['q, r', 's']);
  assert.deepEqual(parseYamlSubset("exclude: [docs/owner's/, docs/b/]\n").exclude, ["docs/owner's/", 'docs/b/']);
  assert.deepEqual(parseYamlSubset('a: []\n').a, []);
});

test('loadConfig: an unterminated quote fails the run rather than producing a path that can never match', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-unterminated-'));
  try {
    fs.writeFileSync(path.join(tmp, '.docgrad.yml'), 'docs_dirs: [docs/]\nexclude: [docs/a, "unclosed]\n');
    assert.throws(() => loadConfig(tmp), /Unterminated " in inline list item/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('loadConfig: a list key left empty throws rather than blowing up later inside collectFiles', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-listempty-'));
  try {
    fs.writeFileSync(path.join(tmp, '.docgrad.yml'), 'docs_dirs: [docs/]\nexclude:\n');
    assert.throws(() => loadConfig(tmp), /exclude must be a list, but got an empty value/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('loadConfig: index_file written with nothing after the colon fails loudly, null still allowed', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-scalar-'));
  try {
    // A bare `index_file:` parses as an empty mapping and used to surface much later as a raw
    // TypeError out of path.join() -- the same silent shape #38 fixed for list fields.
    fs.writeFileSync(path.join(tmp, '.docgrad.yml'), 'docs_dirs: [docs/]\nindex_file:\n');
    assert.throws(() => loadConfig(tmp), /index_file must be a path string or null[\s\S]*nothing after the colon/);
    fs.writeFileSync(path.join(tmp, '.docgrad.yml'), 'docs_dirs: [docs/]\nindex_file: null\n');
    assert.equal(loadConfig(tmp).index_file, null, 'an explicit null is a legitimate answer');
    fs.writeFileSync(path.join(tmp, '.docgrad.yml'), 'docs_dirs: [docs/]\nindex_file: docs/README.md\n');
    assert.equal(loadConfig(tmp).index_file, 'docs/README.md');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('loadConfig: exclude_untracked must be a boolean, and defaults to false', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-booltype-'));
  try {
    fs.writeFileSync(path.join(tmp, '.docgrad.yml'), 'docs_dirs: [docs/]\n');
    assert.equal(loadConfig(tmp).exclude_untracked, false, 'default is today\'s behavior');
    fs.writeFileSync(path.join(tmp, '.docgrad.yml'), 'docs_dirs: [docs/]\nexclude_untracked: yes\n');
    assert.throws(() => loadConfig(tmp), /exclude_untracked must be true or false, but got the string "yes"[\s\S]*exclude_untracked: true/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// --- count fields: positive whole numbers ------------------------------------------------------
//
// Both are used as a slice length or a draw budget, so a wrong value doesn't throw anywhere — it
// quietly produces an empty sample, which is exactly the symptom (coverage that stops moving) that
// the claim_candidates_cap work exists to make legible in the first place.

const COUNT_CASES = [
  ['claim_candidates_cap', '60'],
  ['correctness_sample', '8'],
];

for (const [field, example] of COUNT_CASES) {
  for (const [written, described] of [
    ['0', 'the number 0'],
    ['-5', 'the number -5'],
    ['1.5', 'the number 1.5'],
    ['"60"', 'the string "60"'],
    ['plenty', 'the string "plenty"'],
    ['', 'an empty value'],
  ]) {
    test(`loadConfig: ${field}: ${written || '(empty)'} throws instead of silently drawing nothing`, () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-counttype-'));
      try {
        fs.writeFileSync(path.join(tmp, '.docgrad.yml'), `docs_dirs: [docs/]\n${field}:${written ? ` ${written}` : ''}\n`);
        assert.throws(() => loadConfig(tmp), (err) => {
          assert.match(err.message, new RegExp(`${field} must be a positive whole number`), 'names the field');
          assert.ok(err.message.includes(described), `describes what was given: ${err.message}`);
          assert.ok(err.message.includes(`${field}: ${example}`), `shows the correct form: ${err.message}`);
          return true;
        });
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });
  }
}

test('loadConfig: claim_candidates_cap defaults to 60 and accepts a raised whole number', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-cap-'));
  try {
    fs.writeFileSync(path.join(tmp, '.docgrad.yml'), 'docs_dirs: [docs/]\n');
    assert.equal(loadConfig(tmp).claim_candidates_cap, 60, 'the value inventory.mjs used to hardcode');
    fs.writeFileSync(path.join(tmp, '.docgrad.yml'), 'docs_dirs: [docs/]\nclaim_candidates_cap: 400\n');
    assert.equal(loadConfig(tmp).claim_candidates_cap, 400);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// --- #36: corpus_hash -------------------------------------------------------------------------

test('corpusHash: cosmetic differences that mean the same corpus hash the same', () => {
  const base = {
    docs_dirs: ['docs/', 'guides/'],
    docs_files: ['PRODUCT.md', 'DESIGN.md'],
    entry_files: ['CLAUDE.md'],
    exclude: ['docs/archive/'],
    index_file: 'docs/README.md',
  };
  const cosmetic = {
    // reordered, trailing slashes flipped, whitespace, a duplicate entry
    docs_dirs: ['guides', ' docs/ '],
    docs_files: ['DESIGN.md', 'PRODUCT.md', 'PRODUCT.md'],
    entry_files: ['CLAUDE.md'],
    exclude: ['docs/archive'],
    index_file: ' docs/README.md',
  };
  assert.equal(corpusHash(cosmetic), corpusHash(base));
  assert.match(corpusHash(base), /^[0-9a-f]{8}$/, 'same shape as judge_hash');
});

test('corpusHash: fields outside the corpus definition do not move it', () => {
  const base = { docs_dirs: ['docs/'], docs_files: [], entry_files: [], exclude: [], index_file: null };
  assert.equal(
    corpusHash({ ...base, src_dirs: ['src/'], scenarios: ['src/a.ts'], correctness_sample: 20, targets: { economy: 5 } }),
    corpusHash(base),
    'a corpus fingerprint must not react to rubric/target/measurement settings'
  );
  // claim_candidates_cap changes what a round can *sample*, but not which files were measured:
  // files_total, claims_total, the freshness denominator, the orphan population and the pollution
  // denominator are all identical either side of it. Folding it in would stamp a whole-round
  // comparability break on every repo that applied the fix the tool itself recommends. The honest
  // disclosure is per-round (claim_population.truncated), not a corpus break.
  assert.equal(
    corpusHash({ ...base, claim_candidates_cap: 400 }),
    corpusHash(base),
    'the candidate window is a sampling setting, not a corpus definition'
  );
});

test('corpusHash: every corpus-defining field genuinely changes it', () => {
  const base = {
    docs_dirs: ['docs/'], docs_files: [], entry_files: ['CLAUDE.md'], exclude: [], index_file: 'docs/README.md',
  };
  const before = corpusHash(base);
  // the v1.4.0 case from #36: adding docs_files moved files_total 46->48 while the ruler fingerprint
  // (rubric_hash before E4b, judge_hash today) stood still
  assert.notEqual(corpusHash({ ...base, docs_files: ['PRODUCT.md'] }), before, 'docs_files');
  assert.notEqual(corpusHash({ ...base, docs_dirs: ['docs/', 'guides/'] }), before, 'docs_dirs');
  assert.notEqual(corpusHash({ ...base, entry_files: ['CLAUDE.md', 'AGENTS.md'] }), before, 'entry_files');
  assert.notEqual(corpusHash({ ...base, exclude: ['docs/archive/'] }), before, 'exclude');
  assert.notEqual(corpusHash({ ...base, index_file: 'README.md' }), before, 'index_file');
  assert.notEqual(corpusHash({ ...base, index_file: null }), before, 'index_file unset');
});

test('corpusHash: no config -> null (never a hash of an empty corpus)', () => {
  assert.equal(corpusHash(null), null);
  assert.equal(corpusHash(undefined), null);
  assert.notEqual(corpusHash({ docs_dirs: [] }), null, 'a genuinely empty config still hashes');
});

// --- #35: untracked files ---------------------------------------------------------------------

test('gitTrackedFiles: returns the tracked set inside a work tree, null outside one', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-tracked-'));
  try {
    fs.mkdirSync(path.join(tmp, 'docs'));
    fs.writeFileSync(path.join(tmp, 'docs', 'a.md'), '# a\n');
    assert.equal(gitTrackedFiles(tmp), null, 'not a git work tree -> null, not an empty set');
    gitInit(tmp);
    fs.writeFileSync(path.join(tmp, 'docs', 'draft.md'), '# draft\n');
    const tracked = gitTrackedFiles(tmp);
    assert.ok(tracked.has('docs/a.md'));
    assert.ok(!tracked.has('docs/draft.md'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('collectFiles: exclude_untracked true drops untracked files, including .gitignore\'d ones', () => {
  // The measured case: the file that moved pollution.ratio 0.0517 -> 0.1066 was untracked *and*
  // ignored, so `git ls-files --others --exclude-standard` would have filtered it back out.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-untracked-'));
  try {
    fs.mkdirSync(path.join(tmp, 'docs', 'plans'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'docs', 'a.md'), '# a\n');
    fs.writeFileSync(path.join(tmp, 'docs', 'plans', 'kept.md'), '# kept\n');
    fs.writeFileSync(path.join(tmp, '.gitignore'), 'docs/plans/local-*\n');
    fs.writeFileSync(path.join(tmp, '.docgrad.yml'), 'docs_dirs: [docs/]\nexclude: [docs/plans/]\n');
    gitInit(tmp);
    fs.writeFileSync(path.join(tmp, 'docs', 'draft.md'), '# untracked draft\n');
    fs.writeFileSync(path.join(tmp, 'docs', 'plans', 'local-wip.md'), '# ignored + untracked\n');

    const off = collectFiles(tmp, loadConfig(tmp));
    assert.deepEqual(off.included, ['docs/a.md', 'docs/draft.md'], 'default: untracked files still counted');
    assert.deepEqual(off.excluded, ['docs/plans/kept.md', 'docs/plans/local-wip.md']);

    fs.appendFileSync(path.join(tmp, '.docgrad.yml'), 'exclude_untracked: true\n');
    const on = collectFiles(tmp, loadConfig(tmp));
    assert.deepEqual(on.included, ['docs/a.md'], 'opt-in: corpus matches a clean checkout');
    assert.deepEqual(on.excluded, ['docs/plans/kept.md'], 'the pollution denominator shrinks too');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('collectFiles: exclude_untracked true without git throws instead of silently doing nothing', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-untracked-nogit-'));
  try {
    fs.mkdirSync(path.join(tmp, 'docs'));
    fs.writeFileSync(path.join(tmp, 'docs', 'a.md'), '# a\n');
    fs.writeFileSync(path.join(tmp, '.docgrad.yml'), 'docs_dirs: [docs/]\nexclude_untracked: true\n');
    assert.throws(() => collectFiles(tmp, loadConfig(tmp)), /exclude_untracked: true.*git/s);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('resolveRoot: --root wins, otherwise cwd', () => {
  assert.equal(resolveRoot(['--root', '/tmp/x']), path.resolve('/tmp/x'));
  assert.equal(resolveRoot([]), process.cwd());
});

test('parseArgs: --root/--config/--include (repeatable + comma-separated)', () => {
  const a = parseArgs(['--root', '/tmp/x', '--include', 'docs/infra/', '--include', 'docs/a/**,docs/b.md']);
  assert.equal(a.root, path.resolve('/tmp/x'));
  assert.equal(a.configFile, path.join(path.resolve('/tmp/x'), '.docgrad.yml'));
  assert.deepEqual(a.include, ['docs/infra/', 'docs/a/**', 'docs/b.md']);
});

test('parseArgs: --config external; defaults to <root>/.docgrad.yml with no flags, include is empty', () => {
  assert.equal(parseArgs(['--config', '/tmp/cfg.yml']).configFile, path.resolve('/tmp/cfg.yml'));
  const bare = parseArgs([]);
  assert.equal(bare.configFile, path.join(process.cwd(), '.docgrad.yml'));
  assert.deepEqual(bare.include, []);
  assert.equal(bare.excludeLedger, null, 'default off (#54)');
});

test('parseArgs: --exclude-ledger resolves like --config, relative to cwd', () => {
  const a = parseArgs(['--exclude-ledger', '.docgrad/ledger.jsonl']);
  assert.equal(a.excludeLedger, path.resolve('.docgrad/ledger.jsonl'));
  const b = parseArgs(['--root', '/tmp/x', '--exclude-ledger', '/abs/ledger.jsonl']);
  assert.equal(b.excludeLedger, path.resolve('/abs/ledger.jsonl'));
});

test('parseArgs: missing value and unknown argument throw (not swallowed silently)', () => {
  assert.throws(() => parseArgs(['--include']), /--include requires a value/);
  assert.throws(() => parseArgs(['--root', '--include', 'x']), /--root requires a value/);
  assert.throws(() => parseArgs(['--exclude-ledger']), /--exclude-ledger requires a value/);
  assert.throws(() => parseArgs(['--dim', 'freshness']), /Unknown argument/);
});

test('matchesScope: empty = full scope; directory prefix aligns with path segments; * does not cross levels, ** does', () => {
  assert.equal(matchesScope('docs/a/b.md', []), true);
  assert.equal(matchesScope('docs/infra/x.md', ['docs/infra']), true);
  assert.equal(matchesScope('docs/infra/x.md', ['docs/infra/']), true);
  assert.equal(matchesScope('docs/infrastructure/x.md', ['docs/infra']), false);
  assert.equal(matchesScope('docs/a.md', ['./docs/a.md']), true);
  assert.equal(matchesScope('docs/a.md', ['docs/*.md']), true);
  assert.equal(matchesScope('docs/a/b.md', ['docs/*.md']), false);
  assert.equal(matchesScope('docs/a/b.md', ['docs/**/*.md']), true);
  assert.equal(matchesScope('docs/b.md', ['docs/**/*.md']), true); // ** can match zero levels
  assert.equal(matchesScope('docs/ab.md', ['docs/?b.md']), true);
  assert.equal(matchesScope('docs/aab.md', ['docs/?b.md']), false);
});

test('loadConfig: --config points at a config file outside root (the doc source itself takes no written file)', () => {
  const cfgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-cfg-'));
  const docsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-src-'));
  try {
    const cfgFile = path.join(cfgDir, 'exported.yml');
    fs.writeFileSync(cfgFile, 'docs_dirs: [pages/]\nentry_files: []\n');
    const cfg = loadConfig(docsRoot, cfgFile); // docsRoot has no .docgrad.yml of its own
    assert.deepEqual(cfg.docs_dirs, ['pages/']);
    assert.throws(() => loadConfig(docsRoot), /Run \/docgrad init first/);
  } finally {
    fs.rmSync(cfgDir, { recursive: true, force: true });
    fs.rmSync(docsRoot, { recursive: true, force: true });
  }
});

test('collectFiles: excludes exclude, includes entry_files, paths sorted', () => {
  const cfg = loadConfig(FIXTURE);
  const { included, excluded } = collectFiles(FIXTURE, cfg);
  assert.deepEqual(included, ['CLAUDE.md', 'docs/README.md', 'docs/guide.md', 'docs/orphan.md']);
  assert.deepEqual(excluded, ['docs/archive/old.md']);
});

test('collectFiles: include narrows to scope; exclude still wins over scope', () => {
  const cfg = loadConfig(FIXTURE);
  const { included, excluded } = collectFiles(FIXTURE, cfg, { include: ['docs/guide.md', 'docs/archive/**'] });
  assert.deepEqual(included, ['docs/guide.md']);
  assert.deepEqual(excluded, ['docs/archive/old.md']); // inside scope, but still blocked by exclude
  assert.deepEqual(collectFiles(FIXTURE, cfg, { include: ['docs/*.md'] }).included, [
    'docs/README.md', 'docs/guide.md', 'docs/orphan.md',
  ]);
});

test('collectFiles: docs_files pulls a single file outside docs_dirs into the corpus', () => {
  // This is docs_files' guard rail: if the field were removed, PRODUCT.md/DESIGN.md wouldn't be
  // picked up and this test would go red immediately.
  const cfg = loadConfig(DOCS_FILES_FIXTURE);
  const { included } = collectFiles(DOCS_FILES_FIXTURE, cfg);
  assert.deepEqual(included, [
    'CLAUDE.md', 'DESIGN.md', 'PRODUCT.md', 'docs/README.md', 'docs/guide.md',
  ]);
});

test('collectFiles: docs_files dedupes, silently skips missing files, exclude still wins', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-docsfiles-'));
  try {
    fs.mkdirSync(path.join(tmp, 'docs'));
    fs.writeFileSync(path.join(tmp, 'docs', 'a.md'), '# a\n');
    fs.writeFileSync(path.join(tmp, 'ROOT.md'), '# root\n');
    fs.writeFileSync(path.join(tmp, 'DROPPED.md'), '# dropped\n');
    fs.writeFileSync(
      path.join(tmp, '.docgrad.yml'),
      'docs_dirs: [docs/]\ndocs_files: [docs/a.md, ROOT.md, DROPPED.md, GONE.md]\n' +
        'exclude: [DROPPED.md]\nfreshness:\n  convention: none\n'
    );
    const { included, excluded } = collectFiles(tmp, loadConfig(tmp));
    // docs/a.md is already picked up by docs_dirs -> not duplicated; GONE.md doesn't exist -> silently skipped (same as entry_files)
    assert.deepEqual(included, ['ROOT.md', 'docs/a.md']);
    assert.deepEqual(excluded, ['DROPPED.md']); // listing it in docs_files doesn't block exclude
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// --- #44: out_of_scope is a second, differently-charged way out of the corpus -------------------

// A repo shaped like the measured tj/commander.js case: English docs, a translated mirror that is
// graded as its own corpus, and a genuinely embarrassing draft.
function scopeRepo(configTail) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-oos-'));
  fs.mkdirSync(path.join(tmp, 'docs', 'zh-CN'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'docs', 'wip'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'docs', 'a.md'), '# a\n');
  fs.writeFileSync(path.join(tmp, 'docs', 'zh-CN', 'a.md'), '# 甲\n');
  fs.writeFileSync(path.join(tmp, 'docs', 'wip', 'draft.md'), '# draft\n');
  fs.writeFileSync(path.join(tmp, '.docgrad.yml'), `docs_dirs: [docs/]\n${configTail}`);
  return tmp;
}

test('collectFiles: out_of_scope leaves the corpus without landing in the pollution bucket; exclude still does', () => {
  const tmp = scopeRepo('exclude: [docs/wip/]\nout_of_scope: [docs/zh-CN/]\n');
  try {
    const { included, excluded, outOfScope } = collectFiles(tmp, loadConfig(tmp));
    assert.deepEqual(included, ['docs/a.md'], 'both fields take their files out of the corpus');
    assert.deepEqual(excluded, ['docs/wip/draft.md'], 'only exclude feeds the pollution surface');
    assert.deepEqual(outOfScope, ['docs/zh-CN/a.md']);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('collectFiles: exclude wins when a path matches both fields', () => {
  // Deterministic and one-directional on purpose: a broad out_of_scope entry must never silently
  // cancel an exclude entry somebody already wrote. Getting out of the pollution surface always
  // costs a visible deletion from exclude.
  const tmp = scopeRepo('exclude: [docs/zh-CN/]\nout_of_scope: [docs/zh-CN/, docs/wip/]\n');
  try {
    const { included, excluded, outOfScope } = collectFiles(tmp, loadConfig(tmp));
    assert.deepEqual(included, ['docs/a.md']);
    assert.deepEqual(excluded, ['docs/zh-CN/a.md'], 'still charged: exclude wins the overlap');
    assert.deepEqual(outOfScope, ['docs/wip/draft.md'], 'the non-overlapping entry is unaffected');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('collectFiles: an old config with no out_of_scope behaves exactly as before', () => {
  const tmp = scopeRepo('exclude: [docs/wip/]\n');
  try {
    const { included, excluded, outOfScope } = collectFiles(tmp, loadConfig(tmp));
    assert.deepEqual(included, ['docs/a.md', 'docs/zh-CN/a.md']);
    assert.deepEqual(excluded, ['docs/wip/draft.md']);
    assert.deepEqual(outOfScope, [], 'the new bucket exists and is empty, it does not take anything');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('collectFiles: out_of_scope narrows under --include exactly like exclude does', () => {
  const tmp = scopeRepo('exclude: [docs/wip/]\nout_of_scope: [docs/zh-CN/]\n');
  try {
    const cfg = loadConfig(tmp);
    const narrow = collectFiles(tmp, cfg, { include: ['docs/a.md'] });
    assert.deepEqual(narrow.outOfScope, [], 'outside the scope, so out of this run entirely');
    assert.deepEqual(narrow.excluded, [], 'same as the pollution surface already behaves');
    const wide = collectFiles(tmp, cfg, { include: ['docs/**'] });
    assert.deepEqual(wide.outOfScope, ['docs/zh-CN/a.md']);
    assert.deepEqual(wide.excluded, ['docs/wip/draft.md']);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('collectFiles: a prefix entry only matches on a path boundary, in both fields', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-oos-prefix-'));
  try {
    fs.mkdirSync(path.join(tmp, 'docs', 'arch'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'docs', 'architecture.md'), '# arch\n');
    fs.writeFileSync(path.join(tmp, 'docs', 'arch', 'old.md'), '# old\n');
    fs.writeFileSync(path.join(tmp, '.docgrad.yml'), 'docs_dirs: [docs/]\nout_of_scope: [docs/arch]\n');
    const { included, outOfScope } = collectFiles(tmp, loadConfig(tmp));
    assert.deepEqual(included, ['docs/architecture.md'], 'docs/arch must not swallow architecture.md');
    assert.deepEqual(outOfScope, ['docs/arch/old.md']);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('corpusHash: out_of_scope is corpus-defining, but an absent field still hashes as it did before #44', () => {
  const base = {
    docs_dirs: ['docs/'], docs_files: [], entry_files: ['CLAUDE.md'], exclude: ['docs/archive/'],
    index_file: 'docs/README.md',
  };
  // Pinned to the digest the pre-#44 implementation produced for this config. Adding the field
  // must not stamp a comparability break on every repo that never uses it: a config without
  // out_of_scope and a config with `out_of_scope: []` select the same corpus, so they hash alike.
  assert.equal(corpusHash(base), 'ea564869', 'pre-#44 digest preserved');
  assert.equal(corpusHash({ ...base, out_of_scope: [] }), 'ea564869');
  assert.notEqual(corpusHash({ ...base, out_of_scope: ['docs/zh-CN/'] }), corpusHash(base), 'out_of_scope');
  // The case the field exists for: moving a directory between the two fields changes every
  // denominator while files_total stays put, so report has to draw a comparability break on it.
  const excluded = { ...base, exclude: ['docs/zh-CN/'], out_of_scope: [] };
  const scopedOut = { ...base, exclude: [], out_of_scope: ['docs/zh-CN/'] };
  assert.notEqual(corpusHash(scopedOut), corpusHash(excluded), 'exclude -> out_of_scope is a break');
  // Same normalisation as every other corpus list: trailing slash, order and duplicates are cosmetic.
  assert.equal(
    corpusHash({ ...base, out_of_scope: ['docs/zh-CN', 'guides/', 'docs/zh-CN/'] }),
    corpusHash({ ...base, out_of_scope: ['guides', 'docs/zh-CN/'] })
  );
});

test('collectFiles: docs_files pointing at a directory -> throws explicitly (instead of letting inventory blow up with EISDIR)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-docsfiles-dir-'));
  try {
    fs.mkdirSync(path.join(tmp, 'docs'));
    fs.writeFileSync(path.join(tmp, 'docs', 'a.md'), '# a\n');
    fs.writeFileSync(
      path.join(tmp, '.docgrad.yml'),
      'docs_dirs: [docs/]\ndocs_files: [docs/]\nfreshness:\n  convention: none\n'
    );
    assert.throws(() => collectFiles(tmp, loadConfig(tmp)), /docs_files may only list a single file.*docs_dirs/s);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('estimateTokens: ASCII is 1 token per 4 characters', () => {
  assert.equal(estimateTokens('a'.repeat(40)), 10);
});

test('estimateTokens: CJK is 1.1 tokens per character', () => {
  assert.equal(estimateTokens('中文字'), 3); // round(3.3)
  assert.equal(estimateTokens('中'.repeat(10)), 11);
});

test('githubSlug: lowercase, strip punctuation, spaces to dashes, CJK preserved', () => {
  assert.equal(githubSlug('Docs index'), 'docs-index');
  assert.equal(githubSlug('中文標題'), '中文標題');
  assert.equal(githubSlug('API v2.0 (beta)'), 'api-v20-beta');
});

test('githubSlug: each individual space becomes its own dash (adjacent spaces left by stripped punctuation give a double dash)', () => {
  // GitHub's actual behavior: strip punctuation first, then turn each space into a dash, so
  // `a / b` -> `a--b`. The old implementation collapsed with \s+ into a single dash.
  assert.equal(githubSlug('狀態圖例 (status / sot_level legend)'), '狀態圖例-status--sot_level-legend');
  assert.equal(githubSlug('5. 業務動作 → 呼叫對應'), '5-業務動作--呼叫對應');
  assert.equal(githubSlug('a  b'), 'a--b');
});

test('extractHeadings: a word-internal underscore is literal; only an emphasis underscore is stripped', () => {
  assert.ok(extractHeadings('## snake_case_name here\n').has('snake_case_name-here'));
  assert.ok(extractHeadings('## _italic_ title\n').has('italic-title'));
  assert.ok(extractHeadings('## __bold__ x\n').has('bold-x'));
  assert.ok(extractHeadings('## `code` span\n').has('code-span'));
  assert.ok(extractHeadings('## 狀態圖例 (status / sot_level legend)\n').has('狀態圖例-status--sot_level-legend'));
});

// #42: the 0.6.1 fix only covered the word-internal case. An `_` whose *left* neighbour is
// punctuation or the start of the line was still stripped, so the slug disagreed with GitHub and
// links into those sections were reported as bad anchors — which always costs a star (1.x).
test('extractHeadings: an unpaired underscore is literal, whatever sits next to it (#42)', () => {
  const cases = [
    ['### cmd._args', 'cmd_args'], // githubSlug drops the dot, keeps the underscore
    ['### _private', '_private'],
    ['### sot_level', 'sot_level'], // the 0.6.1 regression case
    ['### a.b_c', 'ab_c'],
    ['### my_var', 'my_var'],
    ['### __dunder', '__dunder'],
    ['### opts._flags and cfg._other', 'opts_flags-and-cfg_other'], // two lone `_` must not pair up
  ];
  for (const [heading, slug] of cases) {
    assert.ok(
      extractHeadings(`${heading}\n`).has(slug),
      `${heading} should slug to ${slug}, got ${[...extractHeadings(`${heading}\n`)].join(', ')}`
    );
  }
});

test('extractHeadings: a matched underscore pair is still emphasis and is still stripped (#42)', () => {
  assert.ok(extractHeadings('### _emphasis_\n').has('emphasis'));
  assert.ok(extractHeadings('### __init__\n').has('init'), 'GitHub renders this as bold "init" too');
  assert.ok(extractHeadings('### _emphasis_ and cmd._args\n').has('emphasis-and-cmd_args'));
});

test('extractHeadings: explicit anchors <a id>/<a name> are also indexed into the slug set', () => {
  const slugs = extractHeadings('# T\n\n<a id="canonical-contracts"></a>\n## 內容\n');
  assert.ok(slugs.has('canonical-contracts'), '<a id> should be indexed');
  assert.ok(slugs.has('t') && slugs.has('內容'), 'a normal heading is unaffected');
  assert.ok(extractHeadings("<a name='legacy-anchor'></a>\n").has('legacy-anchor'), 'single-quoted name= is also recognized');
  assert.ok(extractHeadings('<a class="x" id="with-attrs"></a>\n').has('with-attrs'), 'other attributes before it are also fine');
});

test('extractHeadings: repeated headings get a numeric suffix', () => {
  const slugs = extractHeadings('# A\n## Setup\n## Setup\n');
  assert.ok(slugs.has('a') && slugs.has('setup') && slugs.has('setup-1'));
});

test('extractLinks: captures inline links, skips code fences', () => {
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

test('parseFreshnessConventions: single value / comma / plus separated / empty -> none', () => {
  assert.deepEqual(parseFreshnessConventions('frontmatter'), ['frontmatter']);
  assert.deepEqual(parseFreshnessConventions('frontmatter,heading-line'), ['frontmatter', 'heading-line']);
  assert.deepEqual(parseFreshnessConventions('frontmatter+heading-line'), ['frontmatter', 'heading-line']);
  assert.deepEqual(parseFreshnessConventions('frontmatter , heading-line'), ['frontmatter', 'heading-line']);
  assert.deepEqual(parseFreshnessConventions(null), ['none']);
  assert.deepEqual(parseFreshnessConventions('none'), ['none']);
});

test('extractClaimedDate: multiple values tried in order, first extracted wins', () => {
  const fm = '---\nlast_updated: 2026-07-01\n---\n# T\n';
  const hl = '# T\n\n> Last updated: 2026-06-15\n';
  const freshness = { convention: 'frontmatter,heading-line', field: 'last_updated', heading_field: 'Last updated:' };
  assert.equal(extractClaimedDate(fm, freshness), '2026-07-01'); // only frontmatter matches
  assert.equal(extractClaimedDate(hl, freshness), '2026-06-15'); // frontmatter finds nothing -> falls back to heading-line
  assert.equal(extractClaimedDate('# T\n', freshness), null); // neither matches
});

test('extractClaimedDate: heading-line falls back to field as heading_field when only field is set (compatible with old configs)', () => {
  const hl = '# T\n\n> Last updated: 2026-06-15\n';
  assert.equal(
    extractClaimedDate(hl, { convention: 'heading-line', field: 'Last updated:', heading_field: null }),
    '2026-06-15'
  );
});

test('extractCodeRefs: a path inside a single backtick span, starting with an srcDirs prefix', () => {
  const text = '參考 `apps/api/src/contract/contract-approval.service.ts` 的實作。';
  const refs = extractCodeRefs(text, ['apps/api/src']);
  assert.deepEqual(refs, [
    { path: 'apps/api/src/contract/contract-approval.service.ts', symbol: null, basenameOnly: false },
  ]);
});

test('extractCodeRefs: the `path › symbol` single-backtick form (how-to.md convention)', () => {
  const text = '見 `scripts/lib.mjs › DEFAULTS.targets` 與 `scripts/lib.mjs › parseYamlSubset()`。';
  const refs = extractCodeRefs(text, ['scripts']);
  assert.deepEqual(refs, [
    { path: 'scripts/lib.mjs', symbol: 'DEFAULTS.targets', basenameOnly: false },
    { path: 'scripts/lib.mjs', symbol: 'parseYamlSubset()', basenameOnly: false },
  ]);
});

test('extractCodeRefs: a bare filename (no path prefix) matched by basename, including two backtick spans joined by ›', () => {
  const text = '寫入點＝`contract-approval.service.ts` submit；另見 `contract-approval.service.ts` › `approve()`。';
  const refs = extractCodeRefs(text, ['apps/api/src']);
  assert.deepEqual(refs, [
    { path: 'contract-approval.service.ts', symbol: null, basenameOnly: true },
    { path: 'contract-approval.service.ts', symbol: 'approve()', basenameOnly: true },
  ]);
});

test('extractCodeRefs: a bare directory (no filename) also counts as a path anchor, and contractx does not falsely match the contract prefix', () => {
  const text = '`apps/api/src/timesheet` 整個模組；`apps/api/src/contractx/foo.ts` 不該被當成 contract 前綴命中。';
  const refs = extractCodeRefs(text, ['apps/api/src/timesheet', 'apps/api/src/contract']);
  assert.deepEqual(refs.map((r) => r.path), ['apps/api/src/timesheet']);
});

test('extractCodeRefs: skips backticks inside a code fence, skips non-path-shaped inline code', () => {
  const text = '```\n`apps/api/src/skip.ts`\n```\n一般 `npm install` 不是路徑。';
  const refs = extractCodeRefs(text, ['apps/api/src']);
  assert.deepEqual(refs, []);
});

// #56: rubric_hash fingerprints the anchors, not the rules for applying them. v1.7.0 added two
// boundary rules to audit.md — one of which can only lower a pass rate — and no fingerprint moved,
// so the break could only be disclosed in prose. These tests pin which files decide a rating.
test('judgeHash: covers the anchors (rubric.md, since v2.0.0 E4b) and the rule files, and each one moves it on its own', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-judge-'));
  try {
    fs.mkdirSync(path.join(tmp, 'reference'), { recursive: true });
    const write = (rel, body) => fs.writeFileSync(path.join(tmp, rel), body);
    write('reference/judge.md', 'step 2: rate against the rubric');
    write('reference/placement.md', 'rule 4: grounds live with the conclusion');
    write('reference/rubric.md', '★4 anchor A');
    write('reference/improve.md', 'round flow');
    write('reference/measure.md', 'step 1: run the scripts');
    write('reference/audit.md', 'router: measure.md then judge.md');

    const base = judgeHash(tmp);
    assert.match(base, /^[0-9a-f]{8}$/);
    assert.equal(judgeHash(tmp), base, 'same inputs must hash the same');

    // judge.md carries the procedure and the boundary rules.
    write('reference/judge.md', 'step 2: rate against the rubric (edited)');
    const afterJudge = judgeHash(tmp);
    assert.notEqual(afterJudge, base);

    // placement.md decides what counts as a consistency deduction (SKILL.md blocker 2).
    write('reference/placement.md', 'rule 4: grounds may live anywhere');
    assert.notEqual(judgeHash(tmp), afterJudge);

    // rubric.md is folded into judge_hash's inputs since v2.0.0 E4b, once E2b-2 left it holding
    // only judge anchors — the same layer as judge.md and placement.md.
    const beforeRubric = judgeHash(tmp);
    write('reference/rubric.md', '★4 anchor B');
    const afterRubric = judgeHash(tmp);
    assert.notEqual(afterRubric, beforeRubric, 'rubric.md must move judge_hash (folded in at v2.0.0 E4b)');

    // improve.md delegates the rating to judge.md and is never read by a plain `audit`.
    write('reference/improve.md', 'round flow, rewritten');
    assert.equal(judgeHash(tmp), afterRubric, 'improve.md must not move judge_hash');

    // measure.md is the script run and gate check — it is covered by measure_hash (since E2b-1),
    // not judge_hash, so editing it here must not move judgeHash's value.
    write('reference/measure.md', 'step 1: run the scripts (edited)');
    assert.equal(judgeHash(tmp), afterRubric, 'measure.md must not move judge_hash');

    // audit.md is a thin router with no rules of its own; editing it must not move judge_hash.
    write('reference/audit.md', 'router: measure.md then judge.md (edited)');
    assert.equal(judgeHash(tmp), afterRubric, 'audit.md (the router) must not move judge_hash');

    // Missing files read as unknown, not as a value.
    assert.equal(judgeHash(fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-empty-'))), null);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('docgradMeta: corpus_hash is null without a config, and present with one (backward-compatible signature)', () => {
  assert.equal(docgradMeta().corpus_hash, null, 'an old one-argument caller must not crash');
  const cfg = loadConfig(FIXTURE);
  assert.equal(docgradMeta(undefined, cfg).corpus_hash, corpusHash(cfg));
  assert.match(docgradMeta(undefined, cfg).corpus_hash, /^[0-9a-f]{8}$/);
});

// #47: the skill payload moved to skills/docgrad/ while .claude-plugin/ stayed at the repo root,
// so the manifest is no longer a sibling of the skill root. docgradMeta() swallows a missing
// manifest and returns version: null — nothing throws, nothing warns, and the only trace is a
// history.jsonl slowly filling with null versions. These two tests exist because that failure is
// silent; without them the layout can regress and every other test stays green.
// #47 gave the repo a second manifest for Codex carrying its own copy of the version, and a third
// (Antigravity) that carries none. docs/how-to.md's release step names the authority; this makes a
// half-done bump fail the suite instead of shipping two different answers to "what version is this".
// #50: economy was the only nested map loadConfig never deep-merged. It did not matter while
// nothing read the fields; inventory.mjs reads them now, so a partial economy block would have
// handed it `entry_cost_tiers: undefined`.
test('loadConfig: a partial economy block keeps the untouched key at its default', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-economy-'));
  try {
    fs.writeFileSync(path.join(tmp, '.docgrad.yml'), 'docs_dirs: [docs/]\neconomy:\n  pollution_max: 0.2\n');
    const cfg = loadConfig(tmp);
    assert.equal(cfg.economy.pollution_max, 0.2);
    assert.deepEqual(cfg.economy.entry_cost_tiers, [20000, 10000, 5000, 3000], 'the untouched key must survive the merge');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('validateConfigTypes: the nested maps that can move a judgement are checked', () => {
  const base = { ...loadConfig(FIXTURE) };
  const withEconomy = (economy) => ({ ...base, economy: { ...base.economy, ...economy } });
  assert.throws(() => validateConfigTypes(withEconomy({ entry_cost_tiers: [1, 2] })), /four positive numbers/);
  assert.throws(() => validateConfigTypes(withEconomy({ entry_cost_tiers: [3000, 5000, 10000, 20000] })), /must decrease/);
  assert.throws(() => validateConfigTypes(withEconomy({ pollution_max: 10 })), /at most 1/);
  assert.throws(
    () => validateConfigTypes({ ...base, freshness: { ...base.freshness, stale_after_days: 0 } }),
    /positive whole number of days/
  );
  // The shipped defaults must of course pass.
  assert.ok(validateConfigTypes(base));
});

// measure_hash (the former thresholds_hash) exists because these three values move judgement boundaries without changing a
// word of rubric.md, judge.md or placement.md, so judge_hash alone cannot tell two differently-ruled rounds apart.
test('measureHash: stable at the defaults, moves for each of the three fields, null without a config', () => {
  const base = loadConfig(FIXTURE);
  const at = measureHash(base);
  assert.match(at, /^[0-9a-f]{8}$/);
  assert.equal(measureHash(loadConfig(FIXTURE)), at, 'the same config must hash the same');
  assert.equal(measureHash(null), null, 'unknown must stay distinguishable from the defaults');

  const moved = [
    { ...base, economy: { ...base.economy, entry_cost_tiers: [20000, 10000, 5000, 2500] } },
    { ...base, economy: { ...base.economy, pollution_max: 0.2 } },
    { ...base, freshness: { ...base.freshness, stale_after_days: 365 } },
  ];
  for (const cfg of moved) assert.notEqual(measureHash(cfg), at);
  // ...and each moves it to its own value, so the hash identifies which ruler, not merely "not the default".
  assert.equal(new Set(moved.map((c) => measureHash(c))).size, 3);
});

test('packaging: the Codex manifest version matches the Claude Code manifest, which is the authority', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const authority = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin/plugin.json'), 'utf8'));
  const codex = JSON.parse(fs.readFileSync(path.join(root, '.codex-plugin/plugin.json'), 'utf8'));
  assert.match(authority.version, /^\d+\.\d+\.\d+$/);
  assert.equal(codex.version, authority.version, '.codex-plugin/plugin.json drifted from the version authority');
  // The Antigravity manifest deliberately has no version; asserting that keeps a well-meaning
  // "consistency" edit from adding a third copy to keep in sync.
  const antigravity = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8'));
  assert.equal(antigravity.version, undefined);
});

test('docgradMeta: version is non-null from the real tree (the manifest is a level above the skill root)', () => {
  const meta = docgradMeta();
  assert.notEqual(meta.version, null, 'version went null — the manifest search no longer reaches .claude-plugin/plugin.json');
  assert.match(meta.version, /^\d+\.\d+\.\d+$/);
});

test('docgradMeta: the manifest search walks up, and stops rather than escaping upward forever', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-layout-'));
  try {
    const skillRoot = path.join(tmp, 'skills/docgrad');
    fs.mkdirSync(path.join(skillRoot, 'reference'), { recursive: true });
    fs.mkdirSync(path.join(tmp, '.claude-plugin'));
    fs.writeFileSync(path.join(tmp, '.claude-plugin/plugin.json'), '{"version":"9.9.9"}');
    fs.writeFileSync(path.join(skillRoot, 'reference/rubric.md'), '★4 anchor A');
    fs.writeFileSync(path.join(skillRoot, 'reference/judge.md'), 'step 2: rate against the rubric');
    fs.writeFileSync(path.join(skillRoot, 'reference/placement.md'), 'rule 4: grounds live with the conclusion');
    // Found two levels up, which is the shipped layout.
    assert.equal(docgradMeta(skillRoot).version, '9.9.9');
    // judge_hash still resolves from the skill root itself, not from the manifest's directory.
    assert.match(docgradMeta(skillRoot).judge_hash, /^[0-9a-f]{8}$/);

    // A skill root with no manifest anywhere above it inside the search window reports null rather
    // than picking up an unrelated manifest from further up the filesystem.
    const orphan = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-orphan-'));
    try {
      assert.equal(docgradMeta(orphan).version, null);
    } finally {
      fs.rmSync(orphan, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('docgradMeta: returns version and judge fingerprint; the hash changes when rubric changes', () => {
  const meta = docgradMeta();
  assert.match(meta.version, /^\d+\.\d+\.\d+$/);
  assert.match(meta.judge_hash, /^[0-9a-f]{8}$/);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-meta-'));
  try {
    fs.mkdirSync(path.join(tmp, '.claude-plugin'));
    fs.mkdirSync(path.join(tmp, 'reference'));
    fs.writeFileSync(path.join(tmp, '.claude-plugin/plugin.json'), '{"version":"9.9.9"}');
    fs.writeFileSync(path.join(tmp, 'reference/rubric.md'), '★4 anchor A');
    fs.writeFileSync(path.join(tmp, 'reference/judge.md'), 'step 2: rate against the rubric');
    fs.writeFileSync(path.join(tmp, 'reference/placement.md'), 'rule 4: grounds live with the conclusion');
    const before = docgradMeta(tmp);
    assert.equal(before.version, '9.9.9');
    assert.match(before.judge_hash, /^[0-9a-f]{8}$/);
    fs.writeFileSync(path.join(tmp, 'reference/rubric.md'), '★4 anchor B');
    const after = docgradMeta(tmp);
    assert.match(after.judge_hash, /^[0-9a-f]{8}$/);
    assert.notEqual(after.judge_hash, before.judge_hash, 'editing rubric.md must move judge_hash (folded in at v2.0.0 E4b)');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('docgradMeta: returns null instead of throwing when files cannot be read', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-meta-'));
  try {
    assert.deepEqual(docgradMeta(tmp), {
      version: null,
      measure_hash: null,
      judge_hash: null,
      corpus_hash: null,
    });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('extractClaimLines: only keeps non-heading lines outside a fence that have code coordinates', () => {
  const text = [
    '# 標題含 `src/a.ts` 但不算宣稱',
    '',
    '路由定義在 `src/router.ts`。',
    '這是一段沒有座標的純敘述。',
    '```',
    'fence 內的 `src/ignored.ts` 不算',
    '```',
    '- `src/lib.ts › parse()` 負責解析',
  ].join('\n');
  const claims = extractClaimLines(text, ['src/']);
  assert.deepEqual(claims.map((c) => c.line), [3, 8]);
  assert.equal(claims[0].refs, 1);
});

test('extractClaimLines: returns the section range it belongs to, so verification covers the sentence next to the anchor', () => {
  // The oikos balance sign was written in the sentence right after the anchor line — checking
  // only the anchor line would have missed the whole thing.
  const text = [
    '# 結算設計',
    '',
    '結算由 `src/balance.ts › settle()` 負責。',
    '',
    '回傳正數代表 memberA 欠 memberB。',
    '',
    '## 其他',
    '',
    '無關內容。',
  ].join('\n');
  const [claim] = extractClaimLines(text, ['src/']);
  assert.equal(claim.line, 3);
  assert.equal(claim.section, '結算設計');
  const [start, end] = claim.section_lines;
  assert.ok(start <= 5 && end >= 5, `the neighboring sentence on line 5 must fall inside section range [${start}, ${end}]`);
  assert.ok(end < 7, 'the section range must not cross the next heading');
});

// #41: the ledger keys claims on `<path>:<line>`, and docgrad's own convergence loop moves
// content between documents. A content-derived key is what survives that move.
test('claimHash: identical claim text hashes the same wherever it moves to (#41)', () => {
  const moved = 'Settlement is handled by `src/balance.ts › settle()`.';
  const a = extractClaimLines(`# A\n\n${moved}\n`, ['src/']);
  const b = extractClaimLines(`# B\n\nfiller\n\nmore filler\n\n${moved}\n`, ['src/']);
  assert.equal(a[0].line, 3);
  assert.equal(b[0].line, 7, 'same text, different line');
  assert.equal(a[0].claim_hash, b[0].claim_hash);
  assert.equal(a[0].claim_hash.length, CLAIM_HASH_CHARS);
  assert.match(a[0].claim_hash, /^[0-9a-f]+$/);
});

test('claimHash: whitespace is normalised but markup and case are not (#41)', () => {
  const base = claimHash('Routing lives in `src/router.ts`.');
  assert.equal(claimHash('   Routing   lives\tin  `src/router.ts`.  '), base, 'whitespace runs collapse');
  assert.notEqual(claimHash('routing lives in `src/router.ts`.'), base, 'case is not folded');
  assert.notEqual(claimHash('Routing lives in **`src/router.ts`**.'), base, 'markup is not stripped');
  assert.notEqual(claimHash('Routing lives in `src/routes.ts`.'), base, 'an edited claim is a new claim');
});

// #40: library documentation describes an API, not a file tree. Measured on tj/commander.js,
// path-shaped matching found a claim on exactly zero lines.
function apiRepo() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-api-'));
  fs.mkdirSync(path.join(tmp, 'src'));
  fs.writeFileSync(
    path.join(tmp, 'src', 'command.js'),
    'class Command {\n  option() {}\n  opts() {}\n}\nconst program = new Command();\nlet minWidthToWrap = 40;\n'
  );
  return tmp;
}

test('extractClaimLines: API-shaped inline code counts, but only when the symbol exists under src_dirs (#40)', () => {
  const tmp = apiRepo();
  try {
    const { symbols, files_scanned } = buildSrcSymbolIndex(tmp, ['src/']);
    assert.ok(files_scanned === 1 && symbols.has('option') && symbols.has('program'));
    const text = [
      '# Options',
      '',
      'Declare an option with `.option()`.',            // member call, leading dot
      'Read the parsed values with `program.opts()`.',  // member call
      'Call `opts()` on the command.',                  // bare call
      'The `.mangle()` helper does not exist here.',    // shape matches, symbol does not exist
      'Prose about a `sandwich` and a `program`.',      // bare identifiers: never accepted
      'Wrapping is controlled by `minWidthToWrap`.',    // bare identifier, even though it exists
      '```',
      'fenced `.option()` does not count',
      '```',
    ].join('\n');
    const claims = extractClaimLines(text, ['src/'], { symbols });
    assert.deepEqual(claims.map((c) => c.line), [3, 4, 5]);
    assert.ok(claims.every((c) => c.refs_path === 0 && c.refs_api === 1 && c.refs === 1));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('extractClaimLines: without a symbol index the API shape is inert, path shapes unchanged (#40)', () => {
  const text = 'Declare an option with `.option()`, routing lives in `src/router.ts`.';
  assert.deepEqual(extractClaimLines(text, ['src/']).map((c) => c.line), [1], 'path ref still counts');
  const [claim] = extractClaimLines(text, ['src/']);
  assert.equal(claim.refs, 1);
  assert.equal(claim.refs_api, 0, 'no src_dirs index -> no existence check -> no API refs');
  assert.deepEqual(extractClaimLines('Declare an option with `.option()`.', []), [], 'inert, not guessing');
});

test('buildSrcSymbolIndex: src_dirs unset returns null, so the caller can report the degradation (#40)', () => {
  assert.equal(buildSrcSymbolIndex(process.cwd(), []), null);
  assert.equal(buildSrcSymbolIndex(process.cwd(), undefined), null);
  assert.equal(buildSrcSymbolIndex(process.cwd(), ['   ']), null, 'whitespace-only entries do not count');
});

test('extractClaimLines: a paren-less dotted span already counted as a path ref is not double counted (#40)', () => {
  const tmp = apiRepo();
  try {
    const { symbols } = buildSrcSymbolIndex(tmp, ['src/']);
    // `program.opts` has a basename-shaped tail, so extractCodeRefs already emits it. Counting it
    // a second time would inflate refs and silently reorder the candidate list.
    const [claim] = extractClaimLines('Use `program.opts` directly.', ['src/'], { symbols });
    assert.equal(claim.refs, 1);
    assert.equal(claim.refs_path, 1);
    assert.equal(claim.refs_api, 0);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('isDocgradAuthored: a docs(docgrad) subject is true, anything else false, no subject null (#40)', () => {
  assert.equal(isDocgradAuthored('docs(docgrad): 第 2 輪收斂 — 完整性 ★3→★4'), true);
  assert.equal(isDocgradAuthored('docs(docgrad) : spaced colon'), true);
  assert.equal(isDocgradAuthored('docs: hand-written'), false);
  assert.equal(isDocgradAuthored('feat(docgrad): a code change'), false);
  assert.equal(isDocgradAuthored(undefined), null, 'unknown is never false');
  assert.equal(isDocgradAuthored(null), null);
});

test('gitAddCommitSubjects: reports the oldest adding commit per path, null outside a git tree (#40)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-added-'));
  try {
    fs.mkdirSync(path.join(tmp, 'docs'));
    fs.writeFileSync(path.join(tmp, 'docs', 'hand.md'), '# hand\n');
    gitInit(tmp); // commits everything on disk with subject "fixture"
    fs.writeFileSync(path.join(tmp, 'docs', 'written.md'), '# written\n');
    const env = {
      ...process.env,
      GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null',
      GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com',
      GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com',
    };
    execFileSync('git', ['add', '-A'], { cwd: tmp, env });
    execFileSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'docs(docgrad): round 2'], { cwd: tmp, env });
    // edit the hand-written file afterwards: the *adding* commit must still be the one reported
    fs.writeFileSync(path.join(tmp, 'docs', 'hand.md'), '# hand\n\nmore\n');
    execFileSync('git', ['add', '-A'], { cwd: tmp, env });
    execFileSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'docs(docgrad): round 3'], { cwd: tmp, env });

    const subjects = gitAddCommitSubjects(tmp, ['docs/hand.md', 'docs/written.md']);
    assert.equal(subjects.get('docs/hand.md'), 'fixture');
    assert.equal(subjects.get('docs/written.md'), 'docs(docgrad): round 2');
    assert.equal(isDocgradAuthored(subjects.get('docs/hand.md')), false);
    assert.equal(isDocgradAuthored(subjects.get('docs/written.md')), true);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('gitAddCommitSubjects: outside a git work tree returns null, never an empty answer (#40)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-nogit-added-'));
  try {
    fs.writeFileSync(path.join(tmp, 'a.md'), '# a\n');
    assert.equal(gitAddCommitSubjects(tmp, ['a.md']), null);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('rankClaimCandidates: more refs comes first, ties broken by path then line (stable, reproducible)', () => {
  const ranked = rankClaimCandidates([
    { path: 'b.md', claims: [{ line: 2, text: 'x', refs: 1 }] },
    { path: 'a.md', claims: [{ line: 9, text: 'y', refs: 1 }, { line: 1, text: 'z', refs: 3 }] },
  ]);
  assert.deepEqual(
    ranked.map((c) => `${c.path}:${c.line}`),
    ['a.md:1', 'a.md:9', 'b.md:2']
  );
});

// --- loadLedgerClaimHashes (#54) ---------------------------------------------------

test('loadLedgerClaimHashes: collects distinct claim_hash values, ignores blank lines', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-ledger-'));
  try {
    const ledgerPath = path.join(tmp, 'ledger.jsonl');
    fs.writeFileSync(
      ledgerPath,
      [
        JSON.stringify({ claim_hash: 'aaa111', round: 1, verify: 'pass' }),
        '',
        JSON.stringify({ claim_hash: 'bbb222', round: 1, verify: 'fail' }),
        JSON.stringify({ claim_hash: 'aaa111', round: 2, verify: 'pass' }), // re-verified: same hash again
      ].join('\n')
    );
    const hashes = loadLedgerClaimHashes(ledgerPath);
    assert.deepEqual([...hashes].sort(), ['aaa111', 'bbb222']);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('loadLedgerClaimHashes: a missing file fails loudly rather than returning an empty set', () => {
  assert.throws(
    () => loadLedgerClaimHashes(path.join(os.tmpdir(), 'docgrad-no-such-ledger-', 'ledger.jsonl')),
    /--exclude-ledger .*could not read this file/
  );
});

test('loadLedgerClaimHashes: a malformed line (not JSON) fails loudly, naming the line', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-ledger-bad-'));
  try {
    const ledgerPath = path.join(tmp, 'ledger.jsonl');
    fs.writeFileSync(ledgerPath, '{"claim_hash": "aaa111"}\nnot json at all\n');
    assert.throws(() => loadLedgerClaimHashes(ledgerPath), /:2: not a valid JSON object/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('loadLedgerClaimHashes: a row without claim_hash fails loudly rather than being silently skipped', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-ledger-nohash-'));
  try {
    const ledgerPath = path.join(tmp, 'ledger.jsonl');
    fs.writeFileSync(ledgerPath, '{"round": 1, "verify": "pass"}\n');
    assert.throws(() => loadLedgerClaimHashes(ledgerPath), /has no non-empty claim_hash field/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('lib: parseFreshnessFields — keywords are verbatim: a string is one keyword (never split on commas, never trimmed), a list is kept as is, null -> []', () => {
  assert.deepEqual(parseFreshnessFields('Last updated:'), ['Last updated:']);
  assert.deepEqual(parseFreshnessFields('Updated, last:'), ['Updated, last:']);
  assert.deepEqual(parseFreshnessFields(' Updated:'), [' Updated:']); // a leading space is a word boundary the author chose
  assert.deepEqual(parseFreshnessFields(['Last updated:', 'Updated:']), ['Last updated:', 'Updated:']);
  assert.deepEqual(parseFreshnessFields(null), []);
  assert.deepEqual(parseFreshnessFields([]), []);
});

test('lib: extractClaimedDate with list-valued heading_field picks whichever keyword the file uses', () => {
  const freshness = { convention: 'heading-line', field: null, heading_field: ['Last updated:', 'Updated:'] };
  assert.equal(extractClaimedDate('# A\n\n> Updated: 2026-01-02\n', freshness), '2026-01-02');
  assert.equal(extractClaimedDate('# B\n\n> **Last updated:** 2026-01-03\n', freshness), '2026-01-03');
  assert.equal(extractClaimedDate('# C\n\nno date line\n', freshness), null);
});

test('lib: parseYamlSubset inline list — commas inside a quoted item do not split it; an apostrophe inside a plain item is text', () => {
  const parsed = parseYamlSubset('freshness:\n  heading_field: ["Updated, last:", "Other:", plain]\n');
  assert.deepEqual(parsed.freshness.heading_field, ['Updated, last:', 'Other:', 'plain']);
  assert.deepEqual(parseYamlSubset('a: [x, "y,z"]\n').a, ['x', 'y,z']);
  assert.deepEqual(parseYamlSubset('a: []\n').a, []);
  // regression caught in review: a quote may only open at the start of an item
  assert.deepEqual(parseYamlSubset("exclude: [docs/owner's/, docs/archive/]\n").exclude, ["docs/owner's/", 'docs/archive/']);
  assert.deepEqual(parseYamlSubset('a: [it"s, "q, r"]\n').a, ['it"s', 'q, r']);
});

test('loadLedgerRows: error text names the flag it was called for, and loadLedgerClaimHashes keeps its own wording (#63)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-ledger-flag-'));
  try {
    const missing = path.join(tmp, 'nope.jsonl');
    assert.throws(() => loadLedgerRows(missing, '--locate-ledger'), /--locate-ledger .*could not read this file/);
    assert.throws(() => loadLedgerClaimHashes(missing), /--exclude-ledger .*could not read this file/);
    const ledgerPath = path.join(tmp, 'ledger.jsonl');
    fs.writeFileSync(ledgerPath, `${JSON.stringify({ claim_hash: 'aaa', doc: 'docs/a.md' })}\n${JSON.stringify({ claim_hash: 'aaa', doc: 'docs/a.md' })}\n`);
    // Rows are per line (a ledger is append-only); hashes are deduplicated.
    assert.equal(loadLedgerRows(ledgerPath).length, 2);
    assert.equal(loadLedgerClaimHashes(ledgerPath).size, 1);
    assert.equal(loadLedgerRows(ledgerPath)[0].doc, 'docs/a.md');
    // A row without `doc` is null, never a guessed path.
    fs.writeFileSync(ledgerPath, `${JSON.stringify({ claim_hash: 'bbb' })}\n`);
    assert.equal(loadLedgerRows(ledgerPath)[0].doc, null);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// --- v2 E1/E2a/E2b-1/E2b-2: the two-layer fingerprint vocabulary ------------------------
//
// E1 renamed only: `measure_hash` is the former `thresholds_hash` and `judge_hash` the former
// `judgement_hash`, digesting the same inputs in the same order — so both values held through E1.
// E2a then split `reference/audit.md` into `measure.md` + `judge.md` and repointed `judge_hash` to
// the new judge.md + placement.md pair. That move is deliberate (a false break: the file moved,
// no rule changed) — it is a pinned new value, not a preserved one. `measure_hash` was unaffected
// through E2a — it stayed config-only, and the audit.md split carried no config change.
// E2b-1 grew `measure_hash`'s inputs: it now also covers `lib.mjs › MEASURE_BANDS` (the
// verdict band table, unresolved) and `reference/measure.md`'s content, so it moved there — that
// was the first entry in this test where that value was not the config-only `thresholds_hash`
// literal.
// **E2b-2 retires the linkage/freshness/economy star anchors: rubric.md is judge-only.** judge.md's
// former steps 4/5 and 7 move into measure.md (a real rule removal, so `judge_hash` moves); measure.md
// grows new §Freshness/§Linkage/§Economy notes and §Token economy signals sections and
// `MEASURE_BANDS[*].source` strings are reworded to cite the retired anchors (so `measure_hash`
// moves too); rubric.md itself changes (so `rubric_hash` moves). `corpus_hash` is unaffected.
// **E4b (this epoch) folds the fingerprint that was `rubric_hash` (before E4b) into `judge_hash`.**
// Once E2b-2 left rubric.md holding only judge anchors, rubric.md joins `lib.mjs › JUDGE_FILES`:
// `judge_hash` moves a third time and the separate field retires. `measure_hash` and `corpus_hash`
// are unaffected.
// The literals below were pinned rather than recomputed because a hash that quietly changed would
// otherwise look exactly like one that did not.
test('docgradMeta: judge_hash folds in rubric.md at E4b, and the three hashes stay independent', () => {
  const skillRoot = fileURLToPath(new URL('../skills/docgrad/', import.meta.url));
  const config = loadConfig(fileURLToPath(new URL('../', import.meta.url)));
  const meta = docgradMeta(skillRoot, config);

  assert.deepEqual(Object.keys(meta), ['version', 'measure_hash', 'judge_hash', 'corpus_hash']);
  assert.equal(meta.measure_hash, '38724510', 'measure_hash unaffected by E4b (unchanged since E2b-2)');
  assert.equal(meta.judge_hash, '6c0f1ed0', 'judge_hash after E4b (was e8881920 through E2b-2)');

  // Each hash answers for its own layer and nothing else. A threshold edit is a measure-side ruler
  // change; a placement.md edit is a judge-side one; neither may disturb the other, or #82's
  // "the trend draws measure only" cannot be implemented on top of them.
  const moved = { ...config, economy: { ...config.economy, pollution_max: 0.2 } };
  assert.notEqual(measureHash(moved), meta.measure_hash, 'a threshold edit moves measure_hash');
  assert.equal(judgeHash(skillRoot), meta.judge_hash, '...and leaves judge_hash alone');
  assert.equal(corpusHash(moved), meta.corpus_hash, '...and leaves corpus_hash alone');
});

test('measureHash: null without a config — "unknown" stays distinguishable from "the defaults"', () => {
  // Inherited verbatim from thresholds_hash. A configless run must not be reportable as a run at the
  // shipped defaults: the two are different claims about which ruler was used, and collapsing them
  // is how a fingerprint stops being evidence.
  assert.equal(measureHash(null), null);
  assert.equal(docgradMeta(fileURLToPath(new URL('../skills/docgrad/', import.meta.url))).measure_hash, null);
});

// --- v2 E2b-1: MEASURE_BANDS / evaluateMeasure / measureDigest -------------------------

test('MEASURE_BANDS: plain JSON data — round-trips through JSON.stringify/parse unchanged', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(MEASURE_BANDS)), MEASURE_BANDS);
});

test('measureHash: null (never throws) when reference/measure.md is unreadable from this skillRoot', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-measure-missing-'));
  try {
    const config = loadConfig(FIXTURE);
    assert.doesNotThrow(() => measureHash(config, tmp));
    assert.equal(measureHash(config, tmp), null);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('measureDigest: pure, injectable, null when a MEASURE_FILES entry is null or config is null', () => {
  const config = loadConfig(FIXTURE);
  const files = { [MEASURE_FILES[0]]: 'step 1: run the scripts' };
  const a = measureDigest(config, MEASURE_BANDS, files);
  assert.match(a, /^[0-9a-f]{8}$/);
  assert.equal(measureDigest(config, MEASURE_BANDS, files), a, 'deterministic for the same inputs');
  assert.equal(measureDigest(config, MEASURE_BANDS, { [MEASURE_FILES[0]]: null }), null, 'an unreadable file is null, not a hash of an empty string');
  assert.equal(measureDigest(null, MEASURE_BANDS, files), null);
});

test('MEASURE_BANDS: mutating a threshold moves the digest — a fail edit and an ok edit each move it, on their own', () => {
  const config = loadConfig(FIXTURE);
  const files = { [MEASURE_FILES[0]]: 'step 1: run the scripts' };
  const base = measureDigest(config, MEASURE_BANDS, files);

  const mutatedFail = MEASURE_BANDS.map((r) =>
    r.id === 'dead_link_ratio' ? { ...r, fail: { ...r.fail, value: 0.05 } } : r
  );
  assert.notEqual(measureDigest(config, mutatedFail, files), base, 'a fail descriptor value edit moves the digest');

  const mutatedOk = MEASURE_BANDS.map((r) => (r.id === 'orphan_ratio' ? { ...r, ok: { ...r.ok, value: 0.1 } } : r));
  assert.notEqual(measureDigest(config, mutatedOk, files), base, 'an ok descriptor value edit moves the digest');
  assert.notEqual(measureDigest(config, mutatedFail, files), measureDigest(config, mutatedOk, files), 'each mutation moves it to its own value');
});

// Every verdict-deciding rule lives in MEASURE_BANDS as data — including a row's secondary OK
// condition (`ok_also`) and its `scope` — precisely so a change to either is a measure_hash move
// like any other threshold edit, not a silent code change nothing can see.
test('MEASURE_BANDS: mutating ok_also or scope moves the digest, on their own', () => {
  const config = loadConfig(FIXTURE);
  const files = { [MEASURE_FILES[0]]: 'step 1: run the scripts' };
  const base = measureDigest(config, MEASURE_BANDS, files);

  const mutatedOkAlso = MEASURE_BANDS.map((r) =>
    r.id === 'dead_link_ratio' ? { ...r, ok_also: [{ ...r.ok_also[0], value: 1 }] } : r
  );
  assert.notEqual(measureDigest(config, mutatedOkAlso, files), base, 'flipping the ok_also condition value moves the digest');

  const mutatedScope = MEASURE_BANDS.map((r) => (r.id === 'pollution' ? { ...r, scope: 'any' } : r));
  assert.notEqual(measureDigest(config, mutatedScope, files), base, "flipping one row's scope moves the digest");

  assert.notEqual(
    measureDigest(config, mutatedOkAlso, files),
    measureDigest(config, mutatedScope, files),
    'each mutation moves it to its own value'
  );
});

test('measure_hash / judge_hash: sensitivity — measure.md moves only measure_hash; rubric.md, judge.md and placement.md each move only judge_hash (rubric.md folded in at v2.0.0 E4b)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-fingerprint-sensitivity-'));
  try {
    fs.mkdirSync(path.join(tmp, 'reference'), { recursive: true });
    const write = (rel, body) => fs.writeFileSync(path.join(tmp, rel), body);
    write('reference/measure.md', 'step 1: run the scripts');
    write('reference/judge.md', 'step 2: rate against the rubric');
    write('reference/placement.md', 'rule 4: grounds live with the conclusion');
    write('reference/rubric.md', '★4 anchor A');

    const config = loadConfig(FIXTURE);
    const before = docgradMeta(tmp, config);

    write('reference/measure.md', 'step 1: run the scripts (edited)');
    const afterMeasure = docgradMeta(tmp, config);
    assert.notEqual(afterMeasure.measure_hash, before.measure_hash, 'editing measure.md moves measure_hash');
    assert.equal(afterMeasure.judge_hash, before.judge_hash, '...and leaves judge_hash alone');

    write('reference/judge.md', 'step 2: rate against the rubric (edited)');
    const afterJudge = docgradMeta(tmp, config);
    assert.notEqual(afterJudge.judge_hash, afterMeasure.judge_hash, 'editing judge.md moves judge_hash');
    assert.equal(afterJudge.measure_hash, afterMeasure.measure_hash, '...and leaves measure_hash alone');

    write('reference/placement.md', 'rule 4: grounds may live anywhere');
    const afterPlacement = docgradMeta(tmp, config);
    assert.notEqual(afterPlacement.judge_hash, afterJudge.judge_hash, 'editing placement.md moves judge_hash');
    assert.equal(afterPlacement.measure_hash, afterJudge.measure_hash, '...and leaves measure_hash alone');

    write('reference/rubric.md', '★4 anchor B');
    const afterRubric = docgradMeta(tmp, config);
    assert.notEqual(afterRubric.judge_hash, afterPlacement.judge_hash, 'editing rubric.md moves judge_hash (folded in at v2.0.0 E4b)');
    assert.equal(afterRubric.measure_hash, afterPlacement.measure_hash, '...and leaves measure_hash alone');

    // Each of the three measure_hash config values still moves it too (on top of the band table +
    // measure.md content it now also covers).
    const at = measureHash(config, tmp);
    for (const moved of [
      { ...config, economy: { ...config.economy, entry_cost_tiers: [20000, 10000, 5000, 2500] } },
      { ...config, economy: { ...config.economy, pollution_max: 0.2 } },
      { ...config, freshness: { ...config.freshness, stale_after_days: 365 } },
    ]) {
      assert.notEqual(measureHash(moved, tmp), at);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// Band edges: just below, at, and just above each OK/FAIL line, at the fixture's config (shipped
// defaults: entry_cost_tiers [20000,10000,5000,3000], pollution_max 0.1, stale_after_days 60).
test('evaluateMeasure: band edges — dead_link_ratio (FAIL >2%, OK ==0 and ok_also bad_anchors ==0)', () => {
  const config = loadConfig(FIXTURE);
  const at = (value, bad_anchors = 0) =>
    evaluateMeasure('dead_link_ratio', { value, extra: { bad_anchors } }, config, {}).verdict;
  assert.equal(at(0), 'OK');
  assert.equal(at(0, 1), 'WATCH', 'the ok_also bad_anchors ==0 condition downgrades an otherwise-OK verdict to WATCH');
  assert.equal(at(0.02), 'WATCH', 'at the FAIL boundary itself: not >2%, not ==0');
  assert.equal(at(0.0201), 'FAIL', 'just above the FAIL boundary');
});

// #? — 1 dead link, 2 bad anchors, 100 total links: 1% ratio, not OK (anchors non-zero), not FAIL
// (ratio ≤2%) -> WATCH. The compound OK condition the {op, value} descriptor shape cannot express
// on its own, so it is a row-level `ok_also` condition instead.
test('evaluateMeasure: dead_link_ratio — 1 dead / 2 bad anchors / 100 total is WATCH, not OK or FAIL', () => {
  const config = loadConfig(FIXTURE);
  const r = evaluateMeasure(
    'dead_link_ratio',
    { value: 0.01, numerator: 1, denominator: 100, extra: { bad_anchors: 2 } },
    config,
    {}
  );
  assert.equal(r.verdict, 'WATCH');
  assert.equal(r.bad_anchors, 2);
});

test('evaluateMeasure: dead_link_ratio — total_links: 0 is OK with value 0 and note "no links"', () => {
  const config = loadConfig(FIXTURE);
  const r = evaluateMeasure(
    'dead_link_ratio',
    { value: 0, numerator: 0, denominator: 0, note: 'no links', extra: { bad_anchors: 0 } },
    config,
    {}
  );
  assert.equal(r.verdict, 'OK');
  assert.equal(r.note, 'no links');
});

test('evaluateMeasure: band edges — orphan_ratio (FAIL >20%, OK ≤5%)', () => {
  const config = loadConfig(FIXTURE);
  const at = (value) => evaluateMeasure('orphan_ratio', { value }, config, {}).verdict;
  assert.equal(at(0.05), 'OK');
  assert.equal(at(0.0501), 'WATCH');
  assert.equal(at(0.2), 'WATCH', 'at the FAIL boundary itself');
  assert.equal(at(0.2001), 'FAIL');
});

// 51/1019 = 0.050049… rounds to the same 0.0500 the ≤5% OK line reads at, but the true ratio never
// cleared it. Comparing on `raw` (the unrounded division) rather than the rounded `value` a script
// reports keeps the verdict honest; `value` itself stays the rounded number.
test('evaluateMeasure: orphan_ratio — 51/1019 rounds to the OK boundary but the raw ratio is WATCH', () => {
  const config = loadConfig(FIXTURE);
  const raw = 51 / 1019;
  const rounded = Number(raw.toFixed(4));
  assert.equal(rounded, 0.05, 'the rounded value lands exactly on the OK boundary');
  const r = evaluateMeasure('orphan_ratio', { value: rounded, raw, numerator: 51, denominator: 1019 }, config, {});
  assert.equal(r.verdict, 'WATCH', 'the true ratio is 0.050049…, which is not ≤5%');
  assert.equal(r.value, 0.05, 'the reported value is still the rounded number');
  // Without `raw`, evaluateMeasure falls back to comparing on `value` itself — the bug this guards.
  const withoutRaw = evaluateMeasure('orphan_ratio', { value: rounded, numerator: 51, denominator: 1019 }, config, {});
  assert.equal(withoutRaw.verdict, 'OK', 'documents the fallback: omitting raw compares on the rounded value');
});

test('evaluateMeasure: orphan_ratio — empty corpus (included.length: 0) is null, not a 0/0 FAIL', () => {
  const config = loadConfig(FIXTURE);
  const r = evaluateMeasure('orphan_ratio', { value: null, note: 'empty corpus' }, config, {});
  assert.equal(r.verdict, null);
  assert.equal(r.note, 'empty corpus');
});

test('evaluateMeasure: orphan_ratio — orphans: null (no index_file, unscoped) is null with its own note, distinct from index_present carrying the FAIL', () => {
  const config = loadConfig(FIXTURE);
  const orphan = evaluateMeasure('orphan_ratio', { value: null, note: 'orphans not computed (no index)' }, config, {});
  assert.equal(orphan.verdict, null);
  const indexPresent = evaluateMeasure('index_present', { value: 0 }, config, {});
  assert.equal(indexPresent.verdict, 'FAIL');
});

test('evaluateMeasure: band edges — reachable_ratio (OK ≥95%, no FAIL line: no calibrated source)', () => {
  const config = loadConfig(FIXTURE);
  const at = (value) => evaluateMeasure('reachable_ratio', { value }, config, {}).verdict;
  assert.equal(at(0.95), 'OK');
  assert.equal(at(0.9499), 'WATCH');
  assert.equal(at(0), 'WATCH', 'never FAIL: no calibrated source');
});

test('evaluateMeasure: band edges — index_present (binary: FAIL when absent, OK when present)', () => {
  const config = loadConfig(FIXTURE);
  assert.equal(evaluateMeasure('index_present', { value: 1 }, config, {}).verdict, 'OK');
  assert.equal(evaluateMeasure('index_present', { value: 0 }, config, {}).verdict, 'FAIL');
});

test('evaluateMeasure: scoped links run — orphan_ratio, reachable_ratio, index_present all null with the scope note', () => {
  const config = loadConfig(FIXTURE);
  for (const id of ['orphan_ratio', 'reachable_ratio', 'index_present']) {
    const r = evaluateMeasure(id, { value: 0.5, note: 'scope-limited' }, config, { scoped: true });
    assert.equal(r.verdict, null, `${id} must be null when scoped`);
    assert.equal(r.note, 'scope-limited');
  }
  // dead_link_ratio is still evaluated under scope — its row's scope is "any", not "full".
  assert.equal(
    evaluateMeasure('dead_link_ratio', { value: 0, extra: { bad_anchors: 0 } }, config, { scoped: true }).verdict,
    'OK'
  );
});

test('evaluateMeasure: band edges — date_coverage (FAIL <60%, OK ≥90%)', () => {
  const config = loadConfig(FIXTURE);
  const at = (value) => evaluateMeasure('date_coverage', { value }, config, {}).verdict;
  assert.equal(at(0.9), 'OK');
  assert.equal(at(0.8999), 'WATCH');
  assert.equal(at(0.6), 'WATCH', 'at the FAIL boundary itself');
  assert.equal(at(0.5999), 'FAIL');
});

test('evaluateMeasure: date_coverage — files_total: 0 is null with note "empty corpus", not a 0/0 FAIL', () => {
  const config = loadConfig(FIXTURE);
  const r = evaluateMeasure('date_coverage', { value: null, note: 'empty corpus' }, config, {});
  assert.equal(r.verdict, null);
  assert.equal(r.note, 'empty corpus');
});

test('evaluateMeasure: band edges — key_doc_age (FAIL >max(180, stale_after_days), OK ≤stale_after_days)', () => {
  const config = loadConfig(FIXTURE); // stale_after_days: 60 (shipped default)
  const at = (value) => evaluateMeasure('key_doc_age', { value }, config, {}).verdict;
  assert.equal(at(60), 'OK');
  assert.equal(at(61), 'WATCH');
  assert.equal(at(180), 'WATCH', 'at the FAIL boundary itself (max(180, 60) = 180)');
  assert.equal(at(181), 'FAIL');
});

test('evaluateMeasure: key_doc_age — stale_after_days: 365 makes a 200-day key doc OK (the FAIL line becomes stale_after_days itself)', () => {
  const config = { ...loadConfig(FIXTURE), freshness: { ...loadConfig(FIXTURE).freshness, stale_after_days: 365 } };
  const r = evaluateMeasure('key_doc_age', { value: 200 }, config, {});
  assert.equal(r.verdict, 'OK');
  assert.match(r.line, /365/, 'the line shows the effective (resolved) number');
  assert.equal(evaluateMeasure('key_doc_age', { value: 365 }, config, {}).verdict, 'OK', 'no WATCH band once stale_after_days ≥ 180');
  assert.equal(evaluateMeasure('key_doc_age', { value: 366 }, config, {}).verdict, 'FAIL');
});

test('evaluateMeasure: key_doc_age — scoped freshness run is null with its own note (a full-corpus concept)', () => {
  const config = loadConfig(FIXTURE);
  const r = evaluateMeasure('key_doc_age', { value: 999, note: 'key documents are a full-corpus concept' }, config, { scoped: true });
  assert.equal(r.verdict, null);
  assert.equal(r.note, 'key documents are a full-corpus concept');
});

test('evaluateMeasure: key_doc_age — no dated key document survives the key-document filter is null', () => {
  const config = loadConfig(FIXTURE);
  const r = evaluateMeasure('key_doc_age', { value: null, note: 'no dated key document' }, config, {});
  assert.equal(r.verdict, null);
  assert.equal(r.note, 'no dated key document');
});

test('evaluateMeasure: band edges — date_drift (OK <30 days, no FAIL line: no calibrated source)', () => {
  const config = loadConfig(FIXTURE);
  const at = (value) => evaluateMeasure('date_drift', { value }, config, {}).verdict;
  assert.equal(at(0), 'OK');
  assert.equal(at(29), 'OK');
  assert.equal(at(30), 'WATCH');
  assert.equal(at(10000), 'WATCH', 'never FAIL: only the drift-days half of the retired ★4 clause is measured, no calibrated source for the rest');
});

test('evaluateMeasure: band edges — entry_cost (FAIL >tiers[1], OK ≤tiers[2])', () => {
  const config = loadConfig(FIXTURE); // tiers: [20000, 10000, 5000, 3000]
  const at = (value) => evaluateMeasure('entry_cost', { value }, config, {}).verdict;
  assert.equal(at(5000), 'OK');
  assert.equal(at(5001), 'WATCH');
  assert.equal(at(10000), 'WATCH', 'at the FAIL boundary itself');
  assert.equal(at(10001), 'FAIL');
});

test('evaluateMeasure: entry_cost / pollution — scoped inventory run is null with note "full-corpus concept"', () => {
  const config = loadConfig(FIXTURE);
  for (const id of ['entry_cost', 'pollution']) {
    const r = evaluateMeasure(id, { value: 1 }, config, { scoped: true });
    assert.equal(r.verdict, null);
    assert.equal(r.note, 'full-corpus concept');
  }
});

test('evaluateMeasure: band edges — pollution (OK <pollution_max, no FAIL line: no calibrated source)', () => {
  const config = loadConfig(FIXTURE); // pollution_max: 0.1
  const at = (value) => evaluateMeasure('pollution', { value }, config, {}).verdict;
  assert.equal(at(0.0999), 'OK');
  assert.equal(at(0.1), 'WATCH');
  assert.equal(at(0.9), 'WATCH', 'never FAIL: no calibrated source');
});

test('evaluateMeasure: band edges — undocumented_dirs / drifted_dirs (OK ==0, no FAIL line: no calibrated source)', () => {
  const config = loadConfig(FIXTURE);
  for (const id of ['undocumented_dirs', 'drifted_dirs']) {
    assert.equal(evaluateMeasure(id, { value: 0 }, config, {}).verdict, 'OK');
    assert.equal(evaluateMeasure(id, { value: 1 }, config, {}).verdict, 'WATCH');
  }
});

test('evaluateMeasure: coverage.mjs with src_dirs unset — both rows null with note "src_dirs is unset"', () => {
  const config = loadConfig(FIXTURE);
  for (const id of ['undocumented_dirs', 'drifted_dirs']) {
    const r = evaluateMeasure(id, { value: null, note: 'src_dirs is unset' }, config, {});
    assert.equal(r.verdict, null);
    assert.equal(r.note, 'src_dirs is unset');
  }
});

test('evaluateMeasure: config-resolved bounds — a custom entry_cost_tiers/pollution_max/stale_after_days shifts the line and the verdict', () => {
  const config = {
    ...loadConfig(FIXTURE),
    economy: { entry_cost_tiers: [8000, 4000, 2000, 1000], pollution_max: 0.5 },
    freshness: { ...loadConfig(FIXTURE).freshness, stale_after_days: 90 },
  };
  const cost = evaluateMeasure('entry_cost', { value: 2000 }, config, {});
  assert.equal(cost.verdict, 'OK');
  assert.match(cost.line, /2,000/);
  const pollution = evaluateMeasure('pollution', { value: 0.3 }, config, {});
  assert.equal(pollution.verdict, 'OK');
  assert.match(pollution.line, /50%/);
  const age = evaluateMeasure('key_doc_age', { value: 90 }, config, {});
  assert.equal(age.verdict, 'OK');
  assert.match(age.line, /90 days/);
});

test('evaluateMeasure: unknown id throws', () => {
  assert.throws(() => evaluateMeasure('not_a_real_id', { value: 1 }, loadConfig(FIXTURE), {}));
});

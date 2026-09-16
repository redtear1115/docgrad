import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const FIXTURE = fileURLToPath(new URL('./fixtures/basic/', import.meta.url));
const RETRIEVAL_FIXTURE = fileURLToPath(new URL('./fixtures/retrieval/', import.meta.url));
const DOCS_FILES_FIXTURE = fileURLToPath(new URL('./fixtures/docs-files/', import.meta.url));
const SCRIPT = fileURLToPath(new URL('../skills/docgrad/scripts/inventory.mjs', import.meta.url));

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

// A working checkout with one tracked and one untracked doc, plus an excluded directory holding
// an untracked draft — the shape that produced the 0.0517 / 0.1066 split on a real repo.
function mixedCheckout() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-untracked-inv-'));
  fs.mkdirSync(path.join(tmp, 'docs', 'plans'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'docs', 'a.md'), `# a\n${'x '.repeat(200)}`);
  fs.writeFileSync(path.join(tmp, 'docs', 'plans', 'kept.md'), `# kept\n${'y '.repeat(100)}`);
  fs.writeFileSync(path.join(tmp, '.docgrad.yml'), 'docs_dirs: [docs/]\nexclude: [docs/plans/]\n');
  gitInit(tmp);
  fs.writeFileSync(path.join(tmp, 'docs', 'plans', 'local-wip.md'), `# local draft\n${'z '.repeat(4000)}`);
  return tmp;
}

test('inventory: untracked reports count/tokens/paths, and pollution says the ratio is checkout-bound', () => {
  const tmp = mixedCheckout();
  try {
    const out = JSON.parse(execFileSync(process.execPath, [SCRIPT, '--root', tmp], { encoding: 'utf8' }));
    assert.equal(out.untracked.count, 1);
    assert.deepEqual(out.untracked.files, ['docs/plans/local-wip.md']);
    assert.ok(out.untracked.tokens_est > 0);
    assert.equal(
      out.untracked.tokens_est,
      out.pollution.excluded_files.find((f) => f.path === 'docs/plans/local-wip.md').tokens_est
    );
    assert.match(out.pollution.note, /untracked local file/);
    assert.match(out.pollution.note, /clean checkout/);
    assert.match(out.pollution.note, /exclude_untracked: true/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('inventory: exclude_untracked true shrinks the corpus to the clean checkout and drops the note', () => {
  const tmp = mixedCheckout();
  try {
    const before = JSON.parse(execFileSync(process.execPath, [SCRIPT, '--root', tmp], { encoding: 'utf8' }));
    fs.appendFileSync(path.join(tmp, '.docgrad.yml'), 'exclude_untracked: true\n');
    const after = JSON.parse(execFileSync(process.execPath, [SCRIPT, '--root', tmp], { encoding: 'utf8' }));
    assert.ok(
      after.pollution.excluded_tokens < before.pollution.excluded_tokens,
      'the untracked draft no longer inflates the pollution surface'
    );
    assert.deepEqual(after.pollution.excluded_files.map((f) => f.path), ['docs/plans/kept.md']);
    assert.ok(after.pollution.ratio < before.pollution.ratio);
    assert.equal(after.untracked.count, 0);
    assert.equal(after.pollution.note, undefined, 'nothing untracked left to warn about');
    // exclude_untracked selects a different corpus out of the same tree, so #36's break detector
    // must fire: the scores either side of this change are not comparable.
    assert.notEqual(after.docgrad.corpus_hash, before.docgrad.corpus_hash);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('inventory: no git -> untracked is null (not zero) with a note, and the ratio is unchanged', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-nogit-inv-'));
  try {
    fs.mkdirSync(path.join(tmp, 'docs'));
    fs.writeFileSync(path.join(tmp, 'docs', 'a.md'), '# a\n');
    fs.writeFileSync(path.join(tmp, '.docgrad.yml'), 'docs_dirs: [docs/]\n');
    const out = JSON.parse(execFileSync(process.execPath, [SCRIPT, '--root', tmp], { encoding: 'utf8' }));
    assert.deepEqual(
      { count: out.untracked.count, tokens_est: out.untracked.tokens_est, files: out.untracked.files },
      { count: null, tokens_est: null, files: null }
    );
    assert.match(out.untracked.note, /git is unavailable|not a git working tree/);
    assert.equal(out.pollution.note, undefined, 'no claim is made either way about the ratio');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('inventory: a long untracked list is capped, and the note says so (count/tokens stay exact)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-untracked-cap-'));
  try {
    fs.mkdirSync(path.join(tmp, 'docs'));
    fs.writeFileSync(path.join(tmp, 'docs', 'a.md'), '# a\n');
    fs.writeFileSync(path.join(tmp, '.docgrad.yml'), 'docs_dirs: [docs/]\n');
    gitInit(tmp);
    for (let i = 0; i < 25; i += 1) fs.writeFileSync(path.join(tmp, 'docs', `d${i}.md`), `# d${i}\n`);
    const out = JSON.parse(execFileSync(process.execPath, [SCRIPT, '--root', tmp], { encoding: 'utf8' }));
    assert.equal(out.untracked.count, 25);
    assert.equal(out.untracked.files.length, 20);
    assert.match(out.untracked.note, /capped: only the first 20 of 25/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('inventory: docgrad carries corpus_hash alongside rubric_hash', () => {
  const out = JSON.parse(execFileSync(process.execPath, [SCRIPT, '--root', FIXTURE], { encoding: 'utf8' }));
  assert.match(out.docgrad.corpus_hash, /^[0-9a-f]{8}$/);
  assert.match(out.docgrad.rubric_hash, /^[0-9a-f]{8}$/);
  // #36: a corpus that genuinely differs must produce a different fingerprint, even though the
  // rubric — and therefore rubric_hash — is identical.
  const other = JSON.parse(
    execFileSync(process.execPath, [SCRIPT, '--root', DOCS_FILES_FIXTURE], { encoding: 'utf8' })
  );
  assert.equal(other.docgrad.rubric_hash, out.docgrad.rubric_hash);
  assert.notEqual(other.docgrad.corpus_hash, out.docgrad.corpus_hash);
});

test('inventory: entry_cost dedupes symlink aliases (the same real file only counted once)', () => {
  // kdan-bpm's CLAUDE.md -> AGENTS.md: an agent only loads one copy, summing by name would double the fixed cost.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-symlink-'));
  try {
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(root, '.docgrad.yml'),
      'docs_dirs: [docs/]\nentry_files: [AGENTS.md, CLAUDE.md]\nindex_file: docs/README.md\n');
    fs.writeFileSync(path.join(root, 'docs', 'README.md'), '# idx\n');
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# entry\n' + 'x '.repeat(200));
    fs.symlinkSync('AGENTS.md', path.join(root, 'CLAUDE.md'));
    const out = JSON.parse(execFileSync(process.execPath, [SCRIPT, '--root', root], { encoding: 'utf8' }));
    const solo = out.files.find((f) => f.path === 'AGENTS.md').tokens_est;
    assert.deepEqual(out.entry_cost.files, ['AGENTS.md', 'CLAUDE.md'], 'both names must be listed');
    assert.equal(out.entry_cost.tokens_est, solo, 'counted once, not doubled');
    assert.deepEqual(out.entry_cost.symlink_aliases, [{ path: 'CLAUDE.md', same_file_as: 'AGENTS.md' }]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('inventory: listing/type/entry_cost/pollution', () => {
  const out = JSON.parse(execFileSync(process.execPath, [SCRIPT, '--root', FIXTURE], { encoding: 'utf8' }));
  assert.equal(out.totals.files, 4);
  assert.equal(out.files.find((f) => f.path === 'CLAUDE.md').type, 'entry');
  assert.equal(out.files.find((f) => f.path === 'docs/README.md').type, 'index');
  assert.equal(out.files.find((f) => f.path === 'docs/guide.md').type, 'doc');
  assert.ok(out.files.every((f) => f.bytes > 0 && f.tokens_est > 0));
  assert.deepEqual(out.entry_cost.files, ['CLAUDE.md']);
  assert.ok(out.entry_cost.tokens_est > 0);
  assert.deepEqual(out.pollution.excluded_files.map((f) => f.path), ['docs/archive/old.md']);
  assert.ok(out.pollution.ratio > 0 && out.pollution.ratio < 1);
});

test('inventory: docs_files are regular documents (type doc), do not inflate the fixed cost', () => {
  // This is the whole reason docs_files exists: listing it as entry_files would also pick up the
  // file, but it would get counted as a tax paid on every single task.
  const out = JSON.parse(
    execFileSync(process.execPath, [SCRIPT, '--root', DOCS_FILES_FIXTURE], { encoding: 'utf8' })
  );
  assert.equal(out.totals.files, 5);
  assert.equal(out.files.find((f) => f.path === 'PRODUCT.md').type, 'doc');
  assert.equal(out.files.find((f) => f.path === 'DESIGN.md').type, 'doc');
  assert.deepEqual(out.entry_cost.files, ['CLAUDE.md']);
  assert.equal(
    out.entry_cost.tokens_est,
    out.files.find((f) => f.path === 'CLAUDE.md').tokens_est,
    'entry_cost may only reflect entry_files; docs_files must not be counted in'
  );
});

test('inventory: --include limits scope (scope is labeled, fixed cost is 0 when entry is outside it)', () => {
  const out = JSON.parse(
    execFileSync(process.execPath, [SCRIPT, '--root', FIXTURE, '--include', 'docs/guide.md'], { encoding: 'utf8' })
  );
  assert.deepEqual(out.scope, ['docs/guide.md']);
  assert.deepEqual(out.files.map((f) => f.path), ['docs/guide.md']);
  assert.equal(out.totals.files, 1);
  assert.deepEqual(out.entry_cost.files, []); // CLAUDE.md is outside scope -> fixed cost cannot be cited
  assert.equal(out.entry_cost.tokens_est, 0);
  assert.deepEqual(out.pollution.excluded_files, []); // pollution surface narrows along with scope
});

test('inventory: scope is null for a full run (unchanged existing behavior)', () => {
  const out = JSON.parse(execFileSync(process.execPath, [SCRIPT, '--root', FIXTURE], { encoding: 'utf8' }));
  assert.equal(out.scope, null);
  assert.equal(out.totals.files, 4);
});

// --- #44: out_of_scope leaves the corpus without being charged to the pollution surface ---------

// The measured tj/commander.js shape: a translated mirror large enough to dominate the ratio (it
// produced 40.6% pollution and capped economy at ★3 (1.x)), plus a small genuinely-embarrassing draft.
function mirrorRepo(configTail) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-oos-inv-'));
  fs.mkdirSync(path.join(tmp, 'docs', 'zh-CN'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'docs', 'wip'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'docs', 'a.md'), `# a\n${'x '.repeat(200)}`);
  fs.writeFileSync(path.join(tmp, 'docs', 'zh-CN', 'a.md'), `# 甲\n${'中文鏡像 '.repeat(400)}`);
  fs.writeFileSync(path.join(tmp, 'docs', 'wip', 'draft.md'), `# draft\n${'z '.repeat(50)}`);
  fs.writeFileSync(path.join(tmp, '.docgrad.yml'), `docs_dirs: [docs/]\n${configTail}`);
  return tmp;
}

const runInventory = (root, ...args) =>
  JSON.parse(execFileSync(process.execPath, [SCRIPT, '--root', root, ...args], { encoding: 'utf8' }));

test('inventory: the same mirror moves pollution.ratio under exclude and does not under out_of_scope (#44)', () => {
  const excluded = mirrorRepo('exclude: [docs/zh-CN/]\n');
  const scopedOut = mirrorRepo('out_of_scope: [docs/zh-CN/]\n');
  try {
    const a = runInventory(excluded);
    const b = runInventory(scopedOut);
    // Same corpus on both sides: the mirror is out of the grading population either way.
    assert.deepEqual(a.files.map((f) => f.path), ['docs/a.md', 'docs/wip/draft.md']);
    assert.deepEqual(b.files.map((f) => f.path), ['docs/a.md', 'docs/wip/draft.md']);
    assert.equal(a.totals.tokens_est, b.totals.tokens_est);
    // Only the charge differs, and it is the difference between an OK and a WATCH pollution verdict.
    assert.ok(a.pollution.ratio > 0.5, `exclude charges the mirror: ${a.pollution.ratio}`);
    assert.equal(b.pollution.ratio, 0, 'out_of_scope charges nothing');
    assert.deepEqual(b.pollution.excluded_files, []);
    assert.equal(b.pollution.excluded_tokens, 0);
    // ...and the size of what was moved is on the same page, exactly.
    assert.equal(b.out_of_scope.count, 1);
    assert.deepEqual(b.out_of_scope.files, ['docs/zh-CN/a.md']);
    assert.equal(b.out_of_scope.tokens_est, a.pollution.excluded_tokens, 'same tokens, different charge');
    // Moving a directory between the two fields changes every denominator -> #36's break detector.
    assert.notEqual(b.docgrad.corpus_hash, a.docgrad.corpus_hash);
  } finally {
    fs.rmSync(excluded, { recursive: true, force: true });
    fs.rmSync(scopedOut, { recursive: true, force: true });
  }
});

test('inventory: the out_of_scope block is emitted even when the field is empty (#44)', () => {
  // The anti-abuse property: if the block could be absent, out_of_scope would be a silent switch
  // for zeroing your own pollution surface. It is always there, empty or not.
  const out = runInventory(FIXTURE);
  assert.deepEqual(out.out_of_scope, { count: 0, tokens_est: 0, files: [] });
  assert.equal(out.pollution.ratio > 0, true, 'the existing pollution surface is untouched');
  assert.deepEqual(out.pollution.excluded_files.map((f) => f.path), ['docs/archive/old.md']);
});

test('inventory: a path in both fields is charged to pollution, and the note says exclude won (#44)', () => {
  const tmp = mirrorRepo('exclude: [docs/zh-CN/]\nout_of_scope: [docs/zh-CN/, docs/wip/]\n');
  try {
    const out = runInventory(tmp);
    assert.deepEqual(out.pollution.excluded_files.map((f) => f.path), ['docs/zh-CN/a.md']);
    assert.deepEqual(out.out_of_scope.files, ['docs/wip/draft.md']);
    assert.match(out.out_of_scope.note, /both exclude and out_of_scope/);
    assert.match(out.out_of_scope.note, /exclude wins/);
    assert.match(out.out_of_scope.note, /docs\/zh-CN\/a\.md/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('inventory: a long out_of_scope list is capped, and the note says so (count/tokens stay exact) (#44)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-oos-cap-'));
  try {
    fs.mkdirSync(path.join(tmp, 'docs', 'zh-CN'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'docs', 'a.md'), '# a\n');
    for (let i = 0; i < 25; i++) fs.writeFileSync(path.join(tmp, 'docs', 'zh-CN', `f${i}.md`), `# ${i}\nxxxx\n`);
    fs.writeFileSync(path.join(tmp, '.docgrad.yml'), 'docs_dirs: [docs/]\nout_of_scope: [docs/zh-CN/]\n');
    const out = runInventory(tmp);
    assert.equal(out.out_of_scope.count, 25);
    assert.equal(out.out_of_scope.files.length, 20);
    assert.ok(out.out_of_scope.tokens_est > 0);
    assert.match(out.out_of_scope.note, /capped: only the first 20 of 25/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('inventory: out_of_scope narrows under --include, like the pollution surface does (#44)', () => {
  const tmp = mirrorRepo('out_of_scope: [docs/zh-CN/]\n');
  try {
    const out = runInventory(tmp, '--include', 'docs/a.md');
    assert.deepEqual(out.out_of_scope, { count: 0, tokens_est: 0, files: [] });
    assert.deepEqual(out.pollution.excluded_files, []);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('inventory: an untracked file inside out_of_scope is not listed as untracked (#44)', () => {
  // untracked exists to explain how two checkouts of one commit can measure differently. out_of_scope
  // feeds no measure input, so a file in there cannot cause that divergence and does not belong in
  // the block. An untracked file in the still-charged exclude bucket does, and still is.
  const tmp = mirrorRepo('exclude: [docs/wip/]\nout_of_scope: [docs/zh-CN/]\n');
  try {
    gitInit(tmp);
    fs.writeFileSync(path.join(tmp, 'docs', 'zh-CN', 'local.md'), '# untracked mirror page\n');
    fs.writeFileSync(path.join(tmp, 'docs', 'wip', 'local.md'), '# untracked draft\n');
    const out = runInventory(tmp);
    assert.deepEqual(out.untracked.files, ['docs/wip/local.md']);
    assert.equal(out.untracked.count, 1);
    assert.equal(out.out_of_scope.count, 2, 'the untracked mirror page is still counted, and reported, here');

    // exclude_untracked runs above the split, so out_of_scope's tally is on the same clean-checkout basis.
    fs.appendFileSync(path.join(tmp, '.docgrad.yml'), 'exclude_untracked: true\n');
    const clean = runInventory(tmp);
    assert.equal(clean.out_of_scope.count, 1);
    assert.equal(clean.untracked.count, 0);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('inventory: no .docgrad.yml -> exit 1 + stderr points at init', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-'));
  const r = spawnSync(process.execPath, [SCRIPT, '--root', tmp], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Run \/docgrad init first/);
});

test('inventory: a file with no H2 still gets a structure, just empty', () => {
  const out = JSON.parse(execFileSync(process.execPath, [SCRIPT, '--root', FIXTURE], { encoding: 'utf8' }));
  const claude = out.files.find((f) => f.path === 'CLAUDE.md');
  assert.deepEqual(claude.structure.h2, []);
  assert.deepEqual(claude.structure.rules, { count: 0, median_chars: 0, p90_chars: 0, anchored_ratio: 0 });
  assert.equal(out.totals.rules_total, 0);
  assert.equal(out.totals.rules_anchored_ratio, 0);
});

test('inventory: structure.h2 per-section tokens, rules median/anchored_ratio (retrieval fixture)', () => {
  const out = JSON.parse(
    execFileSync(process.execPath, [SCRIPT, '--root', RETRIEVAL_FIXTURE], { encoding: 'utf8' })
  );
  const guide = out.files.find((f) => f.path === 'docs/guide.md');
  assert.deepEqual(
    guide.structure.h2.map((s) => s.title),
    ['Overview', 'Rules']
  );
  assert.ok(guide.structure.h2.every((s) => s.tokens_est > 0));
  // guide.md has two **MUST** rule lines: one has a `src/foo/bar.ts` anchor, one doesn't -> anchored_ratio 0.5
  assert.equal(guide.structure.rules.count, 2);
  assert.equal(guide.structure.rules.anchored_ratio, 0.5);
  assert.ok(guide.structure.rules.median_chars > 0);
  assert.ok(guide.structure.rules.p90_chars >= guide.structure.rules.median_chars);

  const readme = out.files.find((f) => f.path === 'docs/README.md');
  assert.deepEqual(readme.structure.rules, { count: 0, median_chars: 0, p90_chars: 0, anchored_ratio: 0 });

  assert.equal(out.totals.rules_total, 2);
  assert.equal(out.totals.rules_anchored_ratio, 0.5);
});

test('inventory: rules.pattern can be customized via .docgrad.yml', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-rules-'));
  try {
    fs.mkdirSync(path.join(tmp, 'docs'));
    fs.writeFileSync(
      path.join(tmp, 'docs', 'a.md'),
      '# A\n\n- **MUST**: 用預設字串不該被抓到（自訂 pattern 換了）。\n- TODO: 這條才算規則。\n'
    );
    fs.writeFileSync(
      path.join(tmp, '.docgrad.yml'),
      'docs_dirs: [docs/]\nentry_files: []\nfreshness:\n  convention: none\nrules:\n  pattern: "TODO"\n'
    );
    const out = JSON.parse(execFileSync(process.execPath, [SCRIPT, '--root', tmp], { encoding: 'utf8' }));
    assert.equal(out.files[0].structure.rules.count, 1);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// #41: the ledger keys a claim on `<path>:<line>`, and docgrad's own convergence loop moves
// content between documents. claim_hash is the content-derived key handed to the agent writing
// the ledger, so a move no longer silently repoints a batch of rows at unrelated content.
test('inventory: claim_candidates carry a content-derived claim_hash; path/line stay as locating aids', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-claimhash-'));
  try {
    fs.mkdirSync(path.join(tmp, 'docs'));
    fs.mkdirSync(path.join(tmp, 'src'));
    fs.writeFileSync(path.join(tmp, 'src', 'balance.ts'), 'export function settle() {}\n');
    const claim = 'Settlement is handled by `src/balance.ts`.';
    // the same sentence, in another file at another line — the "moved" case
    fs.writeFileSync(path.join(tmp, 'docs', 'a.md'), `# A\n\n${claim}\n`);
    fs.writeFileSync(path.join(tmp, 'docs', 'b.md'), `# B\n\nfiller\n\nfiller\n\n${claim}\n`);
    // one token different — the "edited" case, which must NOT key the same
    fs.writeFileSync(path.join(tmp, 'docs', 'c.md'), '# C\n\nSettlement is handled by `src/ledger.ts`.\n');
    fs.writeFileSync(path.join(tmp, '.docgrad.yml'), 'docs_dirs: [docs/]\nsrc_dirs: [src/]\n');
    const out = JSON.parse(execFileSync(process.execPath, [SCRIPT, '--root', tmp], { encoding: 'utf8' }));
    const byPath = Object.fromEntries(out.claim_candidates.map((c) => [c.path, c]));
    assert.equal(byPath['docs/a.md'].line, 3);
    assert.equal(byPath['docs/b.md'].line, 7);
    assert.match(byPath['docs/a.md'].claim_hash, /^[0-9a-f]{12}$/);
    assert.equal(
      byPath['docs/a.md'].claim_hash,
      byPath['docs/b.md'].claim_hash,
      'moved-but-identical must key the same — that is the whole point'
    );
    assert.notEqual(
      byPath['docs/c.md'].claim_hash,
      byPath['docs/a.md'].claim_hash,
      'an edited claim genuinely needs re-verification, so it must key differently'
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// --- #40: a library repo has a claim population, and the report says where it came from --------

// A library repo the way tj/commander.js is written: documentation describes an API, and not one
// inline code span is path-shaped. Baseline claims_total on that repo was 0.
function libraryRepo({ withSrcDirs = true, git = false } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-library-'));
  fs.mkdirSync(path.join(tmp, 'docs'));
  fs.mkdirSync(path.join(tmp, 'src'));
  fs.writeFileSync(
    path.join(tmp, 'src', 'command.js'),
    'class Command {\n  option() {}\n  opts() {}\n}\nconst program = new Command();\n'
  );
  fs.writeFileSync(
    path.join(tmp, 'docs', 'options.md'),
    [
      '# Options',
      '',
      'Declare an option with `.option()`.',
      'Read the parsed values with `program.opts()`.',
      'The `.mangle()` helper does not exist in this library.',
      'A `sandwich` is not an API.',
    ].join('\n')
  );
  fs.writeFileSync(
    path.join(tmp, '.docgrad.yml'),
    `docs_dirs: [docs/]\n${withSrcDirs ? 'src_dirs: [src/]\n' : ''}`
  );
  if (git) gitInit(tmp);
  return tmp;
}

test('inventory: a library repo gets a claim population from API-shaped inline code, guarded by src_dirs (#40)', () => {
  const tmp = libraryRepo();
  try {
    const out = JSON.parse(execFileSync(process.execPath, [SCRIPT, '--root', tmp], { encoding: 'utf8' }));
    assert.equal(out.totals.claims_total, 2, 'only the two lines whose symbols exist under src_dirs');
    assert.equal(out.totals.claims_api_only, 2, 'nothing path-shaped in this corpus at all');
    assert.deepEqual(out.claim_candidates.map((c) => c.line), [3, 4]);
    assert.ok(out.claim_candidates.every((c) => c.refs_path === 0 && c.refs_api === 1));
    assert.equal(out.claim_population.api_matching, 'enabled');
    assert.ok(out.claim_population.src_symbols > 0);
    assert.equal(out.claim_population.src_files_scanned, 1);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('inventory: src_dirs unset makes the API matcher inert, and says so out loud (#40)', () => {
  const tmp = libraryRepo({ withSrcDirs: false });
  try {
    const out = JSON.parse(execFileSync(process.execPath, [SCRIPT, '--root', tmp], { encoding: 'utf8' }));
    assert.equal(out.totals.claims_total, 0, 'no src_dirs, no existence check, no new candidates');
    assert.equal(out.totals.claims_api_only, 0);
    assert.equal(out.claim_population.api_matching, 'disabled');
    assert.equal(out.claim_population.src_symbols, null);
    assert.ok(
      out.claim_population.notes.some((n) => n.includes('src_dirs is unset')),
      'the degradation must be visible, not silent'
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('inventory: candidates disclose whether docgrad itself wrote the document they came from (#40)', () => {
  const tmp = libraryRepo({ git: true });
  try {
    // a second document, added by a commit carrying docgrad's own subject prefix
    fs.writeFileSync(path.join(tmp, 'docs', 'internals.md'), '# Internals\n\nUse `program.opts()` internally.\n');
    const env = {
      ...process.env,
      GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null',
      GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com',
      GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com',
    };
    execFileSync('git', ['add', '-A'], { cwd: tmp, env });
    execFileSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'docs(docgrad): round 3 — correctness'], { cwd: tmp, env });

    const out = JSON.parse(execFileSync(process.execPath, [SCRIPT, '--root', tmp], { encoding: 'utf8' }));
    const byPath = Object.fromEntries(out.claim_candidates.map((c) => [c.path, c]));
    assert.equal(byPath['docs/internals.md'].docgrad_authored, true);
    assert.equal(byPath['docs/options.md'].docgrad_authored, false);
    assert.equal(out.claim_population.authorship, 'git');
    assert.equal(out.totals.claims_total, 3);
    assert.equal(out.totals.claims_docgrad_authored, 1);
    assert.equal(out.totals.claims_docgrad_authored_ratio, 0.3333);
    assert.ok(
      out.claim_population.notes.some((n) => n.includes("docgrad itself wrote")),
      'the share must be stated, not left for the reader to compute'
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('inventory: without git, docgrad_authored is null rather than false, with a note (#40)', () => {
  const tmp = libraryRepo();
  try {
    const out = JSON.parse(execFileSync(process.execPath, [SCRIPT, '--root', tmp], { encoding: 'utf8' }));
    assert.equal(out.claim_population.authorship, 'unavailable');
    assert.ok(out.claim_candidates.every((c) => c.docgrad_authored === null));
    assert.ok(out.files.every((f) => f.docgrad_authored === null));
    assert.equal(out.totals.claims_docgrad_authored, null, '"we cannot tell" is not "zero"');
    assert.equal(out.totals.claims_docgrad_authored_ratio, null);
    assert.ok(out.claim_population.notes.some((n) => n.includes('docgrad_authored is null rather than false')));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// --- the claim-candidate window (claim_candidates_cap) -----------------------------------------
//
// The cap has always existed — 60, hardcoded — and nothing in the output said so. A ledger that
// reached the 60th candidate stopped growing while claims_total stayed in the hundreds, and the
// documentation told the reader that could not happen. These tests pin the two halves of the fix:
// the window is configurable, and the run says which side of it you are on.

// `n` claim lines, each a basename-shaped ref, so no src_dirs and no symbol index are needed.
// Every line carries exactly one ref, so the ranking's tiebreak (path, then line) makes the
// emitted order equal to the file order — which is what lets a test assert the prefix property.
function claimRepo(n) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-claimcap-'));
  fs.mkdirSync(path.join(tmp, 'docs'), { recursive: true });
  const lines = Array.from({ length: n }, (_, i) => `Rule ${i} is implemented in \`thing${i}.ts\`.`);
  fs.writeFileSync(path.join(tmp, 'docs', 'rules.md'), `# Rules\n\n${lines.join('\n\n')}\n`);
  fs.writeFileSync(path.join(tmp, '.docgrad.yml'), 'docs_dirs: [docs/]\n');
  return tmp;
}

test('inventory: the default emits at most 60 candidates and says so instead of looking complete', () => {
  const tmp = claimRepo(80);
  try {
    const out = runInventory(tmp);
    assert.equal(out.totals.claims_total, 80, 'the population itself is never capped');
    assert.equal(out.claim_candidates.length, 60, 'default window, unchanged from before it was configurable');
    assert.equal(out.claim_population.cap, 60);
    assert.equal(out.claim_population.emitted, 60);
    assert.equal(out.claim_population.population, 80);
    assert.equal(out.claim_population.truncated, true);
    assert.equal(out.claim_population.population, out.totals.claims_total, 'the block stands on its own');
    // The note must name the remedy, not merely report the fact: a consumer that has just watched
    // coverage stop moving needs to be told this is a config ceiling, not a covered corpus.
    const note = out.claim_population.notes.find((n) => n.includes('window'));
    assert.ok(note, `a truncated run must carry a note: ${JSON.stringify(out.claim_population.notes)}`);
    assert.match(note, /60 of 80/);
    assert.match(note, /claim_candidates_cap/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('inventory: raising claim_candidates_cap emits more, and only appends to the same order', () => {
  const tmp = claimRepo(80);
  try {
    const before = runInventory(tmp);
    fs.appendFileSync(path.join(tmp, '.docgrad.yml'), 'claim_candidates_cap: 75\n');
    const after = runInventory(tmp);
    assert.equal(after.claim_candidates.length, 75);
    assert.equal(after.claim_population.cap, 75);
    assert.equal(after.claim_population.emitted, 75);
    assert.equal(after.claim_population.truncated, true, '75 of 80 is still a window');
    // The window is a prefix of one stable total order, which is why raising the cap cannot
    // invalidate a ledger: every claim the narrower window offered is still offered, in place.
    assert.deepEqual(
      after.claim_candidates.slice(0, 60).map((c) => c.claim_hash),
      before.claim_candidates.map((c) => c.claim_hash)
    );
    // Widening the window changes what a round can sample, but not which files were measured.
    assert.equal(after.docgrad.corpus_hash, before.docgrad.corpus_hash);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// The flag-on counterpart to the test above (#54): with --exclude-ledger, raising the cap does
// NOT merely append to the same prefix, because the order being capped is the *filtered* one and
// that filter is a function of the ledger, not just the corpus.
test('inventory: --exclude-ledger — raising claim_candidates_cap does not merely append to the same prefix, because the filtered order is not the total order', () => {
  const tmp = claimRepo(80);
  try {
    const fullOrder = (() => {
      const dup = claimRepo(80);
      try {
        fs.appendFileSync(path.join(dup, '.docgrad.yml'), 'claim_candidates_cap: 200\n');
        return runInventory(dup);
      } finally {
        fs.rmSync(dup, { recursive: true, force: true });
      }
    })();
    // Ledger covers the first 10 of the total order.
    const ledgered = fullOrder.claim_candidates.slice(0, 10).map((c) => c.claim_hash);
    const ledgerPath = writeLedger(tmp, ledgered);

    const before = runInventory(tmp, '--exclude-ledger', ledgerPath); // cap 60
    fs.appendFileSync(path.join(tmp, '.docgrad.yml'), 'claim_candidates_cap: 75\n');
    const after = runInventory(tmp, '--exclude-ledger', ledgerPath); // cap 75

    assert.equal(before.claim_candidates.length, 60);
    assert.equal(after.claim_candidates.length, 70, '80 total - 10 ledgered = 70 drawable, below the new cap of 75');
    // The property the unflagged test above pins ("after's first 60 == before's 60") does NOT
    // hold here: both runs already filter the same 10 ledgered hashes out before the cap, so
    // before's 60 and after's first 60 are actually identical in *this* case — but the reason is
    // different: not because the window is a prefix of the total order, but because both windows
    // are prefixes of the *same already-filtered* order at a smaller cap than the drawable count.
    // The real counterexample: once a ledger changes between two runs (as it does every round in
    // practice), the same claim_candidates_cap draws a different window. Demonstrate that here.
    const ledgerPath2 = writeLedger(tmp, fullOrder.claim_candidates.slice(0, 20).map((c) => c.claim_hash), '.docgrad2');
    const afterMoreLedger = runInventory(tmp, '--exclude-ledger', ledgerPath2); // cap still 75 (from the appended config)
    assert.notDeepEqual(
      afterMoreLedger.claim_candidates.map((c) => c.claim_hash),
      after.claim_candidates.map((c) => c.claim_hash),
      'the same claim_candidates_cap draws a different window once the ledger has grown — the filtered order is not fixed the way the total order is'
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('inventory: a cap larger than the population reports the whole population, not truncated', () => {
  const tmp = claimRepo(80);
  try {
    fs.appendFileSync(path.join(tmp, '.docgrad.yml'), 'claim_candidates_cap: 500\n');
    const out = runInventory(tmp);
    assert.equal(out.claim_candidates.length, 80);
    assert.equal(out.claim_population.emitted, 80);
    assert.equal(out.claim_population.population, 80);
    assert.equal(out.claim_population.truncated, false);
    assert.equal(out.claim_population.cap, 500, 'the cap is reported as configured, not as clamped');
    assert.ok(
      !out.claim_population.notes.some((n) => n.includes('window')),
      'nothing was withheld, so there is nothing to warn about'
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('inventory: a corpus smaller than the default cap reports truncated: false', () => {
  const tmp = claimRepo(5);
  try {
    const out = runInventory(tmp);
    assert.equal(out.claim_population.emitted, 5);
    assert.equal(out.claim_population.population, 5);
    assert.equal(out.claim_population.truncated, false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('inventory: a bad claim_candidates_cap fails the run rather than emitting an empty window', () => {
  const tmp = claimRepo(80);
  try {
    fs.appendFileSync(path.join(tmp, '.docgrad.yml'), 'claim_candidates_cap: 0\n');
    const res = spawnSync(process.execPath, [SCRIPT, '--root', tmp], { encoding: 'utf8' });
    assert.equal(res.status, 1);
    assert.match(res.stderr, /claim_candidates_cap must be a positive whole number/);
    assert.equal(res.stdout.trim(), '', 'no half-valid JSON to mistake for a measurement');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// --- --exclude-ledger (#54): the emitted window counts what is drawable -----------------------

function writeLedger(tmp, claimHashes, subdir = '.docgrad') {
  const dir = path.join(tmp, subdir);
  fs.mkdirSync(dir, { recursive: true });
  const ledgerPath = path.join(dir, 'ledger.jsonl');
  fs.writeFileSync(
    ledgerPath,
    claimHashes.map((h) => JSON.stringify({ claim_hash: h, round: 1, verify: 'pass' })).join('\n') + '\n'
  );
  return ledgerPath;
}

test('inventory: --exclude-ledger filters ledgered candidates out before the cap is applied, so cap counts drawable candidates (#54)', () => {
  // Two identical repos (claimRepo's content is a pure function of n, so both produce the same
  // ranked order — same paths, same line contents, same claim_hash values): one to read off the
  // full 150-candidate order (cap raised well past the population), one to run the actual test
  // against, at the real default cap of 60.
  const tmpFull = claimRepo(150);
  const tmpTest = claimRepo(150);
  try {
    fs.appendFileSync(path.join(tmpFull, '.docgrad.yml'), 'claim_candidates_cap: 200\n');
    const fullOrder = runInventory(tmpFull);
    assert.equal(fullOrder.claim_candidates.length, 150, 'the whole ranked population, unfiltered');

    const baseline = runInventory(tmpTest); // no flag: cap 60, unfiltered
    assert.equal(baseline.claim_population.emitted, 60);
    assert.deepEqual(
      baseline.claim_candidates.map((c) => c.claim_hash),
      fullOrder.claim_candidates.slice(0, 60).map((c) => c.claim_hash),
      'sanity: the two repos rank identically'
    );

    // Ledger already covers the first 30 of the ranked order.
    const ledgered = fullOrder.claim_candidates.slice(0, 30).map((c) => c.claim_hash);
    const ledgerPath = writeLedger(tmpTest, ledgered);

    const out = runInventory(tmpTest, '--exclude-ledger', ledgerPath);

    // The population and totals are untouched by the flag.
    assert.equal(out.totals.claims_total, 150);
    assert.equal(out.claim_population.population, 150);
    // 150 ranked candidates minus the 30 already in the ledger leaves 120 drawable; the cap (60)
    // is applied to *that*, so the emitted window is 60, not 30 (cap - ledgered).
    assert.equal(out.claim_population.emitted, 60);
    assert.equal(out.claim_population.cap, 60);
    assert.equal(out.claim_population.truncated, true);
    assert.deepEqual(out.claim_population.exclude_ledger, {
      path: ledgerPath,
      ledger_claim_hashes: 30,
      excluded: 30,
      drawable: 120,
    });
    // What's emitted is exactly the next 60 of the total order, proving the filter runs before
    // .slice(0, cap) rather than after (a filter applied after would instead emit the first 60
    // minus the ledgered 30 = only 30 candidates).
    assert.deepEqual(
      out.claim_candidates.map((c) => c.claim_hash),
      fullOrder.claim_candidates.slice(30, 90).map((c) => c.claim_hash)
    );
    // None of the emitted candidates are ones the ledger already covers.
    assert.ok(out.claim_candidates.every((c) => !ledgered.includes(c.claim_hash)));
    assert.ok(out.claim_population.notes.some((n) => n.includes('--exclude-ledger excluded 30 of 150')));
  } finally {
    fs.rmSync(tmpFull, { recursive: true, force: true });
    fs.rmSync(tmpTest, { recursive: true, force: true });
  }
});

test('inventory: --exclude-ledger — a ledger covering everything drawable reports truncated:false against the reduced population, not against claims_total', () => {
  const tmp = claimRepo(50); // smaller than the default cap
  try {
    const baseline = runInventory(tmp);
    const allHashes = baseline.claim_candidates.map((c) => c.claim_hash);
    const ledgerPath = writeLedger(tmp, allHashes);
    const out = runInventory(tmp, '--exclude-ledger', ledgerPath);
    assert.equal(out.claim_population.exclude_ledger.excluded, 50);
    assert.equal(out.claim_population.exclude_ledger.drawable, 0);
    assert.equal(out.claim_candidates.length, 0);
    assert.equal(out.claim_population.truncated, false, '0 emitted of 0 drawable is not a truncated window');
    assert.equal(out.totals.claims_total, 50, 'the population itself is unaffected');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('inventory: without --exclude-ledger, output has no exclude_ledger field and claim_population keys are unchanged from before this flag existed (#54)', () => {
  const tmp = claimRepo(80);
  try {
    const out = runInventory(tmp);
    assert.ok(!('exclude_ledger' in out.claim_population));
    assert.deepEqual(Object.keys(out.claim_population), [
      'api_matching', 'src_symbols', 'src_files_scanned', 'authorship', 'cap', 'emitted', 'population', 'truncated', 'notes',
    ]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('inventory: --exclude-ledger pointing at a missing file fails loudly rather than emitting an unfiltered window', () => {
  const tmp = claimRepo(20);
  try {
    const res = spawnSync(process.execPath, [SCRIPT, '--root', tmp, '--exclude-ledger', path.join(tmp, 'nope', 'ledger.jsonl')], { encoding: 'utf8' });
    assert.equal(res.status, 1);
    assert.match(res.stderr, /--exclude-ledger .*could not read this file/);
    assert.equal(res.stdout.trim(), '', 'no half-valid JSON, and never the unfiltered window');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('inventory: --exclude-ledger pointing at a malformed ledger fails loudly rather than emitting an unfiltered window', () => {
  const tmp = claimRepo(20);
  try {
    const ledgerPath = path.join(tmp, 'ledger.jsonl');
    fs.writeFileSync(ledgerPath, 'not json\n');
    const res = spawnSync(process.execPath, [SCRIPT, '--root', tmp, '--exclude-ledger', ledgerPath], { encoding: 'utf8' });
    assert.equal(res.status, 1);
    assert.match(res.stderr, /not a valid JSON object/);
    assert.equal(res.stdout.trim(), '');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// The note that told the reader an unset src_dirs costs them `a.b`-shaped claims was wrong: the
// path route collects those with or without a symbol index. Pin the corrected wording.
test('inventory: the src_dirs-unset note names shapes the API matcher actually admits', () => {
  const tmp = libraryRepo({ withSrcDirs: false });
  try {
    const out = runInventory(tmp);
    const note = out.claim_population.notes.find((n) => n.includes('src_dirs is unset'));
    assert.ok(note);
    assert.match(note, /foo\(\)/, 'call shapes are what is actually lost');
    assert.match(note, /obj\.my_method/, 'so are long/underscored paren-less tails');
    assert.match(note, /a\.b/, 'and the shape that is NOT lost has to be named as unaffected');
    assert.match(note, /path route/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// #50: these two fields sat in .docgrad.yml since v1.0.0 and were read by nothing, while the rubric
// applied its own hardcoded copy of the same numbers and init.md warned against editing them. These
// tests are the wiring: the config must reach the output, and the output must say when it is not
// the shipped ruler.
test('inventory: economy_thresholds reports the shipped values and the arithmetic over them (#50)', () => {
  const out = JSON.parse(execFileSync(process.execPath, [SCRIPT, '--root', FIXTURE], { encoding: 'utf8' }));
  const e = out.economy_thresholds;
  assert.deepEqual(e.entry_cost_tiers, [20000, 10000, 5000, 3000]);
  assert.equal(e.pollution_max, 0.1);
  assert.equal(e.customised, false, 'a config that never mentions economy: is not customised');
  assert.equal(e.entry_cost_tokens_est, out.entry_cost.tokens_est, 'must cite the same number the entry_cost verdict is measured on');
  assert.equal(e.pollution_ratio, out.pollution.ratio);
  assert.equal(e.cost_allows_star, 4);
  assert.equal(e.pollution_caps_at, null);
  assert.match(out.docgrad.measure_hash, /^[0-9a-f]{8}$/);
});

test('inventory: custom thresholds are honoured, flagged, and move measure_hash (#50)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-econ-'));
  try {
    fs.mkdirSync(path.join(tmp, 'docs'));
    fs.writeFileSync(path.join(tmp, 'docs/README.md'), '# index\n\nsome prose.\n');
    fs.writeFileSync(path.join(tmp, 'ENTRY.md'), `# entry\n\n${'padding words here. '.repeat(40)}\n`);
    const write = (economy) =>
      fs.writeFileSync(path.join(tmp, '.docgrad.yml'), `docs_dirs: [docs/]\nentry_files: [ENTRY.md]\n${economy}`);

    write('');
    const shipped = JSON.parse(execFileSync(process.execPath, [SCRIPT, '--root', tmp], { encoding: 'utf8' }));
    assert.equal(shipped.economy_thresholds.customised, false);
    assert.equal(shipped.economy_thresholds.cost_allows_star, 4);

    // Tiers tight enough that the same entry file now lands in the worst band: the config decides
    // the boundary, which before v1.7.0 it demonstrably did not.
    write('economy:\n  entry_cost_tiers: [50, 40, 30, 20]\n');
    const tight = JSON.parse(execFileSync(process.execPath, [SCRIPT, '--root', tmp], { encoding: 'utf8' }));
    assert.equal(tight.economy_thresholds.customised, true);
    assert.equal(tight.economy_thresholds.cost_allows_star, 1, 'the same file, a different ruler');
    assert.equal(tight.economy_thresholds.star_5_cost_met, false);
    assert.notEqual(tight.docgrad.measure_hash, shipped.docgrad.measure_hash);
    assert.equal(tight.entry_cost.tokens_est, shipped.entry_cost.tokens_est, 'the measurement itself must not move');

    // A partial economy block must keep the other key at its default (the missing deep-merge).
    write('economy:\n  pollution_max: 0.9\n');
    const partial = JSON.parse(execFileSync(process.execPath, [SCRIPT, '--root', tmp], { encoding: 'utf8' }));
    assert.deepEqual(partial.economy_thresholds.entry_cost_tiers, [20000, 10000, 5000, 3000]);
    assert.equal(partial.economy_thresholds.pollution_max, 0.9);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// --- E2b-1: measure verdicts -----------------------------------------------------------

test('inventory: measure array — ids in order, right after docgrad, OK on the shipped-tier fixture', () => {
  const out = JSON.parse(execFileSync(process.execPath, [SCRIPT, '--root', FIXTURE], { encoding: 'utf8' }));
  assert.deepEqual(Object.keys(out).slice(0, 3), ['scope', 'docgrad', 'measure']);
  assert.deepEqual(
    out.measure.map((m) => m.id),
    ['entry_cost', 'pollution']
  );
  const byId = Object.fromEntries(out.measure.map((m) => [m.id, m]));
  assert.equal(byId.entry_cost.value, out.entry_cost.tokens_est);
  assert.equal(byId.entry_cost.verdict, 'OK');
  assert.equal(byId.pollution.value, out.pollution.ratio);
  assert.equal(byId.pollution.verdict, 'OK');
});

test('inventory: measure — tight custom tiers make entry_cost FAIL, and a scoped run nulls both rows', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-measure-econ-'));
  try {
    fs.mkdirSync(path.join(tmp, 'docs'));
    fs.writeFileSync(path.join(tmp, 'docs/README.md'), '# index\n\nsome prose.\n');
    fs.writeFileSync(path.join(tmp, 'ENTRY.md'), `# entry\n\n${'padding words here. '.repeat(40)}\n`);
    fs.writeFileSync(
      path.join(tmp, '.docgrad.yml'),
      'docs_dirs: [docs/]\nentry_files: [ENTRY.md]\neconomy:\n  entry_cost_tiers: [50, 40, 30, 20]\n'
    );
    const out = JSON.parse(execFileSync(process.execPath, [SCRIPT, '--root', tmp], { encoding: 'utf8' }));
    const entryCost = out.measure.find((m) => m.id === 'entry_cost');
    assert.equal(entryCost.verdict, 'FAIL');
    assert.match(entryCost.line, /entry_cost_tiers\[1\]/);

    const scoped = JSON.parse(
      execFileSync(process.execPath, [SCRIPT, '--root', tmp, '--include', 'docs/**'], { encoding: 'utf8' })
    );
    for (const id of ['entry_cost', 'pollution']) {
      const row = scoped.measure.find((m) => m.id === id);
      assert.equal(row.verdict, null);
      assert.equal(row.note, 'full-corpus concept');
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('inventory: measure — this repo is entry_cost OK, pollution OK', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const out = JSON.parse(
    execFileSync(process.execPath, [SCRIPT, '--root', root, '--exclude-ledger', '.docgrad/ledger.jsonl'], { encoding: 'utf8' })
  );
  assert.ok(out.measure.every((m) => m.verdict === 'OK'), JSON.stringify(out.measure));
});

// #51: anchored_ratio was left behind when #40 taught the claim population to recognise API-shaped
// coordinates. A library repo documents an API, not a file tree, so every rule line scored
// unanchored *by construction* — and rubric.md's traceability note fires below 0.5, i.e. precisely
// on repos where every rule does have a verifiable landing point.
test('inventory: a rule line anchored on an API symbol counts as anchored (#51)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-anchored-'));
  try {
    fs.mkdirSync(path.join(tmp, 'docs'));
    fs.mkdirSync(path.join(tmp, 'src'));
    fs.writeFileSync(path.join(tmp, 'src/index.js'), 'export function parseAsync(argv) { return argv; }\n');
    fs.writeFileSync(
      path.join(tmp, 'docs/README.md'),
      [
        '# api',
        '',
        '- **MUST** await `parseAsync()` before reading the parsed result.',
        '- **MUST** keep the callback synchronous.',
        '',
      ].join('\n')
    );
    const write = (srcDirs) =>
      fs.writeFileSync(path.join(tmp, '.docgrad.yml'), `docs_dirs: [docs/]\nindex_file: docs/README.md\n${srcDirs}`);

    // With src_dirs set, the API span is guarded by symbol existence and counts.
    write('src_dirs: [src/]\n');
    const withSrc = JSON.parse(execFileSync(process.execPath, [SCRIPT, '--root', tmp], { encoding: 'utf8' }));
    const rules = withSrc.files.find((f) => f.path === 'docs/README.md').structure.rules;
    assert.equal(rules.count, 2, 'both list items are rule lines');
    assert.equal(rules.anchored_ratio, 0.5, 'the parseAsync() line is anchored, the other is not');

    // Without src_dirs there is no symbol index, so the API shape stays inert — same guard the
    // claim population uses, and the same degradation, rather than a silent free pass.
    write('');
    const withoutSrc = JSON.parse(execFileSync(process.execPath, [SCRIPT, '--root', tmp], { encoding: 'utf8' }));
    assert.equal(withoutSrc.files.find((f) => f.path === 'docs/README.md').structure.rules.anchored_ratio, 0);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// #52: the note used to offer both causes as one disjunction ("git is unavailable or this is not a
// git working tree"), while audit.md told the reader that the note says which. It did not, and the
// two have different remedies: install git / run elsewhere, versus the check can never apply here.
test('inventory: the untracked note names which git failure occurred (#52)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-nogit-'));
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-bin-'));
  try {
    fs.mkdirSync(path.join(tmp, 'docs'));
    fs.writeFileSync(path.join(tmp, 'docs/a.md'), '# a\n');
    fs.writeFileSync(path.join(tmp, '.docgrad.yml'), 'docs_dirs: [docs/]\n');

    // Not a work tree: git runs and refuses.
    const notATree = JSON.parse(execFileSync(process.execPath, [SCRIPT, '--root', tmp], { encoding: 'utf8' }));
    assert.equal(notATree.untracked.count, null);
    assert.match(notATree.untracked.note, /not a git working tree/);
    assert.doesNotMatch(notATree.untracked.note, /git is unavailable or/, 'the disjunction must not survive when the cause is known');

    // No git binary: the spawn itself fails with ENOENT. A PATH holding only node keeps the script
    // runnable while git genuinely cannot be found.
    fs.symlinkSync(process.execPath, path.join(binDir, 'node'));
    const noBinary = JSON.parse(
      execFileSync(process.execPath, [SCRIPT, '--root', tmp], { encoding: 'utf8', env: { PATH: binDir } })
    );
    assert.match(noBinary.untracked.note, /git is not installed/);
    assert.notEqual(noBinary.untracked.note, notATree.untracked.note, 'the two causes must be distinguishable');

    // Third cause, and the one the first version of this fix got wrong: git exists, runs, and fails
    // for its own reasons *inside a real work tree*. Inferring "not a work tree" from "exited
    // non-zero" produced the one message whose follow-up is the opposite of the right one. Found by
    // running docgrad under `claude plugin eval`, where /usr/bin/git is macOS's xcrun shim and
    // cannot write its cache.
    const tree = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-brokengit-'));
    try {
      fs.mkdirSync(path.join(tree, 'docs'));
      fs.writeFileSync(path.join(tree, 'docs/a.md'), '# a\n');
      fs.writeFileSync(path.join(tree, '.docgrad.yml'), 'docs_dirs: [docs/]\n');
      gitInit(tree); // a genuine work tree
      fs.writeFileSync(path.join(binDir, 'git'), "#!/bin/sh\necho \"git: error: Failed to locate 'git'.\" >&2\nexit 72\n");
      fs.chmodSync(path.join(binDir, 'git'), 0o755);
      const brokenGit = JSON.parse(
        execFileSync(process.execPath, [SCRIPT, '--root', tree], { encoding: 'utf8', env: { PATH: binDir } })
      );
      assert.equal(brokenGit.untracked.count, null);
      assert.match(brokenGit.untracked.note, /git is present but failed to run here/);
      assert.doesNotMatch(
        brokenGit.untracked.note,
        /is not a git working tree/,
        'a real work tree must never be reported as not a work tree just because git broke'
      );
      assert.match(brokenGit.untracked.note, /Failed to locate/, "git's own words are what make the cause actionable");
    } finally {
      fs.rmSync(tree, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(binDir, { recursive: true, force: true });
  }
});

// --- #63 prerequisite: --locate-ledger ---------------------------------------------------------
//
// The flag exists because no other output can answer "where are my ledgered claims now": improve.md
// mandates --exclude-ledger on every round that has a ledger, and that filters ledgered candidates
// out before the cap, so a loop round emits zero of them.

function writeLocateLedger(tmp, rows, name = 'ledger.jsonl') {
  const dir = path.join(tmp, '.docgrad');
  fs.mkdirSync(dir, { recursive: true });
  const ledgerPath = path.join(dir, name);
  fs.writeFileSync(ledgerPath, rows.map((r) => JSON.stringify({ round: 1, result: 'pass', ...r })).join('\n') + '\n');
  return ledgerPath;
}

test('inventory: --locate-ledger reports every ledgered claim, uncapped, even when --exclude-ledger removed all of them from the window (#63)', () => {
  const tmp = claimRepo(100); // well past the default cap of 60
  try {
    const baseline = runInventory(tmp);
    assert.equal(baseline.claim_candidates.length, 60, 'the emitted window is capped');
    // Every hash in the population, not just the emitted window.
    const full = claimRepo(100);
    let allHashes;
    try {
      fs.appendFileSync(path.join(full, '.docgrad.yml'), 'claim_candidates_cap: 200\n');
      allHashes = runInventory(full).claim_candidates.map((c) => c.claim_hash);
    } finally {
      fs.rmSync(full, { recursive: true, force: true });
    }
    assert.equal(allHashes.length, 100);
    const ledgerPath = writeLocateLedger(tmp, allHashes.map((h) => ({ claim_hash: h })));
    const out = runInventory(tmp, '--locate-ledger', ledgerPath, '--exclude-ledger', ledgerPath);
    assert.equal(out.claim_candidates.length, 0, '--exclude-ledger removed the whole window');
    assert.equal(out.locate_ledger.distinct, 100);
    assert.equal(out.locate_ledger.located, 100, 'locating reads the unfiltered population');
    assert.equal(out.locate_ledger.not_located, 0);
    assert.equal(out.locate_ledger.located + out.locate_ledger.not_located, out.locate_ledger.distinct);
    assert.ok(out.locate_ledger.note.some((n) => n.includes('--exclude-ledger')));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('inventory: --locate-ledger ignores the ledger row\'s own doc/line and reports where the claim is this round', () => {
  const tmp = claimRepo(5);
  try {
    const hash = runInventory(tmp).claim_candidates[0].claim_hash;
    const ledgerPath = writeLocateLedger(tmp, [{ claim_hash: hash, doc: 'docs/moved-away.md', line: 9999 }]);
    const out = runInventory(tmp, '--locate-ledger', ledgerPath);
    assert.equal(out.locate_ledger.located, 1);
    const [entry] = out.locate_ledger.entries;
    assert.equal(entry.positions.length, 1);
    assert.equal(entry.positions[0].path, 'docs/rules.md', 'the position comes from this round\'s scan');
    assert.notEqual(entry.positions[0].line, 9999);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('inventory: --locate-ledger reports a claim that no longer exists as located:false rather than dropping it (#63)', () => {
  const tmp = claimRepo(5);
  try {
    const ledgerPath = writeLocateLedger(tmp, [
      { claim_hash: runInventory(tmp).claim_candidates[0].claim_hash },
      { claim_hash: 'deadbeef0000', doc: 'docs/gone.md' },
    ]);
    const out = runInventory(tmp, '--locate-ledger', ledgerPath);
    assert.equal(out.locate_ledger.distinct, 2);
    assert.equal(out.locate_ledger.located, 1);
    assert.equal(out.locate_ledger.not_located, 1);
    const missing = out.locate_ledger.entries.find((e) => e.claim_hash === 'deadbeef0000');
    assert.ok(missing, 'an unlocatable row must still appear — silence would read as "nothing to protect here"');
    assert.equal(missing.located, false);
    assert.deepEqual(missing.positions, []);
    assert.equal(missing.ledger_doc, 'docs/gone.md', 'the ledger\'s own doc is echoed as a locating aid only');
    assert.ok(out.locate_ledger.note.some((n) => n.includes('no position in this round')));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('inventory: --locate-ledger counts distinct claim_hash values, not ledger lines (a ledger is append-only)', () => {
  const tmp = claimRepo(5);
  try {
    const hash = runInventory(tmp).claim_candidates[0].claim_hash;
    // Re-verification appends a new line for a hash already present — improve.md's ledger is
    // append-only and never rewritten, so lines > distinct on every real ledger.
    const ledgerPath = writeLocateLedger(tmp, [
      { claim_hash: hash, round: 1 },
      { claim_hash: hash, round: 2 },
      { claim_hash: hash, round: 3 },
    ]);
    const out = runInventory(tmp, '--locate-ledger', ledgerPath);
    assert.equal(out.locate_ledger.lines, 3);
    assert.equal(out.locate_ledger.distinct, 1);
    assert.equal(out.locate_ledger.entries.length, 1);
    assert.equal(out.locate_ledger.located + out.locate_ledger.not_located, out.locate_ledger.distinct);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('inventory: --locate-ledger reports every position when one claim text occupies several (claim_hash is content-derived)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-locate-dup-'));
  try {
    fs.mkdirSync(path.join(tmp, 'docs'), { recursive: true });
    const claim = 'Routing is implemented in `router.ts`.';
    fs.writeFileSync(path.join(tmp, 'docs', 'a.md'), `# A\n\n${claim}\n`);
    fs.writeFileSync(path.join(tmp, 'docs', 'b.md'), `# B\n\n${claim}\n`);
    fs.writeFileSync(path.join(tmp, '.docgrad.yml'), 'docs_dirs: [docs/]\n');
    const hash = runInventory(tmp).claim_candidates[0].claim_hash;
    const ledgerPath = writeLocateLedger(tmp, [{ claim_hash: hash }]);
    const out = runInventory(tmp, '--locate-ledger', ledgerPath);
    assert.equal(out.locate_ledger.distinct, 1);
    assert.equal(out.locate_ledger.multi_position, 1);
    const [entry] = out.locate_ledger.entries;
    assert.equal(entry.positions.length, 2);
    assert.deepEqual(entry.positions.map((p) => p.path).sort(), ['docs/a.md', 'docs/b.md']);
    assert.ok(out.locate_ledger.note.some((n) => n.includes('more than one position')));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('inventory: without --locate-ledger the output carries no locate_ledger key at all', () => {
  const tmp = claimRepo(5);
  try {
    assert.ok(!('locate_ledger' in runInventory(tmp)));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('inventory: --locate-ledger pointing at a missing file fails loudly, naming the flag that was passed', () => {
  const tmp = claimRepo(5);
  try {
    const res = spawnSync(
      process.execPath,
      [SCRIPT, '--root', tmp, '--locate-ledger', path.join(tmp, 'nope', 'ledger.jsonl')],
      { encoding: 'utf8' }
    );
    assert.equal(res.status, 1);
    assert.match(res.stderr, /--locate-ledger .*could not read this file/);
    assert.doesNotMatch(res.stderr, /--exclude-ledger/, 'the error must name the flag actually passed');
    assert.equal(res.stdout.trim(), '');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('inventory: an unknown flag is still rejected after --locate-ledger was added', () => {
  const tmp = claimRepo(5);
  try {
    const res = spawnSync(process.execPath, [SCRIPT, '--root', tmp, '--locate-ledgers', 'x'], { encoding: 'utf8' });
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Unknown argument --locate-ledgers/);
    assert.match(res.stderr, /--locate-ledger/, 'the supported list names the real flag');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('inventory: a scoped --locate-ledger run names scope narrowing as a cause of not_located (#63)', () => {
  const tmp = claimRepo(5);
  try {
    const hashes = runInventory(tmp).claim_candidates.map((c) => c.claim_hash);
    const ledgerPath = writeLocateLedger(tmp, hashes.map((h) => ({ claim_hash: h })));
    const scoped = runInventory(tmp, '--locate-ledger', ledgerPath, '--include', 'docs/nothing/**');
    assert.equal(scoped.locate_ledger.located, 0, 'the scoped corpus contains none of them');
    assert.equal(scoped.locate_ledger.not_located, hashes.length);
    assert.match(
      scoped.locate_ledger.note.join(' '),
      /--include narrowed this run/,
      'without this, a scoped caller reads "not located" as "the claim was edited or deleted"'
    );
    // Unscoped, the same ledger locates everything and the scope clause is absent.
    const full = runInventory(tmp, '--locate-ledger', ledgerPath);
    assert.equal(full.locate_ledger.located, hashes.length);
    assert.equal(full.locate_ledger.note.length, 0);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

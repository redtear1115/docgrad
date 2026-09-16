import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const FIXTURE = fileURLToPath(new URL('./fixtures/basic/', import.meta.url));
const SCRIPT = fileURLToPath(new URL('../skills/docgrad/scripts/links.mjs', import.meta.url));

test('links: --exclude-ledger is a no-op, note explains why, and it need not even exist (#54)', () => {
  const out = JSON.parse(
    execFileSync(process.execPath, [SCRIPT, '--root', FIXTURE, '--exclude-ledger', '/nonexistent/ledger.jsonl'], { encoding: 'utf8' })
  );
  assert.match(out.note, /--exclude-ledger is a no-op for this script/);
  assert.deepEqual(out.orphans, ['docs/orphan.md']); // behaves exactly like the unflagged run otherwise
});

test('links: dead links/bad anchors/orphans/reachable ratio', () => {
  const out = JSON.parse(execFileSync(process.execPath, [SCRIPT, '--root', FIXTURE], { encoding: 'utf8' }));
  assert.deepEqual(out.dead_links, [{ file: 'docs/guide.md', line: 5, target: './nope.md' }]);
  assert.equal(out.bad_anchors.length, 1);
  assert.equal(out.bad_anchors[0].anchor, '不存在的錨');
  assert.equal(out.bad_anchors[0].cjk_uncertain, true);
  assert.deepEqual(out.orphans, ['docs/orphan.md']);
  assert.equal(out.reachable_ratio, 0.75); // README+CLAUDE are roots -> guide is reachable, orphan is not
  assert.ok(out.total_links >= 4); // CLAUDE->README, guide's three links
  assert.equal(out.scope, null);
});

test('links: --include only counts dead links/bad anchors, orphans and reachable ratio are never computed', () => {
  const out = JSON.parse(
    execFileSync(process.execPath, [SCRIPT, '--root', FIXTURE, '--include', 'docs/**'], { encoding: 'utf8' })
  );
  assert.deepEqual(out.scope, ['docs/**']);
  assert.match(out.note, /reachable ratio/);
  // docs/orphan.md is an orphan on a full run; not judged under scope -> null ("not computed"),
  // never [] ("computed, and there are none")
  assert.equal(out.orphans, null);
  assert.notDeepEqual(out.orphans, []);
  assert.equal(out.reachable_ratio, null);
  assert.equal(out.dead_links.length, 1); // dead links are judged per-file, still caught under scope
  assert.equal(out.bad_anchors.length, 1);
});

test('links: docs_files are judged as orphans like any regular document (not a reachability starting point)', () => {
  // PRODUCT.md is linked from the index -> reachable; DESIGN.md has no document linking to it -> orphan.
  // If docs_files weren't part of the corpus, neither would appear in the judgment and orphans would be [].
  const fixture = fileURLToPath(new URL('./fixtures/docs-files/', import.meta.url));
  const out = JSON.parse(execFileSync(process.execPath, [SCRIPT, '--root', fixture], { encoding: 'utf8' }));
  assert.deepEqual(out.orphans, ['DESIGN.md']);
  assert.equal(out.reachable_ratio, 0.8); // 4 of 5 reachable
  assert.deepEqual(out.dead_links, []);
});

test('links: index_file outside docs_dirs and not an entry_file -> still a reachability starting point (not misjudged as an orphan)', () => {
  const fixture = fileURLToPath(new URL('./fixtures/root-index/', import.meta.url));
  const out = JSON.parse(execFileSync(process.execPath, [SCRIPT, '--root', fixture], { encoding: 'utf8' }));
  assert.deepEqual(out.orphans, []); // missing index_file would misjudge docs/guide.md as an orphan
  assert.equal(out.reachable_ratio, 1);
  assert.deepEqual(out.dead_links, []);
});

test('links: index_file unset -> orphans is null ("not computed"), not [] ("zero orphans")', () => {
  // Regression test for #39: with no index_file there is no reachability starting point. The old
  // code short-circuited to [], so downstream consumers that only read the mechanical output —
  // CI gates, dashboards, agents that skip the rubric — read it as "linkage is fine". Measured on a
  // real repo whose seven documents were all mutually unreachable: it still reported [].
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-noindex-'));
  fs.mkdirSync(path.join(tmp, 'docs'));
  fs.writeFileSync(path.join(tmp, '.docgrad.yml'), 'docs_dirs: [docs/]\nentry_files: []\nindex_file: null\nexclude: []\n');
  // Two documents with no links between them: with an index_file they'd be genuine orphans.
  fs.writeFileSync(path.join(tmp, 'docs/a.md'), '# A\n\nnothing links here.\n');
  fs.writeFileSync(path.join(tmp, 'docs/b.md'), '# B\n\nnothing links here either.\n');

  const out = JSON.parse(execFileSync(process.execPath, [SCRIPT, '--root', tmp], { encoding: 'utf8' }));
  assert.equal(out.orphans, null);
  assert.notDeepEqual(out.orphans, []); // must be distinguishable from "zero orphans" by value and type
  assert.equal(out.reachable_ratio, null); // same condition, same degree of honesty
  assert.equal(out.scope, null); // not scope-limited — purely the absence of an index

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('links: full run with an index_file -> orphans is still an array, and still finds a real orphan', () => {
  const out = JSON.parse(execFileSync(process.execPath, [SCRIPT, '--root', FIXTURE], { encoding: 'utf8' }));
  assert.ok(Array.isArray(out.orphans));
  assert.deepEqual(out.orphans, ['docs/orphan.md']);
});

test('links: output carries the docgrad fingerprint, right after scope (#45)', () => {
  const out = JSON.parse(execFileSync(process.execPath, [SCRIPT, '--root', FIXTURE], { encoding: 'utf8' }));
  // This is the output that most needs to identify itself: `orphans` changed shape in v1.5.0
  // ([] -> null when not computed, #39), so a stored JSON with no version stamp can be read
  // under the wrong contract.
  assert.equal(typeof out.docgrad.version, 'string');
  assert.notEqual(out.docgrad.version, null); // #47: a null version here is the silent failure mode
  assert.match(out.docgrad.rubric_hash, /^[0-9a-f]{8}$/);
  assert.match(out.docgrad.corpus_hash, /^[0-9a-f]{8}$/);
  // Same placement as inventory.mjs, so the five scripts' JSON can be compared field by field.
  assert.deepEqual(Object.keys(out).slice(0, 2), ['scope', 'docgrad']);
});

const FS_TRACE = fileURLToPath(new URL('./helpers/fs-trace.mjs', import.meta.url));

// A basic-fixture copy whose --root is a *symlink* to the real tree, so "both spellings of the root"
// is exercised for real: `real` is what realpath prints, `alias` is what the command line says.
function makeFileUriFixture() {
  const real = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-fileuri-')));
  fs.cpSync(FIXTURE, real, { recursive: true });
  const alias = `${real}-alias`;
  fs.symlinkSync(real, alias);
  fs.writeFileSync(path.join(real, 'docs', 'a#b.md'), '# hash in name\n');
  fs.writeFileSync(path.join(real, 'docs', 'a%23b.md'), '# literal percent-two-three in name\n');
  fs.writeFileSync(path.join(real, 'docs', '100%.md'), '# percent in name\n');
  fs.writeFileSync(path.join(real, '..notes.md'), '# two leading dots, not a parent reference\n');
  return { real, alias, cleanup: () => { fs.rmSync(alias, { force: true }); fs.rmSync(real, { recursive: true, force: true }); } };
}

test('links: file:// URI targets join the normal pipeline — both root spellings, one URL decode, localhost host, ..name, root itself', () => {
  const { real, alias, cleanup } = makeFileUriFixture();
  const url = (p) => pathToFileURL(p).href;
  fs.appendFileSync(
    path.join(real, 'CLAUDE.md'),
    [
      '',
      `[via realpath](${url(path.join(real, 'docs/orphan.md'))})`,
      `[via the alias the command line uses](${url(path.join(alias, 'docs/guide.md'))})`,
      `[hash in filename, encoded once](${url(path.join(real, 'docs/a#b.md'))})`,
      `[literal %23 in filename, so the URL carries %2523](${url(path.join(real, 'docs/a%23b.md'))})`,
      `[percent in filename](${url(path.join(real, 'docs/100%.md'))})`,
      `[two leading dots](${url(path.join(real, '..notes.md'))})`,
      `[the root itself](${url(real)}/)`,
      `[localhost host is the local machine](${url(path.join(real, 'docs/guide.md')).replace('file://', 'file://localhost')})`,
      `[valid anchor](${url(path.join(real, 'docs/guide.md'))}#中文標題)`,
      `[bad anchor](${url(path.join(real, 'docs/guide.md'))}#no-such-anchor)`,
      `[missing inside root](${url(path.join(real, 'docs/nope.md'))})`,
      '[outside root](file:///etc/hosts)',
      '[remote host is not looked up](file://other-host/share/doc.md)',
      '',
    ].join('\n')
  );
  try {
    const out = JSON.parse(execFileSync(process.execPath, [SCRIPT, '--root', alias], { encoding: 'utf8' }));
    // orphan.md is linked from CLAUDE.md via file:// -> it is an edge -> no orphans left
    assert.deepEqual(out.orphans, []);
    assert.equal(out.reachable_ratio, 1);
    // exactly one file:// target points at nothing inside the root; a#b.md, a%23b.md (decoded once,
    // not twice), 100%.md, ..notes.md and the root itself all exist and are not dead
    assert.deepEqual(
      out.dead_links.map((d) => d.target).sort(),
      ['./nope.md', url(path.join(real, 'docs/nope.md'))].sort()
    );
    // leaves the root, or names another host: classified, never dead
    assert.deepEqual(
      out.out_of_root_links.map((d) => d.target).sort(),
      ['file:///etc/hosts', 'file://other-host/share/doc.md'].sort()
    );
    // the fragment of a file:// URI is an anchor like any other: the real heading passes, the fake fails
    assert.deepEqual(out.bad_anchors.filter((b) => /^file:/.test(b.target)).map((b) => b.anchor), ['no-such-anchor']);
  } finally {
    cleanup();
  }
});

test('links: an out-of-root file:// target is never stat\'ed (#57 holds for the new scheme)', () => {
  const { real, alias, cleanup } = makeFileUriFixture();
  const probe = path.join(os.tmpdir(), `docgrad-fileuri-probe-${process.pid}.md`);
  fs.writeFileSync(probe, '# exists, and must not be looked at\n');
  fs.appendFileSync(path.join(real, 'CLAUDE.md'), `\n[probe](${pathToFileURL(probe).href})\n`);
  const traceFile = path.join(real, 'trace.txt');
  try {
    const r = execFileSync(process.execPath, [FS_TRACE, traceFile, SCRIPT, '--root', alias], { encoding: 'utf8' });
    const out = JSON.parse(r);
    assert.deepEqual(out.out_of_root_links.map((d) => d.target), [pathToFileURL(probe).href]);
    const trace = fs.readFileSync(traceFile, 'utf8').split('\n').filter(Boolean);
    assert.deepEqual(trace.filter((p) => path.resolve(p) === path.resolve(probe)), []);
  } finally {
    fs.rmSync(probe, { force: true });
    cleanup();
  }
});

test('links: --locate-ledger is a no-op, note explains why, and it need not even exist (#63)', () => {
  const out = JSON.parse(
    execFileSync(process.execPath, [SCRIPT, '--root', FIXTURE, '--locate-ledger', '/nonexistent/ledger.jsonl'], { encoding: 'utf8' })
  );
  assert.match(out.note, /--locate-ledger is a no-op for this script/);
  assert.deepEqual(out.orphans, ['docs/orphan.md']); // behaves exactly like the unflagged run otherwise
});

// #74 — a line-range fragment is not a heading reference, and judging it as one charged a repo
// linkage for a convention that is not broken. The test pins both directions: the convention is not
// reported, and a real mistyped anchor still is — a fix that silenced both would be worse than the
// defect, because bad_anchors is the only thing that reports a broken anchor at all.
// --- E2b-1: measure verdicts -----------------------------------------------------------

test('links: measure array — ids in table order, right after docgrad, FAIL on this fixture (dead links + orphans over the anchors)', () => {
  const out = JSON.parse(execFileSync(process.execPath, [SCRIPT, '--root', FIXTURE], { encoding: 'utf8' }));
  assert.deepEqual(Object.keys(out).slice(0, 3), ['scope', 'docgrad', 'measure']);
  assert.deepEqual(
    out.measure.map((m) => m.id),
    ['dead_link_ratio', 'orphan_ratio', 'reachable_ratio', 'index_present']
  );
  const byId = Object.fromEntries(out.measure.map((m) => [m.id, m]));
  // basic fixture: 1 dead / 5 total = 20% -> FAIL; 1 orphan / 4 included = 25% -> FAIL;
  // reachable_ratio 0.75 -> WATCH (not >=95%); index_file is set and present -> OK.
  assert.equal(byId.dead_link_ratio.verdict, 'FAIL');
  assert.equal(byId.dead_link_ratio.bad_anchors, 1);
  assert.equal(byId.orphan_ratio.verdict, 'FAIL');
  assert.equal(byId.reachable_ratio.verdict, 'WATCH');
  assert.equal(byId.index_present.verdict, 'OK');
});

test('links: measure — scoped run nulls orphan_ratio/reachable_ratio/index_present, dead_link_ratio still evaluated', () => {
  const out = JSON.parse(
    execFileSync(process.execPath, [SCRIPT, '--root', FIXTURE, '--include', 'docs/**'], { encoding: 'utf8' })
  );
  const byId = Object.fromEntries(out.measure.map((m) => [m.id, m]));
  for (const id of ['orphan_ratio', 'reachable_ratio', 'index_present']) {
    assert.equal(byId[id].verdict, null, `${id} must be null when scoped`);
    assert.equal(byId[id].value, null);
    assert.match(byId[id].note, /reachability is a full-index concept/);
  }
  assert.notEqual(byId.dead_link_ratio.verdict, null, 'dead_link_ratio is not a full-corpus-only row');
});

test('links: measure — no index_file: index_present is FAIL, orphan_ratio/reachable_ratio are null with their own note', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-noindex-measure-'));
  fs.mkdirSync(path.join(tmp, 'docs'));
  fs.writeFileSync(path.join(tmp, '.docgrad.yml'), 'docs_dirs: [docs/]\nentry_files: []\nindex_file: null\nexclude: []\n');
  fs.writeFileSync(path.join(tmp, 'docs/a.md'), '# A\n\nnothing links here.\n');
  fs.writeFileSync(path.join(tmp, 'docs/b.md'), '# B\n\nnothing links here either.\n');
  try {
    const out = JSON.parse(execFileSync(process.execPath, [SCRIPT, '--root', tmp], { encoding: 'utf8' }));
    const byId = Object.fromEntries(out.measure.map((m) => [m.id, m]));
    assert.equal(byId.index_present.verdict, 'FAIL');
    assert.equal(byId.orphan_ratio.verdict, null);
    assert.match(byId.orphan_ratio.note, /orphans not computed \(no index\)/);
    assert.equal(byId.reachable_ratio.verdict, null);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('links: measure — this repo is dead 0 / bad anchors 0 / orphans [] / reachable 1, so all four rows are OK', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const out = JSON.parse(execFileSync(process.execPath, [SCRIPT, '--root', root], { encoding: 'utf8' }));
  assert.deepEqual(out.dead_links, []);
  assert.deepEqual(out.bad_anchors, []);
  assert.deepEqual(out.orphans, []);
  assert.equal(out.reachable_ratio, 1);
  assert.ok(out.measure.every((m) => m.verdict === 'OK'), JSON.stringify(out.measure));
});

test('links: #L39-L86 is a line-range fragment, not a bad anchor — but a mistyped one still is (#74)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docgrad-line-range-'));
  try {
    fs.mkdirSync(path.join(tmp, 'docs'));
    fs.writeFileSync(
      path.join(tmp, '.docgrad.yml'),
      'docs_dirs: [docs/]\nentry_files: []\nindex_file: docs/README.md\n'
    );
    fs.writeFileSync(
      path.join(tmp, 'docs', 'README.md'),
      [
        '# Index',
        '',
        '- [range](guide.md#L39-L86)',
        '- [single line](guide.md#L7)',
        '- [real heading](guide.md#heading)',
        '- [mistyped heading](guide.md#headng)',
        '- [lower case, not the convention](guide.md#l39-l86)',
        '',
      ].join('\n')
    );
    fs.writeFileSync(path.join(tmp, 'docs', 'guide.md'), '# Guide\n\n## Heading\n\ntext\n');

    const out = JSON.parse(
      execFileSync(process.execPath, [SCRIPT, '--root', tmp], { encoding: 'utf8' })
    );
    assert.equal(out.total_links, 5, 'every link is still counted; this is not a skip of the link');
    assert.equal(out.dead_links.length, 0);
    assert.deepEqual(
      out.bad_anchors.map((b) => b.anchor).sort(),
      ['headng', 'l39-l86'],
      'L-ranges are not judged; a typo and a lower-case near-miss still are'
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

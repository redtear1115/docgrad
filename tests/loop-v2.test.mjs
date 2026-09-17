// v2.0.0 E2c-2 — doc-pinning tests: improve.md reasons only about `measure` verdicts (never a star
// rating or a judge pass rate), SKILL.md routes `measure`/`judge` as first-class commands, and no
// reference/docs file is left describing the "not runnable until E2c(-2)" intermediate state as
// though it were still current.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const IMPROVE = path.join(ROOT, 'skills/docgrad/reference/improve.md');
const SKILL = path.join(ROOT, 'skills/docgrad/SKILL.md');

function read(p) {
  return fs.readFileSync(p, 'utf8');
}

test('improve.md: no ★ anywhere (A3/A8)', () => {
  const text = read(IMPROVE);
  assert.ok(!text.includes('★'), 'improve.md must not contain ★');
});

test('improve.md: no "lowest-scoring dimension" (A8)', () => {
  const text = read(IMPROVE);
  assert.ok(!/lowest-scoring dimension/i.test(text), 'improve.md must not say "lowest-scoring dimension"');
});

test('improve.md: no "pass rate to decide" (A8)', () => {
  const text = read(IMPROVE);
  assert.ok(!/pass rate to decide/i.test(text), 'improve.md must not say a pass rate decides anything for the loop');
});

test('improve.md: no "economy rating" (A8)', () => {
  const text = read(IMPROVE);
  assert.ok(!/economy rating/i.test(text), 'improve.md must not say "economy rating" — economy is measure verdicts now');
});

test('improve.md: no pointer to a design-ceiling section (A8)', () => {
  const text = read(IMPROVE);
  assert.ok(!/## Dimension cap: the design ceiling/.test(text), 'the old "Dimension cap: the design ceiling" heading must be gone');
});

test('improve.md: contains "meets_target" (A3/A8/A10)', () => {
  const text = read(IMPROVE);
  assert.ok(text.includes('meets_target'), 'improve.md must reason about meets_target');
});

test('improve.md: contains the "outside docgrad\'s remit" stop condition (A8)', () => {
  const text = read(IMPROVE);
  assert.match(text, /outside docgrad's remit/i);
  assert.match(text, /stop immediately/i, 'the remit stop must say the loop stops immediately, not just "excluded"');
});

test('improve.md: plateau is defined only over a non-empty working set (A8)', () => {
  const text = read(IMPROVE);
  assert.match(text, /Plateau.*non-empty working set/is);
});

test('improve.md: step 2 states where an unlisted measure signal is picked (A10)', () => {
  const text = read(IMPROVE);
  assert.match(text, /not on this[\s\S]{0,40}list[\s\S]{0,400}MEASURE_BANDS.\s*order/i);
});

test('SKILL.md: routing table has `measure` and `judge` rows (A4)', () => {
  const text = read(SKILL);
  assert.match(text, /\|\s*`measure`\s*\|/);
  assert.match(text, /\|\s*`judge`\s*\|/);
  assert.match(text, /\|\s*`audit`\s*\|/);
});

test('SKILL.md: argument-hint lists both measure and judge (A4)', () => {
  const text = read(SKILL);
  const hint = /argument-hint:\s*"([^"]*)"/.exec(text);
  assert.ok(hint, 'argument-hint must be present');
  assert.match(hint[1], /measure/);
  assert.match(hint[1], /judge/);
});

test('SKILL.md: frontmatter description no longer promises "target ratings" (A4)', () => {
  const text = read(SKILL);
  assert.ok(!/target ratings/i.test(text), 'SKILL.md must not promise "target ratings" any more');
});

test('SKILL.md: `report` row keeps its pre-E2c-2 opening and closing text (A4)', () => {
  const text = read(SKILL);
  const reportLine = text.split('\n').find((l) => l.startsWith('| `report` |'));
  assert.ok(reportLine, 'the `report` row must exist');
  // Pinned literal, copied verbatim from origin/main d8c1cfd. If this line ever needs to change,
  // that is E3's job (#81/#87), not E2c-2's — this test exists to catch an accidental touch.
  assert.match(
    reportLine,
    /^\| `report` \| Read the target repo's `\.docgrad\/scorecard-latest\.md` and reprint it, plus a per-round score trend drawn from `\.docgrad\/history\.jsonl`\./
  );
  assert.match(reportLine, /No overall score is ever computed\.\*\* When `\.docgrad\/ledger\.jsonl` exists, also report cumulative coverage and which claims are still `fail` or `stale` \|$/);
});

test('no file under skills/ or docs/ (excluding CHANGELOG and §Version history sections) says "until E2c" (A2)', () => {
  const dirs = ['skills', 'docs', '.agents'];
  const offenders = [];
  for (const dir of dirs) {
    walk(path.join(ROOT, dir), (file) => {
      if (!file.endsWith('.md')) return;
      const text = read(file);
      const versionHistoryIdx = text.indexOf('## Version history');
      const body = versionHistoryIdx === -1 ? text : text.slice(0, versionHistoryIdx);
      if (body.includes('until E2c')) offenders.push(path.relative(ROOT, file));
    });
  }
  assert.deepEqual(offenders, [], `these files say "until E2c" outside any §Version history section: ${offenders.join(', ')}`);
});

function walk(dir, onFile) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, onFile);
    else onFile(full);
  }
}

test('improve.md: an all-null round is never "targets met", and a neutral round counts toward plateau (A3)', () => {
  const text = read(IMPROVE);
  assert.match(text, /If every row\s+is null, targets are not met/);
  assert.match(text, /\*\*Nothing measured\*\*/);
  assert.match(text, /record the round as \*\*no improvement\*\*/);
});

test('history example: `dimension` names only a measure id (A3)', () => {
  const text = read(IMPROVE);
  assert.ok(!/"dimension": "[^"]*judged dimension/.test(text), 'dimension must not allow a judged dimension');
});

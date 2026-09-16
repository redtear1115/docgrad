// #88 — improve.md's shipped history.jsonl example is the shape agents copy verbatim to start a new
// round's line. This pins that example against the schema-2 spec: one line, valid JSON, `schema: 2`,
// a `docgrad` object whose keys match `docgradMeta()` in order, every `docgrad` value an obvious
// placeholder (never a live-looking hash), no leftover v1.x top-level fields, and a `measure` block
// whose real (non-placeholder) keys are ids `evaluateMeasure` actually knows.
//
// This test must fail on dedb0cf: the example there has no `schema` and carries top-level
// `docgrad_version`/`rubric_hash`/`measure_hash`/`judge_hash`/`corpus_hash`/`scores` instead.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { docgradMeta, MEASURE_BANDS } from '../skills/docgrad/scripts/lib.mjs';

const IMPROVE = fileURLToPath(new URL('../skills/docgrad/reference/improve.md', import.meta.url));

// The example lives under improve.md step 5 ("Record and commit"), inside a fenced ```json block
// that — because it sits in a markdown list item — is itself indented, so the closing fence carries
// leading whitespace too.
function extractExampleRow() {
  const text = fs.readFileSync(IMPROVE, 'utf8');
  const stepIdx = text.indexOf('5. **Record and commit**');
  assert.ok(stepIdx !== -1, 'improve.md step 5 ("Record and commit") not found');
  const rest = text.slice(stepIdx);
  const fenceMatch = /```json\r?\n([^\r\n]*)\r?\n[ \t]*```/.exec(rest);
  assert.ok(fenceMatch, 'no ```json fenced block found under improve.md step 5');
  return fenceMatch[1];
}

test('improve.md step 5 history example: exactly one non-empty line', () => {
  const line = extractExampleRow();
  const nonEmptyLines = line.split(/\r?\n/).filter((l) => l.trim().length > 0);
  assert.equal(nonEmptyLines.length, 1, 'the shipped example must be JSON Lines: one line');
});

test('improve.md step 5 history example: parses as JSON and matches the schema-2 shape', () => {
  const line = extractExampleRow();
  const row = JSON.parse(line);

  assert.equal(row.schema, 2);

  assert.ok(row.docgrad && typeof row.docgrad === 'object', 'row.docgrad must be an object');
  assert.deepEqual(Object.keys(row.docgrad), Object.keys(docgradMeta()));
  for (const [key, value] of Object.entries(row.docgrad)) {
    assert.match(value, /^<.*>$/, `docgrad.${key} must be an obvious <…> placeholder, got ${JSON.stringify(value)}`);
  }

  for (const legacyKey of ['docgrad_version', 'rubric_hash', 'measure_hash', 'judge_hash', 'corpus_hash', 'scores']) {
    assert.ok(!(legacyKey in row), `row must not carry the v1.x top-level field "${legacyKey}"`);
  }

  assert.equal(row.judge.incomparable, true);

  const measureIds = new Set(MEASURE_BANDS.map((r) => r.id));
  assert.ok(row.measure && typeof row.measure === 'object', 'row.measure must be an object');
  for (const key of Object.keys(row.measure)) {
    const isPlaceholder = /^<.*>$/.test(key) || key === '…';
    if (isPlaceholder) continue;
    assert.ok(measureIds.has(key), `row.measure key "${key}" is not a MEASURE_BANDS id and is not a literal placeholder key`);
  }
});

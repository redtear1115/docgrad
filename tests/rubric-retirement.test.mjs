// v2.0.0 (E2b-2): linkage/freshness/economy stop being star-rated in rubric.md; rubric.md becomes
// judge-only (completeness, correctness, consistency). This file is new (not
// tests/history-spec.test.mjs, which E4a owns in a parallel epoch) precisely to avoid colliding
// with that file.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const RUBRIC = fileURLToPath(new URL('../skills/docgrad/reference/rubric.md', import.meta.url));
const JUDGE = fileURLToPath(new URL('../skills/docgrad/reference/judge.md', import.meta.url));
const MEASURE = fileURLToPath(new URL('../skills/docgrad/reference/measure.md', import.meta.url));

function readLines(p) {
  return fs.readFileSync(p, 'utf8').split('\n');
}

function section(lines, heading) {
  // heading e.g. '## Freshness' — returns the lines from that heading (exclusive) to the next
  // '## ' heading (exclusive), or end of file.
  const startIdx = lines.findIndex((l) => l.trim() === heading);
  assert.notEqual(startIdx, -1, `heading ${heading} must exist`);
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i += 1) {
    if (/^## /.test(lines[i])) {
      endIdx = i;
      break;
    }
  }
  return lines.slice(startIdx + 1, endIdx);
}

test('rubric.md: §Freshness/§Linkage/§Economy/§Token economy report carry no ★ and no table row', () => {
  const lines = readLines(RUBRIC);
  for (const heading of ['## Freshness', '## Linkage', '## Economy', '## Token economy report']) {
    const body = section(lines, heading);
    for (const line of body) {
      assert.ok(!line.includes('★'), `${heading}: no ★ left, but found in: ${line}`);
      assert.ok(!/^\|/.test(line), `${heading}: no table row left, but found: ${line}`);
    }
  }
});

test('rubric.md: outside §Version history, no ★ within 60 chars of freshness/linkage/economy/fixed cost/pollution, and no "six dimension(s)"', () => {
  const raw = fs.readFileSync(RUBRIC, 'utf8');
  const versionHistoryIdx = raw.indexOf('## Version history');
  assert.notEqual(versionHistoryIdx, -1, '§Version history must exist');
  const body = raw.slice(0, versionHistoryIdx);

  const forbidden = /freshness|linkage|economy|fixed cost|pollution/i;
  let idx = body.indexOf('★');
  while (idx !== -1) {
    const windowStart = Math.max(0, idx - 60);
    const windowEnd = Math.min(body.length, idx + 60);
    const window = body.slice(windowStart, windowEnd);
    assert.ok(
      !forbidden.test(window),
      `★ at offset ${idx} sits within 60 chars of a retired-dimension word: ${JSON.stringify(window)}`
    );
    idx = body.indexOf('★', idx + 1);
  }

  assert.ok(!/six[- ]dimension/i.test(body), 'no "six dimension" / "six-dimension" outside §Version history');
});

test('judge.md: step 9\'s first table has exactly Completeness, Correctness, Consistency rows, with a Measure block above it', () => {
  const raw = fs.readFileSync(JUDGE, 'utf8');
  const step9Idx = raw.indexOf('### 9. Emit the scorecard');
  assert.notEqual(step9Idx, -1, 'step 9 must exist');
  const body = raw.slice(step9Idx);

  const measureIdx = body.indexOf('## Measure');
  assert.notEqual(measureIdx, -1, 'a ## Measure block must precede the Dimension table');

  const tableHeaderIdx = body.indexOf('| Dimension | Rating | Main deductions |');
  assert.notEqual(tableHeaderIdx, -1, 'the Dimension table must exist');
  assert.ok(measureIdx < tableHeaderIdx, 'the Measure block must come before the Dimension table');

  // Collect the table's data rows (after the header + separator line, stopping at the first
  // non-'|' line so a later table in the same file is never swept in).
  const afterHeader = body.slice(tableHeaderIdx);
  const allLines = afterHeader.split('\n');
  const tableLines = [];
  for (const l of allLines) {
    if (!l.startsWith('|')) break;
    tableLines.push(l);
  }
  // tableLines[0] = header, tableLines[1] = separator, rest = data rows.
  const dataRows = tableLines.slice(2);
  const dimensionNames = dataRows.map((row) => row.split('|')[1].trim());
  assert.deepEqual(dimensionNames, ['Completeness', 'Correctness', 'Consistency']);
});

test('judge.md has no "### 4." or "### 7." heading; measure.md has both', () => {
  const judgeLines = readLines(JUDGE);
  assert.ok(!judgeLines.some((l) => /^### 4\./.test(l)), 'judge.md must not have a ### 4. heading');
  assert.ok(!judgeLines.some((l) => /^### 7\./.test(l)), 'judge.md must not have a ### 7. heading');

  const measureLines = readLines(MEASURE);
  assert.ok(measureLines.some((l) => /^### 4\./.test(l)), 'measure.md must have a ### 4. heading');
  assert.ok(measureLines.some((l) => /^### 7\./.test(l)), 'measure.md must have a ### 7. heading');
});

test('measure.md: every ★ sits on a line carrying "retired" or "(1.x)"', () => {
  const lines = readLines(MEASURE);
  for (const line of lines) {
    if (line.includes('★')) {
      assert.ok(
        /retired|\(1\.x\)/i.test(line),
        `★ found on a line with neither "retired" nor "(1.x)": ${line}`
      );
    }
  }
});

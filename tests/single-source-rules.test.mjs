// Single source of truth for the loop's rules (#102).
//
// improve.md step 4 (keep-or-revert) and improve.md §Stop conditions are the only places those two rules are
// defined. During v2.0.0 E2c-2 the same rule was independently restated in at least four places (INTEROP.md,
// docs/design.md twice, improve.md's own small-corpus exception); every verification round found one more that had
// not followed a rule change, and no test noticed any of them. This file makes restating them a test failure:
// anywhere else, link to improve.md instead of repeating the condition.
//
// The check is pattern-based: each pattern below is the signature of a restated condition, not a word ban. A hit
// that is genuinely not a restatement belongs in ALLOWED with its reason — never widen a pattern's exclusions to
// hide one.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

// Files that are allowed to state the rules: the source itself, and history records of what a rule used to be.
const SOURCE = 'skills/docgrad/reference/improve.md';
const SKIPPED_PREFIXES = ['CHANGELOG.md', 'case-studies/', 'evals/', '.docgrad/'];
const RESTATEMENTS = [
  { name: 'revert condition naming other rows', re: /\bno other (?:row|dimension)\b/i },
  {
    name: 'revert condition over any row/dimension',
    re: /\bany\b\**\s+(?:other\s+)?(?:`?measure`?\s+)?(?:row|dimension)\b[^\n.]{0,60}\b(?:worse|worsens|drops?|moves? to `?false)/i,
  },
  { name: 'verdict/meets_target tied to a revert', re: /\b(?:verdict|meets_target)\b[^\n.]{0,80}\brevert/i },
  { name: 'revert tied to verdict/meets_target', re: /\brevert\w*\b[^\n.]{0,80}\b(?:verdict|meets_target)\b/i },
  { name: 'plateau window', re: /\btwo consecutive rounds\b/i },
  { name: 'targets-met condition', re: /meets_target`?[^\n.]{0,30}\breads `?true/i },
];

// { file, text, why } — a line containing `text` in `file` is not a restatement.
const ALLOWED = [
  {
    file: 'skills/docgrad/reference/measure.md',
    text: '"improve verifies that no other dimension drops" clause',
    why: 'names a retired 1.x clause as retired; it states no current rule',
  },
];

function trackedMarkdown() {
  const out = execFileSync('git', ['ls-files', '-z', '--', '*.md'], { cwd: ROOT, encoding: 'utf8' });
  return out.split('\0').filter(Boolean);
}

// Text after a `## Version history…` heading is a record of past rules, not a statement of current ones.
function currentBody(text) {
  const idx = text.search(/^## Version history/m);
  return idx === -1 ? text : text.slice(0, idx);
}

test('no file other than improve.md restates the keep-or-revert rule or the stop conditions (#102)', () => {
  const offenders = [];
  for (const rel of trackedMarkdown()) {
    if (rel === SOURCE) continue;
    if (SKIPPED_PREFIXES.some((p) => rel.startsWith(p))) continue;
    const lines = currentBody(fs.readFileSync(path.join(ROOT, rel), 'utf8')).split('\n');
    lines.forEach((line, i) => {
      for (const { name, re } of RESTATEMENTS) {
        if (!re.test(line)) continue;
        if (ALLOWED.some((a) => a.file === rel && line.includes(a.text))) continue;
        offenders.push(`${rel}:${i + 1} (${name}): ${line.trim().slice(0, 120)}`);
      }
    });
  }
  assert.deepEqual(offenders, [], `link to ${SOURCE} instead of restating:\n${offenders.join('\n')}`);
});

test('improve.md restates neither rule outside its own step 4 and §Stop conditions', () => {
  const text = fs.readFileSync(path.join(ROOT, SOURCE), 'utf8');
  const lines = text.split('\n');
  const step4 = lines.findIndex((l) => /^4\. \*\*Verify\*\*/.test(l));
  const step5 = lines.findIndex((l) => /^5\. \*\*Record and commit\*\*/.test(l));
  const stopStart = lines.findIndex((l) => /^## Stop conditions/.test(l));
  const stopEnd = lines.findIndex((l, i) => i > stopStart && /^## /.test(l));
  for (const idx of [step4, step5, stopStart, stopEnd]) assert.notEqual(idx, -1, 'improve.md structure changed');
  const inSource = (i) => (i >= step4 && i < step5) || (i >= stopStart && i < stopEnd);
  const offenders = [];
  lines.forEach((line, i) => {
    if (inSource(i)) return;
    for (const { name, re } of RESTATEMENTS) {
      if (re.test(line)) offenders.push(`improve.md:${i + 1} (${name}): ${line.trim().slice(0, 120)}`);
    }
  });
  assert.deepEqual(offenders, [], `point at step 4 / §Stop conditions instead:\n${offenders.join('\n')}`);
});

test('the files that describe the loop link to the single source instead', () => {
  const design = fs.readFileSync(path.join(ROOT, 'docs/design.md'), 'utf8');
  assert.match(design, /improve\.md\]\([^)]*\) step 4/);
  assert.match(design, /improve\.md\]\([^)]*\) §Stop conditions/);
  const interop = fs.readFileSync(path.join(ROOT, 'INTEROP.md'), 'utf8');
  assert.match(interop, /improve\.md\]\([^)]*\) §Steps in each round, step 4/);
});

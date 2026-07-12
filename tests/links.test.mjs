import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const FIXTURE = fileURLToPath(new URL('./fixtures/basic/', import.meta.url));
const SCRIPT = fileURLToPath(new URL('../scripts/links.mjs', import.meta.url));

test('links: 死鏈/壞錨/孤兒/可達率', () => {
  const out = JSON.parse(execFileSync(process.execPath, [SCRIPT, '--root', FIXTURE], { encoding: 'utf8' }));
  assert.deepEqual(out.dead_links, [{ file: 'docs/guide.md', line: 5, target: './nope.md' }]);
  assert.equal(out.bad_anchors.length, 1);
  assert.equal(out.bad_anchors[0].anchor, '不存在的錨');
  assert.equal(out.bad_anchors[0].cjk_uncertain, true);
  assert.deepEqual(out.orphans, ['docs/orphan.md']);
  assert.equal(out.reachable_ratio, 0.75); // README+CLAUDE 為根 → guide 可達，orphan 不可達
  assert.ok(out.total_links >= 4); // CLAUDE→README、guide 三連結
});

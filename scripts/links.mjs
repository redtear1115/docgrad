#!/usr/bin/env node
// links.mjs — 死鏈/壞錨/孤兒（可達性從 index_file＋entry_files 起算 transitive）
// 用法: node links.mjs [--root <repo>] [--config <file>] [--include <glob>]；JSON → stdout。
// scope 限定時只出死鏈/壞錨：孤兒與可達率是「全量索引」概念,範圍一縮就失真,一律不計。
import fs from 'node:fs';
import path from 'node:path';
import {
  loadConfig, collectFiles, parseArgs, fail,
  extractHeadings, extractLinks, githubSlug, CJK_RE,
} from './lib.mjs';

const EXTERNAL_RE = /^(https?:|mailto:|tel:|data:)/i;
const MD_TARGET_RE = /\.(md|mdx|markdown)$/i;

function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

try {
  const { root, configFile, include } = parseArgs();
  const scoped = include.length > 0;
  const config = loadConfig(root, configFile);
  const { included } = collectFiles(root, config, { include });
  const includedSet = new Set(included);
  const readText = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
  const headingCache = new Map();
  const slugsOf = (rel) => {
    if (!headingCache.has(rel)) headingCache.set(rel, extractHeadings(readText(rel)));
    return headingCache.get(rel);
  };

  const dead_links = [];
  const bad_anchors = [];
  const graph = new Map(included.map((p) => [p, new Set()]));
  let total_links = 0;

  for (const rel of included) {
    for (const { target, line } of extractLinks(readText(rel))) {
      if (EXTERNAL_RE.test(target)) continue;
      total_links += 1;
      const hashIndex = target.indexOf('#');
      const rawPath = safeDecode(hashIndex === -1 ? target : target.slice(0, hashIndex));
      const anchor = hashIndex === -1 ? null : safeDecode(target.slice(hashIndex + 1));
      const resolved =
        rawPath === ''
          ? rel // 純錨點連結指向自身
          : rawPath.startsWith('/')
            ? path.posix.normalize(rawPath.slice(1))
            : path.posix.normalize(path.posix.join(path.posix.dirname(rel), rawPath));
      if (!fs.existsSync(path.join(root, resolved))) {
        dead_links.push({ file: rel, line, target });
        continue;
      }
      if (includedSet.has(resolved)) graph.get(rel).add(resolved);
      if (anchor && MD_TARGET_RE.test(resolved) && includedSet.has(resolved)) {
        if (!slugsOf(resolved).has(githubSlug(anchor))) {
          bad_anchors.push({ file: rel, line, target, anchor, cjk_uncertain: CJK_RE.test(anchor) });
        }
      }
    }
  }

  const roots = [config.index_file, ...config.entry_files].filter((p) => p && includedSet.has(p));
  const reachable = new Set(roots);
  const queue = [...roots];
  while (queue.length) {
    for (const next of graph.get(queue.shift()) ?? []) {
      if (!reachable.has(next)) {
        reachable.add(next);
        queue.push(next);
      }
    }
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        scope: scoped ? include : null,
        ...(scoped
          ? { note: 'scope 限定:孤兒/可達率不計(可達性是全量索引概念),只採計死鏈與壞錨' }
          : {}),
        total_links,
        dead_links,
        bad_anchors,
        orphans: !scoped && config.index_file ? included.filter((p) => !reachable.has(p)) : [],
        reachable_ratio:
          !scoped && config.index_file && included.length > 0
            ? Number((reachable.size / included.length).toFixed(4))
            : null,
      },
      null,
      2
    )}\n`
  );
} catch (err) {
  fail(err.message);
}

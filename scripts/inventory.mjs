#!/usr/bin/env node
// inventory.mjs — 文件清單＋CJK-aware token 量測＋固定成本/污染面
// 用法: node inventory.mjs [--root <repo>]；JSON → stdout。
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, collectFiles, estimateTokens, resolveRoot, fail } from './lib.mjs';

function fileType(p, config) {
  if (config.entry_files.includes(p)) return 'entry';
  if (p === config.index_file) return 'index';
  return 'doc';
}

function measure(rootDir, relPath, config) {
  const text = fs.readFileSync(path.join(rootDir, relPath), 'utf8');
  return {
    path: relPath,
    bytes: Buffer.byteLength(text),
    tokens_est: estimateTokens(text),
    type: fileType(relPath, config),
  };
}

try {
  const root = resolveRoot();
  const config = loadConfig(root);
  const { included, excluded } = collectFiles(root, config);
  const files = included.map((p) => measure(root, p, config));
  const excludedFiles = excluded.map((p) => measure(root, p, config));
  const totalTokens = files.reduce((s, f) => s + f.tokens_est, 0);
  const excludedTokens = excludedFiles.reduce((s, f) => s + f.tokens_est, 0);
  process.stdout.write(
    `${JSON.stringify(
      {
        files,
        totals: {
          files: files.length,
          bytes: files.reduce((s, f) => s + f.bytes, 0),
          tokens_est: totalTokens,
        },
        entry_cost: {
          files: config.entry_files,
          tokens_est: files.filter((f) => f.type === 'entry').reduce((s, f) => s + f.tokens_est, 0),
        },
        pollution: {
          excluded_files: excludedFiles.map((f) => ({ path: f.path, tokens_est: f.tokens_est })),
          excluded_tokens: excludedTokens,
          ratio:
            totalTokens + excludedTokens === 0
              ? 0
              : Number((excludedTokens / (totalTokens + excludedTokens)).toFixed(4)),
        },
      },
      null,
      2
    )}\n`
  );
} catch (err) {
  fail(err.message);
}

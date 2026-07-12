// scripts/lib.mjs — docgrad 量測腳本共用模組（零依賴，Node ≥18）
import fs from 'node:fs';
import path from 'node:path';

export const CONFIG_FILENAME = '.docgrad.yml';

// --- YAML 子集解析 ---------------------------------------------------------
// 只支援 .docgrad.yml 需要的兩層結構：頂層 scalar / inline list / block list /
// 一層 nested map。不是通用 YAML parser。

function stripComment(s) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
    else if (c === '#' && !inSingle && !inDouble && (i === 0 || s[i - 1] === ' ' || s[i - 1] === '\t')) {
      return s.slice(0, i).trimEnd();
    }
  }
  return s;
}

function parseScalar(v) {
  v = v.trim();
  if (v === '' || v === 'null' || v === '~') return null;
  if ((v[0] === '"' && v.at(-1) === '"') || (v[0] === "'" && v.at(-1) === "'")) return v.slice(1, -1);
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

function parseInlineList(v) {
  const inner = v.slice(1, -1).trim();
  return inner === '' ? [] : inner.split(',').map((s) => parseScalar(s));
}

export function parseYamlSubset(text) {
  const root = {};
  let nestedKey = null; // 目前展開中的頂層 key（nested map 或 block list）
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const indent = raw.match(/^ */)[0].length;
    const content = stripComment(raw.trim()).trim();
    if (!content) continue;
    if (indent === 0) {
      const m = content.match(/^([^:]+):\s*(.*)$/);
      if (!m) throw new Error(`無法解析設定行: ${raw}`);
      const key = m[1].trim();
      const rest = m[2].trim();
      if (rest === '') {
        nestedKey = key;
        root[key] = {}; // 遇到 "- " 時轉成 array
      } else {
        nestedKey = null;
        root[key] = rest.startsWith('[') ? parseInlineList(rest) : parseScalar(rest);
      }
    } else {
      if (nestedKey === null) throw new Error(`縮排層級錯誤: ${raw}`);
      if (content.startsWith('- ')) {
        if (!Array.isArray(root[nestedKey])) root[nestedKey] = [];
        root[nestedKey].push(parseScalar(content.slice(2)));
      } else {
        const m = content.match(/^([^:]+):\s*(.*)$/);
        if (!m) throw new Error(`無法解析設定行: ${raw}`);
        const rest = m[2].trim();
        root[nestedKey][m[1].trim()] = rest.startsWith('[') ? parseInlineList(rest) : parseScalar(rest);
      }
    }
  }
  return root;
}

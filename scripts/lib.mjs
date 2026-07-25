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

// --- 設定載入 --------------------------------------------------------------

const DEFAULTS = {
  docs_dirs: ['docs/'],
  entry_files: [],
  index_file: null,
  exclude: [],
  src_dirs: [],
  freshness: { convention: 'none', field: null, stale_after_days: 60 },
  coverage: { drift_after_days: 30, min_commits: 3 },
  targets: { completeness: 4, correctness: 4, freshness: 4, linkage: 4, consistency: 4 },
  correctness_sample: 8,
  scenario: null,
  language: 'zh-TW',
};

// configFile 可外置（--config）：文件源本身不能落檔時（匯出目錄、唯讀掛載）指定別處的設定檔。
export function loadConfig(rootDir, configFile = path.join(rootDir, CONFIG_FILENAME)) {
  if (!fs.existsSync(configFile)) {
    throw new Error(`找不到 ${configFile}（root: ${rootDir}），請先執行 /docgrad init`);
  }
  const parsed = parseYamlSubset(fs.readFileSync(configFile, 'utf8'));
  const config = {
    ...DEFAULTS,
    ...parsed,
    freshness: { ...DEFAULTS.freshness, ...(parsed.freshness ?? {}) },
    coverage: { ...DEFAULTS.coverage, ...(parsed.coverage ?? {}) },
    targets: { ...DEFAULTS.targets, ...(parsed.targets ?? {}) },
  };
  if (['frontmatter', 'heading-line'].includes(config.freshness.convention) && !config.freshness.field) {
    throw new Error(`freshness.convention 為 ${config.freshness.convention} 時必須設定 freshness.field`);
  }
  return config;
}

// --- CLI 共用 ---------------------------------------------------------------

// 只認 --root、缺值退回 cwd 的舊介面；四支 CLI 一律改用 parseArgs()。
export function resolveRoot(argv = process.argv.slice(2)) {
  const i = argv.indexOf('--root');
  return path.resolve(i >= 0 && argv[i + 1] ? argv[i + 1] : process.cwd());
}

function takeValue(argv, i, flag) {
  const v = argv[i + 1];
  if (v === undefined || v.startsWith('--')) throw new Error(`${flag} 需要一個參數值`);
  return v;
}

// 四支腳本共用旗標：
//   --root <dir>      目標 repo 根（預設 cwd）
//   --config <file>   設定檔路徑（預設 <root>/.docgrad.yml）
//   --include <glob>  限定範圍（scoped audit），可重複或逗號分隔；不給＝全量
export function parseArgs(argv = process.argv.slice(2)) {
  let rootArg = null;
  let configArg = null;
  const include = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root') rootArg = takeValue(argv, i++, '--root');
    else if (a === '--config') configArg = takeValue(argv, i++, '--config');
    else if (a === '--include') {
      include.push(...takeValue(argv, i++, '--include').split(',').map((s) => s.trim()).filter(Boolean));
    } else throw new Error(`未知參數 ${a}（支援 --root / --config / --include）`);
  }
  const root = path.resolve(rootArg ?? process.cwd());
  return {
    root,
    configFile: configArg ? path.resolve(configArg) : path.join(root, CONFIG_FILENAME),
    include,
  };
}

export function fail(message) {
  process.stderr.write(`docgrad: ${message}\n`);
  process.exit(1);
}

// --- 檔案盤點 ----------------------------------------------------------------

const MD_EXTENSIONS = new Set(['.md', '.mdx', '.markdown']);
const ALWAYS_SKIP_DIRS = new Set(['node_modules', '.git']);

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function walkMarkdown(absDir, rootDir, out) {
  for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (ALWAYS_SKIP_DIRS.has(entry.name)) continue;
      walkMarkdown(path.join(absDir, entry.name), rootDir, out);
    } else if (MD_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      out.push(toPosix(path.relative(rootDir, path.join(absDir, entry.name))));
    }
  }
}

// --- scope 過濾（--include）--------------------------------------------------
// 支援 `**`（跨層）、`*`（同層）、`?`（單字元）；不含這些字元的 pattern 視為路徑前綴
// （`docs/infra` ⇒ 該檔本身與其下所有檔案）。scope 為空＝全量，不過濾。

const GLOB_CHARS = /[*?]/;

export function globToRegExp(pattern) {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        i += 1;
        if (pattern[i + 1] === '/') {
          i += 1;
          re += '(?:.*/)?'; // a/**/b 也要匹配 a/b
        } else {
          re += '.*';
        }
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${re}$`);
}

export function matchesScope(relPath, include = []) {
  if (include.length === 0) return true;
  return include.some((raw) => {
    const p = raw.replace(/^\.\//, '');
    if (GLOB_CHARS.test(p)) return globToRegExp(p).test(relPath);
    const dir = p.endsWith('/') ? p : `${p}/`;
    return relPath === p || relPath.startsWith(dir);
  });
}

export function collectFiles(rootDir, config, { include = [] } = {}) {
  const all = [];
  for (const dir of config.docs_dirs) {
    const abs = path.join(rootDir, dir);
    if (fs.existsSync(abs)) walkMarkdown(abs, rootDir, all);
  }
  for (const f of config.entry_files) {
    if (fs.existsSync(path.join(rootDir, f)) && !all.includes(f)) all.push(f);
  }
  const isExcluded = (p) =>
    config.exclude.some((ex) => p === ex || p.startsWith(ex.endsWith('/') ? ex : `${ex}/`));
  const inScope = (p) => matchesScope(p, include);
  return {
    included: all.filter((p) => !isExcluded(p) && inScope(p)).sort(),
    excluded: all.filter((p) => isExcluded(p) && inScope(p)).sort(),
  };
}

// --- token 估算（啟發式係數：CJK 每字 1.1、其餘每 4 字元 1）------------------

export const CJK_TOKENS_PER_CHAR = 1.1;
export const NON_CJK_CHARS_PER_TOKEN = 4;
export const CJK_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/;
const CJK_RE_G = new RegExp(CJK_RE.source, 'g');

export function estimateTokens(text) {
  const cjk = (text.match(CJK_RE_G) || []).length;
  return Math.round(cjk * CJK_TOKENS_PER_CHAR + (text.length - cjk) / NON_CJK_CHARS_PER_TOKEN);
}

// --- markdown 解析 ------------------------------------------------------------

export function githubSlug(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s+/g, '-');
}

export function extractHeadings(text) {
  const counts = new Map();
  const slugs = new Set();
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
    if (!m) continue;
    const base = githubSlug(m[1].replace(/[*_`]/g, ''));
    const n = counts.get(base) ?? 0;
    counts.set(base, n + 1);
    slugs.add(n === 0 ? base : `${base}-${n}`);
  }
  return slugs;
}

const LINK_RE = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

export function extractLinks(text) {
  const links = [];
  let inFence = false;
  text.split(/\r?\n/).forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    for (const m of line.matchAll(LINK_RE)) links.push({ target: m[1], line: i + 1 });
  });
  return links;
}

// --- 新鮮度日期抽取 --------------------------------------------------------

const DATE_RE = /(\d{4}-\d{2}-\d{2})/;

export function extractClaimedDate(text, freshness) {
  if (freshness.convention === 'frontmatter') {
    const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fm) return null;
    const line = fm[1].split(/\r?\n/).find((l) => l.trimStart().startsWith(`${freshness.field}:`));
    const m = line && line.match(DATE_RE);
    return m ? m[1] : null;
  }
  if (freshness.convention === 'heading-line') {
    for (const line of text.split(/\r?\n/).slice(0, 30)) {
      if (line.includes(freshness.field)) {
        const m = line.match(DATE_RE);
        if (m) return m[1];
      }
    }
  }
  return null;
}

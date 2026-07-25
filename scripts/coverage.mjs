#!/usr/bin/env node
// coverage.mjs — 覆蓋漂移偵測:用 git 機械偵測「code 動了但 docs 沒跟上」。
// 用法: node coverage.mjs [--root <repo>] [--config <file>]；JSON → stdout。
// 以 src_dirs 下第一層子目錄為「區域」,對照 docs 是否提及＋比對 git 時戳。
// --include 對本腳本刻意不生效:docs 端一縮,範圍外的提及會被誤判成 undocumented。
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadConfig, collectFiles, parseArgs, fail } from './lib.mjs';

const SKIP_DIRS = new Set(['node_modules', '.git']);

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// area 提及偵測:能匹配 src/auth、src/auth/login.js；不匹配 src/authx、mysrc/auth。
function mentionRegex(area) {
  return new RegExp('(?<![\\w./-])' + escapeRegex(area) + '(?![\\w-])');
}

// git 最後一次 commit 的完整 ISO 時戳(%cI)；失敗或空 → null。
function gitLastCommit(root, rel) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cI', '--', rel], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

// 自 doc 最後更新「之後」起,area 有多少次 commit；失敗 → null。
// git --since 對同秒時戳為含端點(inclusive):同一 commit 同時改到 doc 與 code
// 不算漂移,故以 doc 時戳 +1 秒為界,排除該 commit 本身。
function gitCountSince(root, docIso, rel) {
  const sinceIso = new Date(Date.parse(docIso) + 1000).toISOString();
  try {
    const out = execFileSync('git', ['rev-list', '--count', 'HEAD', `--since=${sinceIso}`, '--', rel], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return out === '' ? null : Number(out);
  } catch {
    return null;
  }
}

// 遞迴數 area 內檔案（跳過 node_modules/.git）。
function countFiles(absDir) {
  let n = 0;
  for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      n += countFiles(path.join(absDir, entry.name));
    } else {
      n += 1;
    }
  }
  return n;
}

const dayDiff = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000);
const toDate = (iso) => (iso ? iso.slice(0, 10) : null);

try {
  const { root, configFile, include } = parseArgs();
  const config = loadConfig(root, configFile);
  const scopeNote = include.length
    ? { scope: include, note: 'scope 不套用於覆蓋漂移:docs 端一縮會把範圍外的提及誤判成 undocumented,故一律全量比對' }
    : { scope: null };

  // src_dirs 未設定 → 降級:不量測,交回 LLM 純對照。
  if (config.src_dirs.length === 0) {
    process.stdout.write(
      `${JSON.stringify(
        {
          ...scopeNote,
          src_dirs: [],
          areas: [],
          note: [scopeNote.note, 'src_dirs 未設定,無法量測覆蓋漂移'].filter(Boolean).join('；'),
        },
        null,
        2
      )}\n`
    );
    process.exit(0);
  }

  const { included } = collectFiles(root, config);
  const docTexts = included.map((rel) => ({ rel, text: fs.readFileSync(path.join(root, rel), 'utf8') }));

  // 區域枚舉:每個 src_dir 的第一層子目錄為 area;散檔只計入 loose_files。
  const loose_files = {};
  const areaEntries = [];
  for (const srcDir of config.src_dirs) {
    const absSrc = path.join(root, srcDir);
    const base = srcDir.replace(/\/+$/, ''); // 去尾斜線,POSIX area 前綴
    let loose = 0;
    if (fs.existsSync(absSrc)) {
      for (const entry of fs.readdirSync(absSrc, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue; // 跳過隱藏目錄/檔
        if (entry.isDirectory()) {
          if (SKIP_DIRS.has(entry.name)) continue;
          areaEntries.push({ area: `${base}/${entry.name}`, absDir: path.join(absSrc, entry.name) });
        } else {
          loose += 1;
        }
      }
    }
    loose_files[srcDir] = loose;
  }

  areaEntries.sort((a, b) => (a.area < b.area ? -1 : a.area > b.area ? 1 : 0));

  const areas = areaEntries.map(({ area, absDir }) => {
    const code_files = countFiles(absDir);
    const last_code_iso = gitLastCommit(root, area);

    const re = mentionRegex(area);
    const mentioned_by = docTexts.filter((d) => re.test(d.text)).map((d) => d.rel);

    const docIsos = mentioned_by.map((rel) => gitLastCommit(root, rel)).filter((x) => x);
    const last_doc_iso = docIsos.length ? docIsos.sort().at(-1) : null;

    const commits_since_doc = last_doc_iso ? gitCountSince(root, last_doc_iso, area) : null;
    const drift_days = last_code_iso && last_doc_iso ? dayDiff(last_code_iso, last_doc_iso) : null;

    let status;
    if (last_code_iso === null) {
      status = 'no_git';
    } else if (mentioned_by.length === 0) {
      status = 'undocumented';
    } else if (
      drift_days !== null &&
      drift_days > config.coverage.drift_after_days &&
      commits_since_doc !== null &&
      commits_since_doc >= config.coverage.min_commits
    ) {
      status = 'drifted';
    } else {
      status = 'covered';
    }

    return {
      area,
      code_files,
      last_code_commit: toDate(last_code_iso),
      mentioned_by,
      last_doc_commit: toDate(last_doc_iso),
      commits_since_doc,
      drift_days,
      status,
    };
  });

  const undocumented = areas.filter((a) => a.status === 'undocumented').map((a) => a.area).sort();
  const drifted = areas.filter((a) => a.status === 'drifted').map((a) => a.area).sort();

  process.stdout.write(
    `${JSON.stringify(
      {
        ...scopeNote,
        src_dirs: config.src_dirs,
        thresholds: {
          drift_after_days: config.coverage.drift_after_days,
          min_commits: config.coverage.min_commits,
        },
        loose_files,
        areas,
        undocumented,
        drifted,
      },
      null,
      2
    )}\n`
  );
} catch (err) {
  fail(err.message);
}

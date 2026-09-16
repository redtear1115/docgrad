#!/usr/bin/env node
// coverage.mjs — coverage drift detection: mechanically detects "code moved but docs didn't keep up" via git.
// Usage: node coverage.mjs [--root <repo>] [--config <file>] [--exclude-ledger <path>] [--locate-ledger <path>]; JSON -> stdout.
// Treats each first-level subdirectory under src_dirs as an "area", checks whether docs mention it
// and compares git timestamps.
// --include is deliberately a no-op for this script: narrowing the docs side would misjudge
// mentions outside scope as undocumented.
// --exclude-ledger (#54) is also a no-op here: only inventory.mjs draws claim candidates from a
// claim ledger; coverage drift has nothing to do with the claim ledger, so accepting and ignoring
// the flag (like --include above) keeps it usable as a truly shared flag across all five scripts.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadConfig, collectFiles, parseArgs, fail, docgradMeta, evaluateMeasure, resolveInRoot } from './lib.mjs';

const SKIP_DIRS = new Set(['node_modules', '.git']);

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Area mention detection: matches src/auth, src/auth/login.js; does not match src/authx, mysrc/auth.
function mentionRegex(area) {
  return new RegExp('(?<![\\w./-])' + escapeRegex(area) + '(?![\\w-])');
}

// The full ISO timestamp (%cI) of git's last commit; failure or empty -> null.
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

// How many commits have touched the area **since** the doc's last update; failure -> null.
// git --since is inclusive of the exact same second: if a single commit touches both the doc and
// the code, that doesn't count as drift, so the boundary is set to the doc's timestamp + 1 second,
// excluding that commit itself.
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

// Recursively counts files inside an area (skipping node_modules/.git).
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
  const { root, configFile, include, excludeLedger, locateLedger } = parseArgs();
  const config = loadConfig(root, configFile);
  const scopeNoteText = include.length
    ? 'scope does not apply to coverage drift: narrowing the docs side would misjudge mentions outside scope as undocumented, so this always compares the full corpus'
    : null;
  const locateLedgerNoteText = locateLedger
    ? '--locate-ledger is a no-op for this script: only inventory.mjs can locate a ledgered claim in the corpus, and coverage drift has nothing to do with it'
    : null;
  const excludeLedgerNoteText = excludeLedger
    ? '--exclude-ledger is a no-op for this script: only inventory.mjs draws claim candidates from a claim ledger, and coverage drift has nothing to do with it'
    : null;
  const combinedNoteText = [scopeNoteText, excludeLedgerNoteText, locateLedgerNoteText].filter(Boolean).join('; ') || null;
  // Key order follows inventory.mjs — scope, then docgrad, then everything else — so a reader
  // comparing two scripts' JSON finds the same fingerprint in the same place.
  //
  // `scope` is always null here, even when --include was passed, because this script always
  // compares the full corpus (the note above says why). Echoing the requested scope would
  // contradict the note in the same object, and would break the one property that makes the five
  // scripts' headers comparable field by field: `scope` must mean "what this output actually
  // covers". retrieval.mjs, which also ignores --include, already reports null.
  const head = { scope: null, docgrad: docgradMeta(undefined, config) };

  // src_dirs unset -> degrade: don't measure, hand it back to the LLM for a plain comparison.
  if (config.src_dirs.length === 0) {
    const unsetMeasure = [
      evaluateMeasure('undocumented_dirs', { value: null, note: 'src_dirs is unset' }, config, { scoped: false }),
      evaluateMeasure('drifted_dirs', { value: null, note: 'src_dirs is unset' }, config, { scoped: false }),
    ];
    process.stdout.write(
      `${JSON.stringify(
        {
          ...head,
          measure: unsetMeasure,
          src_dirs: [],
          areas: [],
          note: [scopeNoteText, excludeLedgerNoteText, locateLedgerNoteText, 'src_dirs is unset, coverage drift cannot be measured']
            .filter(Boolean)
            .join('; '),
        },
        null,
        2
      )}\n`
    );
    process.exit(0);
  }

  const { included } = collectFiles(root, config);
  const docTexts = included.map((rel) => ({ rel, text: fs.readFileSync(path.join(root, rel), 'utf8') }));

  // Area enumeration: each src_dir's first-level subdirectories are areas; loose files just count toward loose_files.
  const loose_files = {};
  const areaEntries = [];
  for (const srcDir of config.src_dirs) {
    // #57: a src_dir that leaves the root — `../` or a symlinked directory — would otherwise be
    // enumerated here and have every file under it counted. countFiles below needs no check of its
    // own: it recurses only into Dirent.isDirectory(), which is false for a symlink, and it reads
    // nothing.
    const absSrc = resolveInRoot(root, srcDir, 'src_dirs');
    const base = srcDir.replace(/\/+$/, ''); // strip trailing slash, POSIX area prefix
    let loose = 0;
    if (fs.existsSync(absSrc)) {
      for (const entry of fs.readdirSync(absSrc, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue; // skip hidden dirs/files
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

  // Not scope-sensitive — --include is a no-op for this whole script (see the note above) — so
  // { scoped: false } always, and neither row is ever nulled by that path.
  const measure = [
    evaluateMeasure('undocumented_dirs', { value: undocumented.length }, config, { scoped: false }),
    evaluateMeasure('drifted_dirs', { value: drifted.length }, config, { scoped: false }),
  ];

  process.stdout.write(
    `${JSON.stringify(
      {
        ...head,
        ...(combinedNoteText ? { note: combinedNoteText } : {}),
        // Right after docgrad/note, same as the other three scripts that emit a measure array.
        measure,
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

#!/usr/bin/env node
// freshness.mjs — date-signal coverage + comparison against real git log dates
// Usage: node freshness.mjs [--root <repo>] [--config <file>] [--include <glob>] [--exclude-ledger <path>] [--locate-ledger <path>]; JSON -> stdout.
// env DOCGRAD_TODAY=YYYY-MM-DD can override "today" (for reproducible tests).
// --exclude-ledger (#54) is a no-op here: only inventory.mjs draws claim candidates from a claim
// ledger; freshness measures date signals, which the claim ledger has nothing to do with. Accepted
// and ignored, like --include on coverage.mjs, so it stays usable as a truly shared flag.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadConfig, collectFiles, parseArgs, fail, docgradMeta, evaluateMeasure, extractClaimedDate, parseFreshnessConventions } from './lib.mjs';

const MISMATCH_TOLERANCE_DAYS = 7;

// docgrad's own convergence commits don't count as "content was updated" — improve/loop's commit
// message always follows the pattern `docs(docgrad): round N convergence …` (see
// reference/improve.md step 5).
// Without this exclusion the process self-pollutes: round 1 backfills last_updated on 39 files,
// and that commit itself pushes those files' git dates to that same day, so round 2 sees 38 false
// mismatches (this actually happened on oikos on 2026-07-13).
const DOCGRAD_COMMIT_PREFIX = 'docs(docgrad):';

function gitDate(root, rel) {
  try {
    // Get the date of the most recent **non-docgrad** commit: fetch a handful at once and filter,
    // to avoid calling git one commit at a time.
    const out = execFileSync('git', ['log', '-20', '--format=%as%x00%s', '--', rel], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (!out) return null;
    const entries = out.split('\n').map((l) => {
      const [date, subject = ''] = l.split('\0');
      return { date, subject };
    });
    const authored = entries.find((e) => !e.subject.startsWith(DOCGRAD_COMMIT_PREFIX));
    // All 20 are docgrad commits (rare) -> fall back to the oldest one; better to be conservative than to return null.
    return (authored ?? entries.at(-1)).date || null;
  } catch {
    return null;
  }
}

// Discriminative power of the date signal: a too-high share of the same day is a sign of a large
// backfill — those files will age and go stale in lockstep, and no matter how high
// coverage_ratio is, it can't tell which document is genuinely unmaintained. Report-only; doesn't
// affect how coverage_ratio is judged.
function dateConcentration(claimedDates) {
  if (!claimedDates.length) return { max_same_day_ratio: 0, date: null, files: 0 };
  const counts = new Map();
  for (const d of claimedDates) counts.set(d, (counts.get(d) ?? 0) + 1);
  let top = null;
  for (const [date, n] of counts) if (!top || n > top[1] || (n === top[1] && date < top[0])) top = [date, n];
  return {
    max_same_day_ratio: Number((top[1] / claimedDates.length).toFixed(4)),
    date: top[0],
    files: top[1],
  };
}

const dayDiff = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000);

try {
  const { root, configFile, include, excludeLedger, locateLedger } = parseArgs();
  const config = loadConfig(root, configFile);
  const { included } = collectFiles(root, config, { include });
  const today = process.env.DOCGRAD_TODAY ?? new Date().toISOString().slice(0, 10);
  const locateLedgerNoteText = locateLedger
    ? '--locate-ledger is a no-op for this script: only inventory.mjs can locate a ledgered claim in the corpus, and freshness measures date signals, which the claim ledger has nothing to do with'
    : null;
  const excludeLedgerNoteText = excludeLedger
    ? '--exclude-ledger is a no-op for this script: only inventory.mjs draws claim candidates from a claim ledger, and freshness measures date signals, which the claim ledger has nothing to do with'
    : null;
  // Named, like the other three scripts' combinedNoteText — the shape a fourth shared flag
  // should extend rather than re-invent (docs/how-to.md §Extend the measurement scripts).
  const combinedNoteText = [excludeLedgerNoteText, locateLedgerNoteText].filter(Boolean).join('; ') || null;

  const results = included.map((rel) => {
    const claimed = extractClaimedDate(fs.readFileSync(path.join(root, rel), 'utf8'), config.freshness);
    const actual_git = gitDate(root, rel);
    const basis = actual_git ?? claimed;
    return { path: rel, claimed, actual_git, age_days: basis ? dayDiff(today, basis) : null };
  });

  const withSignal = results.filter((r) => r.claimed !== null);
  const staleList = results.filter((r) => r.age_days !== null && r.age_days > config.freshness.stale_after_days);
  const mismatchList = results
    .filter((r) => r.claimed && r.actual_git && dayDiff(r.actual_git, r.claimed) > MISMATCH_TOLERANCE_DAYS)
    .map((r) => ({
      path: r.path,
      claimed: r.claimed,
      actual_git: r.actual_git,
      drift_days: dayDiff(r.actual_git, r.claimed),
    }));

  const scoped = include.length > 0;

  // key_doc_age: key documents = entry_files ∪ index_file — a narrower subset than
  // rubric.md's "key documents" (which also includes each area's authoritative document; that
  // definition still governs the freshness ★ rating until a later epoch). Only docs present in
  // this run's corpus and carrying a non-null age_days count.
  const keyDocInput = (() => {
    if (scoped) return { value: null, note: 'key documents are a full-corpus concept' };
    const resultByPath = new Map(results.map((r) => [r.path, r]));
    const keyDocPaths = [...new Set([...config.entry_files, config.index_file].filter(Boolean))];
    const skipped = [];
    const ages = [];
    for (const p of keyDocPaths) {
      const r = resultByPath.get(p);
      if (!r) {
        skipped.push(`${p} not in corpus`);
        continue;
      }
      if (r.age_days === null) {
        skipped.push(`${p} has no date signal`);
        continue;
      }
      ages.push(r.age_days);
    }
    if (ages.length === 0) return { value: null, note: 'no dated key document' };
    return {
      value: Math.max(...ages),
      ...(skipped.length ? { note: skipped.join('; ') } : {}),
    };
  })();

  const measure = [
    evaluateMeasure(
      'date_coverage',
      results.length === 0
        ? { value: null, note: 'empty corpus' }
        : {
            value: Number((withSignal.length / results.length).toFixed(4)),
            raw: withSignal.length / results.length,
            numerator: withSignal.length,
            denominator: results.length,
          },
      config,
      { scoped }
    ),
    evaluateMeasure('key_doc_age', keyDocInput, config, { scoped }),
    // ★4's "only isolated mismatches" clause has no count, so it is not measured: this line
    // covers the drift-days-<30 half only, per measure.md.
    evaluateMeasure(
      'date_drift',
      { value: mismatchList.length ? Math.max(...mismatchList.map((m) => m.drift_days)) : 0 },
      config,
      { scoped }
    ),
  ];

  process.stdout.write(
    `${JSON.stringify(
      {
        scope: include.length ? include : null,
        // Same position as in inventory.mjs (right after scope) so two scripts' JSON can be
        // compared field by field: which tool version, which rubric, which corpus definition.
        docgrad: docgradMeta(undefined, config),
        ...(combinedNoteText ? { note: combinedNoteText } : {}),
        // The band-table verdicts (E2b-1), placed right after docgrad/note so all four scripts
        // that emit one stay comparable field by field.
        measure,
        // the actual convention list applied (a single value is still returned as an array;
        // with multiple values they're tried in order, see lib.mjs's extractClaimedDate).
        convention: parseFreshnessConventions(config.freshness.convention),
        files_total: results.length,
        files_with_signal: withSignal.length,
        coverage_ratio: results.length ? Number((withSignal.length / results.length).toFixed(4)) : 0,
        date_concentration: dateConcentration(withSignal.map((r) => r.claimed)),
        stale: staleList,
        mismatches: mismatchList,
      },
      null,
      2
    )}\n`
  );
} catch (err) {
  fail(err.message);
}

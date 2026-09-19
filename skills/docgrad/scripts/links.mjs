#!/usr/bin/env node
// links.mjs — dead links/bad anchors/stale ranges/orphans (reachability computed transitively from index_file + entry_files)
// Usage: node links.mjs [--root <repo>] [--config <file>] [--include <glob>] [--exclude-ledger <path>] [--locate-ledger <path>]; JSON -> stdout.
// When scope-limited, only dead links/bad anchors/stale ranges are emitted: orphans and reachable ratio are
// full-index concepts that go wrong once scope narrows, so they're never computed under scope.
// --exclude-ledger (#54) is a no-op here: only inventory.mjs draws claim candidates from a claim
// ledger; link checking has nothing to do with it. Accepted and ignored, like --include above.
import fs from 'node:fs';
import path from 'node:path';
import {
  loadConfig, collectFiles, parseArgs, fail, docgradMeta, evaluateMeasure, legacyTargetsNote,
  extractHeadings, extractLinks, githubSlug, CJK_RE, pathInsideRoot, resolveLinkTarget,
} from './lib.mjs';

const MD_TARGET_RE = /\.(md|mdx|markdown)$/i;

// `#L39-L86` is GitHub's line-range convention, not a heading reference (#74). `extractHeadings`
// can never match it, so every link written that way was reported as a broken anchor — a permanent
// linkage deduction for a convention that is not broken. It is now judged as nothing rather than as
// a heading: docgrad has no concept of a line range, and reporting a defect it cannot define is
// worse than staying quiet about it.
//
// It lives here rather than inside `githubSlug()` because that function answers "what slug does
// this text produce", which is a different question from "is this text a heading reference at
// all" — and because the same call site flags `cjk_uncertain`, which must keep applying to real
// anchors.
//
// **Verifying the range** (#85) is done, but not here and not as a heading check: a range that
// points past the end of its target file is a stale range, counted in its own `stale_ranges` bucket
// and its own `stale_range_ratio` row. It is not a broken anchor — the fix is to update the numbers,
// not to find the heading — and folding it into `bad_anchors` would cap it at WATCH, because
// `bad_anchors` only ever holds `dead_link_ratio` off OK. See `lineRangeOf` below.
//
// The cost of the skip above: a mistyped heading anchor that happens to look like `L12` stops being
// reported as a bad anchor. The shape is narrow — a leading capital `L`, digits only after it — and
// `#l39-l86` in lower case is still judged, because that is not the convention either.
const LINE_RANGE_ANCHOR_RE = /^L\d+(-L\d+)?$/;

// #85. A range is stale when any line it names is past the end of the target file: `L70-L120` into a
// 90-line file points the reader at thirty lines that are gone, which is exactly how documentation and
// code drift apart. The rule is the same for a single line: `#L7` in a five-line file is stale. A line
// that exists but is blank is **not** stale — blank lines are legitimate, and nothing mechanical can
// tell a deliberate one from a drifted one. `L0` names no line at all and is stale too. A reversed
// range (`L20-L10`) is read by its larger end, the same way GitHub highlights it.
function lineRangeOf(anchor) {
  const m = /^L(\d+)(?:-L(\d+))?$/.exec(anchor);
  if (!m) return null;
  const start = Number(m[1]);
  const end = m[2] === undefined ? start : Number(m[2]);
  return { first: Math.min(start, end), last: Math.max(start, end) };
}

const RANGE_TARGET_NOT_A_FILE = 'not-a-file'; // a directory: no lines to count, not judged
const RANGE_TARGET_UNREADABLE = 'unreadable'; // permissions, a race: not judged, and reported

// Lines as GitHub numbers them: a trailing newline ends the last line rather than opening an empty
// one, and an empty file has none. Split on `\n` alone, so a CRLF file counts the same.
function countLines(absPath) {
  const text = fs.readFileSync(absPath, 'utf8');
  if (text === '') return 0;
  const parts = text.split('\n').length;
  return text.endsWith('\n') ? parts - 1 : parts;
}


// --- out-of-root link targets (#57) -------------------------------------------------
//
// A link target is **document**-derived, not config-derived, so unlike a configured path it is not
// a hard error: an accidental `../../` link is common, and exiting 1 on one would be a corpus-wide
// regression. It is classified into its own bucket instead, without its existence ever being the
// thing that decides the classification.
//
// Not stat'ing it is the whole fix. Before this, an out-of-root target was passed to existsSync and
// then reported as a dead link when absent and silently dropped when present — an existence oracle
// over the auditor's filesystem, repeatable at will from a repo docgrad was merely grading. The
// oracle **is** that present/absent difference, so relabelling only the present case would leave it
// open. Every branch below is therefore chosen so that nothing outside the root is ever consulted.
//
//   1. A lexically escaping target (`../…`, or `/…` normalising above the root) is classified with
//      **no filesystem call at all** — the strongest form of "never stat'ed", and the shape the
//      fixtures pin down.
//   2. A lexically in-root target is resolved through symlinks (realpath) before it is trusted.
//      A symlinked directory, or a symlinked file, whose target leaves the root lands in the same
//      bucket; the realpath of a symlinked *directory* resolves whether or not the file under it
//      exists, so this branch too cannot be turned into an oracle.
//   3. The one asymmetric case left is a **dangling** symlink: realpath cannot resolve it, so
//      containment climbs past it to its (contained) parent and would answer "inside", after which
//      the dead/alive split would again say whether the link's target exists. So an entry that is a
//      symlink and does not resolve is put in the out-of-root bucket too. The cost is that a
//      dangling *in-root* symlink is reported as out-of-root rather than dead — a rare case, and a
//      broken file rather than a broken link. Fail closed.
//
// Branches 2 and 3 do make filesystem calls, on a path the repo named inside its own tree — but
// each of them answers the same way whether or not anything exists outside the root, which is the
// property that closes the oracle. Branch 1 makes none at all, and everything that reaches
// existsSync below resolves inside the root.
function escapesLexically(resolved) {
  return resolved === '..' || resolved.startsWith('../');
}

function isUnresolvedSymlink(abs) {
  let st;
  try {
    st = fs.lstatSync(abs); // never follows the final component
  } catch {
    return false; // not there at all: an ordinary in-root miss, i.e. a dead link
  }
  if (!st.isSymbolicLink()) return false;
  try {
    fs.realpathSync(abs);
    return false;
  } catch {
    return true;
  }
}

// Branch 3 applied to **every** component, not only the last one (#75).
//
// Checking the final component alone left the oracle open one level up: with `jump -> /outside/dir`
// and a link `jump/x.md`, `lstat` on `jump/x.md` throws because its *ancestor* does not resolve, and
// that throw is indistinguishable from "an ordinary in-root miss". `realpathDeepest()` then climbs
// past the unresolvable ancestor to the nearest resolvable parent — the root — and answers "inside",
// so the link was filed as dead when `/outside/dir` was absent and as out-of-root when it existed.
// One bit about the auditor's filesystem, per probe, from a repo docgrad is merely grading.
//
// **What closes it is that both answers now agree, not that anything stopped looking.** An
// unresolvable component lands out-of-root here; a resolvable one that points outside lands
// out-of-root at the `pathInsideRoot` check below. Either way the bucket no longer depends on what
// exists outside the root. Every path stat'ed is one the repo named inside its own tree, and the
// walk stops at the first component that fails, so a deep target costs no more than the depth at
// which it first goes wrong.
function hasUnresolvedSymlinkComponent(root, resolved) {
  let abs = root;
  for (const part of resolved.split('/')) {
    if (!part || part === '.') continue;
    abs = path.join(abs, part);
    if (isUnresolvedSymlink(abs)) return true;
  }
  return false;
}

function targetOutOfRoot(root, resolved) {
  if (escapesLexically(resolved)) return true;
  const abs = path.join(root, resolved);
  return !pathInsideRoot(root, abs) || hasUnresolvedSymlinkComponent(root, resolved);
}

try {
  const { root, configFile, include, excludeLedger, locateLedger } = parseArgs();
  const scoped = include.length > 0;
  const config = loadConfig(root, configFile);
  const locateLedgerNoteText = locateLedger
    ? '--locate-ledger is a no-op for this script: only inventory.mjs can locate a ledgered claim in the corpus, and link checking has nothing to do with it'
    : null;
  const excludeLedgerNoteText = excludeLedger
    ? '--exclude-ledger is a no-op for this script: only inventory.mjs draws claim candidates from a claim ledger, and link checking has nothing to do with it'
    : null;
  const { included } = collectFiles(root, config, { include });
  const includedSet = new Set(included);
  const readText = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
  const headingCache = new Map();
  const slugsOf = (rel) => {
    if (!headingCache.has(rel)) headingCache.set(rel, extractHeadings(readText(rel)));
    return headingCache.get(rel);
  };

  const dead_links = [];
  const out_of_root_links = [];
  const bad_anchors = [];
  const stale_ranges = [];
  let range_links = 0; // line-range links to an existing in-root file: stale_range_ratio's denominator
  let unreadable_range_links = 0; // ...whose target could not be read: not judged, and the row says so
  const lineCounts = new Map(); // a file linked by range several times is read once
  const graph = new Map(included.map((p) => [p, new Set()]));
  let total_links = 0;

  for (const rel of included) {
    for (const { target, line } of extractLinks(readText(rel))) {
      const link = resolveLinkTarget(root, rel, target);
      if (link === null) continue; // external scheme
      total_links += 1;
      const { resolved, anchor } = link; // a pure anchor link resolves to the document itself
      // Classified before anything is stat'ed, and never counted as dead: "this link leaves the
      // repository" and "this link points at nothing" are different facts, and the second one is
      // the one that would have to be answered by looking outside the root.
      if (resolved === null || targetOutOfRoot(root, resolved)) {
        out_of_root_links.push({ file: rel, line, target });
        continue;
      }
      if (!fs.existsSync(path.join(root, resolved))) {
        dead_links.push({ file: rel, line, target });
        continue;
      }
      if (includedSet.has(resolved)) graph.get(rel).add(resolved);
      // #85. Any file type, in the corpus or not — a range almost always points at source code, which
      // the heading check below never looks at. The target is already known to exist inside the root:
      // the out-of-root and dead-link checks above have `continue`d past everything else. A directory
      // has no lines to count and is left alone.
      const range = anchor ? lineRangeOf(anchor) : null;
      if (range) {
        const abs = path.join(root, resolved);
        if (!lineCounts.has(resolved)) {
          // An unreadable target is not judged — but it is counted and said, never folded into the
          // quiet "no range links" reading. Before #85 this script never opened a non-markdown
          // target, so one unreadable file here must not take the whole links measure down with it.
          let count;
          try {
            count = fs.statSync(abs).isFile() ? countLines(abs) : RANGE_TARGET_NOT_A_FILE;
          } catch {
            count = RANGE_TARGET_UNREADABLE;
          }
          lineCounts.set(resolved, count);
        }
        const targetLines = lineCounts.get(resolved);
        if (targetLines === RANGE_TARGET_UNREADABLE) {
          unreadable_range_links += 1;
        } else if (targetLines !== RANGE_TARGET_NOT_A_FILE) {
          range_links += 1;
          if (range.first < 1 || range.last > targetLines) {
            stale_ranges.push({ file: rel, line, target, anchor, target_lines: targetLines });
          }
        }
      }
      if (anchor && !LINE_RANGE_ANCHOR_RE.test(anchor) && MD_TARGET_RE.test(resolved) && includedSet.has(resolved)) {
        if (!slugsOf(resolved).has(githubSlug(anchor))) {
          bad_anchors.push({ file: rel, line, target, anchor, cjk_uncertain: CJK_RE.test(anchor) });
        }
      }
    }
  }

  const scopeNoteText = scoped
    ? 'scope-limited: orphans/reachable ratio not computed (reachability is a full-index concept), only dead links, bad anchors and stale ranges are counted'
    : null;
  const combinedNoteText = [scopeNoteText, excludeLedgerNoteText, locateLedgerNoteText, legacyTargetsNote(config)].filter(Boolean).join('; ') || null;

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

  const orphans = !scoped && config.index_file ? included.filter((p) => !reachable.has(p)) : null;
  const reachableRatio =
    !scoped && config.index_file && included.length > 0
      ? Number((reachable.size / included.length).toFixed(4))
      : null;
  const indexPresentValue = scoped ? null : config.index_file && includedSet.has(config.index_file) ? 1 : 0;

  // measure: the band-table verdicts (E2b-1). Scoped rows (orphan_ratio, reachable_ratio,
  // index_present) are nulled by evaluateMeasure itself, given { scoped }; the note it defaults to
  // there is overridden with the same scope note already printed above, per measure.md.
  //
  // Each ratio row passes `raw` (the unrounded division) alongside the rounded `value` it reports:
  // rounding to four decimal places can land exactly on a boundary the true ratio never reached
  // (51/1019 rounds to 0.0500, reading as the ≤5% orphan_ratio line even though it is not), and the
  // verdict must be honest about which side of the line the real number is on.
  const measure = [
    evaluateMeasure(
      'dead_link_ratio',
      total_links === 0
        ? { value: 0, numerator: 0, denominator: 0, note: 'no links', extra: { bad_anchors: 0 } }
        : {
            value: Number((dead_links.length / total_links).toFixed(4)),
            raw: dead_links.length / total_links,
            numerator: dead_links.length,
            denominator: total_links,
            extra: { bad_anchors: bad_anchors.length },
          },
      config,
      { scoped }
    ),
    // #85. Denominator is line-range links only, not every link: a repo with two hundred links and
    // three ranges, one of them stale, has a third of its ranges wrong, and diluting that by the other
    // links would hide it. No range links at all is 0 with a note, the same way `dead_link_ratio`
    // treats no links.
    evaluateMeasure(
      'stale_range_ratio',
      (() => {
        const unreadNote = unreadable_range_links
          ? `${unreadable_range_links} line-range link(s) not judged: target unreadable`
          : null;
        if (range_links === 0) {
          return { value: 0, numerator: 0, denominator: 0, note: ['no line-range links', unreadNote].filter(Boolean).join('; ') };
        }
        return {
          value: Number((stale_ranges.length / range_links).toFixed(4)),
          raw: stale_ranges.length / range_links,
          numerator: stale_ranges.length,
          denominator: range_links,
          ...(unreadNote ? { note: unreadNote } : {}),
        };
      })(),
      config,
      { scoped }
    ),
    evaluateMeasure(
      'orphan_ratio',
      scoped
        ? { value: null, note: scopeNoteText }
        : orphans === null
          ? { value: null, note: 'orphans not computed (no index)' }
          : included.length === 0
            ? { value: null, note: 'empty corpus' }
            : {
                value: Number((orphans.length / included.length).toFixed(4)),
                raw: orphans.length / included.length,
                numerator: orphans.length,
                denominator: included.length,
              },
      config,
      { scoped }
    ),
    evaluateMeasure(
      'reachable_ratio',
      scoped
        ? { value: null, note: scopeNoteText }
        : { value: reachableRatio, raw: reachableRatio === null ? null : reachable.size / included.length },
      config,
      { scoped }
    ),
    evaluateMeasure(
      'index_present',
      scoped ? { value: null, note: scopeNoteText } : { value: indexPresentValue },
      config,
      { scoped }
    ),
  ];

  process.stdout.write(
    `${JSON.stringify(
      {
        scope: scoped ? include : null,
        // Same position as in inventory.mjs (right after scope) so two scripts' JSON can be
        // compared field by field. It matters most here: orphans changed shape in v1.5.0
        // ([] -> null when not computed, #39), and without this the output cannot say which
        // version of the tool wrote it.
        docgrad: docgradMeta(undefined, config),
        ...(combinedNoteText ? { note: combinedNoteText } : {}),
        // The band-table verdicts (E2b-1): number first, verdict next to it, naming the anchor
        // line that fired. Placed right after docgrad/note so the four scripts stay comparable
        // field by field; retrieval.mjs is report-only and carries no measure array.
        measure,
        total_links,
        dead_links,
        // #57: link targets that resolve outside the repository root. Reported and never fatal —
        // a document can carry an accidental `../../`, and the root is the boundary docgrad
        // measures within, not something a document is forbidden to mention. They are deliberately
        // **not** dead links: their existence was never looked up, and calling them dead would
        // assert the one fact this bucket exists in order not to go and find out.
        out_of_root_links,
        bad_anchors,
        // #85: each entry names the linking document and line, the range as written, and how many
        // lines the target actually has — enough to fix it without opening the target first.
        stale_ranges,
        // null when it can't be computed, never [] — an empty array is indistinguishable from
        // "computed, and there are genuinely none", and downstream reads that as "linkage is fine".
        // Same condition as reachable_ratio: under scope, or with no index_file, reachability has
        // no starting point, so orphanhood can't be judged at all.
        orphans,
        reachable_ratio: reachableRatio,
      },
      null,
      2
    )}\n`
  );
} catch (err) {
  fail(err.message);
}

#!/usr/bin/env node
// links.mjs — dead links/bad anchors/orphans (reachability computed transitively from index_file + entry_files)
// Usage: node links.mjs [--root <repo>] [--config <file>] [--include <glob>] [--exclude-ledger <path>] [--locate-ledger <path>]; JSON -> stdout.
// When scope-limited, only dead links/bad anchors are emitted: orphans and reachable ratio are
// full-index concepts that go wrong once scope narrows, so they're never computed under scope.
// --exclude-ledger (#54) is a no-op here: only inventory.mjs draws claim candidates from a claim
// ledger; link checking has nothing to do with it. Accepted and ignored, like --include above.
import fs from 'node:fs';
import path from 'node:path';
import {
  loadConfig, collectFiles, parseArgs, fail, docgradMeta, evaluateMeasure,
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
// **Verifying the range** — that it falls inside the target file's line count, so a range pointing
// past the end of a shrunken file is caught — is the strictly better answer, and is deliberately
// not this. It adds a measurement signal rather than removing a false one, and linkage becomes a
// CI gate under the v2 measure/judge split, which is where a check like that belongs.
//
// The cost of skipping: a mistyped heading anchor that happens to look like `L12` stops being
// reported. The shape is narrow — a leading capital `L`, digits only after it — and `#l39-l86` in
// lower case is still judged, because that is not the convention either.
const LINE_RANGE_ANCHOR_RE = /^L\d+(-L\d+)?$/;


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
      if (anchor && !LINE_RANGE_ANCHOR_RE.test(anchor) && MD_TARGET_RE.test(resolved) && includedSet.has(resolved)) {
        if (!slugsOf(resolved).has(githubSlug(anchor))) {
          bad_anchors.push({ file: rel, line, target, anchor, cjk_uncertain: CJK_RE.test(anchor) });
        }
      }
    }
  }

  const scopeNoteText = scoped
    ? 'scope-limited: orphans/reachable ratio not computed (reachability is a full-index concept), only dead links and bad anchors are counted'
    : null;
  const combinedNoteText = [scopeNoteText, excludeLedgerNoteText, locateLedgerNoteText].filter(Boolean).join('; ') || null;

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

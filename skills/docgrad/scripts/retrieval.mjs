#!/usr/bin/env node
// retrieval.mjs — traceability + marginal cost (a newer measurement script, report-only, see reference/measure.md §Token economy signals)
// Usage: node retrieval.mjs [--root <repo>] [--config <file>] [--include <glob, see note below for why it's a no-op>] [--exclude-ledger <path>] [--locate-ledger <path>]; JSON -> stdout.
// --exclude-ledger (#54) is also a no-op here, for an unrelated reason: only inventory.mjs draws
// claim candidates from a claim ledger, and retrieval measures traceability/marginal cost, not
// correctness. Accepted and ignored, like --include.
//
// Measures two things:
//   1. scenarios (a new .docgrad.yml field: a list of representative code paths) — for each one,
//      how many hops it takes to get from the code back to the spec that governs it
//      (depth_from_index), the marginal token cost (marginal_tokens), and whether there's a
//      reverse pointer (code_pointer).
//   2. areas/index_hotness — general-purpose signals available even without scenarios: whether
//      each src_dirs subdirectory has a code->doc pointer (code_pointer_ratio), and whether the
//      index/entry files churn more often than what they index (index_hotness).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadConfig, collectFiles, parseArgs, fail, docgradMeta, estimateTokens, extractLinks, extractCodeRefs, resolveLinkTarget, resolveInRoot, assertInsideRoot } from './lib.mjs';

const SKIP_DIRS = new Set(['node_modules', '.git']);
const CHURN_WINDOW_DAYS = 90;

function isGitRepo(root) {
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return true;
  } catch {
    return false;
  }
}

// Number of commits in the last N days; failure (not git / path not in history) -> null.
function commitsSince(root, rel, days) {
  try {
    const sinceIso = new Date(Date.now() - days * 86400000).toISOString();
    const out = execFileSync(
      'git',
      ['rev-list', '--count', 'HEAD', `--since=${sinceIso}`, '--', rel],
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim();
    return out === '' ? null : Number(out);
  } catch {
    return null;
  }
}

// #57: every entry this returns is read by hasCodePointer() through readTextSafe(), and the `else`
// branch pushes **any** non-directory dirent — Dirent.isDirectory() is false for a symlink, so a
// symlinked file inside an otherwise perfectly contained src_dir had its body read and leaked
// through the code_pointer boolean. Containment therefore applies to every entry, not only to the
// configured directory the walk started from. This is the code-side counterpart of a `notes.md`
// symlink in docs/, and it is the higher-value route of the two because it reads arbitrary
// non-markdown file bodies.
function walkFiles(rootDir, absDir, out) {
  let entries;
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const abs = assertInsideRoot(rootDir, path.join(absDir, entry.name), 'src_dirs', path.relative(rootDir, path.join(absDir, entry.name)));
    if (entry.isDirectory()) walkFiles(rootDir, abs, out);
    else out.push(abs);
  }
}

function readTextSafe(absPath) {
  try {
    const buf = fs.readFileSync(absPath);
    if (buf.includes(0)) return null; // skip binary (rough heuristic: contains a NUL byte)
    return buf.toString('utf8');
  } catch {
    return null;
  }
}

// The actual file listing under path (the file itself, or a directory walked recursively, skipping
// node_modules/.git); doesn't exist -> []. `field` names the config key in a containment error,
// because this serves both `scenarios` and the src_dirs-derived area list.
function resolveFiles(root, relPath, field) {
  const abs = resolveInRoot(root, relPath, field);
  if (!fs.existsSync(abs)) return [];
  const stat = fs.statSync(abs);
  if (stat.isFile()) return [relPath];
  const out = [];
  walkFiles(root, abs, out);
  return out.map((a) => path.relative(root, a).split(path.sep).join('/'));
}

// Bidirectional directory-prefix comparison: a is an ancestor directory of b, b is an ancestor of
// a, or they're exactly equal. Follows coverage.mjs's "contractx doesn't falsely match contract"
// principle — without a '/' boundary it doesn't count as a hit. When ref is an **ancestor** of
// query, there's one more condition: ref must be strictly deeper than the src_dir it belongs to.
// A catch-all mention like `apps/api/src` (referring to the whole app, when discussing gate
// coverage or deployment units) is not "the rule governing this file" — letting it in would turn
// the same doc into a fixed hit for every scenario/area (measured on kdan-workforce: WF24 hit 6
// times for any path).
function refCovers(ref, query, prefixes) {
  if (ref === query || ref.startsWith(`${query}/`)) return true;
  if (!query.startsWith(`${ref}/`)) return false;
  const owner = prefixes.find((p) => ref === p || ref.startsWith(`${p}/`));
  return owner === undefined ? ref.includes('/') : ref.length > owner.length;
}

// Whether any file under path contains a pointer back to docsDirs or a doc's basename (a code->doc reverse pointer).
function hasCodePointer(root, files, docsDirs, docBasenames) {
  const dirPrefixes = docsDirs.map((d) => d.replace(/\/+$/, ''));
  for (const rel of files) {
    const text = readTextSafe(path.join(root, rel));
    if (!text) continue;
    if (dirPrefixes.some((d) => d && text.includes(d))) return true;
    if (docBasenames.some((b) => text.includes(b))) return true;
  }
  return false;
}

try {
  const { root, configFile, include, excludeLedger, locateLedger } = parseArgs();
  const config = loadConfig(root, configFile);
  const srcPrefixes = config.src_dirs.map((d) => d.replace(/\/+$/, '')).filter(Boolean);
  const { included } = collectFiles(root, config);
  const gitOk = isGitRepo(root);
  const notes = [];
  if (include.length) {
    notes.push(
      '--include is a no-op for this script: traceability and marginal cost are full-index/retrieval concepts, and narrowing scope would drop the routing chain and cross-file anchors (same reasoning as coverage.mjs)'
    );
  }
  if (locateLedger) {
    notes.push(
      '--locate-ledger is a no-op for this script: only inventory.mjs can locate a ledgered claim in the corpus, and retrieval measures traceability/marginal cost, which the claim ledger has nothing to do with'
    );
  }
  if (excludeLedger) {
    notes.push(
      '--exclude-ledger is a no-op for this script: only inventory.mjs draws claim candidates from a claim ledger, and retrieval measures traceability/marginal cost, which the claim ledger has nothing to do with'
    );
  }

  const docTexts = included.map((rel) => ({ rel, text: fs.readFileSync(path.join(root, rel), 'utf8') }));
  const tokensOf = new Map(docTexts.map((d) => [d.rel, estimateTokens(d.text)]));
  const docBasenames = included.map((rel) => path.posix.basename(rel));
  // Each doc's code refs are extracted only once, reused by both the scenarios and areas sections.
  const docRefs = docTexts.map((d) => ({ rel: d.rel, refs: extractCodeRefs(d.text, config.src_dirs) }));

  // --- markdown link graph + BFS depth from index_file (shares links.mjs's resolveLinkTarget) --------
  const includedSet = new Set(included);
  const graph = new Map(included.map((p) => [p, new Set()]));
  for (const { rel, text } of docTexts) {
    for (const { target } of extractLinks(text)) {
      const link = resolveLinkTarget(root, rel, target);
      // external scheme, a pure `#fragment` (no edge to add), or a target the root cannot contain
      if (link === null || link.selfAnchor || link.resolved === null) continue;
      if (includedSet.has(link.resolved)) graph.get(rel).add(link.resolved);
    }
  }
  const depthFromIndex = new Map();
  const bfsParent = new Map();
  if (config.index_file && includedSet.has(config.index_file)) {
    depthFromIndex.set(config.index_file, 0);
    const queue = [config.index_file];
    while (queue.length) {
      const cur = queue.shift();
      for (const next of graph.get(cur) ?? []) {
        if (!depthFromIndex.has(next)) {
          depthFromIndex.set(next, depthFromIndex.get(cur) + 1);
          bfsParent.set(next, cur);
          queue.push(next);
        }
      }
    }
  } else {
    notes.push('index_file is unset or outside the included scope: depth_from_index/marginal_tokens treat the index chain as entirely unreachable');
  }
  // Shortest path from a doc back to the index (including the doc itself); unreachable (not
  // connected to the index chain) just counts itself.
  function chainToIndex(doc) {
    if (!depthFromIndex.has(doc)) return [doc];
    const chain = [];
    let cur = doc;
    while (cur !== undefined) {
      chain.push(cur);
      if (cur === config.index_file) break;
      cur = bfsParent.get(cur);
    }
    return chain;
  }

  // Entry files are the fixed term of marginal_tokens (always loaded); the same file must cost its
  // tokens only once. "The same file" means the same *file*, not the same spelling: deduplicating
  // on the config string alone counted `CLAUDE.md -> AGENTS.md` twice, so a symlinked pair inflated
  // every scenario's marginal_tokens by the whole entry file while inventory.mjs — which has
  // deduplicated on realpath since the alias fix — charged it once. Measured on a fixture: 348
  // tokens in entry_cost against 696 in marginal_tokens, exactly double. rubric.md defines
  // marginal_tokens as counting each file once, so the script was contradicting its own spec and
  // the other script's number at the same time (#51).
  // The name list stays a plain string set: it is used further down to strike entry files off a
  // chain, and chains are keyed by the config's own spellings, not by realpath.
  const entryFiles = [...new Set(config.entry_files)];
  const entryTokens = (() => {
    const seen = new Set();
    let sum = 0;
    for (const f of config.entry_files) {
      // collectFiles() has already rejected an out-of-root entry_files path before this runs, so
      // this is defence in depth rather than the enforcing check — but this loop reads files by
      // itself, and a second reader of the same field must not be the one place the rule is missing.
      const abs = resolveInRoot(root, f, 'entry_files');
      if (!fs.existsSync(abs)) continue;
      let key = abs;
      try {
        key = fs.realpathSync(abs);
      } catch {
        /* unreadable: fall back to the path, better to double-count than to drop a real cost */
      }
      if (seen.has(key)) continue;
      seen.add(key);
      sum += estimateTokens(fs.readFileSync(abs, 'utf8'));
    }
    return sum;
  })();

  // --- scenarios ---------------------------------------------------------------------
  const scenarioPaths = config.scenarios ?? [];
  const scenarios = scenarioPaths.map((scenarioPath) => {
    const files = resolveFiles(root, scenarioPath, 'scenarios');
    const churn_commits = gitOk ? commitsSince(root, scenarioPath, CHURN_WINDOW_DAYS) : null;

    const docs = [];
    for (const { rel, refs } of docRefs) {
      let hits = 0;
      for (const ref of refs) {
        if (ref.basenameOnly) {
          if (files.some((f) => path.posix.basename(f) === ref.path)) hits += 1;
        } else if (refCovers(ref.path, scenarioPath, srcPrefixes)) {
          hits += 1;
        }
      }
      if (hits > 0) {
        docs.push({
          doc: rel,
          hits,
          tokens_est: tokensOf.get(rel),
          depth_from_index: depthFromIndex.has(rel) ? depthFromIndex.get(rel) : null,
        });
      }
    }
    docs.sort((a, b) => b.hits - a.hits || a.doc.localeCompare(b.doc));

    const marginalSet = new Set();
    for (const d of docs) {
      for (const node of chainToIndex(d.doc)) marginalSet.add(node);
    }
    // Entry files are already in entryTokens, so any of them landing on a chain would be counted
    // a second time (rubric.md, Token economy: "each file counted once"). Two routes lead there:
    // (a) the entry file is a waypoint between the index and an anchoring doc; (b) the entry file
    // IS an anchoring doc the index cannot reach — chainToIndex then returns [doc], i.e. itself.
    for (const f of entryFiles) marginalSet.delete(f);
    const marginal_tokens =
      entryTokens + [...marginalSet].reduce((s, rel) => s + (tokensOf.get(rel) ?? 0), 0);
    const depths = docs.map((d) => d.depth_from_index).filter((d) => d !== null);

    return {
      path: scenarioPath,
      churn_commits,
      docs,
      fan_in: docs.length,
      marginal_tokens,
      max_depth: depths.length ? Math.max(...depths) : null,
      code_pointer: hasCodePointer(root, files, config.docs_dirs, docBasenames),
    };
  });
  if (scenarioPaths.length === 0) {
    notes.push('scenarios is unset (.docgrad.yml): marginal cost cannot be mechanically simulated (falls back to an LLM simulating a scenario), but areas and index_hotness are still given');
  }

  // --- areas (src_dirs first-level subdirectories; same definition as coverage.mjs) --------------------------------
  let areas = [];
  if (config.src_dirs.length === 0) {
    notes.push('src_dirs is unset, areas/code_pointer_ratio cannot be measured');
  } else {
    const areaList = [];
    for (const srcDir of config.src_dirs) {
      const absSrc = resolveInRoot(root, srcDir, 'src_dirs');
      const base = srcDir.replace(/\/+$/, '');
      if (!fs.existsSync(absSrc)) continue;
      for (const entry of fs.readdirSync(absSrc, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
        if (entry.isDirectory()) areaList.push(`${base}/${entry.name}`);
      }
    }
    areaList.sort();
    areas = areaList.map((area) => {
      const files = resolveFiles(root, area, 'src_dirs');
      let fan_in = 0;
      for (const { refs } of docRefs) {
        if (refs.some((ref) => !ref.basenameOnly && refCovers(ref.path, area, srcPrefixes))) fan_in += 1;
      }
      return { area, code_pointer: hasCodePointer(root, files, config.docs_dirs, docBasenames), fan_in };
    });
  }
  const code_pointer_ratio = areas.length
    ? Number((areas.filter((a) => a.code_pointer).length / areas.length).toFixed(4))
    : null;

  // --- index_hotness -------------------------------------------------------------------
  let index_hotness = null;
  if (gitOk) {
    const perDoc = included.map((rel) => ({ path: rel, commits_90d: commitsSince(root, rel, CHURN_WINDOW_DAYS) ?? 0 }));
    const counts = perDoc.map((d) => d.commits_90d).sort((a, b) => a - b);
    const n = counts.length;
    const median_commits_90d = n === 0 ? 0 : n % 2 ? counts[(n - 1) / 2] : (counts[n / 2 - 1] + counts[n / 2]) / 2;
    const indexCommits = config.index_file ? (commitsSince(root, config.index_file, CHURN_WINDOW_DAYS) ?? 0) : null;
    const entryEntries = config.entry_files.map((f) => ({ path: f, commits_90d: commitsSince(root, f, CHURN_WINDOW_DAYS) ?? 0 }));
    index_hotness = {
      index_file: config.index_file
        ? { path: config.index_file, commits_90d: indexCommits }
        : null,
      entry_files: entryEntries,
      median_commits_90d,
      ratio:
        indexCommits !== null && median_commits_90d > 0
          ? Number((indexCommits / median_commits_90d).toFixed(2))
          : null,
      top5: [...perDoc].sort((a, b) => b.commits_90d - a.commits_90d || a.path.localeCompare(b.path)).slice(0, 5),
    };
  } else {
    notes.push('no git, index_hotness cannot be measured');
  }

  const out = {
    scope: null,
    // Same position as in inventory.mjs (right after scope) so two scripts' JSON can be
    // compared field by field: which tool version, which rubric, which corpus definition.
    docgrad: docgradMeta(undefined, config),
    scenarios,
    areas,
    code_pointer_ratio,
    index_hotness,
  };
  if (notes.length) out.note = notes.join('; ');

  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
} catch (err) {
  fail(err.message);
}

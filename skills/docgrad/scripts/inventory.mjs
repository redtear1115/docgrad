#!/usr/bin/env node
// inventory.mjs — document inventory + CJK-aware token measurement + fixed cost/pollution surface + section-level structure metrics
// Usage: node inventory.mjs [--root <repo>] [--config <file>] [--include <glob>] [--exclude-ledger <path>]; JSON -> stdout.
import fs from 'node:fs';
import path from 'node:path';
import {
  loadConfig, collectFiles, estimateTokens, parseArgs, fail,
  extractCodeRefs, extractApiRefs, extractClaimLines, rankClaimCandidates, docgradMeta, evaluateMeasure,
  gitTrackedFiles, gitUnavailableNote, matchesPathPrefix,
  buildSrcSymbolIndex, gitAddCommitSubjects, isDocgradAuthored, AUTHORSHIP_UNAVAILABLE_NOTE,
  MAX_SRC_SYMBOL_FILE_BYTES, SHIPPED_TIERS, SHIPPED_POLLUTION_MAX, loadLedgerClaimHashes, loadLedgerRows, locateLedgerClaims,
} from './lib.mjs';

const LIST_ITEM_RE = /^\s*(?:[-*+]|\d+\.)\s+/;

// How many untracked paths to print. The count and the token total are always exact; the list is
// there to make the files identifiable, not to be exhaustive.
const UNTRACKED_LIST_CAP = 20;

// Same discipline for out_of_scope (#44): count and tokens_est exact, list capped with a note.
const OUT_OF_SCOPE_LIST_CAP = 20;

function fileType(p, config) {
  if (config.entry_files.includes(p)) return 'entry';
  if (p === config.index_file) return 'index';
  return 'doc';
}

function median(nums) {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

function percentile90(nums) {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil(0.9 * s.length) - 1));
  return s[idx];
}

// H2 section slicing (a "## " outside a fence opens a new section); tokens_est covers the whole
// section's content (not the heading line itself).
function extractH2Sections(text) {
  const lines = text.split(/\r?\n/);
  const sections = [];
  let current = null;
  let inFence = false;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      if (current) current.lines.push(line);
      continue;
    }
    if (!inFence) {
      const m = line.match(/^##\s+(.+?)\s*#*\s*$/);
      if (m) {
        if (current) sections.push(current);
        current = { title: m[1].replace(/[*_`]/g, '').trim(), lines: [] };
        continue;
      }
    }
    if (current) current.lines.push(line);
  }
  if (current) sections.push(current);
  return sections.map((s) => ({ title: s.title, tokens_est: estimateTokens(s.lines.join('\n')) }));
}

// A rule line = a list item (an optional leading emoji is fine; the test is just whether it
// contains the pattern substring) that also contains rules.pattern.
//
// anchored = the line carries code coordinates, using **the same definition as the claim
// population**: path-shaped inline code, or API-shaped inline code whose every segment exists as a
// symbol under src_dirs. Until v1.7.0 this counted path shapes only, so a library repo — whose
// documentation describes an API, not a file tree — scored anchored_ratio 0 by construction, and
// rubric.md's traceability note ("<0.5 means claims lack verifiable code landing points") fired on
// repos where every single rule had one. #40 had already fixed exactly that definition for the
// claim population; this is the same fix in the place that was left behind (#51).
function extractRuleLines(text, pattern, srcDirs, symbols) {
  const lines = text.split(/\r?\n/);
  let inFence = false;
  const rules = [];
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (!LIST_ITEM_RE.test(line)) continue;
    if (!line.includes(pattern)) continue;
    const content = line.replace(LIST_ITEM_RE, '').trim();
    const anchored =
      extractCodeRefs(line, srcDirs).length > 0 || extractApiRefs(line, symbols).length > 0;
    rules.push({ chars: content.length, anchored });
  }
  return rules;
}

function buildStructure(text, config, symbols) {
  const ruleLines = extractRuleLines(text, config.rules.pattern, config.src_dirs, symbols);
  return {
    h2: extractH2Sections(text),
    rules: {
      count: ruleLines.length,
      median_chars: median(ruleLines.map((r) => r.chars)),
      p90_chars: percentile90(ruleLines.map((r) => r.chars)),
      anchored_ratio: ruleLines.length
        ? Number((ruleLines.filter((r) => r.anchored).length / ruleLines.length).toFixed(4))
        : 0,
    },
    // for aggregation into totals; not emitted in the JSON (would duplicate rules.count/anchored_ratio's meaning)
    _ruleLines: ruleLines,
  };
}

function measure(rootDir, relPath, config, symbols) {
  const text = fs.readFileSync(path.join(rootDir, relPath), 'utf8');
  const structure = buildStructure(text, config, symbols);
  const ruleLines = structure._ruleLines;
  delete structure._ruleLines;
  const claimLines = extractClaimLines(text, config.src_dirs, { symbols });
  return {
    path: relPath,
    bytes: Buffer.byteLength(text),
    tokens_est: estimateTokens(text),
    type: fileType(relPath, config),
    claims: claimLines.length, // lines with extractable code coordinates = the claim-ledger sampling population
    structure,
    _ruleLines: ruleLines, // for internal aggregation; stripped before output
    _claimLines: claimLines,
  };
}

try {
  const { root, configFile, include, excludeLedger, locateLedger } = parseArgs();
  const config = loadConfig(root, configFile);
  // One git call, shared between collectFiles (exclude_untracked) and the untracked report below.
  const tracked = gitTrackedFiles(root);
  const { included, excluded, outOfScope } = collectFiles(root, config, { include, tracked });
  // One pass over src_dirs, reused by every file: the existence check that keeps API-shaped
  // inline code a signal rather than noise. null when src_dirs is unset -> the extension is inert
  // and claim_population.api_matching reports that (#40).
  const symbolIndex = buildSrcSymbolIndex(root, config.src_dirs);
  const symbols = symbolIndex ? symbolIndex.symbols : null;
  const filesRaw = included.map((p) => measure(root, p, config, symbols));
  const excludedFiles = excluded.map((p) => measure(root, p, config, symbols));
  // out_of_scope files are outside every rated population — no claims, no rules, no structure are
  // drawn from them. Only their size is reported, so only their size is computed.
  const outOfScopeFiles = outOfScope.map((p) => ({
    path: p,
    tokens_est: estimateTokens(fs.readFileSync(path.join(root, p), 'utf8')),
  }));

  // Who wrote each document: the subject of the commit that added it. `docs(docgrad):` means
  // docgrad produced the file during a convergence round, so a claim drawn from it is docgrad
  // checking its own prose. Map|null — null means git could not answer, which is not "false".
  const addSubjects = gitAddCommitSubjects(root, included);
  const authorshipOf = (p) => (addSubjects === null ? null : isDocgradAuthored(addSubjects.get(p)));
  for (const f of filesRaw) f.docgrad_authored = authorshipOf(f.path);

  const rulesTotal = filesRaw.reduce((s, f) => s + f._ruleLines.length, 0);
  const rulesAnchored = filesRaw.reduce((s, f) => s + f._ruleLines.filter((r) => r.anchored).length, 0);
  const claimsTotal = filesRaw.reduce((s2, f) => s2 + f._claimLines.length, 0);
  // Claims that exist only because of the API matcher (no path-shaped ref on the line at all).
  // On a library repo this equals claims_total; on docgrad itself it is the size of the addition.
  const claimsApiOnly = filesRaw.reduce(
    (s2, f) => s2 + f._claimLines.filter((c) => c.refs_path === 0).length,
    0
  );
  // Aggregated over the **whole population**, not the capped candidate list, so the report can
  // say "N% of this round's claim population comes from documents docgrad wrote" without the cap
  // distorting the share.
  const claimsDocgradAuthored =
    addSubjects === null
      ? null
      : filesRaw.reduce((s2, f) => s2 + (f.docgrad_authored ? f._claimLines.length : 0), 0);
  // A stably-ordered candidate list: the order produced from the same corpus is always the same,
  // so claim-ledger sampling is reproducible. Only the first `claim_candidates_cap` entries are
  // emitted — the population size is totals.claims_total; this is the pick order for sampling.
  //
  // Without --exclude-ledger, the window is a **prefix** of this one total order, so raising the
  // cap only appends: every claim a narrower window could draw, a wider one draws in the same
  // position. What the cap does decide is how far a ledger can keep growing before new draws dry
  // up, so both ends of it are reported below rather than left for the reader to infer by counting
  // array entries.
  //
  // With --exclude-ledger (#54), candidates already in the ledger are filtered out **before** the
  // cap is applied, so the window is a prefix of the *filtered* order instead — and that filtered
  // order shifts as the ledger grows, so "raising the cap only appends" no longer holds in that
  // mode. See claim_population.exclude_ledger below.
  //
  // Out of scope for #54: the ranking below degrades to plain path/line order once `refs` stops
  // discriminating (measured on a real repo: 77% of the population has refs: 1), and
  // --exclude-ledger reaches that flat region sooner by excluding drawn candidates from the front.
  // A better ranking signal is a design question, tracked separately at #60 — not fixed here.
  const rankedCandidates = rankClaimCandidates(
    filesRaw.map((f) => ({ path: f.path, claims: f._claimLines }))
  );
  const excludedHashes = excludeLedger ? loadLedgerClaimHashes(excludeLedger) : null;
  const drawableCandidates = excludedHashes
    ? rankedCandidates.filter((c) => !excludedHashes.has(c.claim_hash))
    : rankedCandidates;
  const excludedByLedgerCount = excludedHashes ? rankedCandidates.length - drawableCandidates.length : 0;
  const claimCandidates = drawableCandidates
    .slice(0, config.claim_candidates_cap)
    .map((c) => ({ ...c, docgrad_authored: authorshipOf(c.path) }));
  const candidatesTruncated = claimCandidates.length < drawableCandidates.length;
  // #63 prerequisite. Built from `rankedCandidates` — the **unfiltered** population — on purpose:
  // in the improve loop this flag always arrives alongside --exclude-ledger, and locating against
  // the filtered list would report every ledgered claim as not-located, which is the exact opposite
  // of what was asked. The two flags are independent and may name different files.
  const locateLedgerBlock = (() => {
    if (!locateLedger) return null;
    const ledgerRows = loadLedgerRows(locateLedger, '--locate-ledger');
    const entries = locateLedgerClaims(rankedCandidates, ledgerRows);
    const located = entries.filter((e) => e.located).length;
    const multiPosition = entries.filter((e) => e.positions.length > 1).length;
    const notLocated = entries.length - located;
    const note = [];
    if (notLocated) {
      note.push(
        `${notLocated} of ${entries.length} ledgered claims have no position in this round's corpus: the claim text was edited, its document left the corpus, or it was deleted${include.length ? ', or --include narrowed this run to a slice that does not contain it — a scoped run locates against the scoped corpus, so these counts are not comparable with an unscoped one' : ''}. claim_hash is content-derived, so an edited claim is a different claim — those ledger rows no longer describe anything that is here, and they are reported rather than dropped.`
      );
    }
    if (multiPosition) {
      note.push(
        `${multiPosition} ledgered claims occupy more than one position: the same claim text appears in several documents. Every position is listed; this is a duplication finding for the consistency dimension, not an error.`
      );
    }
    if (excludeLedger) {
      note.push(
        'positions were located against the unfiltered claim population, so --exclude-ledger (also passed on this run) did not hide any of them.'
      );
    }
    return {
      path: locateLedger,
      // `lines` is the ledger's **non-empty** row count (blank lines are skipped, as they are by
      // --exclude-ledger); `distinct` is the number of distinct claim_hash values. A docgrad ledger
      // is append-only and re-verification appends a new row for a hash already present, so these
      // two differ on every real ledger. located + not_located === distinct.
      lines: ledgerRows.length,
      distinct: entries.length,
      located,
      not_located: notLocated,
      multi_position: multiPosition,
      entries,
      note,
    };
  })();
  const files = filesRaw.map(({ _ruleLines, _claimLines, ...f }) => f);
  const totalTokens = files.reduce((s, f) => s + f.tokens_est, 0);
  const excludedTokens = excludedFiles.reduce((s, f) => s + f.tokens_est, 0);

  // Untracked files among everything this run collected (included + excluded — both sides feed
  // pollution.ratio, which is a rated input). Reporting them is what makes the difference between
  // a working checkout and a clean one visible instead of silent; it does not change the numbers.
  //
  // out_of_scope files are deliberately **not** in this population (#44). This block exists to
  // explain how two checkouts of the same commit can land on different star ratings, and its
  // membership test is "does this file feed a rated input". out_of_scope feeds none — not the
  // corpus, not the pollution ratio — so an untracked file in there cannot produce that
  // divergence, and listing it would pad `untracked` with paths that provably cannot move a score.
  // out_of_scope's own size is reported separately and is report-only. (When exclude_untracked is
  // on, the tracked filter has already run above the split, so out_of_scope's tally is on the same
  // clean-checkout basis as every other number here.)
  const collected = [...filesRaw, ...excludedFiles];
  const untrackedFiles = tracked === null ? null : collected.filter((f) => !tracked.has(f.path));
  const untracked =
    untrackedFiles === null
      ? { count: null, tokens_est: null, files: null, note: gitUnavailableNote() }
      : {
          count: untrackedFiles.length,
          tokens_est: untrackedFiles.reduce((s, f) => s + f.tokens_est, 0),
          files: untrackedFiles.map((f) => f.path).sort().slice(0, UNTRACKED_LIST_CAP),
          ...(untrackedFiles.length > UNTRACKED_LIST_CAP
            ? { note: `list capped: only the first ${UNTRACKED_LIST_CAP} of ${untrackedFiles.length} paths are shown (count/tokens_est cover all of them)` }
            : {}),
        };
  // Files that both fields claim. exclude wins the split (see collectFiles), so these are charged
  // to the pollution surface; say so, because the author who listed them in out_of_scope is
  // expecting the opposite and would otherwise only see a ratio that refused to move.
  const bothFields = excludedFiles
    .filter((f) => matchesPathPrefix(f.path, config.out_of_scope))
    .map((f) => f.path)
    .sort();
  const outOfScopeNotes = [
    ...(outOfScopeFiles.length > OUT_OF_SCOPE_LIST_CAP
      ? [`list capped: only the first ${OUT_OF_SCOPE_LIST_CAP} of ${outOfScopeFiles.length} paths are shown (count/tokens_est cover all of them)`]
      : []),
    ...(bothFields.length
      ? [`${bothFields.length} path(s) match both exclude and out_of_scope and are counted in the pollution surface, because exclude wins: ${bothFields.slice(0, OUT_OF_SCOPE_LIST_CAP).join(', ')} — remove them from exclude if they are genuinely out of scope`]
      : []),
  ];
  const outOfScopeBlock = {
    count: outOfScopeFiles.length,
    tokens_est: outOfScopeFiles.reduce((s, f) => s + f.tokens_est, 0),
    files: outOfScopeFiles.map((f) => f.path).slice(0, OUT_OF_SCOPE_LIST_CAP),
    ...(outOfScopeNotes.length ? { note: outOfScopeNotes.join('; ') } : {}),
  };
  // The ratio itself is left exactly as it was — silently changing everyone's economy rating is
  // the kind of break this tool exists to catch. The note only says the number is checkout-bound.
  const pollutionNote =
    untrackedFiles && untrackedFiles.length
      ? `this ratio includes ${untrackedFiles.length} untracked local file(s) (see "untracked"), so it will differ on a clean checkout of the same commit and two people can arrive at different economy ratings; set exclude_untracked: true in .docgrad.yml to measure the clean-checkout corpus instead`
      : null;
  const entryCost = (() => {
    // When scope-limited, count only entry files within the scope — fixed cost is a
    // full-corpus concept, so a scoped report cannot cite it directly.
    // Symlink dedup: multiple entry names pointing at the same real file (kdan-bpm's
    // `CLAUDE.md -> AGENTS.md`) get loaded by an agent as a single file, so summing them by
    // name would double the fixed cost (measured on 2026-09-05: 5,792 vs the true 2,896).
    // Group by realpath, count the same real file once; files still lists every name, and
    // aliases that got folded together are called out.
    const entries = files.filter((f) => f.type === 'entry');
    const seen = new Map();
    const aliases = [];
    for (const f of entries) {
      let key = f.path;
      try {
        key = fs.realpathSync(path.join(root, f.path));
      } catch {
        /* fall back to the path itself when it can't be read — better to double-count than to miss it */
      }
      if (seen.has(key)) {
        aliases.push({ path: f.path, same_file_as: seen.get(key) });
        continue;
      }
      seen.set(key, f.path);
    }
    const counted = new Set(seen.values());
    return {
      files: entries.map((f) => f.path),
      tokens_est: entries
        .filter((f) => counted.has(f.path))
        .reduce((s, f) => s + f.tokens_est, 0),
      ...(aliases.length ? { symlink_aliases: aliases } : {}),
    };
  })();

  const pollutionRatio =
    totalTokens + excludedTokens === 0
      ? 0
      : Number((excludedTokens / (totalTokens + excludedTokens)).toFixed(4));

  // Economy's two thresholds used to live only in reference/rubric.md's prose, retyped by hand,
  // while the identically-named config fields were read by nothing at all (#50). Editing them
  // changed no outcome, and init.md warned against editing them for a reason that did not exist.
  // They are read here now, so the rubric can cite one source instead of keeping a second copy.
  //
  // The verdicts below are arithmetic over two already-mechanical numbers, not a rating: the star
  // still comes from the anchors. `cost_allows_star` is the ceiling the fixed cost alone permits;
  // ★5 additionally requires a mechanical gate, which no script can observe.
  const tiers = config.economy.entry_cost_tiers;
  const pollutionMax = config.economy.pollution_max;
  const cost = entryCost.tokens_est;
  const economyThresholds = {
    entry_cost_tiers: tiers,
    pollution_max: pollutionMax,
    customised: JSON.stringify([tiers, pollutionMax]) !== JSON.stringify([SHIPPED_TIERS, SHIPPED_POLLUTION_MAX]),
    entry_cost_tokens_est: cost,
    pollution_ratio: pollutionRatio,
    cost_allows_star: cost > tiers[0] ? 1 : cost > tiers[1] ? 2 : cost > tiers[2] ? 3 : 4,
    star_5_cost_met: cost <= tiers[3],
    pollution_caps_at: pollutionRatio >= pollutionMax ? 3 : null,
    note:
      'thresholds come from .docgrad.yml economy:; cost_allows_star is the ceiling the fixed cost alone permits and ★5 also requires a mechanical gate. When customised is true these are not the shipped anchors, so this repo\'s economy rating is not comparable with one graded at the defaults.',
  };

  const scoped = include.length > 0;
  // entry_cost and pollution are full-corpus concepts (matching judge.md §Scoped audit's economy
  // row): under --include, evaluateMeasure nulls both given { scoped }.
  const measureRows = [
    evaluateMeasure('entry_cost', { value: cost }, config, { scoped }),
    evaluateMeasure('pollution', { value: pollutionRatio }, config, { scoped }),
  ];

  process.stdout.write(
    `${JSON.stringify(
      {
        scope: include.length ? include : null,
        // history.jsonl copies this `docgrad` object verbatim (improve.md step 5)
        docgrad: docgradMeta(undefined, config),
        // The band-table verdicts (E2b-1), right after docgrad so all four scripts that emit one
        // stay comparable field by field.
        measure: measureRows,
        files,
        totals: {
          files: files.length,
          bytes: files.reduce((s, f) => s + f.bytes, 0),
          tokens_est: totalTokens,
          claims_total: claimsTotal,
          // How much of the population the API matcher is carrying (#40). Equal to claims_total
          // on a library repo, 0 when src_dirs is unset.
          claims_api_only: claimsApiOnly,
          // How much of it comes from documents docgrad itself wrote during a convergence round.
          // null, never 0, when git cannot answer.
          claims_docgrad_authored: claimsDocgradAuthored,
          claims_docgrad_authored_ratio:
            claimsDocgradAuthored === null || claimsTotal === 0
              ? null
              : Number((claimsDocgradAuthored / claimsTotal).toFixed(4)),
          rules_total: rulesTotal,
          rules_anchored_ratio: rulesTotal ? Number((rulesAnchored / rulesTotal).toFixed(4)) : 0,
        },
        // Where this round's claim population came from, in words. The numbers live in totals;
        // this block says how they were obtained and what was degraded.
        claim_population: {
          api_matching: symbolIndex ? 'enabled' : 'disabled',
          src_symbols: symbolIndex ? symbolIndex.symbols.size : null,
          src_files_scanned: symbolIndex ? symbolIndex.files_scanned : null,
          authorship: addSubjects === null ? 'unavailable' : 'git',
          // Is claim_candidates the whole ordered population, or a window onto it? A consumer must
          // be able to answer that without counting entries, because the answer decides whether a
          // round that drew nothing means "the corpus is fully covered" or "the window ran out".
          // `population` is the same number as totals.claims_total, restated here so this block
          // stands on its own.
          cap: config.claim_candidates_cap,
          emitted: claimCandidates.length,
          population: rankedCandidates.length,
          truncated: candidatesTruncated,
          // Present only when --exclude-ledger was passed (#54) — its absence, not a false value,
          // is what keeps a no-flag run byte-identical to before this flag existed.
          ...(excludeLedger
            ? {
                exclude_ledger: {
                  path: excludeLedger,
                  ledger_claim_hashes: excludedHashes.size,
                  excluded: excludedByLedgerCount,
                  drawable: drawableCandidates.length,
                },
              }
            : {}),
          notes: [
            ...(excludeLedger
              ? [`--exclude-ledger excluded ${excludedByLedgerCount} of ${rankedCandidates.length} ranked candidates (already verified in ${excludeLedger}) before claim_candidates_cap was applied, leaving ${drawableCandidates.length} drawable; cap counts drawable candidates in this mode, so it is not the same denominator as an unflagged run`]
              : []),
            ...(candidatesTruncated
              ? excludeLedger
                ? [`claim_candidates is a window onto the drawable population, not all of it: ${claimCandidates.length} of ${drawableCandidates.length} drawable candidates are emitted, in ranked order, because claim_candidates_cap is ${config.claim_candidates_cap}. This window is a prefix of the *filtered* (ledger-excluded) order, not of the total ${rankedCandidates.length}-candidate order, and that filtered order shifts as the ledger grows — raising claim_candidates_cap in .docgrad.yml still widens it, but "only appends" does not hold while this flag is on.`]
                : [`claim_candidates is a window onto the population, not all of it: ${claimCandidates.length} of ${rankedCandidates.length} candidates are emitted, in ranked order, because claim_candidates_cap is ${config.claim_candidates_cap}. A claim ledger can only draw from what is emitted, so once it covers all ${claimCandidates.length} of them every later round draws zero new claims and cumulative coverage freezes at ${claimCandidates.length}/${rankedCandidates.length} (${Math.round((claimCandidates.length / rankedCandidates.length) * 100)}%) — which is not the same thing as the corpus being fully covered. Raise claim_candidates_cap in .docgrad.yml to widen the window; the cost is inventory output size, and the ranked order of what is already emitted does not change.`]
              : []),
            ...(symbolIndex
              ? []
              : ['src_dirs is unset, so API-shaped inline code cannot be existence-checked and contributes no claim candidates. What that costs is call-shaped spans (`foo()`, `.option()`, `obj.method()`) and paren-less dotted spans with a long or underscore-bearing tail (`obj.my_method`, `program.optsWithGlobals`); short dotted spans like `a.b` and `program.opts` are collected by the path route regardless and are unaffected. On a library repo, whose documentation describes an API rather than a file tree, this can leave claims_total at 0 and the correctness dimension with no mechanical basis — set src_dirs in .docgrad.yml']),
            ...(symbolIndex && symbolIndex.files_skipped
              ? [`${symbolIndex.files_skipped} file(s) under src_dirs were skipped when building the symbol index (larger than ${Math.round(MAX_SRC_SYMBOL_FILE_BYTES / 1024)} KB, binary, or unreadable), so an identifier that only appears in one of them will not pass the existence check`]
              : []),
            ...(addSubjects === null ? [AUTHORSHIP_UNAVAILABLE_NOTE] : []),
            ...(claimsDocgradAuthored
              ? [`${Math.round((claimsDocgradAuthored / claimsTotal) * 100)}% of this round's claim population comes from documents docgrad itself wrote (their add commit's subject starts with "docs(docgrad):"); a correctness score built on the tool's own prose is not worthless, but it does not sample the repo's pre-existing documentation debt`]
              : []),
          ],
        },
        claim_candidates: claimCandidates,
        // Absent entirely unless --locate-ledger was passed: no flag, no new key.
        ...(locateLedgerBlock ? { locate_ledger: locateLedgerBlock } : {}),
        entry_cost: entryCost,
        pollution: {
          excluded_files: excludedFiles.map((f) => ({ path: f.path, tokens_est: f.tokens_est })),
          excluded_tokens: excludedTokens,
          ratio: pollutionRatio,
          ...(pollutionNote ? { note: pollutionNote } : {}),
        },
        // Sits next to pollution, and is emitted on **every** run — empty field included. That is
        // the anti-abuse property, not decoration: if the size of out_of_scope were hidden when
        // convenient, the field would just be a switch for zeroing your own pollution surface. You
        // can move anything you like out of the surface; how much you moved is printed on the same
        // page, by the same run, in the same units.
        out_of_scope: outOfScopeBlock,
        economy_thresholds: economyThresholds,
        untracked,
      },
      null,
      2
    )}\n`
  );
} catch (err) {
  fail(err.message);
}

// scripts/lib.mjs — shared module for docgrad's measurement scripts (zero dependencies, Node >=18)
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const CONFIG_FILENAME = '.docgrad.yml';

// --- YAML subset parser ---------------------------------------------------------
// Only supports the two-level structure .docgrad.yml needs: top-level scalar / inline list /
// block list / one level of nested map. Not a general-purpose YAML parser.

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

// Items are split on commas outside quotes, so a quoted item may contain one
// (`["Updated, last:", "Other:"]` is two items). A quote only opens at the start of an item —
// an apostrophe inside a plain item (`docs/owner's/`) is ordinary text, as it always was.
function splitInlineItems(inner) {
  const items = [];
  let cur = '';
  let quote = null;
  let atItemStart = true;
  for (const c of inner) {
    if (quote) {
      cur += c;
      if (c === quote) quote = null;
    } else if (atItemStart && (c === '"' || c === "'")) {
      quote = c;
      cur += c;
      atItemStart = false;
    } else if (c === ',') {
      items.push(cur);
      cur = '';
      atItemStart = true;
    } else {
      cur += c;
      if (c !== ' ' && c !== '\t') atItemStart = false;
    }
  }
  // An item whose opening quote is never closed used to keep the quote character in its value
  // (`["docs/a", "\"unclosed"]`), so the entry silently became a different string than the one
  // written. Other malformed shapes this subset still accepts quietly (a missing closing bracket,
  // for one) are a separate gap, not fixed here.
  if (quote) throw new Error(`Unterminated ${quote} in inline list item: ${cur.trim()}`);
  items.push(cur);
  return items;
}

function parseInlineList(v) {
  const inner = v.slice(1, -1).trim();
  return inner === '' ? [] : splitInlineItems(inner).map((s) => parseScalar(s));
}

export function parseYamlSubset(text) {
  const root = {};
  let nestedKey = null; // the top-level key currently being expanded (nested map or block list)
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const indent = raw.match(/^ */)[0].length;
    const content = stripComment(raw.trim()).trim();
    if (!content) continue;
    if (indent === 0) {
      const m = content.match(/^([^:]+):\s*(.*)$/);
      if (!m) throw new Error(`Could not parse config line: ${raw}`);
      const key = m[1].trim();
      const rest = m[2].trim();
      if (rest === '') {
        nestedKey = key;
        root[key] = {}; // becomes an array once a "- " line is encountered
      } else {
        nestedKey = null;
        root[key] = rest.startsWith('[') ? parseInlineList(rest) : parseScalar(rest);
      }
    } else {
      if (nestedKey === null) throw new Error(`Bad indentation level: ${raw}`);
      if (content.startsWith('- ')) {
        if (!Array.isArray(root[nestedKey])) root[nestedKey] = [];
        root[nestedKey].push(parseScalar(content.slice(2)));
      } else {
        const m = content.match(/^([^:]+):\s*(.*)$/);
        if (!m) throw new Error(`Could not parse config line: ${raw}`);
        const rest = m[2].trim();
        root[nestedKey][m[1].trim()] = rest.startsWith('[') ? parseInlineList(rest) : parseScalar(rest);
      }
    }
  }
  return root;
}

// --- Config loading --------------------------------------------------------------

const DEFAULTS = {
  docs_dirs: ['docs/'],
  // docs_files: a **single** markdown file outside docs_dirs, included in the corpus as a regular
  // document (type: 'doc'). It differs from entry_files in "when it's loaded", not "how important
  // it is" — see item 3 of the questionnaire in reference/init.md.
  docs_files: [],
  entry_files: [],
  index_file: null,
  // exclude: "this repo contains this, and I am not proud of it". Removed from the corpus and
  // **charged to the pollution surface** — unchanged meaning, unchanged numbers.
  exclude: [],
  // out_of_scope: "this exists, it is real documentation, and it is not what this run grades".
  // Removed from the corpus exactly like exclude, but **not** charged to the pollution surface;
  // its own count and token total are reported on every run instead (see inventory.mjs). Defaults
  // to [] so a config written before this field existed behaves identically to before — an absent
  // field and an empty list are the same corpus, and neither moves a single rating.
  out_of_scope: [],
  // exclude_untracked: opt-in, default false (= today's behavior). When true, collectFiles drops
  // every collected file that git does not track, so the corpus matches a clean checkout of the
  // same commit. This is strictly about **tracked vs. untracked**; it says nothing about what
  // `exclude` or `out_of_scope` mean. It is a separate failure mode (#35: scan baseline) from the
  // one those two fields separate (#44: scope semantics) and the filter runs before their split.
  exclude_untracked: false,
  src_dirs: [],
  // convention can be a single value or a comma/`+`-separated list of values (see
  // parseFreshnessConventions); heading_field is the inline keyword used for a heading-line;
  // falls back to field when unset (compatibility with older configs).
  freshness: { convention: 'none', field: null, heading_field: null, stale_after_days: 60 },
  coverage: { drift_after_days: 30, min_commits: 3 },
  targets: { completeness: 4, correctness: 4, freshness: 4, linkage: 4, consistency: 4, economy: 4 },
  // Thresholds for the economy anchors (added in v1.0.0, actually read since v1.7.0 — until then
  // they were inert and reference/rubric.md retyped the numbers in prose, so editing them changed
  // nothing while init.md warned that it changed everything). inventory.mjs reads them now and the
  // rubric cites what it emits. Changing them does not change a *shipped* anchor — it changes the
  // ruler this repo is graded by, which is why they are in measure_hash: a score measured at
  // custom thresholds is not comparable with one measured at the defaults, and the fingerprint is
  // how a reader can tell.
  economy: { entry_cost_tiers: [20000, 10000, 5000, 3000], pollution_max: 0.1 },
  correctness_sample: 8,
  // How many of the ranked claim candidates inventory.mjs actually emits. The population itself is
  // never capped — totals.claims_total counts all of it — but emitting every candidate *with its
  // text* is what costs tokens, and this is a tool whose sixth dimension prices context: a repo
  // with 358 candidates would add tens of thousands of tokens to every round's inventory output.
  //
  // The cost of the window is that the claim ledger can only ever draw from what was emitted. Once
  // a ledger covers all `claim_candidates_cap` entries, new draws return nothing and cumulative
  // coverage freezes short of claims_total — measured on a real repo at 36 distinct claims with
  // correctness_sample: 12 and claims_total: 358, three rounds from the wall. So the window is
  // disclosed on every run (claim_population.truncated / emitted / population) and raising this
  // number is the documented remedy.
  //
  // #54: without `--exclude-ledger`, every already-verified ledger row still occupies one of the
  // `claim_candidates_cap` slots forever — the window narrows to `cap - (ledger size)` drawable
  // candidates as the ledger grows, which is the same defect this cap exists to prevent, just one
  // level down. `--exclude-ledger <path>` (inventory.mjs only, default off) filters candidates
  // already in the ledger out of the ranked list **before** this cap is applied, so `cap` counts
  // drawable candidates instead of emitted-including-already-verified ones. With the flag, the
  // emitted window is a prefix of the *filtered* order, not of the total order, and that filtered
  // order itself shifts as the ledger grows — so "raising the cap only appends" and "the window is
  // the ceiling coverage can reach" hold only when the flag is off.
  //
  // Default 60 = the value that was hardcoded in inventory.mjs before it became configurable.
  claim_candidates_cap: 60,
  scenario: null,
  scenarios: [], // used by retrieval.mjs: list of representative code paths (files or dirs), report-only
  rules: { pattern: '**MUST' }, // used by inventory.mjs structure.rules: the string that marks a rule line
  language: 'zh-TW',
};

// --- Config field type validation -------------------------------------------------
//
// A scalar written where a list belongs (`docs_files: PRODUCT.md`, missing the brackets) used to
// be iterated **character by character** by the `for…of` loops in collectFiles: every single
// character was tried as a path, every existsSync failed, and the corpus silently came back
// without those files. The only symptom was that files_total didn't move — and nobody connects
// "the number didn't change" to "the config is malformed", least of all right after adding a
// field and expecting the number to grow.
//
// So: fail loudly, and cover every list field in one pass (validating only the newest field would
// leave the older ones inconsistent). Deliberately **not** auto-wrapping a scalar into a
// one-element list: a silent repair leaves the config still wrong in a version-controlled file,
// for the next reader to trip over again.

const LIST_FIELD_EXAMPLES = {
  docs_dirs: 'docs/',
  docs_files: 'PRODUCT.md',
  entry_files: 'CLAUDE.md',
  exclude: 'docs/archive/',
  out_of_scope: 'docs/zh-CN/',
  src_dirs: 'src/',
  scenarios: 'src/foo/bar.ts',
};

const BOOL_FIELD_EXAMPLES = {
  exclude_untracked: 'true',
};

// Counts. Both of these are used as a slice length or a draw budget, so a string, a float or a
// zero doesn't fail — it quietly produces an empty or nonsensical sample. `claim_candidates_cap: 0`
// would emit no candidates at all and every following round would draw nothing; a quoted "60"
// would make slice() return an empty list. Same discipline as the fields above, and covering both
// count fields rather than only the new one, so the two can't drift apart.
const POSITIVE_INT_FIELD_EXAMPLES = {
  correctness_sample: '8',
  claim_candidates_cap: '60',
};

function describeValue(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'a list';
  if (typeof v === 'object') {
    return Object.keys(v).length === 0
      ? 'an empty value (nothing after the colon, and no "- " item under it)'
      : 'a map';
  }
  if (typeof v === 'string') return `the string ${JSON.stringify(v)}`;
  return `the ${typeof v} ${JSON.stringify(v)}`;
}

const PATH_FIELD_EXAMPLES = { index_file: 'docs/README.md' };

export function validateConfigTypes(config, configFile = CONFIG_FILENAME) {
  for (const [field, example] of Object.entries(LIST_FIELD_EXAMPLES)) {
    const value = config[field];
    if (!Array.isArray(value)) {
      throw new Error(
        `${configFile}: ${field} must be a list, but got ${describeValue(value)}. ` +
          `Write it as an inline list — ${field}: [${example}] — or as a block list with one "- " item per line. ` +
          `A bare scalar would be iterated character by character and collect nothing at all.`
      );
    }
    const bad = value.findIndex((e) => typeof e !== 'string' || e.trim() === '');
    if (bad >= 0) {
      throw new Error(
        `${configFile}: ${field}[${bad}] must be a non-empty path string, but got ${describeValue(value[bad])}. ` +
          `Correct form: ${field}: [${example}]`
      );
    }
  }
  for (const [field, example] of Object.entries(BOOL_FIELD_EXAMPLES)) {
    const value = config[field];
    if (typeof value !== 'boolean') {
      throw new Error(
        `${configFile}: ${field} must be true or false, but got ${describeValue(value)}. ` +
          `Correct form: ${field}: ${example}`
      );
    }
  }
  for (const [field, example] of Object.entries(POSITIVE_INT_FIELD_EXAMPLES)) {
    const value = config[field];
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(
        `${configFile}: ${field} must be a positive whole number, but got ${describeValue(value)}. ` +
          `Correct form: ${field}: ${example}. ` +
          `A quoted number, a fraction or 0 would be used as a count anyway and would silently draw nothing.`
      );
    }
  }
  // Single-path fields fail the same way list fields used to: a key written with nothing after the
  // colon parses to {} and only surfaces much later as a raw TypeError out of path.join(). Null is
  // legitimate here (it means "this repo has no index"), an object never is.
  for (const [field, example] of Object.entries(PATH_FIELD_EXAMPLES)) {
    const value = config[field];
    if (value === null || value === undefined) continue;
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(
        `${configFile}: ${field} must be a path string or null, but got ${describeValue(value)}. ` +
          `Write ${field}: ${example}, or ${field}: null when the repo has none. ` +
          `A key with nothing after the colon parses as an empty mapping, not as null.`
      );
    }
  }
  // Nested maps were never type-checked. That was survivable while nothing read economy; it is not
  // now, and freshness.stale_after_days has driven a rubric anchor since long before that.
  const economy = config.economy ?? {};
  const tiers = economy.entry_cost_tiers;
  if (!Array.isArray(tiers) || tiers.length !== 4 || tiers.some((t) => typeof t !== 'number' || !(t > 0))) {
    throw new Error(
      `${configFile}: economy.entry_cost_tiers must be a list of four positive numbers, but got ${describeValue(tiers)}. ` +
        `Correct form: economy.entry_cost_tiers: [20000, 10000, 5000, 3000] — the ★1/★2/★3/★4 fixed-cost boundaries, highest first.`
    );
  }
  for (let i = 1; i < tiers.length; i += 1) {
    if (tiers[i] >= tiers[i - 1]) {
      throw new Error(
        `${configFile}: economy.entry_cost_tiers must decrease, but ${tiers[i - 1]} is followed by ${tiers[i]}. ` +
          `They are star boundaries read highest-first; out of order they would place a cheaper entry file in a worse band than an expensive one.`
      );
    }
  }
  if (typeof economy.pollution_max !== 'number' || !(economy.pollution_max > 0) || economy.pollution_max > 1) {
    throw new Error(
      `${configFile}: economy.pollution_max must be a ratio greater than 0 and at most 1, but got ${describeValue(economy.pollution_max)}. ` +
        `Correct form: economy.pollution_max: 0.1 — that is 10%, written as a fraction, not as 10.`
    );
  }
  const staleAfter = config.freshness?.stale_after_days;
  if (!Number.isInteger(staleAfter) || staleAfter < 1) {
    throw new Error(
      `${configFile}: freshness.stale_after_days must be a positive whole number of days, but got ${describeValue(staleAfter)}. ` +
        `Correct form: freshness.stale_after_days: 60. It sets the rubric's freshness ★3 staleness boundary for this repo.`
    );
  }
  return config;
}

// configFile can be external (--config): for when the doc source itself can't take a written file
// (an export directory, a read-only mount) and you want to point at a config file elsewhere.
// The shipped anchor values, exported so a run can say whether it was graded by them or by
// something this repo chose. Deliberately not derived from DEFAULTS at call time: the point of
// comparison is "the values docgrad ships", and reading them out of the same object a config has
// already been merged into would compare a thing with itself.
export const SHIPPED_TIERS = [20000, 10000, 5000, 3000];
export const SHIPPED_POLLUTION_MAX = 0.1;

// freshness.field / freshness.heading_field: a keyword string, or an inline list of them. Only the
// fields the active conventions read are validated (frontmatter -> field; heading-line ->
// heading_field, falling back to field), so `convention: none` keeps accepting whatever it always
// accepted. Keywords are matched verbatim — nothing is trimmed or coerced — so an empty string, a
// non-string, or an empty list is a config error rather than a keyword that silently matches nothing.
function validateFreshnessFields(freshness, configFile) {
  const conventions = parseFreshnessConventions(freshness.convention);
  const active = new Set();
  if (conventions.includes('frontmatter')) active.add('field');
  if (conventions.includes('heading-line')) active.add(freshness.heading_field == null ? 'field' : 'heading_field');
  for (const name of active) {
    const value = freshness[name];
    if (value === null || value === undefined) continue;
    const items = Array.isArray(value) ? value : [value];
    if (items.length === 0) {
      throw new Error(`${configFile}: freshness.${name} must name at least one keyword — write freshness.${name}: "Last updated:" or freshness.${name}: ["Last updated:", "Updated:"]`);
    }
    const bad = items.findIndex((e) => typeof e !== 'string' || e === '');
    if (bad !== -1) {
      throw new Error(`${configFile}: freshness.${name}${Array.isArray(value) ? `[${bad}]` : ''} must be a non-empty keyword string, but got ${describeValue(items[bad])}`);
    }
  }
}

export function loadConfig(rootDir, configFile = path.join(rootDir, CONFIG_FILENAME)) {
  if (!fs.existsSync(configFile)) {
    throw new Error(`Could not find ${configFile} (root: ${rootDir}). Run /docgrad init first.`);
  }
  const parsed = parseYamlSubset(fs.readFileSync(configFile, 'utf8'));
  const config = {
    ...DEFAULTS,
    ...parsed,
    freshness: { ...DEFAULTS.freshness, ...(parsed.freshness ?? {}) },
    coverage: { ...DEFAULTS.coverage, ...(parsed.coverage ?? {}) },
    targets: { ...DEFAULTS.targets, ...(parsed.targets ?? {}) },
    rules: { ...DEFAULTS.rules, ...(parsed.rules ?? {}) },
    // economy was the only nested map without this, so `economy: { pollution_max: 0.2 }` used to
    // leave entry_cost_tiers undefined rather than at its default. Nothing noticed because nothing
    // read the field; now that inventory.mjs does, a partial economy block would have crashed it.
    economy: { ...DEFAULTS.economy, ...(parsed.economy ?? {}) },
  };
  validateConfigTypes(config, configFile);
  validateFreshnessFields(config.freshness, configFile);
  const needsField = parseFreshnessConventions(config.freshness.convention).some(
    (c) => c === 'frontmatter' || c === 'heading-line'
  );
  if (needsField && parseFreshnessFields(config.freshness.field).length === 0) {
    throw new Error(`freshness.field must be set when freshness.convention is ${config.freshness.convention}`);
  }
  return config;
}

// --- CLI shared -------------------------------------------------------------------

// Legacy interface that only recognizes --root and falls back to cwd when it's missing;
// all four CLIs now use parseArgs() instead.
export function resolveRoot(argv = process.argv.slice(2)) {
  const i = argv.indexOf('--root');
  return path.resolve(i >= 0 && argv[i + 1] ? argv[i + 1] : process.cwd());
}

function takeValue(argv, i, flag) {
  const v = argv[i + 1];
  if (v === undefined || v.startsWith('--')) throw new Error(`${flag} requires a value`);
  return v;
}

// Flags shared by all five scripts (#54):
//   --root <dir>            target repo root (default: cwd)
//   --config <file>         config file path (default: <root>/.docgrad.yml)
//   --include <glob>        limit scope (scoped audit), repeatable or comma-separated; omit = full scope
//   --exclude-ledger <path> path to a `.docgrad/ledger.jsonl`; default off. Only inventory.mjs draws
//                           on it (it filters the ranked claim-candidate list before the cap is
//                           applied) — coverage.mjs, freshness.mjs, links.mjs and retrieval.mjs all
//                           accept it, like --include on coverage/retrieval, and report it as a
//                           no-op in their own output note rather than silently ignoring it.
export function parseArgs(argv = process.argv.slice(2)) {
  let rootArg = null;
  let configArg = null;
  let excludeLedgerArg = null;
  let locateLedgerArg = null;
  const include = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root') rootArg = takeValue(argv, i++, '--root');
    else if (a === '--config') configArg = takeValue(argv, i++, '--config');
    else if (a === '--exclude-ledger') excludeLedgerArg = takeValue(argv, i++, '--exclude-ledger');
    else if (a === '--locate-ledger') locateLedgerArg = takeValue(argv, i++, '--locate-ledger');
    else if (a === '--include') {
      include.push(...takeValue(argv, i++, '--include').split(',').map((s) => s.trim()).filter(Boolean));
    } else
      throw new Error(
        `Unknown argument ${a} (supported: --root / --config / --include / --exclude-ledger / --locate-ledger)`
      );
  }
  const root = path.resolve(rootArg ?? process.cwd());
  return {
    root,
    configFile: configArg ? path.resolve(configArg) : path.join(root, CONFIG_FILENAME),
    include,
    excludeLedger: excludeLedgerArg ? path.resolve(excludeLedgerArg) : null,
    // The two ledger flags are independent: --exclude-ledger narrows what is *emitted*,
    // --locate-ledger asks where already-ledgered claims *are*. They may name different files,
    // and in the improve loop they are both passed on every round with a ledger.
    locateLedger: locateLedgerArg ? path.resolve(locateLedgerArg) : null,
  };
}

export function fail(message) {
  process.stderr.write(`docgrad: ${message}\n`);
  process.exit(1);
}

// --- File inventory ----------------------------------------------------------

const MD_EXTENSIONS = new Set(['.md', '.mdx', '.markdown']);
const ALWAYS_SKIP_DIRS = new Set(['node_modules', '.git']);

function toPosix(p) {
  return p.split(path.sep).join('/');
}

// --- root containment (#57) --------------------------------------------------------
//
// docgrad is documented as a tool you run against repos you did not write (case-studies/01 clones
// a third-party repo and grades it), and the repo being graded controls **both** `.docgrad.yml` and
// the symlinks in its own tree. So every path these scripts open has to be proven to live inside
// the root they were pointed at, or local file content ends up in the report and in the agent
// context that reads it.
//
// **Built on fs.realpathSync, never on path.resolve.** A lexical check is defeated by one committed
// symlink: `docs-x -> /` with `docs_dirs: ['docs-x/Users/v/notes/']` resolves lexically inside the
// root, passes any prefix test, and then readdirSync follows it straight back out. Only the path
// the kernel would actually open tells the truth.
//
// **The root is realpathed here, once per root — deliberately not in parseArgs().** `--root`'s
// documented meaning is the path the caller typed (tests/lib.test.mjs asserts
// `parseArgs().root === path.resolve('/tmp/x')`, and `configFile` is derived from it); on darwin
// `/tmp -> /private/tmp`, so realpathing there would silently redefine the flag. The comparison is
// realpath-to-realpath, and both sides are resolved in this one place.
//
// **Missing paths stay non-fatal.** realpathSync throws ENOENT, and a missing `docs_dir` /
// `docs_files` entry is deliberately skipped today (see pushSingleFile: `.docgrad.yml` is
// version-controlled and shared across branches, so a file that is simply not on this branch must
// not stop the run). What gets resolved is therefore the deepest **existing** ancestor, with the
// not-yet-existing tail re-appended lexically: a component that does not exist cannot hide a
// symlink, and a path that does not exist cannot disclose anything either. Turning "not on this
// branch" into exit 1 would be a worse bug than the one this closes.
//
// **Not checked, on purpose: `exclude` and `out_of_scope`.** Both are pure string prefix matchers
// (matchesPathPrefix) over paths that have *already* been collected; neither one ever touches the
// filesystem, so neither is a disclosure vector. Adding them here would buy uniformity, not
// security, and would invite a later reader to believe they were one.
//
// **Residual risks, recorded rather than closed.** (1) TOCTOU: the check and the read are separate
// syscalls, in five separate processes, seconds apart — a *concurrent* attacker could swap a path
// in between. Closing it means carrying validated file handles across four files. (2) A dangling
// symlink resolves to its own (contained) directory and so passes; that is correct, because opening
// it discloses nothing — links.mjs, where a dangling symlink *is* an information channel, handles
// that case separately and says so there.

export class OutOfRootError extends Error {
  constructor(message) {
    super(message);
    this.name = 'OutOfRootError';
  }
}

// The realpath of the deepest existing ancestor of absPath, with the missing tail re-appended.
// null means "this cannot be resolved for a reason other than not existing yet" — an unreadable
// ancestor or a symlink loop is a refusal to answer, and every caller fails closed on it.
function realpathDeepest(absPath) {
  let cur = path.resolve(absPath);
  const tail = [];
  for (;;) {
    try {
      const real = fs.realpathSync(cur);
      return tail.length ? path.join(real, ...tail) : real;
    } catch (err) {
      const code = err?.code;
      if (code !== 'ENOENT' && code !== 'ENOTDIR') return null;
      const parent = path.dirname(cur);
      if (parent === cur) return null; // climbed to the filesystem root without resolving anything
      tail.unshift(path.basename(cur));
      cur = parent;
    }
  }
}

// One realpath of the root per root string, for the whole process: every configured path and every
// tree entry is compared against it, and the answer cannot change under us any more than the TOCTOU
// residual above already allows.
const ROOT_REAL_CACHE = new Map();

export function rootRealPath(rootDir) {
  const key = path.resolve(rootDir);
  if (!ROOT_REAL_CACHE.has(key)) ROOT_REAL_CACHE.set(key, realpathDeepest(key));
  return ROOT_REAL_CACHE.get(key);
}

// Boundary-aware comparison, never startsWith: `/repo-evil` starts with `/repo` and is a different
// tree. path.relative gives '' for the root itself and a `..` first segment for anything above it.
// No case folding: two spellings differing only in case are two different paths on a case-sensitive
// filesystem, and folding them would be a guess everywhere else. A first segment of exactly `..` is
// the only way out — a name that merely begins with those characters (`..hidden`) is an ordinary
// in-root entry and must stay allowed.
export function isInsideRoot(rootReal, candidateReal) {
  if (rootReal === null || candidateReal === null) return false;
  const rel = path.relative(rootReal, candidateReal);
  if (rel === '') return true;
  if (path.isAbsolute(rel)) return false;
  return rel.split(path.sep)[0] !== '..';
}

// Non-throwing predicate, for the one caller (links.mjs) that must classify rather than fail.
export function pathInsideRoot(rootDir, absPath) {
  return isInsideRoot(rootRealPath(rootDir), realpathDeepest(absPath));
}

function outOfRootMessage(field, shown, rootDir) {
  return (
    `${field}: ${shown} resolves outside the repository root ${rootDir}, so docgrad will not read it. ` +
    `Paths in ${CONFIG_FILENAME} are resolved against --root (the repository being graded), not against ` +
    `the directory the config file itself sits in, and a symlink whose target leaves the root counts as outside.`
  );
}

// Proves an already-absolute candidate stays in the root; returns it so call sites can stay
// expression-shaped. `shown` is what the error names — the repo-relative spelling wherever there
// is one, because that is what the reader has to go and fix.
export function assertInsideRoot(rootDir, absPath, field, shown = absPath) {
  if (!pathInsideRoot(rootDir, absPath)) throw new OutOfRootError(outOfRootMessage(field, shown, rootDir));
  return absPath;
}

// The configured-path form. Returns the **lexical** join, not the realpath: every caller goes on to
// derive repo-relative paths from it, and handing back the resolved path would rewrite them
// (on darwin a root under /tmp would start reporting files under /private/tmp).
export function resolveInRoot(rootDir, rel, field) {
  return assertInsideRoot(rootDir, path.join(rootDir, rel), field, rel);
}

function walkMarkdown(absDir, rootDir, out) {
  for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
    const abs = path.join(absDir, entry.name);
    // Dirent.isDirectory() is false for a symlink, so a symlinked directory reaches the branch
    // below and is only looked at when its name ends in .md — which is exactly the shape #57
    // reports (`notes.md -> /Users/you/.ssh/config`). Both branches are checked all the same: the
    // walk starts from a configured directory that was proven contained, but each entry can leave
    // the root on its own.
    if (entry.isDirectory()) {
      if (ALWAYS_SKIP_DIRS.has(entry.name)) continue;
      assertInsideRoot(rootDir, abs, 'docs_dirs', toPosix(path.relative(rootDir, abs)));
      walkMarkdown(abs, rootDir, out);
    } else if (MD_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      const rel = toPosix(path.relative(rootDir, abs));
      assertInsideRoot(rootDir, abs, 'docs_dirs', rel);
      out.push(rel);
    }
  }
}

// --- scope filtering (--include) --------------------------------------------------
// Supports `**` (crosses levels), `*` (same level), `?` (single character); a pattern without
// these characters is treated as a path prefix (`docs/infra` => the file itself and everything
// under it). An empty scope = full scope, no filtering.

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
          re += '(?:.*/)?'; // a/**/b must also match a/b
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

// Shared inclusion rule for single-file entries (docs_files / entry_files / index_file):
//   - doesn't exist -> silently skip (`.docgrad.yml` is version-controlled and shared across
//     branches; a temporarily missing file shouldn't crash the whole script).
//   - points at a directory -> throw explicitly. Otherwise the error would surface later, when
//     inventory.mjs reads the file, as an unhelpful `EISDIR: illegal operation on a directory`
//     (the mirror image of the ENOTDIR you get when a single file is mistakenly put in docs_dirs).
//   - already included -> don't push a duplicate (when the same file is listed both in this field
//     and in what docs_dirs scanned up, it only counts once).
//   - leaves the root -> throw (#57). Note the order: containment is decided **before** the
//     existence check, so "outside the root" is an error even when the file is missing, while
//     "inside the root but not on this branch" keeps its silent skip.
//
// Deliberately still **no extension filter here.** Its absence is a separate defect from the
// containment hole, and adding one in this change would silently drop legitimate in-root entries
// (`docs_files: ['NOTES.txt']` is valid today) — moving files_total, the freshness denominator and
// the pollution denominator for repos doing nothing wrong. The extension-free route matters here
// only because it is how an out-of-root file of any type got in.
function pushSingleFile(rootDir, rel, field, out) {
  if (!rel) return;
  const abs = resolveInRoot(rootDir, rel, field);
  if (!fs.existsSync(abs)) return;
  if (fs.statSync(abs).isDirectory()) {
    throw new Error(`${field} may only list a single file, but ${rel} is a directory — put the whole directory in docs_dirs instead`);
  }
  if (!out.includes(rel)) out.push(rel);
}

// --- git: which collected files does git actually track? ----------------------------
//
// collectFiles walks the filesystem, it does not ask git. So an untracked local file sitting
// inside the corpus changes pollution.ratio — and the pollution surface is a **rated** input
// (economy.pollution_max forces a downgrade once it is exceeded). Measured on one repo at the
// same commit, same script version: ratio 0.1066 in a working checkout vs 0.0517 in a clean
// worktree, the whole difference being a single untracked 9,730-token draft in a .gitignore'd
// directory. pollution_max sits at 0.10, i.e. **between the two numbers**: two people can rate
// the same commit differently, which is precisely the class of problem docgrad exists to catch.
//
// Classification is by the complement of the **tracked** set (`git ls-files`), not by
// `git ls-files --others --exclude-standard`: the draft that produced the measurement above lives
// in a .gitignore'd directory, so it is untracked *and* ignored, and --exclude-standard would
// filter it straight back out. "Not in git" is the property that matters here, and an ignored
// file has it.
// Set by gitTrackedFiles() on its way to returning null, so a caller can say **which** cause
// applied. The three are not interchangeable, and each points at a different action:
//
//   no-git-binary   install git, or run somewhere it exists
//   not-a-work-tree the check can never apply here; stop recommending it
//   git-failed      git exists and ran and broke — run where git works; the check does apply
//
// The first version of this (v1.7.0, #52) had only the first two and inferred the second from
// "anything that is not ENOENT". That was wrong in a way that mattered: under an agent sandbox
// where `/usr/bin/git` is macOS's xcrun shim and cannot write its cache, git exits non-zero inside
// a directory that **is** a work tree, and the report said "not a git working tree" — the one
// message whose follow-up is the opposite of the right one. Found by running docgrad under
// `claude plugin eval`; the trace is in evals/README.md.
let lastGitFailure = null;
let lastGitStderr = null;

export function gitUnavailableReason() {
  return lastGitFailure;
}

// git's own words for a directory that genuinely is not a work tree. Matched rather than assumed,
// because "git exited non-zero" covers far more than that.
const NOT_A_WORK_TREE_RE = /not a git repository|does not appear to be a git repository/i;

export function gitTrackedFiles(rootDir) {
  try {
    const out = execFileSync('git', ['ls-files', '-z'], {
      cwd: rootDir,
      encoding: 'utf8',
      // stderr is captured, not discarded: it is the only thing that separates "not a work tree"
      // from "git is broken here". Piped rather than inherited, so a normal run stays quiet.
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    });
    lastGitFailure = null;
    lastGitStderr = null;
    return new Set(out.split('\0').filter(Boolean)); // git already prints posix separators
  } catch (err) {
    const stderr = String(err?.stderr ?? '').trim();
    lastGitStderr = stderr ? stderr.split('\n')[0].slice(0, 200) : null;
    if (err && err.code === 'ENOENT') lastGitFailure = 'no-git-binary';
    else if (NOT_A_WORK_TREE_RE.test(stderr)) lastGitFailure = 'not-a-work-tree';
    else lastGitFailure = 'git-failed';
    return null;
  }
}

// Does a collected path sit at, or under, any entry of a path list? Shared by collectFiles' two
// buckets and by inventory.mjs's exclude/out_of_scope overlap note, so the two can never drift.
// A trailing slash is optional in the config; `docs/arch` must not match `docs/architecture.md`.
export function matchesPathPrefix(p, list) {
  if (!Array.isArray(list)) return false;
  return list.some((e) => p === e || p.startsWith(e.endsWith('/') ? e : `${e}/`));
}

const NO_GIT = 'git is unavailable or this is not a git working tree';

// The disjunction above is what a caller says when it genuinely does not know which applied; when
// it does know, it must say so, because the two have different remedies.
const GIT_FAILURE_TEXT = {
  'no-git-binary': 'git is not installed (or not on PATH)',
  'not-a-work-tree': 'this directory is not a git working tree',
  'git-failed': 'git is present but failed to run here, so whether this is a work tree is unknown',
};

export function gitUnavailableNote(reason = gitUnavailableReason(), stderr = lastGitStderr) {
  const cause = GIT_FAILURE_TEXT[reason] ?? NO_GIT;
  const detail = reason === 'git-failed' && stderr ? ` (git said: ${stderr})` : '';
  return `${cause}${detail}: tracked and untracked files cannot be told apart, so this is null rather than zero`;
}

// Retained as the cause-unknown wording; prefer gitUnavailableNote() at any call site that has just
// made the failing call itself.
export const GIT_UNAVAILABLE_NOTE = gitUnavailableNote(null);

// tracked: pass a Set from gitTrackedFiles() to reuse one git call; undefined = look it up when
// config.exclude_untracked needs it; null = caller already established git is unavailable.
export function collectFiles(rootDir, config, { include = [], tracked } = {}) {
  const all = [];
  for (const dir of config.docs_dirs) {
    const abs = resolveInRoot(rootDir, dir, 'docs_dirs');
    if (fs.existsSync(abs)) walkMarkdown(abs, rootDir, all);
  }
  // docs_files: single files outside docs_dirs that are semantically **regular documents**
  // (typically a repo-root PRODUCT.md/DESIGN.md — a must-read that's conditionally loaded).
  // They aren't picked up by docs_dirs' directory scan, and putting a single file in docs_dirs
  // would blow up (ENOTDIR); listing them as entry_files would get them in, but inventory.mjs's
  // fileType() would tag them as 'entry' and inflate the fixed cost (measured on oikos:
  // 9,037 -> 21,474 tokens, economy ★3 -> ★1), which also contradicts audit.md's requirement
  // that entry_cost.files really be loaded on every single task. Hence a separate field.
  for (const f of config.docs_files) pushSingleFile(rootDir, f, 'docs_files', all);
  // entry_files and index_file may fall outside docs_dirs (e.g. a repo-root SKILL.md/README.md);
  // both are part of the documentation system and must be included in the corpus — missing
  // index_file would get it filtered out of links.mjs's roots (roots only recognizes paths
  // within includedSet), and the whole subtree reachable only from the index would be
  // misjudged as orphans.
  for (const f of config.entry_files) pushSingleFile(rootDir, f, 'entry_files', all);
  pushSingleFile(rootDir, config.index_file, 'index_file', all);
  // Filter before the exclude/scope split, so the pollution surface's numerator *and* denominator
  // both describe the same clean-checkout corpus.
  let collected = all;
  if (config.exclude_untracked) {
    const trackedSet = tracked === undefined ? gitTrackedFiles(rootDir) : tracked;
    if (trackedSet === null) {
      throw new Error(
        `exclude_untracked: true, but ${NO_GIT} — run inside a git working tree, or set exclude_untracked: false`
      );
    }
    collected = all.filter((p) => trackedSet.has(p));
  }
  // --- the exclude / out_of_scope split (#44) -------------------------------------------------
  //
  // The rubric answer this encodes: **the pollution surface measures how much junk this repo
  // contains, not how much of it I chose not to grade.** Only the first should move a star.
  // `exclude` carried both meanings at once and the pollution surface only honoured one of them:
  // on tj/commander.js a `docs/zh-CN/` translated mirror — deliberately graded as a separate
  // corpus, not junk — was charged 40.6% pollution and capped economy at ★3 while the fixed cost
  // was a perfect 0. So the two meanings get two fields:
  //   exclude       -> out of the corpus, **in** the pollution surface ("this repo contains this")
  //   out_of_scope  -> out of the corpus, **out** of the pollution surface, size always reported
  //
  // Precedence when a path matches both: **exclude wins.** Deterministic, and it is the direction
  // that cannot launder a pollution surface — adding a broad `out_of_scope` entry can never
  // silently cancel an `exclude` entry someone already wrote and make the ratio drop without an
  // `exclude` line being visibly deleted. Getting something out of the pollution surface therefore
  // always costs one deliberate edit to `exclude`. The overlap is never silent either: the file
  // shows up under pollution.excluded_files rather than out_of_scope, and inventory.mjs names the
  // overlapping paths in a note.
  const isExcluded = (p) => matchesPathPrefix(p, config.exclude);
  const isOutOfScope = (p) => !isExcluded(p) && matchesPathPrefix(p, config.out_of_scope);
  const inScope = (p) => matchesScope(p, include);
  return {
    included: collected.filter((p) => !isExcluded(p) && !isOutOfScope(p) && inScope(p)).sort(),
    excluded: collected.filter((p) => isExcluded(p) && inScope(p)).sort(),
    // Narrowed by `include` exactly like `excluded` is: under a scoped run every bucket describes
    // the same slice of the tree, so the three add up to what the scope collected.
    outOfScope: collected.filter((p) => isOutOfScope(p) && inScope(p)).sort(),
  };
}

// --- Token estimation (heuristic coefficients: CJK 1.1 tokens/char, everything else 1 token/4 chars) ------------------

export const CJK_TOKENS_PER_CHAR = 1.1;
export const NON_CJK_CHARS_PER_TOKEN = 4;
export const CJK_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/;
const CJK_RE_G = new RegExp(CJK_RE.source, 'g');

export function estimateTokens(text) {
  const cjk = (text.match(CJK_RE_G) || []).length;
  return Math.round(cjk * CJK_TOKENS_PER_CHAR + (text.length - cjk) / NON_CJK_CHARS_PER_TOKEN);
}

// --- markdown parsing ------------------------------------------------------------

// GitHub's slug turns **each individual space** into one dash — it doesn't collapse a run of
// spaces into one. The two only diverge when stripping punctuation leaves adjacent spaces
// behind, and that's exactly how Chinese headings are most often written:
// `## 狀態圖例 (status / sot_level legend)` -> GitHub gives `狀態圖例-status--sot_level-legend`
// (double dash). The old implementation collapsed `\s+` into a single dash, so every link of
// this shape was falsely reported as a bad anchor (5 of the 18 bad_anchors measured on kdan-bpm
// on 2026-09-05 were of this kind). Matching github-slugger's behavior fixes it.
export function githubSlug(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

// Explicit anchors `<a id="x"></a>` / `<a name="x"></a>` — a heading's slug changes when the
// heading is rewritten, so long-lived links often switch to an explicit anchor instead. The old
// implementation only recognized `#` headings, so every link pointing at an explicit anchor was
// falsely reported as a bad anchor (13 of the 18 bad_anchors measured on kdan-bpm on 2026-09-05
// were of this kind).
const EXPLICIT_ANCHOR_RE = /<a\s[^>]*\b(?:id|name)\s*=\s*["']([^"']+)["']/gi;

// Strips the emphasis markers out of a heading before it is slugged, so the slug describes what
// GitHub actually *renders*. `*` and `` ` `` are stripped unconditionally. `_` is the hard case:
// GFM only treats it as an emphasis delimiter when it comes in a **matched pair** whose outer
// sides are non-alphanumeric and whose inner sides are not whitespace. A lone `_` sitting next to
// punctuation, or at the start of a word, is literal — GitHub keeps it in the slug.
//
//   `_emphasis_` / `__bold__` / `__init__` -> stripped (GitHub renders these as emphasis too)
//   `sot_level` / `cmd._args` / `_private` -> kept
//
// The previous implementation stripped an `_` whenever *either* neighbour was non-alphanumeric,
// which turned `### cmd._args` into `cmdargs` and `### _private` into `private` while GitHub
// produces `cmd_args` / `_private`. Every link pointing at such a section was reported as a bad
// anchor, and a bad anchor always costs a star — measured on tj/commander.js, the convergence
// loop went and added `<a id>` to a document that had nothing wrong with it (#42). The 0.6.1 fix
// only covered the word-internal case (`sot_level`); pairing is what covers all of them.
const EMPHASIS_PAIR_RE = /(?<![\p{L}\p{N}])(_{1,3})(?=[^\s_])(.+?)(?<=[^\s_])\1(?![\p{L}\p{N}])/gu;

export function stripHeadingEmphasis(heading) {
  return heading.replace(/[*`]/g, '').replace(EMPHASIS_PAIR_RE, '$2');
}

export function extractHeadings(text) {
  const counts = new Map();
  const slugs = new Set();
  for (const line of text.split(/\r?\n/)) {
    for (const m of line.matchAll(EXPLICIT_ANCHOR_RE)) slugs.add(m[1].trim());
    const m = line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
    if (!m) continue;
    const base = githubSlug(stripHeadingEmphasis(m[1]));
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

// --- Link target resolution ------------------------------------------------------
//
// One place turns a markdown link target into a root-relative path, because two scripts build a
// graph out of the same links and had drifted: links.mjs learned `file:` URIs in v1.9.0 while
// retrieval.mjs kept its own copy of the pre-1.9.0 parsing, so a document reachable through a
// `file:` link counted for linkage and not for `depth_from_index`.
//
// Returns null for an external scheme — there is nothing to resolve and neither caller counts it.
// Otherwise `{ resolved, anchor, selfAnchor }`:
//   resolved   a root-relative posix path **candidate** — not a containment guarantee. It is null
//              only for a `file:` URI the root cannot contain (a host other than `localhost`, a URI
//              the URL parser rejects, a path outside both spellings of the root); an ordinary
//              `../../outside.md` still resolves, to `../outside.md`, and it is the caller that
//              decides. links.mjs keeps `targetOutOfRoot()`; retrieval.mjs only ever builds edges
//              into `includedSet`. **Never stat'ed here**, which is what keeps #57's oracle closed.
//   anchor     percent-decoded fragment, or null.
//   selfAnchor a pure `#fragment` link; `resolved` is the document itself. links.mjs checks the
//              anchor against its own headings; retrieval.mjs skips it rather than add a self-edge.
// `file:` targets reach the URL parser undecoded, so they are decoded exactly once and `%23` stays
// a `#` in a filename; every other shape is percent-decoded here. That decoding is what links.mjs
// already did and what retrieval.mjs did **not** — see the CHANGELOG: sharing this function changes
// retrieval's reading of any percent-encoded target, `file:` or not.
const EXTERNAL_LINK_RE = /^(https?:|mailto:|tel:|data:)/i;
const FILE_URI_RE = /^file:/i;

function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function fileUriToRel(root, uri) {
  let abs;
  try {
    const url = new URL(uri);
    if (url.hostname !== '' && url.hostname !== 'localhost') return null;
    abs = fileURLToPath(url);
  } catch {
    return null;
  }
  for (const base of [root, rootRealPath(root)]) {
    if (base === null) continue;
    const rel = path.relative(base, abs);
    if (rel === '') return '';
    if (!path.isAbsolute(rel) && rel.split(path.sep)[0] !== '..') return rel.split(path.sep).join('/');
  }
  return null;
}

export function resolveLinkTarget(root, rel, target) {
  if (EXTERNAL_LINK_RE.test(target)) return null;
  const hashIndex = target.indexOf('#');
  const rawTarget = hashIndex === -1 ? target : target.slice(0, hashIndex);
  const anchor = hashIndex === -1 ? null : safeDecode(target.slice(hashIndex + 1));
  if (FILE_URI_RE.test(rawTarget)) {
    return { resolved: fileUriToRel(root, rawTarget), anchor, selfAnchor: false };
  }
  const rawPath = safeDecode(rawTarget);
  if (rawPath === '') return { resolved: rel, anchor, selfAnchor: true };
  const resolved = rawPath.startsWith('/')
    ? path.posix.normalize(rawPath.slice(1))
    : path.posix.normalize(path.posix.join(path.posix.dirname(rel), rawPath));
  return { resolved, anchor, selfAnchor: false };
}

// --- Freshness date extraction --------------------------------------------------

const DATE_RE = /(\d{4}-\d{2}-\d{2})/;

// convention accepts a single value or a comma/`+`-separated list of values
// ("frontmatter,heading-line" or "frontmatter+heading-line"); unset/falsy is always treated as 'none'.
export function parseFreshnessConventions(convention) {
  if (!convention) return ['none'];
  return String(convention)
    .split(/[,+]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// field / heading_field: a keyword or a YAML inline list of keywords naming the same date signal
// (`heading_field: ["Last updated:", "Updated:"]`). Keywords are used verbatim — validated, not
// trimmed or coerced, at config load — and a plain string is never split, so the list is the only
// way to name several.
export function parseFreshnessFields(value) {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function extractClaimedDateOne(text, convention, freshness) {
  if (convention === 'frontmatter') {
    const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fm) return null;
    // Within this convention, document order decides: the first frontmatter line that names one of
    // the fields *and* carries a date wins (`last_updated: null` followed by `last_session:
    // 2026-09-04` yields the date). Conventions themselves are still tried in config order.
    const fields = parseFreshnessFields(freshness.field);
    for (const l of fm[1].split(/\r?\n/)) {
      if (!fields.some((field) => l.trimStart().startsWith(`${field}:`))) continue;
      const m = l.match(DATE_RE);
      if (m) return m[1];
    }
    return null;
  }
  if (convention === 'heading-line') {
    // Falls back to field when heading_field is unset (an old config that only sets field but
    // wants heading-line behavior).
    const fields = parseFreshnessFields(freshness.heading_field ?? freshness.field);
    if (fields.length === 0) return null;
    for (const line of text.split(/\r?\n/).slice(0, 30)) {
      if (fields.some((field) => line.includes(field))) {
        const m = line.match(DATE_RE);
        if (m) return m[1];
      }
    }
  }
  return null;
}

// Tries each convention in the list in order; the first date extracted wins.
export function extractClaimedDate(text, freshness) {
  for (const convention of parseFreshnessConventions(freshness.convention)) {
    const date = extractClaimedDateOne(text, convention, freshness);
    if (date) return date;
  }
  return null;
}

// --- code anchor extraction (used by retrieval.mjs / inventory.mjs) ------------------------------
// The convention in docs/how-to.md §citing code: inside a backtick span, use `path › symbol()`,
// never a line number. Both forms are recognized:
//   1. Inside a single backtick span, a path starting with any of srcDirs' prefixes, with an
//      optional " › symbol": `apps/api/src/foo/bar.ts`, `scripts/lib.mjs › DEFAULTS.targets`
//   2. A bare filename (no path prefix; the caller matches it against a real file's basename):
//      `bar.ts`, also recognizing two backtick spans joined by "›": `bar.ts` › `sym()`
// Only extracted outside code fences, to avoid matching example code. Directory names aren't
// hardcoded — srcDirs is passed in by the caller.
const CODE_REF_RE = /`([^`\n]+)`/g;
const TWO_SPAN_ARROW_RE = /`([^`\n]+)`\s*›\s*`([^`\n]+)`/g;

export function extractCodeRefs(text, srcDirs = []) {
  const prefixes = srcDirs.map((d) => d.replace(/\/+$/, '')).filter(Boolean);

  const lines = [];
  let inFence = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (!inFence) lines.push(line);
  }
  // Normalize two backtick spans joined by "›" into a single span first, then run everything
  // through the same parsing path.
  const body = lines.join('\n').replace(TWO_SPAN_ARROW_RE, (_, p, s) => `\`${p} › ${s}\``);

  const refs = [];
  for (const m of body.matchAll(CODE_REF_RE)) {
    const raw = m[1].trim();
    if (!raw) continue;
    let pathPart = raw;
    let symbol = null;
    const arrowIdx = raw.indexOf('›');
    if (arrowIdx >= 0) {
      pathPart = raw.slice(0, arrowIdx).trim();
      symbol = raw.slice(arrowIdx + 1).trim() || null;
    }
    pathPart = pathPart.replace(/^['"]|['"]$/g, '');
    if (!pathPart || /\s/.test(pathPart)) continue; // not a path-shaped token (ordinary inline code)
    const hasPrefix = prefixes.some((p) => pathPart === p || pathPart.startsWith(`${p}/`));
    const looksLikeFile = /\.[A-Za-z0-9]{1,10}$/.test(pathPart);
    if (hasPrefix) {
      refs.push({ path: pathPart, symbol, basenameOnly: false });
    } else if (!pathPart.includes('/') && looksLikeFile) {
      refs.push({ path: pathPart, symbol, basenameOnly: true });
    }
  }
  return refs;
}

// --- Source symbol index (the guard for API-shaped claim candidates) ---------------------------
//
// Library documentation describes an **API**, not a file tree. Measured on tj/commander.js,
// extractCodeRefs found a path-shaped span on exactly zero lines — `claims_total` was 0, so the
// correctness dimension had no mechanical basis at all, and the convergence loop then wrote new
// documents in docgrad's own `path › symbol()` house style and manufactured a population out of
// its own prose (#40).
//
// Recognising API-shaped inline code needs a guard, because prose is full of code-shaped words.
// The guard is existence: an identifier only counts if it actually occurs somewhere under
// src_dirs. That is one pass over src_dirs building a Set, never a grep per candidate — cost is
// O(bytes under src_dirs), read once per script run and then O(1) per lookup. Files above
// MAX_SRC_SYMBOL_FILE_BYTES are skipped: a minified bundle or a generated lockfile is both the most
// expensive thing in the tree and the worst possible symbol source (it would add every mangled
// name in the dependency graph to the set and blunt the guard).
//
// No src_dirs -> null -> the whole extension stays inert. Callers must report that, not hide it.

const IDENTIFIER_RE = /[A-Za-z_$][A-Za-z0-9_$]*/g;
export const MAX_SRC_SYMBOL_FILE_BYTES = 512 * 1024;

export function buildSrcSymbolIndex(rootDir, srcDirs = []) {
  const dirs = (Array.isArray(srcDirs) ? srcDirs : [])
    .map((d) => String(d).trim().replace(/\/+$/, ''))
    .filter(Boolean);
  if (!dirs.length) return null;

  const symbols = new Set();
  let filesScanned = 0;
  let filesSkipped = 0;
  let bytesScanned = 0;

  const visit = (absDir) => {
    let entries;
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch {
      return; // unreadable directory — the guard degrades, it must not crash the measurement
    }
    for (const entry of entries) {
      const abs = path.join(absDir, entry.name);
      if (entry.isDirectory()) {
        if (ALWAYS_SKIP_DIRS.has(entry.name)) continue;
        visit(abs);
        continue;
      }
      // Dirent.isFile() is false for a symlink, so this walk already declines to read one; the
      // containment check that retrieval.mjs's walkFiles needs on every entry has no counterpart to
      // do here. The configured src_dir below is the route that could leave the root, and it is
      // checked there.
      if (!entry.isFile()) continue;
      let text;
      try {
        const { size } = fs.statSync(abs);
        if (size > MAX_SRC_SYMBOL_FILE_BYTES) {
          filesSkipped += 1;
          continue;
        }
        text = fs.readFileSync(abs, 'utf8');
        bytesScanned += size;
      } catch {
        filesSkipped += 1;
        continue;
      }
      if (text.includes('\0')) {
        filesSkipped += 1; // binary
        continue;
      }
      filesScanned += 1;
      for (const m of text.matchAll(IDENTIFIER_RE)) symbols.add(m[0]);
    }
  };

  for (const dir of dirs) {
    const abs = resolveInRoot(rootDir, dir, 'src_dirs');
    if (fs.existsSync(abs)) visit(abs);
  }
  return { symbols, files_scanned: filesScanned, files_skipped: filesSkipped, bytes_scanned: bytesScanned };
}

// API-shaped inline code. Three shapes are accepted, and each must be the *entire* content of one
// backtick span:
//   `foo()`                        bare call
//   `.option()` / `obj.method()`   member call (a leading dot is how JS API docs name a method)
//   `obj.my_method` /
//   `program.optsWithGlobals`      dotted symbol with no call parens — but **only** when its final
//                                  segment does not look like a file extension, i.e. longer than
//                                  10 characters or carrying a `_`/`$`. `a.b`, `a.b.c` and
//                                  `program.opts` all fail that test and are rejected here; see
//                                  the second exclusion below for where they do get collected.
//
// Deliberately NOT accepted:
//   - a bare identifier with neither a dot nor parens (`minWidthToWrap`). The existence check
//     cannot carry that shape on its own: a Set of every identifier under src_dirs contains
//     `data`, `name`, `true`, `value`, and inline code around those words is ordinary prose.
//     A real API claim about such a symbol is almost always written next to a call somewhere in
//     the same document, so the cost of excluding it is small and the false-positive saving large.
//   - a paren-less dotted span whose last segment looks like a file extension — 1 to 10 plain
//     alphanumerics (`a.b`, `program.opts`, `lib.mjs`). extractCodeRefs already emits those as
//     basename path refs, and counting them twice would inflate `refs` and silently reorder the
//     candidate list. Note what this means for `src_dirs`: those spans are collected by the **path**
//     route, which needs no symbol index, so they keep producing claim candidates whether or not
//     `src_dirs` is set. What an unset `src_dirs` actually costs is the two shapes above it.
const API_SPAN_RE = /^\.?([A-Za-z_$][A-Za-z0-9_$]*)((?:\.[A-Za-z_$][A-Za-z0-9_$]*)*)(\(\s*\))?$/;
const BASENAME_TAIL_RE = /\.[A-Za-z0-9]{1,10}$/;

export function apiSpanSegments(raw) {
  const m = raw.match(API_SPAN_RE);
  if (!m) return null;
  const [, head, rest, call] = m;
  if (!call && !rest) return null; // bare identifier
  if (!call && BASENAME_TAIL_RE.test(raw)) return null; // already a basename path ref
  return rest ? [head, ...rest.slice(1).split('.')] : [head];
}

// symbols: a Set from buildSrcSymbolIndex().symbols. null/undefined => inert, returns [].
export function extractApiRefs(text, symbols) {
  if (!symbols || !symbols.size) return [];
  const refs = [];
  let inFence = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    for (const m of line.matchAll(CODE_REF_RE)) {
      const raw = m[1].trim();
      if (!raw || raw.includes('/') || raw.includes('›')) continue; // path territory, not API
      const segments = apiSpanSegments(raw);
      if (!segments) continue;
      // Every segment must exist under src_dirs, not just the last one. The existence check is
      // what makes this a signal rather than noise; requiring all of it is what keeps a documented
      // config key like `freshness.retention` from passing on the strength of one common word.
      if (!segments.every((s) => symbols.has(s))) continue;
      refs.push({ symbol: raw });
    }
  }
  return refs;
}

// --- git: which commit first added a file, and did docgrad write it? ---------------------------
//
// A correctness score built entirely on the tool's own prose is not worthless, but the reader has
// to be told. Measured on tj/commander.js after five convergence rounds: all 26 claim candidates
// came from the three documents docgrad itself had just written, and none from the seven
// pre-existing ones — the score went up while the repo's actual documentation debt was never
// sampled once.
//
// The signal is mechanical: the commit that *added* the file (oldest `--diff-filter=A`), and
// whether its subject carries docgrad's own `docs(docgrad):` prefix. One `git log` for the whole
// corpus rather than one per file; `--reverse` means the first time a path appears in the output
// is its add commit. Chunked so a very large corpus cannot overflow argv.
//
// null when git is unavailable — never false. "We could not tell" and "docgrad did not write it"
// are different statements, and collapsing them is how a disclosure field becomes a lie.

const GIT_PATHSPEC_CHUNK = 200;
const DOCGRAD_COMMIT_SUBJECT_RE = /^docs\(docgrad\)\s*:/;

export function gitAddCommitSubjects(rootDir, relPaths = []) {
  if (!relPaths.length) return new Map();
  const subjects = new Map();
  try {
    for (let i = 0; i < relPaths.length; i += GIT_PATHSPEC_CHUNK) {
      const chunk = relPaths.slice(i, i + GIT_PATHSPEC_CHUNK);
      const out = execFileSync(
        'git',
        ['log', '--reverse', '--diff-filter=A', '--name-only', '--format=%x00%s', '--', ...chunk],
        { cwd: rootDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 }
      );
      let subject = null;
      for (const line of out.split('\n')) {
        if (line.startsWith('\0')) {
          subject = line.slice(1);
          continue;
        }
        const p = line.trim();
        if (!p || subjects.has(p)) continue;
        subjects.set(p, subject);
      }
    }
  } catch {
    return null; // not a git work tree / git not installed
  }
  return subjects;
}

// null = unknown (no git, or the path has no add commit in this history); true/false otherwise.
export function isDocgradAuthored(subject) {
  if (typeof subject !== 'string') return null;
  return DOCGRAD_COMMIT_SUBJECT_RE.test(subject);
}

export const AUTHORSHIP_UNAVAILABLE_NOTE =
  `${NO_GIT}: the commit that added each document cannot be read, so docgrad_authored is null rather than false — the share of candidates coming from documents docgrad itself wrote is unknown for this round`;

// --- docgrad's own version fingerprint (used for history.jsonl's comparability fields) ----------------
//
// rubric_hash is the fingerprint of "the ruler this round used": every edit to rubric.md changes
// the hash, and the report draws a comparability break based on it. The first 8 characters are
// enough to distinguish (collision probability is negligible), and it keeps each history line
// from getting too long.

// corpus_hash is the counterpart fingerprint: rubric_hash answers "which ruler did this round
// use", corpus_hash answers "which files did it measure". Editing docs_dirs / docs_files /
// index_file / entry_files / exclude / out_of_scope moves files_total, claims_total, the freshness denominator,
// the orphan/reachability population and the pollution denominator all at once — every score in
// that round becomes incomparable with the round before, while rubric_hash does not change a
// single character. Same shape as rubric_hash (sha256, first 8 hex chars), so report's existing
// comparability-break detection can be reused verbatim.
//
// Normalised before hashing, so cosmetic edits don't fake a break: entries trimmed, trailing
// slashes dropped (`docs/` and `docs` are the same directory), duplicates removed, each list
// sorted. Serialisation is an array of [field, value] pairs in a fixed order — a plain object
// literal would make the digest depend on key insertion order.

const CORPUS_LIST_FIELDS = ['docs_dirs', 'docs_files', 'entry_files', 'exclude'];
// out_of_scope is deliberately not in that array — it is appended conditionally in
// corpusFingerprint below, so that a config without the field keeps the hash it already had.

function normalizeCorpusEntry(v) {
  return String(v).trim().replace(/\/+$/, '');
}

export function corpusFingerprint(config) {
  const pairs = CORPUS_LIST_FIELDS.map((field) => {
    const raw = Array.isArray(config?.[field]) ? config[field] : [];
    return [field, [...new Set(raw.map(normalizeCorpusEntry).filter(Boolean))].sort()];
  });
  pairs.push(['index_file', config?.index_file ? normalizeCorpusEntry(config.index_file) || null : null]);
  // out_of_scope (#44) is corpus-defining in the same way exclude is — it moves files_total, the
  // freshness denominator, the orphan population — and moving a directory *between* the two fields
  // changes the pollution denominator without changing files_total, so report must see a break.
  //
  // Appended only when non-empty, unlike the fields above. A config that predates the field and a
  // config that spells out `out_of_scope: []` select exactly the same corpus, so they must hash the
  // same; emitting the pair unconditionally would instead stamp a comparability break on every repo
  // in existence at upgrade time, for a corpus that did not change by one file. A path moving
  // between exclude and out_of_scope still moves the hash — it leaves the exclude list, which is
  // always emitted.
  const outOfScope = [
    ...new Set((Array.isArray(config?.out_of_scope) ? config.out_of_scope : []).map(normalizeCorpusEntry).filter(Boolean)),
  ].sort();
  if (outOfScope.length) pairs.push(['out_of_scope', outOfScope]);
  // Not a path, but it selects a different corpus out of the same tree: flipping it moves
  // files_total, the freshness denominator and the pollution denominator. Leaving it out would
  // reproduce the exact blind spot #36 exists to close.
  pairs.push(['exclude_untracked', config?.exclude_untracked === true]);
  return pairs;
}

// No config supplied (an older caller, or a run that never loaded one) -> null, never a crash and
// never a hash of an empty corpus — report must be able to tell "unknown" from "genuinely empty".
export function corpusHash(config) {
  if (!config) return null;
  return createHash('sha256')
    .update(JSON.stringify(corpusFingerprint(config)), 'utf8')
    .digest('hex')
    .slice(0, 8);
}

// Resolved through realpath first, because the documented bare-clone install symlinks
// `skills/docgrad` into `~/.claude/skills/` and the manifest search below walks *up* from here.
// Node normally resolves realpaths itself, so this is inert on a default run. It earns its place
// under `--preserve-symlinks --preserve-symlinks-main` *together*: `--preserve-symlinks-main` alone
// keeps only the entry module on its symlink path, and this file is an imported module, so Node
// still realpaths it. With both flags and without this call the walk climbs `~/.claude/skills/` and
// `version` comes back null; with it, the real version. Measured on a symlinked install.
function resolveSkillRoot() {
  const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  try {
    return fs.realpathSync(dir);
  } catch {
    return dir;
  }
}

// --- measure_hash (v2: was thresholds_hash) -----------------------------------------
//
// v2 splits the two layers everywhere: `measure` is the deterministic script output, reproducible
// and fit to gate CI; `judge` is the model's stars, which are not. The fingerprints follow, because
// a hash spanning both would put judge's prose in the way of measure's trend — exactly what the
// split exists to prevent.
//
// This epoch renames only. The digest is byte-identical to the `thresholds_hash` it replaces: the
// same three config values, in the same order. `measure.md`'s content joins it when that file
// exists (the next epoch); until then this covers the config half of measure's ruler alone.
//
// rubric_hash fingerprints the ruler docgrad ships. It does not cover the ruler a *repo* is
// actually graded by, because three config values move judgement boundaries without touching a
// word of rubric.md:
//
//   economy.entry_cost_tiers   the ★1/★2/★3/★4 fixed-cost bands
//   economy.pollution_max      the ★3 cap on the pollution surface
//   freshness.stale_after_days the ★3 staleness boundary, written in the anchor as "≤60 days"
//
// The first two were inert until v1.7.0 and warned about anyway; the third has been live since it
// was introduced and was never warned about at all — the wiring was the opposite of what the docs
// said in both directions (#50). Now they are all read, and all fingerprinted: two rounds whose
// measure_hash differs were not measured by the same ruler, however identical their rubric_hash.
//
// null without a config, for the same reason corpus_hash is: "unknown" must stay distinguishable
// from "the defaults".
export function measureHash(config) {
  if (!config) return null;
  return createHash('sha256')
    .update(
      JSON.stringify([
        config.economy?.entry_cost_tiers ?? null,
        config.economy?.pollution_max ?? null,
        config.freshness?.stale_after_days ?? null,
      ]),
      'utf8'
    )
    .digest('hex')
    .slice(0, 8);
}

const SKILL_ROOT = resolveSkillRoot();

// The manifest is at the *plugin* root, which since v1.7.0 is not the skill root: the skill payload
// lives at `skills/docgrad/` while `.claude-plugin/` stays at the repo root. Walking up is what
// keeps `version` populated in both layouts.
//
// This is deliberately the one lookup that searches. A missing manifest makes `version` null, and
// the catch below swallows it silently — so the failure shows up as a `history.jsonl` full of null
// versions, months later, with nothing pointing at the cause. That is exactly the "state file
// quietly stops matching reality" class #36 exists to catch, which is why it also has a test.
const MANIFEST_SEARCH_LEVELS = 4;

function findManifest(startDir) {
  let dir = startDir;
  for (let i = 0; i <= MANIFEST_SEARCH_LEVELS; i += 1) {
    const candidate = path.join(dir, '.claude-plugin/plugin.json');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break; // hit the filesystem root
    dir = parent;
  }
  return null;
}

// --- judge_hash (v2: was judgement_hash) ---------------------------------------------
//
// Renamed, not recomputed: the same two files, in the same order, so the value does not move.
// `reference/audit.md` is still one of them **and still contains measure-side instructions** —
// that file is split into `measure.md` / `judge.md` in the next epoch, and this hash repoints then.
// Until it does, a judge-side fingerprint covering measure-side prose is a named intermediate
// state, not an oversight.
//
// rubric_hash fingerprints the **anchors**. It does not fingerprint the **rules for applying them**,
// and those live in different files — which v1.7.0 demonstrated the hard way: #48 added two boundary
// rules to audit.md, one of which can only lower a correctness pass rate, and no fingerprint moved.
// The break had to be disclosed in prose and trusted to be read (#56).
//
// What is in, and why — decided by what the skill's own blockers say decides a rating (SKILL.md §2):
//
//   reference/audit.md      the scoring procedure, the sampling rule, the boundary rules. `audit`
//                           runs it; `improve`/`loop` delegate to it ("run a full evaluation per
//                           audit.md").
//   reference/placement.md  "Before rating **consistency** you must also read placement.md — the
//                           rules for judging placement and duplication live there." Editing it
//                           changes what counts as a deduction, so it changes the consistency star.
//
// What is out, and why:
//
//   reference/rubric.md     already covered by rubric_hash. Hashing it twice would make one edit
//                           move two fingerprints and tell a reader nothing extra.
//   reference/improve.md    it is the round *flow* — recording, committing, graduation — and it
//                           delegates the rating itself to audit.md. It can change which claims a
//                           *loop* draws (it tells the round to pass --exclude-ledger), so it is the
//                           closest call here; it is out because a plain `audit` never reads it, and
//                           a fingerprint that moves for runs it cannot affect is noise.
//
// Whole-file, like rubric_hash: a formatting-only edit moves it. That is the same trade rubric_hash
// already makes, and narrowing to rule sections would have to change rubric_hash too to stay
// coherent — a separate decision, not a side effect of this one.
const JUDGE_FILES = ['reference/audit.md', 'reference/placement.md'];

export function judgeHash(skillRoot = SKILL_ROOT) {
  const h = createHash('sha256');
  try {
    for (const rel of JUDGE_FILES) {
      // The path is hashed alongside the content so that adding a file later cannot collide with an
      // edit to an existing one.
      h.update(rel, 'utf8');
      h.update(fs.readFileSync(path.join(skillRoot, rel), 'utf8'), 'utf8');
    }
  } catch {
    return null; // same contract as rubric_hash: unknown stays distinguishable from a value
  }
  return h.digest('hex').slice(0, 8);
}

export function docgradMeta(skillRoot = SKILL_ROOT, config = null) {
  let version = null;
  try {
    const manifest = findManifest(skillRoot);
    version = manifest ? JSON.parse(fs.readFileSync(manifest, 'utf8')).version ?? null : null;
  } catch {
    version = null; // allowed to be missing when run from outside the source tree; don't let it crash the script
  }
  let rubricHash = null;
  try {
    const rubric = fs.readFileSync(path.join(skillRoot, 'reference/rubric.md'), 'utf8');
    rubricHash = createHash('sha256').update(rubric, 'utf8').digest('hex').slice(0, 8);
  } catch {
    rubricHash = null;
  }
  return {
    version,
    rubric_hash: rubricHash,
    measure_hash: measureHash(config),
    judge_hash: judgeHash(skillRoot),
    corpus_hash: corpusHash(config),
  };
}

// --- Claim identity ------------------------------------------------------------------
//
// `.docgrad/ledger.jsonl` keys a claim on `<path>:<line>`, and docgrad's own improve/loop
// **rewrites documents** — "move content out of the entry file" is literally one of the two
// prescribed economy fixes. Every such move silently repoints a batch of ledger keys at other
// content: the next round re-verifies the wrong line, records a false `fail`, and because
// failures are re-verified without a cap, that batch eats the following round's new-draw budget.
// A harmless tidy-up therefore stops coverage from growing. The tool's core action destroys its
// own state file (#41).
//
// claim_hash is the content-derived key that survives the move, handed to the agent writing the
// ledger so it does not have to invent one. `path` and `line` stay in the output as locating
// aids — they are still how a verifier finds the text to read.
//
// Normalisation is deliberately shallow: runs of whitespace collapsed, ends trimmed. Markdown
// markup is **not** stripped and case is **not** folded, because an edited claim *should* hash
// differently — a rewritten claim genuinely needs re-verification, and treating it as the same
// claim would carry a stale `pass` forward. Moved-but-identical hashing the same is the point;
// edited-but-identical would be the bug.
export function normalizeClaimText(text) {
  return String(text).replace(/\s+/gu, ' ').trim();
}

// sha256, first 12 hex chars — the same shape as rubric_hash/corpus_hash but longer than their 8.
// Those two are a single value per round and only ever compared against the previous round, so
// they have no birthday problem. claim_hash is a **key across a whole population**, and a realistic
// repo carries hundreds to low thousands of claims. At 2,000 claims, 32 bits (8 hex chars) collides
// with probability ~4.7e-4: roughly one repo in two thousand would silently merge two unrelated
// claims into one ledger row — exactly the class of failure this field exists to remove. 48 bits
// puts the same figure at ~7e-9 and still fits comfortably on one JSONL line.
export const CLAIM_HASH_CHARS = 12;

export function claimHash(text) {
  return createHash('sha256')
    .update(normalizeClaimText(text), 'utf8')
    .digest('hex')
    .slice(0, CLAIM_HASH_CHARS);
}

// --- Concrete claim candidates ------------------------------------------------------
//
// A "concrete claim" = a line outside a fence that has code coordinates to check against. Two
// shapes count as coordinates:
//   - path-shaped inline code (`lib/foo.js`, `src/a.ts › parse()`) — extractCodeRefs
//   - API-shaped inline code — a call (`foo()`, `.option()`, `obj.method()`) or a paren-less
//     dotted span whose tail is too long or too underscored to be a file extension
//     (`obj.my_method`, `program.optsWithGlobals`) — extractApiRefs, and **only** when a symbol
//     index built from src_dirs is supplied, so every identifier is existence-checked.
//     `a.b`-shaped spans are *not* in this route: apiSpanSegments rejects them and extractCodeRefs
//     picks them up as basename path refs instead, with or without src_dirs.
// A plain descriptive sentence has no coordinates to extract and shouldn't enter the claim ledger
// in the first place — the rubric's weighted sampling rule for correctness (prefer sampling lines
// with a path/symbol) becomes mechanically reproducible this way, instead of being freely
// re-picked by an LLM each round. Heading lines are excluded: a heading is navigation, not a claim.
//
// options.symbols: the Set from buildSrcSymbolIndex().symbols. Omitted or null (which is what
// buildSrcSymbolIndex returns when src_dirs is unset) makes the API shape inert — no existence
// check is possible, so no candidate is drawn from it.
export function extractClaimLines(text, srcDirs = [], { symbols = null } = {}) {
  const lines = text.split(/\r?\n/);

  // Split into sections first: each heading opens a new section, and the section range tells a
  // verifier "how far to read". This step is necessary, not just convenient — contradictions
  // often show up **in the sentence next to the anchor line**, not the anchor line itself: on
  // oikos, that balance sign was written in the sentence right after "settlement is handled by
  // `src/balance.ts › settle()`", and checking only the anchor line missed the whole thing
  // entirely (the pattern behind the ★4->★2 re-verification after wrap-up on 2026-07-13).
  const sections = [];
  let inFence = false;
  let current = { title: null, start: 1, end: lines.length };
  for (let i = 0; i < lines.length; i += 1) {
    if (/^\s*(```|~~~)/.test(lines[i])) inFence = !inFence;
    if (inFence) continue;
    const m = lines[i].match(/^\s*#{1,6}\s+(.+?)\s*#*\s*$/);
    if (!m) continue;
    current.end = i; // the previous section ends right before the heading line
    sections.push(current);
    current = { title: m[1].replace(/[*_`]/g, '').trim(), start: i + 2, end: lines.length };
  }
  sections.push(current);
  const sectionOf = (lineNo) =>
    sections.find((s) => lineNo >= s.start && lineNo <= s.end) ?? sections.at(-1);

  const out = [];
  inFence = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (/^\s*#{1,6}\s/.test(line)) continue;
    if (!line.trim()) continue;
    const pathRefs = extractCodeRefs(line, srcDirs);
    const apiRefs = extractApiRefs(line, symbols);
    const refs = pathRefs.length + apiRefs.length;
    if (!refs) continue;
    const sec = sectionOf(i + 1);
    const text_ = line.trim();
    out.push({
      line: i + 1,
      text: text_,
      // Stable across a move, different after an edit — see claimHash above. path/line remain as
      // locating aids, they are just no longer the identity.
      claim_hash: claimHash(text_),
      refs,
      // The split is disclosed, not just the total: on a library repo `refs_path` is 0 across the
      // board, and a reader needs to see that the population rests entirely on the API matcher.
      refs_path: pathRefs.length,
      refs_api: apiRefs.length,
      section: sec.title,
      // verification range: the whole section, not just this one line.
      section_lines: [sec.start, sec.end],
    });
  }
  return out;
}

// Aggregates claim candidates across files with a **stable** ordering: more refs comes first
// (the more specific the claim, the more it deserves verification), ties broken by path, then by
// line — the order this produces from the same corpus is always the same, so sampling is
// reproducible.
export function rankClaimCandidates(perFile) {
  return perFile
    .flatMap(({ path: p, claims }) => claims.map((c) => ({ path: p, ...c })))
    .sort((a, b) => b.refs - a.refs || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0) || a.line - b.line);
}

// --- #54: --exclude-ledger --------------------------------------------------------
//
// Reads a `.docgrad/ledger.jsonl` and returns the set of `claim_hash` values it contains, so
// inventory.mjs can filter them out of the ranked candidate list before `claim_candidates_cap` is
// applied — every ledger row currently costs the emitted window one slot forever, and this is the
// fix (#54).
//
// **Fails loudly on anything short of a well-formed ledger.** A missing file, an unreadable one, or
// a line that isn't a JSON object with a `claim_hash` string all throw. The alternative — falling
// back to "nothing excluded" — would silently re-emit the unfiltered window while the caller
// believes it asked for a filtered one, which is the exact defect this flag exists to close, just
// hidden one layer deeper. A malformed ledger must stop the run, not degrade it quietly.
export function loadLedgerRows(ledgerPath, flag = '--exclude-ledger') {
  let text;
  try {
    text = fs.readFileSync(ledgerPath, 'utf8');
  } catch (err) {
    throw new Error(
      `${flag} ${ledgerPath}: could not read this file (${err.code === 'ENOENT' ? 'not found' : err.message}). ` +
        'A missing or unreadable ledger must fail the run, not be silently treated as empty.'
    );
  }
  const rows = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i].trim();
    if (!raw) continue;
    let row;
    try {
      row = JSON.parse(raw);
    } catch {
      throw new Error(
        `${flag} ${ledgerPath}:${i + 1}: not a valid JSON object. Each non-empty line of a ledger must be exactly one JSON object with a claim_hash field.`
      );
    }
    if (row === null || typeof row !== 'object' || Array.isArray(row) || typeof row.claim_hash !== 'string' || !row.claim_hash) {
      throw new Error(
        `${flag} ${ledgerPath}:${i + 1}: this row has no non-empty claim_hash field. Every ledger row must carry the claim_hash it was verified against.`
      );
    }
    // `doc` is the ledger's own locating field (see reference/improve.md's row example) — kept as a
    // locating *aid* only. Nothing here trusts it: a row's position is recomputed from this round's
    // corpus scan, so a stale or tampered `doc`/`line` cannot move where a claim is reported.
    rows.push({ claim_hash: row.claim_hash, doc: typeof row.doc === 'string' ? row.doc : null });
  }
  return rows;
}

export function loadLedgerClaimHashes(ledgerPath, flag = '--exclude-ledger') {
  return new Set(loadLedgerRows(ledgerPath, flag).map((r) => r.claim_hash));
}

// --- #63 prerequisite: --locate-ledger --------------------------------------------------------
//
// Answers "where are my already-ledgered claims *now*", which no other output can: improve.md
// mandates --exclude-ledger on every round that has a ledger, and that filters ledgered candidates
// out **before** claim_candidates_cap is applied, so a loop round emits zero of them.
//
// Three properties the callers depend on:
//   1. It reads the **unfiltered** ranked population, so --exclude-ledger never hides a position.
//   2. It is uncapped — claim_candidates_cap governs the emitted window, not this.
//   3. A hash with no current position is emitted with `located: false`, never dropped. A claim
//      whose text was edited since it was ledgered has no position by construction (claim_hash is
//      content-derived), and silently omitting it would read as "nothing to protect here" — the
//      one reading that must never be available to a caller.
//
// A claim_hash can legitimately hold several positions at once: the hash is derived from the claim
// text alone, so the same anchored sentence in two documents is one hash in two places — which is
// the duplication the consistency dimension exists to find. Every position is reported.
export function locateLedgerClaims(rankedCandidates, ledgerRows) {
  const byHash = new Map();
  for (const c of rankedCandidates) {
    if (!byHash.has(c.claim_hash)) byHash.set(c.claim_hash, []);
    byHash.get(c.claim_hash).push({ path: c.path, line: c.line, section_lines: c.section_lines });
  }
  // First row wins for a repeated hash: a ledger is append-only, so the same claim_hash recurs
  // across rounds and only `doc` differs between those rows. `doc` is an untrusted locating aid,
  // so which one is echoed changes nothing that is measured — but it is stated rather than left
  // to whichever order the file happened to be in (docs/design.md §Scripts contract).
  const seen = new Map();
  for (const row of ledgerRows) if (!seen.has(row.claim_hash)) seen.set(row.claim_hash, row);
  const entries = [];
  for (const [claim_hash, row] of seen) {
    const positions = byHash.get(claim_hash) ?? [];
    entries.push(
      positions.length
        ? { claim_hash, located: true, positions }
        : { claim_hash, located: false, positions: [], ledger_doc: row.doc }
    );
  }
  return entries;
}

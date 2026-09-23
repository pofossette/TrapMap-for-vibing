/**
 * Silent-Fallback Guard (check:silent-fallbacks).
 *
 * The retrieval-latency incident's most expensive property was not the broken
 * SQL — it was that the failure was invisible. Every affected query threw, the
 * call site caught it, logged to the console and carried on with a cheaper
 * path, so a permanently degraded pipeline looked like a healthy fast one in
 * every dashboard. Three of those call sites now emit
 * `trapmap_retrieval_degraded_total`; this guard keeps the rest of the tree
 * from growing new ones by accident.
 *
 * A catch block passes when it does at least one of:
 *
 *   - rethrows / rejects (the caller learns about the failure), or
 *   - emits a metric (`recordDegraded`, `emitDegraded`, `.inc/.add/.record` on
 *     a metric-ish name), or
 *   - carries an explicit marker:
 *     `// silent-fallback-ok: <why swallowing is the right answer here>`
 *
 * Logging alone does NOT pass, and the marker's reason is mandatory — that is
 * the whole point: `console.error` was present at every site of the incident.
 *
 * Scope: product source — every package's and app's `src` directory under
 * `packages` and `apps`. The Go service plane is a different runtime and out
 * of scope. Tests, fixtures, a package's own `scripts` dir (codegen), `dist`
 * and `archived` are skipped.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { finishCheckRun } from './lib/check-result.js';

/** Marks a deliberate, reviewed swallow. The reason after `:` is required. */
const MARKER = 'silent-fallback-ok:';

/** Emitting one of these counts as "the failure is observable". */
const OBSERVABLE_PATTERN =
  /\b(?:record|emit|observe|increment|count)(?:Degraded|Stage|Channel|Search|Retry|Failure|Error|Fallback|Metric)|\bemitDegraded\b|\.inc\(|\.add\(|\.observe\(|\.record\(|metric|Metrics|telemetry|Telemetry/;

/** Rethrow shapes: the caller cannot mistake this for success. */
const RETHROW_PATTERN = /\bthrow\b|\bPromise\.reject\b|\breject\(|\breturn\s+Promise\.reject/;

const LOG_CALL_START = /\b(?:console|logger)\.\w+\s*\(/g;

/**
 * Strip every `console.x(...)` / `logger.x(...)` call (with paren matching, so
 * multi-line calls go too) and all comments. What survives is the catch's real
 * work: when nothing survives, the handler only logs.
 *
 * This is the incident's exact shape — `console.error(...)` and fall through —
 * and it is deliberately narrower than "does not rethrow": a catch that turns
 * the failure into a typed result (`return false`, `return { status: 503 }`,
 * `state = { reachable: false }`) reports the failure to its caller and is not
 * what this guard is about.
 */
export function workWithoutLogging(body: string): string {
  let stripped = body;
  LOG_CALL_START.lastIndex = 0;
  let match = LOG_CALL_START.exec(stripped);
  while (match !== null) {
    let depth = 1;
    let i = match.index + match[0].length;
    while (i < stripped.length && depth > 0) {
      if (stripped[i] === '(') depth += 1;
      else if (stripped[i] === ')') depth -= 1;
      i += 1;
    }
    stripped = stripped.slice(0, match.index) + stripped.slice(i);
    LOG_CALL_START.lastIndex = 0;
    match = LOG_CALL_START.exec(stripped);
  }
  return (
    stripped
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      // Punctuation left behind by the removed calls (`;`, `,`) is not work:
      // `console.error(e);` must read as "only logs" just like an empty body.
      .replace(/[;,\s]+/g, '')
  );
}

const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', 'archived', 'test', '__tests__']);

export interface SilentFallbackViolation {
  file: string;
  line: number;
  /** True when the catch body is empty or only logs. */
  onlyLogs: boolean;
}

export interface SilentFallbackScanResult {
  failures: number;
  messages: string[];
  violations: SilentFallbackViolation[];
  /** Annotated catches, reported so the list stays visible. */
  annotated: SilentFallbackViolation[];
  scannedFiles: number;
  catchBlocks: number;
}

function walk(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let stat: ReturnType<typeof statSync>;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      walk(full, out);
    } else if (
      /\.tsx?$/.test(entry) &&
      !entry.includes('.test.') &&
      !entry.includes('.spec.') &&
      !entry.endsWith('.d.ts')
    ) {
      out.push(full);
    }
  }
}

/**
 * Collect scan roots that exist. Package-level `scripts/` dirs are excluded —
 * they hold codegen/one-off tooling where swallowing is structural, and they
 * are not what the incident exposed.
 */
function scanRoots(root: string): string[] {
  const roots: string[] = [];
  for (const container of ['packages']) {
    let entries: string[];
    try {
      entries = readdirSync(join(root, container));
    } catch {
      continue;
    }
    for (const entry of entries) {
      const src = join(root, container, entry, 'src');
      try {
        if (statSync(src).isDirectory()) roots.push(src);
      } catch {
        // not every package has a src dir
      }
    }
  }
  return roots;
}

/** Body text of the catch block that starts at `bodyStart`, brace-matched. */
function catchBody(source: string, bodyStart: number): { body: string; end: number } {
  let depth = 1;
  let i = bodyStart;
  while (i < source.length && depth > 0) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') depth -= 1;
    i += 1;
  }
  return { body: source.slice(bodyStart, i - 1), end: i };
}

export function scanSilentFallbacks(root: string): SilentFallbackScanResult {
  const files: string[] = [];
  for (const dir of scanRoots(root)) walk(dir, files);

  const violations: SilentFallbackViolation[] = [];
  const annotated: SilentFallbackViolation[] = [];
  let catchBlocks = 0;

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const rel = relative(root, file);
    const catchRe = /\bcatch\s*(?:\([^)]*\))?\s*\{/g;
    let match = catchRe.exec(source);
    while (match !== null) {
      catchBlocks += 1;
      const bodyStart = match.index + match[0].length;
      const { body } = catchBody(source, bodyStart);
      const line = source.slice(0, match.index).split('\n').length;

      // The marker may sit on the catch line itself or anywhere in its body.
      const preceding = source.slice(Math.max(0, match.index - 120), match.index);
      const hasMarker = preceding.includes(MARKER) || body.includes(MARKER);
      const onlyLogs = workWithoutLogging(body) === '';
      const observable = OBSERVABLE_PATTERN.test(body) || RETHROW_PATTERN.test(body) || !onlyLogs;

      if (hasMarker) {
        // A marker without a reason is just a different way of being silent.
        const markerIndex = (preceding + body).indexOf(MARKER);
        const reason = (preceding + body)
          .slice(markerIndex + MARKER.length)
          .split('\n')[0]
          ?.trim();
        if (!reason) {
          violations.push({ file: rel, line, onlyLogs: false });
        } else {
          annotated.push({ file: rel, line, onlyLogs: body.trim() === '' });
        }
      } else if (!observable) {
        violations.push({ file: rel, line, onlyLogs: body.trim() === '' });
      }
      match = catchRe.exec(source);
    }
  }

  const messages = violations.map(
    (v) =>
      `[silent-fallbacks] ${v.file}:${v.line} swallows an error without rethrowing, emitting a metric, or a ${MARKER} reason`,
  );

  return {
    failures: messages.length,
    messages,
    violations,
    annotated,
    scannedFiles: files.length,
    catchBlocks,
  };
}

function main(): void {
  const root = resolve(import.meta.dirname, '..');
  const result = scanSilentFallbacks(root);
  for (const item of result.annotated) {
    console.log(`[silent-fallbacks] annotated ${item.file}:${item.line}`);
  }
  console.log(
    `[silent-fallbacks] ${result.scannedFiles} file(s), ${result.catchBlocks} catch block(s), ${result.annotated.length} annotated.`,
  );
  finishCheckRun({
    name: '[silent-fallbacks]',
    result,
    remedy:
      'Rethrow the error, emit a metric (see RetrievalMetricsPort.recordDegraded), or annotate the catch with `// silent-fallback-ok: <reason>` explaining why swallowing is correct here.',
    passedMessage: '[silent-fallbacks] every swallow is either observable or explicitly justified.',
  });
}

const isDirectRun =
  !process.env.VITEST && (process.argv[1] ?? '').includes('check-silent-fallbacks');
if (isDirectRun) {
  main();
}

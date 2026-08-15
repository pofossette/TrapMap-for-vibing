/**
 * Eval Import Boundary Guard (check:eval-imports).
 *
 * Enforces the evals → packages boundary: evals code may only reach into
 * packages through three surfaces:
 *
 *   1. `@trapmap/*` package-name imports (they route through each package's
 *      exports map, which is the intended public surface);
 *   2. `packages/contracts/**` (shared contracts live in the eval domain
 *      and are deliberately open to evals);
 *   3. the host-local test assembly surface actually imported by evals
 *      (see HOST_LOCAL_EVAL_ALLOWLIST below), plus modules explicitly
 *      marked `@eval-only` in their header comment.
 *
 * Everything else — a relative import from evals straight into a service
 * package's internal file — fails the check.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { finishCheckRun } from './lib/check-result.js';
import {
  type ImportRef,
  collectImportRefs,
  hasEvalOnlyMarker,
  resolvePackageTarget,
} from './lib/eval-import-lib.js';

// ── Allowlists ───────────────────────────────────────────────────────

/**
 * host-local files evals are allowed to import. These are the public test
 * assembly surface of the host-local runtime (composition, runtime handles,
 * config loading) that the eval runners genuinely need; adding a new file
 * here is a deliberate, reviewable decision.
 */
export const HOST_LOCAL_EVAL_ALLOWLIST: readonly string[] = [
  'packages/host-local/src/nest/runtime/host-runtime.ts',
  'packages/host-local/src/nest/runtime/host-services.ts',
  'packages/host-local/src/nest/config/config.ts',
];

/**
 * Documented test-facade exceptions: service modules that are not @eval-only
 * (they are also used by product code) but expose a test-only entry point
 * evals rely on. Kept as small and explicit as possible.
 */
export const EVAL_TEST_FACADE_ALLOWLIST: readonly string[] = [
  // resetRetrievalReadModelCacheForTests() — module-level read-model cache
  // reset used by the retrieval eval runner between scenarios; the module is
  // product code (read-model.ts consumes it) so it cannot carry @eval-only.
  'packages/service-knowledge-read/src/retrieval-read-model-cache.ts',
];

// ── Types ────────────────────────────────────────────────────────────

export interface EvalImportViolation {
  file: string;
  line: number;
  target: string;
}

export interface CheckResult {
  failures: number;
  messages: string[];
}

// ── Checking logic (testable) ────────────────────────────────────────

function isAllowlisted(target: string): boolean {
  return HOST_LOCAL_EVAL_ALLOWLIST.includes(target) || EVAL_TEST_FACADE_ALLOWLIST.includes(target);
}

function isEvalOnlyMarked(root: string, target: string): boolean {
  const targetAbs = resolve(root, target);
  return existsSync(targetAbs) && hasEvalOnlyMarker(readFileSync(targetAbs, 'utf8'));
}

/** Classify one evals → packages relative import; returns a violation or null. */
export function classifyImport(
  root: string,
  file: string,
  line: number,
  target: string,
): EvalImportViolation | null {
  if (target.startsWith('packages/contracts/')) return null;
  if (isAllowlisted(target)) return null;
  if (isEvalOnlyMarked(root, target)) return null;
  return { file, line, target };
}

function classifyRef(root: string, ref: ImportRef): EvalImportViolation | null {
  if (!ref.importPath.startsWith('.')) return null;
  const target = resolvePackageTarget(root, ref.file, ref.importPath);
  if (!target) return null;
  return classifyImport(root, ref.file, ref.line, target);
}

/** Scan evals/ for boundary violations. */
export function checkEvalImports(root: string): CheckResult {
  const messages: string[] = [];
  let failures = 0;

  for (const ref of collectImportRefs(resolve(root, 'evals'), root)) {
    const violation = classifyRef(root, ref);
    if (violation) {
      failures += 1;
      messages.push(
        `[eval-imports] ${violation.file}:${violation.line} imports ${ref.importPath} (→ ${violation.target}) — evals may only import @trapmap/* package names, packages/contracts/**, the host-local eval allowlist, or @eval-only-marked modules`,
      );
    }
  }

  return { failures, messages };
}

// ── CLI entry point ──────────────────────────────────────────────────

const ROOT = resolve(import.meta.dirname, '..');

function main(): void {
  const result = checkEvalImports(ROOT);
  finishCheckRun({
    name: '[eval-imports]',
    result,
    remedy:
      'Prefer @trapmap/* package imports; deep relative imports into service packages require an @eval-only marker or an explicit allowlist entry.',
    passedMessage: '[eval-imports] all evals imports respect the packages boundary.',
  });
}

const isDirectRun = !process.env.VITEST && process.argv[1]?.includes('check-eval-imports');
if (isDirectRun) {
  main();
}

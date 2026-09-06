/**
 * Eval Import Boundary Guard (check:eval-imports).
 *
 * Enforces the evals ↔ packages boundary:
 *
 *   Forward (evals → packages): evals code may only reach into packages
 *   through two surfaces:
 *
 *     1. @trapmap/* package-name imports (they route through each
 *        package's exports map, which is the intended public surface);
 *     2. the host-local test assembly surface actually imported by evals
 *        (see HOST_LOCAL_EVAL_ALLOWLIST below), plus modules explicitly
 *        marked @eval-only in their header comment.
 *
 *   Everything else — a relative import from evals straight into a package's
 *   internal file — fails the check. Eval-only contracts live in
 *   evals/types/ (they are no longer part of packages/contracts), so
 *   deep relative imports into packages/contracts/src/** are violations
 *   just like any other package internals import.
 *
 *   Reverse (packages/apps → evals): product code must never import from
 *   evals/** (relative) and must not reference the retired
 *   @trapmap/contracts/evals namespace or a future @trapmap/evals
 *   package. evals is a one-way dependency of the eval tooling, never a
 *   dependency of product code.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

import { finishCheckRun } from './lib/check-result.js';
import {
  collectImportRefs,
  hasEvalOnlyMarker,
  type ImportRef,
  resolvePackageTarget,
  sourcePathFor,
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

/** Scan evals/ for forward boundary violations. */
export function checkEvalImports(root: string): CheckResult {
  const messages: string[] = [];
  let failures = 0;

  for (const ref of collectImportRefs(resolve(root, 'evals'), root)) {
    const violation = classifyRef(root, ref);
    if (violation) {
      failures += 1;
      messages.push(
        `[eval-imports] ${violation.file}:${violation.line} imports ${ref.importPath} (→ ${violation.target}) — evals may only import @trapmap/* package names, the host-local eval allowlist, or @eval-only-marked modules`,
      );
    }
  }

  return { failures, messages };
}

/** The retired / forbidden evals package-name namespaces in product code. */
const FORBIDDEN_EVAL_SPECIFIERS = ['@trapmap/contracts/evals', '@trapmap/evals'] as const;

function isForbiddenEvalSpecifier(importPath: string): boolean {
  return FORBIDDEN_EVAL_SPECIFIERS.some(
    (namespace) => importPath === namespace || importPath.startsWith(`${namespace}/`),
  );
}

/** Resolve a relative import from a product file to a repo-relative path. */
function resolveRelativeTarget(
  root: string,
  fromFileRel: string,
  importPath: string,
): string | null {
  if (!importPath.startsWith('.')) return null;
  const abs = resolve(root, dirname(fromFileRel), importPath);
  const rel = relative(root, abs).replaceAll('\\', '/');
  if (!rel.startsWith('evals/')) return null;
  return sourcePathFor(rel);
}

/**
 * Reverse scan: product code (packages/ + apps/) must not import from
 * evals/ and must not reference the evals package namespaces.
 */
export function checkReverseEvalImports(root: string): CheckResult {
  const messages: string[] = [];
  let failures = 0;

  for (const sourceRoot of ['packages', 'apps']) {
    for (const ref of collectImportRefs(resolve(root, sourceRoot), root)) {
      if (isForbiddenEvalSpecifier(ref.importPath)) {
        failures += 1;
        messages.push(
          `[eval-imports] ${ref.file}:${ref.line} references ${ref.importPath} — product code must not depend on the eval workspace`,
        );
        continue;
      }
      if (!ref.importPath.startsWith('.')) continue;
      const target = resolveRelativeTarget(root, ref.file, ref.importPath);
      if (target?.startsWith('evals/')) {
        failures += 1;
        messages.push(
          `[eval-imports] ${ref.file}:${ref.line} imports ${ref.importPath} (→ ${target}) — product code must not import from evals/`,
        );
      }
    }
  }

  return { failures, messages };
}

// ── CLI entry point ──────────────────────────────────────────────────

const ROOT = resolve(import.meta.dirname, '..');

function main(): void {
  const forward = checkEvalImports(ROOT);
  const reverse = checkReverseEvalImports(ROOT);
  finishCheckRun({
    name: '[eval-imports]',
    result: {
      failures: forward.failures + reverse.failures,
      messages: [...forward.messages, ...reverse.messages],
    },
    remedy:
      'Prefer @trapmap/* package imports; deep relative imports into service packages require an @eval-only marker or an explicit allowlist entry; product code must never import from evals/.',
    passedMessage: '[eval-imports] all evals imports respect the packages boundary.',
  });
}

const isDirectRun = !process.env.VITEST && process.argv[1]?.includes('check-eval-imports');
if (isDirectRun) {
  main();
}

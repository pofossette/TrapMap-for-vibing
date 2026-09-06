/**
 * @eval-only Marker Guard (check:eval-only).
 *
 * Product modules that are imported ONLY by evals (no product-code consumer)
 * must carry an `@eval-only` header comment so the boundary is self-declaring.
 * The marker makes the module a permitted evals → service import target for
 * scripts/check-eval-imports.ts and gives reviewers a searchable signal.
 *
 * A module is considered eval-only when:
 *
 *   - evals/ imports it (static or dynamic) via a relative path into the
 *     packages/service-* src trees, packages/backend-core/src or
 *     packages/host-* src trees;
 *   - no product code references it (no relative import anywhere in
 *     packages/ outside evals, and it is not reachable through its package's
 *     index re-export chain — i.e. not part of the package public surface).
 *
 * Such modules without the marker fail the check.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import { finishCheckRun } from './lib/check-result.js';
import {
  collectImportRefs,
  hasEvalOnlyMarker,
  type ImportRef,
  resolvePackageTarget,
  sourcePathFor,
} from './lib/eval-import-lib.js';

// ── Types ────────────────────────────────────────────────────────────

export interface CheckResult {
  failures: number;
  messages: string[];
}

const EVAL_ONLY_SCOPE_PREFIXES = [
  'packages/service-',
  'packages/backend-core/',
  'packages/host-local/',
  'packages/host-distributed/',
];

function inScope(target: string): boolean {
  return EVAL_ONLY_SCOPE_PREFIXES.some((prefix) => target.startsWith(prefix));
}

// ── Product reference analysis ───────────────────────────────────────

/**
 * Build the set of package modules referenced by product code (relative
 * imports anywhere in packages/, repo-relative normalized source paths).
 */
export function collectProductRelativeRefs(root: string): Set<string> {
  const referenced = new Set<string>();
  for (const ref of collectImportRefs(resolve(root, 'packages'), root)) {
    if (!ref.importPath.startsWith('.')) continue;
    const target = resolvePackageTarget(root, ref.file, ref.importPath);
    if (target) referenced.add(target);
  }
  return referenced;
}

const RE_EXPORT_RE = /(?:export\s+\*|export\s+[^;]*?)\s+from\s+['"](\.[^'"]+)['"]/g;

function collectReExportTargets(root: string, rel: string): string[] {
  const abs = resolve(root, rel);
  if (!statSync(abs, { throwIfNoEntry: false })?.isFile()) return [];
  const targets: string[] = [];
  const content = readFileSync(abs, 'utf8');
  RE_EXPORT_RE.lastIndex = 0;
  let match = RE_EXPORT_RE.exec(content);
  while (match !== null) {
    const target = resolvePackageTarget(root, rel, match[1]!);
    if (target) targets.push(target);
    match = RE_EXPORT_RE.exec(content);
  }
  return targets;
}

/**
 * Build the set of modules reachable through each package's index re-export
 * chain (`export * from './x.js'` / `export { ... } from './x.js'` starting
 * from src/index.ts). These are part of the package public surface, so evals
 * reaching them is a package-name import, not an eval-only dependency.
 */
// fallow-ignore-next-line complexity -- package index re-export BFS over all workspace packages
export function collectIndexReachable(root: string): Set<string> {
  const reachable = new Set<string>();
  let packagesEntries: string[];
  try {
    packagesEntries = readdirSync(resolve(root, 'packages'));
  } catch {
    return reachable;
  }

  for (const pkgDir of packagesEntries) {
    const indexAbs = resolve(root, 'packages', pkgDir, 'src', 'index.ts');
    if (!statSync(indexAbs, { throwIfNoEntry: false })?.isFile()) continue;

    const queue = [sourcePathFor(`packages/${pkgDir}/src/index.ts`)];
    const visited = new Set<string>();
    while (queue.length > 0) {
      const rel = queue.shift()!;
      if (visited.has(rel)) continue;
      visited.add(rel);
      reachable.add(rel);
      queue.push(...collectReExportTargets(root, rel));
    }
  }
  return reachable;
}

// ── Checking logic (testable) ────────────────────────────────────────

function isProductSurface(
  target: string,
  productRefs: Set<string>,
  indexReachable: Set<string>,
): boolean {
  return productRefs.has(target) || indexReachable.has(target);
}

function isEvalOnlyCandidate(
  root: string,
  ref: ImportRef,
  productRefs: Set<string>,
  indexReachable: Set<string>,
): string | null {
  const target = resolvePackageTarget(root, ref.file, ref.importPath);
  if (target === null || !inScope(target)) return null;
  if (isProductSurface(target, productRefs, indexReachable)) return null;
  return target;
}

/** Find eval-only product modules imported by evals without the marker. */
// fallow-ignore-next-line complexity -- assembles eval-only candidate map from evals import refs and verifies markers
export function checkEvalOnlyMarkers(root: string): CheckResult {
  const messages: string[] = [];
  let failures = 0;

  const productRefs = collectProductRelativeRefs(root);
  const indexReachable = collectIndexReachable(root);

  const candidates = new Map<string, string>(); // target -> source ref description
  for (const ref of collectImportRefs(resolve(root, 'evals'), root)) {
    const target = isEvalOnlyCandidate(root, ref, productRefs, indexReachable);
    if (target === null) continue;
    candidates.set(target, `${ref.file}:${ref.line}`);
  }

  for (const [target, ref] of [...candidates.entries()].sort()) {
    let content: string;
    try {
      content = readFileSync(resolve(root, target), 'utf8');
    } catch {
      continue;
    }
    if (!hasEvalOnlyMarker(content)) {
      failures += 1;
      messages.push(
        `[eval-only] ${target} is imported only by evals (${ref}) but has no @eval-only header comment — add one or wire a product consumer`,
      );
    }
  }

  return { failures, messages };
}

// ── CLI entry point ──────────────────────────────────────────────────

const ROOT = resolve(import.meta.dirname, '..');

function main(): void {
  const result = checkEvalOnlyMarkers(ROOT);
  finishCheckRun({
    name: '[eval-only]',
    result,
    remedy:
      'Add an @eval-only header comment to modules consumed exclusively by evals; product modules must be imported through their package public surface instead.',
    passedMessage:
      '[eval-only] every eval-only product module carries an @eval-only header comment.',
  });
}

const isDirectRun = !process.env.VITEST && process.argv[1]?.includes('check-eval-only');
if (isDirectRun) {
  main();
}

/**
 * Route Surface Guard — wired into check:docs as the `route-surface` step.
 *
 * Keeps the documented external API surface and the real host gateway
 * RouteDefs in lockstep:
 *
 *   1. documented ⊆ real — every /v1|/v2|/v3 path literal in the guarded
 *      docs must be registered by a host gateway RouteDef;
 *   2. real ⊆ api-surface.md — every gateway route must appear on the
 *      canonical API surface reference page.
 *
 * This guard exists because `POST /v1/retrieval/skills/search-by-content`
 * stayed documented for months while no gateway registered it (the original
 * implementation was retired with the deleted server package) — see the
 * skill-lookup-surface mainline detail in docs/todos/.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { type CheckRunResult, finishCheckRun } from './lib/check-result.js';

export interface PathRef {
  path: string;
  file: string;
  line: number;
}

export interface SurfaceViolation {
  kind: 'documented-not-real' | 'real-not-documented';
  path: string;
  refs: PathRef[];
}

/**
 * Documented-but-unimplemented routes tolerated by the guard.
 *
 * Seed: `/v2/retrieval/search` is referenced by the CLI `--v2` command and
 * api-surface, but neither host gateway registers it (the v2 capsule
 * implementation was retired with the deleted server package). It is tracked
 * as deferred work in the mainline issue pool; never add new entries here
 * without a corresponding tracked debt item.
 */
export const SURFACE_EXEMPTIONS: readonly string[] = ['/v2/retrieval/search'];

/**
 * Pre-existing inventory drift frozen at guard adoption.
 *
 * These are not approvals for new endpoints. They record drift that predates
 * the guard (retired server-package docs and gateway routes missing canonical
 * API-surface rows) and are tracked together in
 * docs/todos/open-debt-and-compromises.md. New paths must never be added here;
 * fix the route or documentation instead.
 */
export const SURFACE_INVENTORY_DRIFT: readonly string[] = [
  '/v1/admin/reconcile-knowledge-indexes',
  '/v1/auth/login',
  '/v1/auth/session',
  '/v1/candidates/:candidateId/resolution',
  '/v1/cron/jobs',
  '/v1/cron/jobs/:jobId',
  '/v1/cron/jobs/:jobId/trigger',
  '/v1/cron/status',
  '/v1/duplicates',
  '/v1/duplicates/:candidateId',
  '/v1/duplicates/:candidateId/bundle',
  '/v1/jobs',
  '/v1/jobs/:jobId',
  '/v1/jobs/queue',
  '/v1/knowledge/:id/evidence',
  '/v1/knowledge/decay',
  '/v1/knowledge/maintenance',
  '/v1/knowledge/projection-status',
  '/v1/operations/artifacts',
  '/v1/operations/artifacts/:id/derive',
  '/v1/operations/audit',
  '/v1/operations/badcases/:feedbackId/export',
  '/v1/operations/capsule-index/cleanup-orphans',
  '/v1/operations/capsule-index/health',
  '/v1/operations/capsule-index/rebuild',
  '/v1/operations/decay/batch',
  '/v1/operations/decay/entries',
  '/v1/operations/decay/search',
  '/v1/operations/export',
  '/v1/operations/import',
  '/v1/operations/knowledge',
  '/v1/operations/knowledge/:entryId/deactivate',
  '/v1/operations/maintenance/batch',
  '/v1/operations/maintenance/entries',
  '/v1/operations/stats/',
  '/v1/operations/stats/hits',
  '/v1/operations/stats/summary',
  '/v1/operations/stats/usage',
  '/v1/operations/status',
  '/v1/operations/status/async/tasks/:taskId/requeue',
  '/v1/traps/:trapId/resubmit',
  '/v1/traps/:trapId/supersede',
  '/v3/retrieval/plan',
];

const VERSIONED_PATH_RE = /\/(?:v1|v2|v3)\/[A-Za-z0-9_:./{}-]+/g;

export function normalizeRoutePath(path: string): string {
  return path.replace(/:[A-Za-z0-9_]+/g, ':param');
}

function routePathLiteral(line: string): string | null {
  const match = line.match(/path:\s*'([^']+)'/);
  return match?.[1] ?? null;
}

function versionedPath(routePath: string): boolean {
  return /^\/(?:v1|v2|v3)\//.test(routePath);
}

function versionedRouteRef(
  line: string | undefined,
  file: string,
  lineNumber: number,
): PathRef | null {
  const routePath = routePathLiteral(line ?? '');
  if (!routePath || !versionedPath(routePath)) return null;
  return { path: routePath, file, line: lineNumber };
}

function documentPathRefs(
  refs: PathRef[],
  seen: Set<string>,
  file: string,
  line: string,
  lineNumber: number,
): void {
  for (const match of line.matchAll(VERSIONED_PATH_RE)) {
    const routePath = match[0].replace(/[)\]、。，;:'"\s]+$/g, '');
    const key = `${file}\u0000${routePath}\u0000${lineNumber}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({ path: routePath, file, line: lineNumber });
  }
}

export function collectRoutePathsFromSource(source: string, file: string): PathRef[] {
  const refs: PathRef[] = [];
  const lines = source.split('\n');
  for (let index = 0; index < lines.length; index++) {
    const ref = versionedRouteRef(lines[index], file, index + 1);
    if (ref) {
      refs.push(ref);
    }
  }
  return refs;
}

export function collectDocumentedPaths(files: string[]): PathRef[] {
  const refs: PathRef[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split('\n');
    for (let index = 0; index < lines.length; index++) {
      documentPathRefs(refs, seen, file, lines[index] ?? '', index + 1);
    }
  }
  return refs;
}

export function checkSurface(
  real: PathRef[],
  documented: PathRef[],
  exemptions: readonly string[],
  inventoryDrift: readonly string[] = [],
): SurfaceViolation[] {
  const exemptSet = new Set(exemptions.map(normalizeRoutePath));
  const knownDriftSet = new Set(inventoryDrift.map(normalizeRoutePath));
  const documentedBlockedPaths = new Set([...exemptSet, ...knownDriftSet]);

  return [
    ...undocumentedDocumentViolations(real, documented, documentedBlockedPaths),
    ...undocumentedRealViolations(real, documented, knownDriftSet),
  ];
}

function groupDocumentedRefs(documented: PathRef[]): Map<string, PathRef[]> {
  const docRefsByNormalized = new Map<string, PathRef[]>();
  for (const ref of documented) {
    const key = normalizeRoutePath(ref.path);
    docRefsByNormalized.set(key, [...(docRefsByNormalized.get(key) ?? []), ref]);
  }
  return docRefsByNormalized;
}

function missingDocumentViolation(
  realByNormalized: ReadonlyMap<string, PathRef>,
  blockedPaths: ReadonlySet<string>,
  refs: PathRef[],
): SurfaceViolation | null {
  const representative = refs[0];
  if (!representative) return null;
  const normalizedPath = normalizeRoutePath(representative.path);
  if (blockedPaths.has(normalizedPath) || realByNormalized.has(normalizedPath)) return null;
  return { kind: 'documented-not-real', path: representative.path, refs };
}

function undocumentedDocumentViolations(
  real: PathRef[],
  documented: PathRef[],
  blockedPaths: ReadonlySet<string>,
): SurfaceViolation[] {
  const realByNormalized = new Map(real.map((ref) => [normalizeRoutePath(ref.path), ref]));
  const violations: SurfaceViolation[] = [];
  const docRefsByNormalized = groupDocumentedRefs(documented);
  for (const refs of docRefsByNormalized.values()) {
    const violation = missingDocumentViolation(realByNormalized, blockedPaths, refs);
    if (violation) violations.push(violation);
  }

  return violations;
}

function undocumentedRealViolations(
  real: PathRef[],
  documented: PathRef[],
  blockedPaths: ReadonlySet<string>,
): SurfaceViolation[] {
  const apiSurfaceDocSet = new Set(
    documented
      .filter((ref) => ref.file.includes('api-surface.md'))
      .map((ref) => normalizeRoutePath(ref.path)),
  );

  return real.flatMap((ref) => {
    const normalizedPath = normalizeRoutePath(ref.path);
    if (apiSurfaceDocSet.has(normalizedPath) || blockedPaths.has(normalizedPath)) {
      return [];
    }
    return [{ kind: 'real-not-documented' as const, path: ref.path, refs: [ref] }];
  });
}

// ── CLI entry point ──────────────────────────────────────────────────

const ROOT = resolve(import.meta.dirname, '..');

const REAL_ROUTE_FILES = [
  'packages/service-knowledge-read/src/experience-gene-routes.ts',
  'packages/host-local/src/nest/gateway/gateway.route-defs.ts',
  'packages/host-local/src/nest/gateway/gateway.cron-route-defs.ts',
  'packages/host-distributed/src/gateway/route-defs.ts',
];

const DOCUMENTED_ROUTE_FILES = [
  'docs/reference/api-surface.md',
  'docs/guides/CLIENT_INTEGRATION.md',
  'docs/architecture/components/ARTIFACTS.md',
];

function main(): void {
  const real: PathRef[] = [];
  for (const rel of REAL_ROUTE_FILES) {
    real.push(...collectRoutePathsFromSource(readFileSync(resolve(ROOT, rel), 'utf8'), rel));
  }
  const documented = collectDocumentedPaths(
    DOCUMENTED_ROUTE_FILES.map((rel) => resolve(ROOT, rel)),
  );

  const violations = checkSurface(real, documented, SURFACE_EXEMPTIONS, SURFACE_INVENTORY_DRIFT);
  const result: CheckRunResult = {
    failures: violations.length,
    messages: violations.flatMap((violation) =>
      violation.refs.map(
        (ref) => `[route-surface] ${violation.kind}: ${ref.file}:${ref.line} ${ref.path}`,
      ),
    ),
  };
  finishCheckRun({
    name: '[route-surface]',
    result,
    remedy:
      'Every documented /v1|/v2|/v3 route must exist in a host gateway RouteDef, and every gateway route must appear in docs/reference/api-surface.md. Add the missing route or fix the docs; do not extend SURFACE_EXEMPTIONS without a tracked debt entry.',
    passedMessage: '[route-surface] documented gateway routes match host RouteDefs.',
  });
}

const isDirectRun = !process.env.VITEST && process.argv[1]?.includes('check-route-surface');
if (isDirectRun) {
  main();
}

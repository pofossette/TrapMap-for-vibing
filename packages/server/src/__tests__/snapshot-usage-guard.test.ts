import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SERVER_SRC = resolve(process.cwd(), 'packages/server/src');

/**
 * Files allowed to call store.snapshot() or store.transact() directly.
 *
 * These fall into categories:
 * - Repository implementations: wrap store as compatibility layer (by design)
 * - Migration/backfill scripts: one-off data migration tools
 * - Bootstrap files: startup wiring and recovery
 * - Lifecycle subscribers: event-driven side effects on store changes
 * - Candidate processing: pipeline that mutates store during candidate lifecycle
 * - Diagnostic/admin mutations: controlled operator writes and migration HTTP tools
 * - Projection exceptions: explicit read-side helpers that still need compatibility snapshot input
 * - Named compatibility debt: audit seams that still require store access
 * - Phase 2 posture freeze: every entry here must belong to an explicit
 *   compatibility bucket and may not silently expand production primary-owner scope
 *
 * Core business routes (auth, knowledge, traps, retrieval, members, teams)
 * must use repos.* and must NOT appear here.
 */
const SNAPSHOT_ALLOWLIST: string[] = [
  // Repository implementations — wrap store.snapshot()/transact() internally
  'lib/lineage/repository.ts',
  'lib/feedback/repository.ts',
  'lib/candidates/repository.ts',
  'lib/duplicates/repository.ts',
  'lib/conflict/repository.ts',
  'lib/graph-index/repository.ts',

  // Migration and backfill scripts
  'lib/persistence/migrate-candidates.ts',
  'lib/persistence/migrate-knowledge.ts',
  'lib/persistence/backfill-indexes.ts',

  // Bootstrap and startup
  'bootstrap/bootstrap-repositories.ts',
  'bootstrap/bootstrap-workers.ts',
  'bootstrap/bootstrap-candidate-recovery.ts',

  // Lifecycle subscribers
  'lib/lifecycle/subscribers/indexing.ts',
  'lib/lifecycle/subscribers/conflict.ts',
  'lib/lifecycle/subscribers/audit.ts',

  // Candidate processing pipeline
  'lib/candidates/processor.ts',
  'lib/candidates/services/submission-service.ts',
  'lib/candidates/services/resolution-service.ts',

  // Knowledge review application service (named compatibility debt: local audit seam)
  'lib/knowledge/review-application-service.ts',

  // Retrieval read-model: repo-backed assembly; retained only for cache-backed read-model ownership
  'lib/retrieval/read-model.ts',

  // Indexing pipeline
  'lib/indexing/pipeline.ts',
  'lib/indexing/events.ts',
  'lib/indexing/skill-events.ts',
  'lib/indexing/skill-extract.ts',
  'lib/indexing/skill-graph-build.ts',
  'lib/indexing/reconcile.ts',
  'lib/indexing/adapters/graph.ts',
  'lib/jobs/handlers/knowledge-index-follow-up.ts',
  'lib/jobs/handlers/skill-index-follow-up.ts',
  'lib/jobs/handlers/remediation-reactivation.ts',
  'lib/jobs/skill-index-follow-up.ts',

  // Conflict detection
  'lib/conflict/detect.ts',

  // Diagnostic/admin mutations — controlled operator writes and migration tools
  'routes/operations/knowledge-legacy.ts',
  'routes/feedback-admin.ts',
  'routes/admin-benchmark.ts',
  'routes/knowledge.ts',
  'routes/teams.ts',
  'routes/admin-boundary-search.ts',
  'routes/maintenance.ts',
  'routes/access-keys.ts',
  'routes/evidence.ts',
  'routes/members.ts',

  // Projection exceptions — explicit read-side helpers with named repo capability gaps
  'lib/operations/read-model.ts',
];

function findAllTsFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip test fixture directories
      if (entry.name === '__fixtures__') continue;
      results.push(...findAllTsFiles(fullPath));
    } else if (
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.spec.ts')
    ) {
      results.push(fullPath);
    }
  }
  return results;
}

function hasActualStoreCall(content: string, pattern: RegExp): boolean {
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trimStart();
    // Skip single-line comments
    if (trimmed.startsWith('//')) continue;
    // Skip block comment lines (rough heuristic: lines between /* and */)
    if (trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
    if (pattern.test(line)) return true;
  }
  return false;
}

describe('snapshot usage guard', () => {
  it('no non-allowlisted file calls store.snapshot() or store.transact()', () => {
    const allFiles = findAllTsFiles(SERVER_SRC);
    const violations: Array<{ file: string; calls: string[] }> = [];

    for (const filePath of allFiles) {
      const relPath = relative(SERVER_SRC, filePath);

      if (SNAPSHOT_ALLOWLIST.includes(relPath)) continue;

      const content = readFileSync(filePath, 'utf8');
      const calls: string[] = [];

      if (hasActualStoreCall(content, /store\.snapshot\(\)/)) calls.push('store.snapshot()');
      if (hasActualStoreCall(content, /store\.transact\(/)) calls.push('store.transact()');

      if (calls.length > 0) {
        violations.push({ file: relPath, calls });
      }
    }

    expect(
      violations,
      violations.length > 0
        ? `Found store.snapshot()/store.transact() in non-allowlisted files:\n${violations.map((v) => `  ${v.file}: ${v.calls.join(', ')}`).join('\n')}\n\nAdd to SNAPSHOT_ALLOWLIST in this test or refactor to use repos.*`
        : undefined,
    ).toEqual([]);
  });

  it('allowlist entries exist on disk', () => {
    const missing = SNAPSHOT_ALLOWLIST.filter((relPath) => {
      try {
        readFileSync(resolve(SERVER_SRC, relPath), 'utf8');
        return false;
      } catch {
        return true;
      }
    });

    expect(missing, `Allowlist entries not found on disk: ${missing.join(', ')}`).toEqual([]);
  });

  it('Phase 2 freeze keeps key compatibility buckets explicit', () => {
    expect(SNAPSHOT_ALLOWLIST).toEqual(
      expect.arrayContaining([
        'routes/teams.ts',
        'routes/members.ts',
        'routes/access-keys.ts',
        'routes/maintenance.ts',
        'routes/feedback-admin.ts',
        'bootstrap/bootstrap-candidate-recovery.ts',
        'lib/operations/read-model.ts',
        'lib/jobs/handlers/knowledge-index-follow-up.ts',
        'lib/jobs/handlers/skill-index-follow-up.ts',
        'lib/jobs/handlers/remediation-reactivation.ts',
        'lib/knowledge/review-application-service.ts',
      ]),
    );
  });
});

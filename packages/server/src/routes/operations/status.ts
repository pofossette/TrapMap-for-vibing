import {
  asyncOperationsStatusResponseSchema,
  asyncTaskRequeueResponseSchema,
  compatibilityStatusRequestSchema,
  compatibilityStatusResponseSchema,
} from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { getRetrievalCacheStats } from '@trapmap/server/lib/cache/metrics.js';
import { createDomainEventOutbox } from '@trapmap/server/lib/lifecycle/outbox.js';
import { PostgresStore } from '@trapmap/server/lib/persistence/postgres-store.js';
import { createTaskQueue } from '@trapmap/server/lib/queue/task-queue.js';
import { requirePermission } from '@trapmap/server/lib/rbac.js';
import { resolveAuthContext } from '@trapmap/server/lib/session.js';
import { nowIso } from '@trapmap/server/lib/store.js';
import { createWorkflowRepository } from '@trapmap/server/lib/workflows/repository.js';

export const statusRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/operations/status/async', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:export');

    const store = app.skillShareer.store;
    if (!(store instanceof PostgresStore)) {
      return asyncOperationsStatusResponseSchema.parse({
        asyncRuntimeEnabled: false,
        queue: {
          pending: 0,
          running: 0,
          dead: 0,
          staleRunning: 0,
          backlogOldestAgeSeconds: null,
          runningOldestAgeSeconds: null,
          deadOldestAgeSeconds: null,
          reclaimCount: 0,
          workerState: 'not-configured',
          recentDeadLetters: [],
        },
        outbox: {
          pending: 0,
          processing: 0,
          failed: 0,
          staleProcessing: 0,
          backlogOldestAgeSeconds: null,
          processingOldestAgeSeconds: null,
          failedOldestAgeSeconds: null,
          reclaimCount: 0,
          workerState: 'not-configured',
          recentFailures: [],
        },
        cache: {},
        workflows: [],
        reportedAt: nowIso(),
      });
    }

    const pool = store.getPool();
    const queue = createTaskQueue({ pool });
    const outbox = createDomainEventOutbox({ pool });
    const workflowRepo = createWorkflowRepository(pool);
    const [queueSnapshot, outboxSnapshot, workflows] = await Promise.all([
      queue.getStatusSnapshot(),
      outbox.getStatusSnapshot(),
      workflowRepo.listRecent(25),
    ]);

    const queueWorker = (app as any).taskWorker;
    const outboxWorker = (app as any).outboxWorker;

    return asyncOperationsStatusResponseSchema.parse({
      asyncRuntimeEnabled: true,
      queue: {
        ...queueSnapshot,
        workerState:
          queueWorker?.ownsWork?.() === false
            ? 'remote'
            : queueWorker?.isRunning?.()
              ? 'running'
              : 'degraded',
      },
      outbox: {
        ...outboxSnapshot,
        workerState:
          outboxWorker?.ownsWork?.() === false
            ? 'remote'
            : outboxWorker?.isRunning?.()
              ? 'running'
              : 'degraded',
      },
      cache: getRetrievalCacheStats(),
      workflows,
      reportedAt: nowIso(),
    });
  });

  app.post('/v1/operations/status/async/tasks/:taskId/requeue', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:export');

    const store = app.skillShareer.store;
    if (!(store instanceof PostgresStore)) {
      return asyncTaskRequeueResponseSchema.parse({
        taskId: (request.params as { taskId: string }).taskId,
        requeued: false,
        reportedAt: nowIso(),
      });
    }

    const taskId = (request.params as { taskId: string }).taskId;
    const queue = createTaskQueue({ pool: store.getPool() });
    const before = await queue.getStatusSnapshot();
    await queue.requeue(taskId);
    const after = await queue.getStatusSnapshot();

    return asyncTaskRequeueResponseSchema.parse({
      taskId,
      requeued: after.dead < before.dead || after.pending > before.pending,
      reportedAt: nowIso(),
    });
  });

  // Compatibility status route (Phase 16-01: COMP-03)
  app.get('/v1/operations/status', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:export');

    const query = compatibilityStatusRequestSchema.parse(
      (request.query as Record<string, unknown>) ?? {},
    );

    // Status route legitimately needs store.snapshot() for cross-entity diagnostics:
    // it reads both knowledgeEntries and skillArtifacts in a single snapshot to compute
    // migration status, unmigrated counts, and coexistence flags. No single repository
    // method provides this cross-entity view, so store.snapshot() is the correct pattern here.
    const data = await app.skillShareer.store.snapshot();

    // Ensure skillArtifacts exists
    if (!data.skillArtifacts) {
      data.skillArtifacts = [];
    }

    // Filter by team if specified
    let legacyEntries = data.knowledgeEntries;
    let artifacts = data.skillArtifacts;

    if (query.teamId) {
      legacyEntries = legacyEntries.filter((entry) => entry.teamId === query.teamId);
      artifacts = artifacts.filter((artifact) => artifact.teamId === query.teamId);
    }

    // Calculate migration status
    const totalLegacyEntries = legacyEntries.length;
    const migratedArtifacts = artifacts.filter(
      (artifact) => artifact.metadata.sourceKind === 'legacy-knowledge',
    );
    const migratedEntriesCount = migratedArtifacts.length;
    const unmigratedEntriesCount = Math.max(0, totalLegacyEntries - migratedEntriesCount);
    const totalArtifacts = artifacts.length;

    // Count by source kind
    const artifactsBySourceKind = {
      'skill-directory': artifacts.filter((a) => a.metadata.sourceKind === 'skill-directory')
        .length,
      'single-skill-md': artifacts.filter((a) => a.metadata.sourceKind === 'single-skill-md')
        .length,
      'legacy-knowledge': migratedArtifacts.length,
    };

    // Get sample of unmigrated entry IDs
    const migratedSlugs = new Set(migratedArtifacts.map((a) => a.slug));
    const unmigratedEntries = legacyEntries.filter((entry) => {
      const expectedSlug = entry.shortcut
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
      return !migratedSlugs.has(expectedSlug);
    });
    const unmigratedEntryIds = unmigratedEntries.slice(0, 50).map((entry) => entry.id);

    // Determine coexistence and sunset status
    const coexistenceActive = totalLegacyEntries > 0 && totalArtifacts > 0;
    const sunsetBlockers: string[] = [];

    if (unmigratedEntriesCount > 0) {
      sunsetBlockers.push(`${unmigratedEntriesCount} unmigrated entries remaining`);
    }
    if (totalLegacyEntries > 0 && totalArtifacts === 0) {
      sunsetBlockers.push('No artifacts created yet');
    }

    const sunsetReady = sunsetBlockers.length === 0;

    return compatibilityStatusResponseSchema.parse({
      totalLegacyEntries,
      migratedEntriesCount,
      unmigratedEntriesCount,
      totalArtifacts,
      artifactsBySourceKind,
      unmigratedEntryIds,
      coexistenceActive,
      sunsetReady,
      sunsetBlockers,
      reportedAt: nowIso(),
    });
  });
};

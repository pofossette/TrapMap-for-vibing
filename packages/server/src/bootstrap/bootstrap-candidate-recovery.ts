/**
 * Bootstrap candidate recovery — find and re-enqueue interrupted candidates.
 *
 * Runs AFTER repositories are initialized so that repos.candidate is available
 * for querying PG-backed candidates in queued/analyzing state.
 */

import type { FastifyInstance } from 'fastify';

import {
  CANDIDATE_PROCESSING_TASK_TYPE,
  findInterruptedCandidates,
  resetInterruptedCandidates,
} from '@trapmap/server/lib/candidates/index.js';
import { getStorePool } from '@trapmap/server/lib/store.js';

export async function bootstrapCandidateRecovery(app: FastifyInstance): Promise<void> {
  try {
    const data = await app.skillShareer.store.snapshot();
    const interrupted = findInterruptedCandidates(data);

    // Also check PG candidates for interrupted state
    const { candidate: candidateRepo } = app.skillShareer.repos;
    const interruptedPg = await Promise.all([
      candidateRepo.listByStatus('queued' as any),
      candidateRepo.listByStatus('analyzing' as any),
    ]).then(([queued, analyzing]) => [...queued, ...analyzing]);

    const allInterrupted = [
      ...interrupted,
      ...interruptedPg.filter((pg) => !interrupted.some((im) => im.id === pg.id)),
    ];

    if (allInterrupted.length > 0) {
      app.log.info(
        { count: allInterrupted.length },
        'Found interrupted candidates, re-enqueueing for worker processing',
      );

      // Reset JSONB-based candidates to 'received' and enqueue via store.transact
      if (interrupted.length > 0) {
        await app.skillShareer.store.transact((txData) => {
          resetInterruptedCandidates({
            data: txData,
            reason: 'Server restart recovery',
          });
        });
      }

      // Reset PG-based candidates via repository
      for (const pgCandidate of interruptedPg) {
        await candidateRepo.updateStatus(
          pgCandidate.id,
          'received' as any,
          'Server restart recovery',
        );
      }

      // Re-enqueue all interrupted candidates to the task queue
      const store = app.skillShareer.store;
      const isPoolBacked = getStorePool(store) !== null;
      const queue = isPoolBacked ? app.skillShareer.asyncTransport?.task : undefined;
      for (const candidate of allInterrupted) {
        if (queue) {
          await queue
            .enqueue(
              CANDIDATE_PROCESSING_TASK_TYPE,
              { candidateId: candidate.id, retryCount: 0 },
              { dedupeKey: candidate.id, maxAttempts: 3 },
            )
            .catch((error: unknown) => {
              app.log.error(
                { error, candidateId: candidate.id },
                'Failed to re-enqueue interrupted candidate',
              );
            });
        } else if (isPoolBacked) {
          app.log.error(
            { candidateId: candidate.id },
            'Postgres runtime missing async transport queue during candidate recovery',
          );
        } else {
          app.log.warn(
            { candidateId: candidate.id },
            'JSON store candidate reset but not re-enqueued (PG task queue unavailable)',
          );
        }
      }
      app.log.info({ count: allInterrupted.length }, 'Interrupted candidates re-enqueued');
    }
  } catch (error) {
    app.log.error({ error }, 'Failed to check for interrupted candidates');
  }
}

import type { Pool } from 'pg';

import type { LegacySnapshotBackfillSnapshot } from './legacy-snapshot-backfill.js';

type Queryable = Pick<Pool, 'query'>;

const ARRAY_BUCKETS = [
  'users',
  'teams',
  'memberships',
  'accessKeys',
  'sessions',
  'auditEvents',
  'knowledgeEntries',
  'skillArtifacts',
  'artifactFilePayloads',
  'candidateSubmissions',
  'duplicateCases',
  'entityLineage',
  'conflicts',
  'feedbackQueue',
  'graphIndexDocuments',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertSnapshotShape(value: unknown): asserts value is LegacySnapshotBackfillSnapshot {
  if (!isRecord(value)) throw new Error('legacy store_snapshot data must be an object');
  if (!isRecord(value.counters))
    throw new Error('legacy store_snapshot bucket counters is invalid');
  for (const bucket of ARRAY_BUCKETS) {
    if (!Array.isArray(value[bucket])) {
      throw new Error(`legacy store_snapshot bucket ${bucket} is missing or invalid`);
    }
  }
  if (value.promptVersion !== null && typeof value.promptVersion !== 'number') {
    throw new Error('legacy store_snapshot bucket promptVersion is invalid');
  }
  if (value.rebuildState !== null) {
    if (
      !isRecord(value.rebuildState) ||
      typeof value.rebuildState.targetVersion !== 'number' ||
      !Array.isArray(value.rebuildState.completedSourceKeys) ||
      !value.rebuildState.completedSourceKeys.every((key) => typeof key === 'string')
    ) {
      throw new Error('legacy store_snapshot bucket rebuildState is invalid');
    }
  }
}

/** Task-9-only source adapter. It must be deleted with store_snapshot. */
export async function readLegacySnapshot(pool: Queryable): Promise<LegacySnapshotBackfillSnapshot> {
  const { rows } = await pool.query<{ data: unknown }>(
    'SELECT data FROM store_snapshot WHERE key = $1',
    ['main'],
  );
  const snapshot = rows[0]?.data;
  if (snapshot === undefined || snapshot === null) {
    throw new Error('legacy store_snapshot singleton row main is missing');
  }
  assertSnapshotShape(snapshot);
  return snapshot;
}

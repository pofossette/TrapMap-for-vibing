import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import type { Pool } from 'pg';

import { createKnowledgeReadGraphProjectionRebuilder } from '../packages/service-knowledge-read/src/graph-projection-backfill.js';
import {
  runLegacySnapshotBackfill,
  type LegacySnapshotBackfillDeps,
} from './legacy-snapshot-backfill.js';
import { createLegacySnapshotOwnerWiring } from './legacy-snapshot-owner-wiring.js';
import { readLegacySnapshot } from './legacy-snapshot-source.js';
import { reportEntrypointFailure } from './testing/entrypoint.js';

type CommandResult = Awaited<ReturnType<typeof runLegacySnapshotBackfill>>;

export interface LegacySnapshotBackfillCommandDeps {
  sourcePool: Pool;
  targetPool: Pool;
  readSnapshot?: typeof readLegacySnapshot;
  createGraphRebuilder?: typeof createKnowledgeReadGraphProjectionRebuilder;
  createOwnerWiring?: typeof createLegacySnapshotOwnerWiring;
  runBackfill?: typeof runLegacySnapshotBackfill;
}

/**
 * Runs the Task-9 transfer without destructive compatibility-state changes.
 * A later, separately authorized retirement step may only act on the returned
 * readyForCompatibilityStateDeletion flag after database evidence is reviewed.
 */
export async function runLegacySnapshotBackfillCommand(
  deps: LegacySnapshotBackfillCommandDeps,
): Promise<CommandResult> {
  const readSnapshot = deps.readSnapshot ?? readLegacySnapshot;
  const createGraphRebuilder =
    deps.createGraphRebuilder ?? createKnowledgeReadGraphProjectionRebuilder;
  const createOwnerWiring = deps.createOwnerWiring ?? createLegacySnapshotOwnerWiring;
  const runBackfill = deps.runBackfill ?? runLegacySnapshotBackfill;

  const snapshot = await readSnapshot(deps.sourcePool);
  const rebuildGraphProjection = createGraphRebuilder(deps.targetPool);
  const ownerWiring = createOwnerWiring(deps.targetPool, rebuildGraphProjection);

  return runBackfill({
    ...ownerWiring,
    readSnapshot: async () => snapshot,
  } as LegacySnapshotBackfillDeps);
}

function parseCommandOptions(): { sourceDatabaseUrl: string; targetDatabaseUrl: string } {
  const { values } = parseArgs({
    options: {
      'source-database-url': { type: 'string' },
      'target-database-url': { type: 'string' },
    },
    strict: true,
  });
  if (!values['source-database-url'] || !values['target-database-url']) {
    throw new Error(
      'Usage: pnpm exec tsx scripts/backfill-legacy-snapshot.ts --source-database-url <url> --target-database-url <url>',
    );
  }
  return {
    sourceDatabaseUrl: values['source-database-url'],
    targetDatabaseUrl: values['target-database-url'],
  };
}

export async function main(): Promise<void> {
  const options = parseCommandOptions();
  const { Pool } = await import('pg');
  const sourcePool = new Pool({ connectionString: options.sourceDatabaseUrl });
  const targetPool = new Pool({ connectionString: options.targetDatabaseUrl });
  try {
    const result = await runLegacySnapshotBackfillCommand({ sourcePool, targetPool });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.readyForCompatibilityStateDeletion) {
      process.exitCode = 2;
    }
  } finally {
    await Promise.all([sourcePool.end(), targetPool.end()]);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(reportEntrypointFailure);
}

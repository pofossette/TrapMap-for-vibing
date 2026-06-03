/**
 * Label backfill CLI runner.
 *
 * Usage:
 *   pnpm backfill:labels
 *   pnpm backfill:labels -- --dry-run
 *
 * Requires DATABASE_URL environment variable.
 */

import { Pool } from 'pg';

import { createAiProviders, loadAiProviderConfig } from '@trapmap/server/lib/ai/index.js';
import { createGraphIndexRepository } from '@trapmap/server/lib/graph-index/repository.js';
import { PostgresStore } from '@trapmap/server/lib/persistence/postgres-store.js';

import { backfillLabels } from './backfill.js';
import { createLabelRepository } from './repository.js';

interface RawLabelSource {
  label: string;
  kind: string;
  sourceType: 'knowledge' | 'artifact' | 'graph';
  sourceId: string;
}

export async function loadRawLabelSources(
  pool: Pool,
  graphRepo = createGraphIndexRepository({
    pool,
    store: new PostgresStore(pool),
  }),
): Promise<RawLabelSource[]> {
  const sources: RawLabelSource[] = [];

  const knowledgeRows = await pool.query<{ entry_id: string; label: string }>(
    'SELECT entry_id, label FROM knowledge_labels ORDER BY entry_id, label',
  );
  for (const row of knowledgeRows.rows) {
    sources.push({
      label: row.label,
      kind: 'cue',
      sourceType: 'knowledge',
      sourceId: row.entry_id,
    });
  }

  const artifactRows = await pool.query<{ id: string; labels: unknown }>(
    'SELECT id, labels FROM skill_artifacts ORDER BY id',
  );
  for (const row of artifactRows.rows) {
    const labels = Array.isArray(row.labels) ? row.labels : [];
    for (const value of labels) {
      if (typeof value !== 'string' || value.trim().length === 0) continue;
      sources.push({
        label: value,
        kind: 'tool',
        sourceType: 'artifact',
        sourceId: row.id,
      });
    }
  }

  const graphDocs = await graphRepo.listAll();
  for (const doc of graphDocs) {
    for (const node of doc.nodes) {
      if (node.kind === 'trap' || node.kind === 'skill') continue;
      const raw = node.rawLabel ?? node.label;
      if (raw.trim().length === 0) continue;
      sources.push({
        label: raw,
        kind: node.kind,
        sourceType: 'graph',
        sourceId: doc.id,
      });
    }
  }

  return sources;
}

export async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('Error: DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const repository = createLabelRepository({ pool });
    const rawLabelSources = await loadRawLabelSources(pool);
    const ai = createAiProviders(loadAiProviderConfig());

    console.log(`Starting label backfill${dryRun ? ' (DRY RUN)' : ''}...`);
    console.log(`Found ${rawLabelSources.length} raw label sources`);

    const report = await backfillLabels(repository, rawLabelSources, {
      chat: ai.chat,
      embeddings: ai.embeddings,
      dryRun,
      sourceContext: 'backfill',
      autoMergeThreshold: 0.8,
    });

    console.log('\n=== Backfill Report ===');
    console.log(`Examined: ${report.examined}`);
    console.log(`Canonical created: ${report.canonicalCreated}`);
    console.log(`Aliases created: ${report.aliasesCreated}`);
    console.log(`Alignment events: ${report.alignmentEvents}`);
    console.log(`Matched existing: ${report.matchedExisting}`);
    console.log(`Unsure: ${report.unsure}`);
    console.log(`Skipped: ${report.skipped}`);
    if (report.warnings.length > 0) {
      console.log(`Warnings: ${report.warnings.join(', ')}`);
    }

    console.log('\nDone.');
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
  });
}

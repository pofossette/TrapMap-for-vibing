import { createAiProviders, loadAiProviderConfig } from '@trapmap/server/lib/ai/index.js';
import { backfillLabels } from '@trapmap/server/lib/labels/backfill.js';
import { repairGraphDocuments } from '@trapmap/server/lib/labels/merge-repair.js';
import { createLabelReadProjection } from '@trapmap/server/lib/labels/repository.js';
import type { GraphIndexRepositoryPort } from '@trapmap/contracts';
import { createKnowledgeReadGraphIndexRepository } from '@trapmap/service-knowledge-read';
import { Pool } from 'pg';

interface RawLabelSource {
  label: string;
  kind: string;
  sourceType: 'knowledge' | 'artifact' | 'graph';
  sourceId: string;
}

export async function withLabelRunnerPool<T>(run: (pool: Pool) => Promise<T>): Promise<T> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    return await run(pool);
  } finally {
    await pool.end();
  }
}

async function loadKnowledgeLabelSources(pool: Pool): Promise<RawLabelSource[]> {
  const result = await pool.query<{ entry_id: string; label: string }>(
    'SELECT entry_id, label FROM knowledge_labels ORDER BY entry_id, label',
  );
  return result.rows.map((row) => ({
    label: row.label,
    kind: 'cue',
    sourceType: 'knowledge',
    sourceId: row.entry_id,
  }));
}

async function loadArtifactLabelSources(pool: Pool): Promise<RawLabelSource[]> {
  const result = await pool.query<{ id: string; labels: unknown }>(
    'SELECT id, labels FROM skill_artifacts ORDER BY id',
  );
  return result.rows.flatMap((row) =>
    (Array.isArray(row.labels) ? row.labels : []).flatMap((value) =>
      typeof value === 'string' && value.trim().length > 0
        ? [{ label: value, kind: 'tool', sourceType: 'artifact' as const, sourceId: row.id }]
        : [],
    ),
  );
}

async function loadGraphLabelSources(
  graphIndex: Pick<GraphIndexRepositoryPort, 'listAll'>,
): Promise<RawLabelSource[]> {
  return (await graphIndex.listAll()).flatMap((document) =>
    document.nodes.flatMap((node) => {
      const raw = node.rawLabel ?? node.label;
      return node.kind === 'trap' || node.kind === 'skill' || raw.trim().length === 0
        ? []
        : [{ label: raw, kind: node.kind, sourceType: 'graph' as const, sourceId: document.id }];
    }),
  );
}

export async function loadRawLabelSources(
  pool: Pool,
  graphIndex: Pick<GraphIndexRepositoryPort, 'listAll'>,
): Promise<RawLabelSource[]> {
  const [knowledge, artifacts, graph] = await Promise.all([
    loadKnowledgeLabelSources(pool),
    loadArtifactLabelSources(pool),
    loadGraphLabelSources(graphIndex),
  ]);
  return [...knowledge, ...artifacts, ...graph];
}

function logCompletion(warnings: string[]): void {
  if (warnings.length > 0) console.log(`Warnings: ${warnings.join(', ')}`);
  console.log('\nDone.');
}

export async function runLabelBackfill(dryRun: boolean): Promise<void> {
  await withLabelRunnerPool(async (pool) => {
    const graphIndex = createKnowledgeReadGraphIndexRepository(pool);
    const rawLabelSources = await loadRawLabelSources(pool, graphIndex);
    const ai = createAiProviders(loadAiProviderConfig());
    console.log(`Starting label backfill${dryRun ? ' (DRY RUN)' : ''}...`);
    console.log(`Found ${rawLabelSources.length} raw label sources`);
    const report = await backfillLabels(createLabelReadProjection({ pool }), rawLabelSources, {
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
    logCompletion(report.warnings);
  });
}

export async function runLabelMergeRepair(dryRun: boolean): Promise<void> {
  await withLabelRunnerPool(async (pool) => {
    const graphIndex = createKnowledgeReadGraphIndexRepository(pool);
    const documents = await graphIndex.listAll();
    console.log(`Starting label merge repair${dryRun ? ' (DRY RUN)' : ''}...`);
    console.log(`Found ${documents.length} graph documents to examine`);
    const report = await repairGraphDocuments(
      createLabelReadProjection({ pool }),
      documents,
      (document) => graphIndex.upsert(document),
      { dryRun },
    );
    console.log('\n=== Merge Repair Report ===');
    console.log(`Examined: ${report.examined}`);
    console.log(`Updated documents: ${report.updatedDocuments}`);
    console.log(`Nodes rewritten: ${report.nodesRewritten}`);
    console.log(`Edges rewritten: ${report.edgesRewritten}`);
    logCompletion(report.warnings);
  });
}

export async function runLabelRunnerMain(
  main: () => Promise<void>,
  failureLabel: string,
): Promise<void> {
  await main().catch((error: unknown) => {
    console.error(`${failureLabel} failed:`, error);
    process.exitCode = 1;
  });
}

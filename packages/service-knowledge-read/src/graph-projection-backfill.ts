import { createHash } from 'node:crypto';

import type { Pool, PoolClient } from 'pg';

type GraphSourceType = 'trap' | 'skill';
type GraphScope = 'global' | 'project';

interface GraphSourceRow {
  id: string;
  team_id: string | null;
  scope: GraphScope;
  required_level: number;
  label: string;
  evidence: string;
  updated_at: string | Date;
  revision_no: number;
}

interface GraphDocument {
  id: string;
  sourceType: GraphSourceType;
  sourceId: string;
  revision: number;
  contentHash: string;
  teamId: string | null;
  scope: GraphScope;
  requiredLevel: number;
  nodes: Array<{ id: string; kind: GraphSourceType; label: string; evidence: string }>;
  evidence: string;
  updatedAt: string | Date;
}

type TransactionPool = Pick<Pool, 'connect'>;
type TransactionClient = Pick<PoolClient, 'query' | 'release'>;

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function asScope(value: unknown): GraphScope {
  return value === 'project' ? 'project' : 'global';
}

function normalizeSourceRow(
  row: Record<string, unknown>,
  sourceType: GraphSourceType,
): GraphSourceRow {
  const id = asString(row.id);
  if (!id) throw new Error(`Graph projection ${sourceType} source is missing an ID`);

  const label = sourceType === 'trap' ? asString(row.shortcut) : asString(row.title);
  const metadata = row.metadata as { summary?: unknown } | null;
  const evidence =
    sourceType === 'trap' ? asString(row.detail) : asString(metadata?.summary) || label;

  return {
    id,
    team_id: typeof row.team_id === 'string' ? row.team_id : null,
    scope: asScope(row.scope),
    required_level: asNumber(row.required_level, 0),
    label,
    evidence,
    updated_at:
      row.updated_at instanceof Date || typeof row.updated_at === 'string'
        ? row.updated_at
        : new Date(0).toISOString(),
    revision_no: Math.max(1, asNumber(row.revision_no, 1)),
  };
}

function buildDocument(sourceType: GraphSourceType, source: GraphSourceRow): GraphDocument {
  const node = {
    id: `${sourceType}:${source.id}`,
    kind: sourceType,
    label: source.label,
    evidence: source.evidence,
  };
  const contentHash = createHash('sha256')
    .update(JSON.stringify({ sourceType, sourceId: source.id, revision: source.revision_no, node }))
    .digest('hex');

  return {
    id: `graphdoc_${sourceType}_${source.id}_r${source.revision_no}`,
    sourceType,
    sourceId: source.id,
    revision: source.revision_no,
    contentHash,
    teamId: source.team_id,
    scope: source.scope,
    requiredLevel: source.required_level,
    nodes: [node],
    evidence: `derived from authoritative ${sourceType} ${source.id} revision ${source.revision_no}`,
    updatedAt: source.updated_at,
  };
}

async function readAuthoritativeSources(client: TransactionClient): Promise<GraphDocument[]> {
  const knowledge = await client.query(
    `SELECT ke.id, ke.team_id, ke.scope, ke.required_level, ke.shortcut, ke.detail, ke.updated_at,
            COALESCE(MAX(kr.revision_no), 1) AS revision_no
       FROM knowledge_entries ke
       LEFT JOIN knowledge_revisions kr ON kr.entry_id = ke.id
      GROUP BY ke.id`,
  );
  const artifacts = await client.query(
    `SELECT sa.id, sa.team_id, sa.scope, sa.required_level, sa.title, sa.metadata, sa.updated_at,
            COALESCE(MAX(ar.revision_no), 1) AS revision_no
       FROM skill_artifacts sa
       LEFT JOIN artifact_revisions ar ON ar.artifact_id = sa.id
      GROUP BY sa.id`,
  );

  return [
    ...knowledge.rows.map((row) =>
      buildDocument('trap', normalizeSourceRow(row as Record<string, unknown>, 'trap')),
    ),
    ...artifacts.rows.map((row) =>
      buildDocument('skill', normalizeSourceRow(row as Record<string, unknown>, 'skill')),
    ),
  ];
}

async function replaceGraphDocuments(
  client: TransactionClient,
  documents: readonly GraphDocument[],
): Promise<void> {
  await client.query('DELETE FROM graph_index_documents');
  for (const document of documents) {
    await client.query(
      `INSERT INTO graph_index_documents (
         id, source_type, source_id, revision_no, content_hash, team_id, scope, required_level,
         nodes, edges, evidence, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, '[]'::jsonb, $10, $11, $11)`,
      [
        document.id,
        document.sourceType,
        document.sourceId,
        document.revision,
        document.contentHash,
        document.teamId,
        document.scope,
        document.requiredLevel,
        JSON.stringify(document.nodes),
        document.evidence,
        document.updatedAt,
      ],
    );
  }
}

/**
 * Creates the Task-9 graph projection rebuild owned by knowledge-read. It
 * rebuilds only from knowledge-write's authoritative source tables and treats
 * the graph table as a fully replaceable derived projection.
 */
export function createKnowledgeReadGraphProjectionRebuilder(pool: TransactionPool) {
  return async (): Promise<{ sourceCount: number; destinationCount: number }> => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const documents = await readAuthoritativeSources(client);
      await replaceGraphDocuments(client, documents);
      const countResult = await client.query(
        'SELECT COUNT(*)::int AS count FROM graph_index_documents',
      );
      const destinationCount = asNumber(
        (countResult.rows[0] as { count?: unknown } | undefined)?.count,
        -1,
      );
      if (destinationCount !== documents.length) {
        throw new Error(
          `Graph projection readback count mismatch: expected ${documents.length}, got ${destinationCount}`,
        );
      }
      await client.query('COMMIT');
      return { sourceCount: documents.length, destinationCount };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  };
}

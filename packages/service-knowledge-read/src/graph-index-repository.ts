import type { GraphIndexDocumentRecord, GraphIndexRepositoryPort } from '@trapmap/contracts';
import type { Pool } from 'pg';

type Queryable = Pick<Pool, 'query'>;

interface GraphIndexRow {
  id: string;
  source_type: 'trap' | 'skill';
  source_id: string;
  revision_no: number;
  content_hash: string;
  team_id: string | null;
  scope: GraphIndexDocumentRecord['scope'];
  required_level: number;
  nodes: GraphIndexDocumentRecord['nodes'];
  edges: GraphIndexDocumentRecord['edges'];
  evidence: string;
  created_at: Date | string;
  updated_at: Date | string;
}

const columns = `
  id, source_type, source_id, revision_no, content_hash, team_id, scope, required_level,
  nodes, edges, evidence, created_at, updated_at`;

function asIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function toRecord(row: GraphIndexRow): GraphIndexDocumentRecord {
  return {
    id: row.id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    revision: row.revision_no,
    contentHash: row.content_hash,
    teamId: row.team_id,
    scope: row.scope,
    requiredLevel: row.required_level,
    nodes: row.nodes,
    edges: row.edges,
    evidence: row.evidence,
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at),
  };
}

function values(document: GraphIndexDocumentRecord) {
  return [
    document.id,
    document.sourceType,
    document.sourceId,
    document.revision,
    document.contentHash,
    document.teamId,
    document.scope,
    document.requiredLevel,
    JSON.stringify(document.nodes),
    JSON.stringify(document.edges),
    document.evidence,
    document.createdAt,
    document.updatedAt,
  ];
}

/** PostgreSQL graph projection repository owned by knowledge-read. */
export function createKnowledgeReadGraphIndexRepository(pool: Queryable): GraphIndexRepositoryPort {
  return {
    async insert(document) {
      await pool.query(
        `INSERT INTO graph_index_documents (${columns})
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12, $13)`,
        values(document),
      );
    },
    async getById(id) {
      const result = await pool.query(
        `SELECT ${columns} FROM graph_index_documents WHERE id = $1`,
        [id],
      );
      return result.rows[0] ? toRecord(result.rows[0] as GraphIndexRow) : null;
    },
    async listBySource(sourceType, sourceId) {
      const result = await pool.query(
        `SELECT ${columns} FROM graph_index_documents WHERE source_type = $1 AND source_id = $2`,
        [sourceType, sourceId],
      );
      return result.rows.map((row) => toRecord(row as GraphIndexRow));
    },
    async listAll() {
      const result = await pool.query(`SELECT ${columns} FROM graph_index_documents`);
      return result.rows.map((row) => toRecord(row as GraphIndexRow));
    },
    async upsert(document) {
      await pool.query(
        `INSERT INTO graph_index_documents (${columns})
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12, $13)
         ON CONFLICT (id) DO UPDATE SET
           content_hash = EXCLUDED.content_hash, nodes = EXCLUDED.nodes, edges = EXCLUDED.edges,
           evidence = EXCLUDED.evidence, updated_at = EXCLUDED.updated_at`,
        values(document),
      );
    },
    async remove(id) {
      await pool.query('DELETE FROM graph_index_documents WHERE id = $1', [id]);
    },
    async removeBySource(sourceType, sourceId) {
      await pool.query(
        'DELETE FROM graph_index_documents WHERE source_type = $1 AND source_id = $2',
        [sourceType, sourceId],
      );
    },
  };
}

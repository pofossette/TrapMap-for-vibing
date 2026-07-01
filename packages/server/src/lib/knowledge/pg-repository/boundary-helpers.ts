/**
 * Helpers for reading/writing knowledge boundary sub-tables.
 *
 * Boundary data is stored in six related tables:
 *   knowledge_boundary_contexts, knowledge_boundary_versions,
 *   knowledge_boundary_prerequisites, knowledge_boundary_signals,
 *   knowledge_boundary_exclusions, knowledge_boundary_evidence.
 */

import type { Boundary } from '@trapmap/contracts';
import type { Pool } from 'pg';

/**
 * Insert boundary sub-tables for a knowledge entry.
 */
export async function insertBoundarySubTables(
  client: import('pg').PoolClient,
  entryId: string,
  boundary: Boundary,
): Promise<void> {
  // Context labels
  for (const ctx of boundary.context) {
    await client.query(
      'INSERT INTO knowledge_boundary_contexts (entry_id, context_value) VALUES ($1, $2)',
      [entryId, ctx],
    );
  }

  // Version constraints
  for (const ver of boundary.versions) {
    await client.query(
      'INSERT INTO knowledge_boundary_versions (entry_id, package_name, range_value, note) VALUES ($1, $2, $3, $4)',
      [entryId, ver.package, ver.range, ver.note ?? null],
    );
  }

  // Prerequisites
  for (const prereq of boundary.prerequisites) {
    await client.query(
      'INSERT INTO knowledge_boundary_prerequisites (entry_id, description, kind, required) VALUES ($1, $2, $3, $4)',
      [entryId, prereq.description, prereq.kind ?? null, prereq.required ? 1 : 0],
    );
  }

  // Signals
  for (const sig of boundary.signals) {
    await client.query(
      'INSERT INTO knowledge_boundary_signals (entry_id, pattern, kind, description) VALUES ($1, $2, $3, $4)',
      [entryId, sig.pattern, sig.kind, sig.description ?? null],
    );
  }

  // Exclusions
  for (const exc of boundary.exclusions) {
    await client.query(
      'INSERT INTO knowledge_boundary_exclusions (entry_id, description, kind) VALUES ($1, $2, $3)',
      [entryId, exc.description, exc.kind ?? null],
    );
  }

  // Evidence
  for (const ev of boundary.evidence) {
    await client.query(
      'INSERT INTO knowledge_boundary_evidence (entry_id, kind, identifier, url, note) VALUES ($1, $2, $3, $4, $5)',
      [entryId, ev.kind, ev.identifier, ev.url ?? null, ev.note ?? null],
    );
  }
}

/**
 * Clear all boundary sub-table rows for a knowledge entry.
 */
export async function clearBoundarySubTables(
  client: import('pg').PoolClient,
  entryId: string,
): Promise<void> {
  await client.query('DELETE FROM knowledge_boundary_contexts WHERE entry_id = $1', [entryId]);
  await client.query('DELETE FROM knowledge_boundary_versions WHERE entry_id = $1', [entryId]);
  await client.query('DELETE FROM knowledge_boundary_prerequisites WHERE entry_id = $1', [entryId]);
  await client.query('DELETE FROM knowledge_boundary_signals WHERE entry_id = $1', [entryId]);
  await client.query('DELETE FROM knowledge_boundary_exclusions WHERE entry_id = $1', [entryId]);
  await client.query('DELETE FROM knowledge_boundary_evidence WHERE entry_id = $1', [entryId]);
}

/**
 * Load boundary data from sub-tables for a knowledge entry.
 */
export async function loadBoundaryFromSubTables(
  pool: Pool,
  entryId: string,
): Promise<Boundary | null> {
  const [contexts, versions, prerequisites, signals, exclusions, evidence] = await Promise.all([
    pool.query<{ context_value: string }>(
      'SELECT context_value FROM knowledge_boundary_contexts WHERE entry_id = $1 ORDER BY id',
      [entryId],
    ),
    pool.query<{ package_name: string; range_value: string; note: string | null }>(
      'SELECT package_name, range_value, note FROM knowledge_boundary_versions WHERE entry_id = $1 ORDER BY id',
      [entryId],
    ),
    pool.query<{ description: string; kind: string | null; required: number }>(
      'SELECT description, kind, required FROM knowledge_boundary_prerequisites WHERE entry_id = $1 ORDER BY id',
      [entryId],
    ),
    pool.query<{ pattern: string; kind: string; description: string | null }>(
      'SELECT pattern, kind, description FROM knowledge_boundary_signals WHERE entry_id = $1 ORDER BY id',
      [entryId],
    ),
    pool.query<{ description: string; kind: string | null }>(
      'SELECT description, kind FROM knowledge_boundary_exclusions WHERE entry_id = $1 ORDER BY id',
      [entryId],
    ),
    pool.query<{ kind: string; identifier: string; url: string | null; note: string | null }>(
      'SELECT kind, identifier, url, note FROM knowledge_boundary_evidence WHERE entry_id = $1 ORDER BY id',
      [entryId],
    ),
  ]);

  // If no boundary data exists in sub-tables, return null
  if (
    contexts.rows.length === 0 &&
    versions.rows.length === 0 &&
    prerequisites.rows.length === 0 &&
    signals.rows.length === 0 &&
    exclusions.rows.length === 0 &&
    evidence.rows.length === 0
  ) {
    return null;
  }

  return {
    context: contexts.rows.map((r) => r.context_value),
    versions: versions.rows.map((r) => ({
      package: r.package_name,
      range: r.range_value,
      note: r.note ?? undefined,
    })),
    prerequisites: prerequisites.rows.map((r) => ({
      description: r.description,
      kind: (r.kind ?? undefined) as Boundary['prerequisites'][number]['kind'],
      required: r.required === 1,
    })),
    signals: signals.rows.map((r) => ({
      pattern: r.pattern,
      kind: r.kind as Boundary['signals'][number]['kind'],
      description: r.description ?? undefined,
    })),
    exclusions: exclusions.rows.map((r) => ({
      description: r.description,
      kind: (r.kind ?? undefined) as Boundary['exclusions'][number]['kind'],
    })),
    evidence: evidence.rows.map((r) => ({
      kind: r.kind as Boundary['evidence'][number]['kind'],
      identifier: r.identifier,
      url: r.url ?? undefined,
      note: r.note ?? undefined,
    })),
  };
}

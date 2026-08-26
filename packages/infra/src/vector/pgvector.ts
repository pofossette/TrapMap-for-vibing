/**
 * @trapmap/infra — shared pgvector helpers.
 *
 * Host-agnostic SQL building utilities for pgvector similarity search.
 * These pure helpers were previously duplicated across
 * `service-knowledge-read` (knowledge embeddings, gene retrieval) and
 * `service-knowledge-write` (duplicate projection). Consolidating here
 * gives a single testable implementation and a clear ownership boundary.
 */

/**
 * Format a numeric vector as a pgvector literal string: `[1,2,3]`.
 * The caller is responsible for ensuring the vector contains only finite numbers.
 */
export function formatVectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

/**
 * Clamp a similarity value to the `[0, 1]` range.
 * pgvector cosine distance yields `1 - (a <=> b)` which is already in range,
 * but clamping protects against floating-point drift and keeps tests stable.
 */
export function clampSimilarity(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * pgvector cosine distance expression: `column <=> $index::vector`.
 */
export function vectorDistanceExpression(column: string, paramIndex: number): string {
  return `${column} <=> $${paramIndex}::vector`;
}

/**
 * pgvector cosine similarity expression: `1 - (column <=> $index::vector)`.
 */
export function vectorSimilarityExpression(column: string, paramIndex: number): string {
  return `1 - (${column} <=> $${paramIndex}::vector)`;
}

/**
 * Build a SELECT that returns similarity clamped to `[0, 1]` and ordered by
 * vector distance asc, then id asc for stable test ordering.
 */
export function buildVectorSimilaritySelect(params: {
  tableAlias: string;
  vectorColumn: string;
  vector: number[];
  paramIndex: number;
}): { vectorLiteral: string; orderBy: string; similaritySelect: string } {
  const vectorLiteral = formatVectorLiteral(params.vector);
  const similaritySelect = `least(1.0, greatest(0.0, ${vectorSimilarityExpression(`${params.tableAlias}.${params.vectorColumn}`, params.paramIndex)}))`;
  const orderBy = `${vectorDistanceExpression(`${params.tableAlias}.${params.vectorColumn}`, params.paramIndex)}`;
  return { vectorLiteral, orderBy, similaritySelect };
}

/**
 * Append a team_id governance filter to SQL conditions.
 * - `null` => `team_id IS NULL`
 * - `string` => `(team_id IS NULL OR team_id = $n)`
 * - `undefined` => no filter (caller wants no team scoping)
 */
export function appendTeamFilter(
  conditions: string[],
  params: unknown[],
  teamId: string | null | undefined,
  column = 'team_id',
): void {
  if (teamId === undefined) return;
  if (teamId === null) {
    conditions.push(`${column} IS NULL`);
    return;
  }
  params.push(teamId);
  conditions.push(`(${column} IS NULL OR ${column} = $${params.length})`);
}

/**
 * Append a scope filter. Empty array => no filter.
 */
export function appendScopeFilter(
  conditions: string[],
  params: unknown[],
  scopes: Array<'global' | 'project'>,
  column = 'scope',
): void {
  if (!scopes || scopes.length === 0) return;
  if (scopes.length === 1) {
    params.push(scopes[0]!);
    conditions.push(`${column} = $${params.length}`);
    return;
  }
  params.push(scopes);
  conditions.push(`${column} = ANY($${params.length}::text[])`);
}

/**
 * Append maxRequiredLevel governance filter.
 */
export function appendRequiredLevelFilter(
  conditions: string[],
  params: unknown[],
  maxRequiredLevel: number,
  column = 'required_level',
): void {
  params.push(maxRequiredLevel);
  conditions.push(`${column} <= $${params.length}`);
}

/**
 * Build governance conditions for Experience Gene reads:
 * team_id + required_level + scope + optional labels JSONB containment.
 */
export function appendExperienceGeneGovernanceFilters(
  conditions: string[],
  params: unknown[],
  context: { teamId: string | null; maxRequiredLevel: number },
  filters: { labels: string[]; scopes: Array<'global' | 'project'> },
  columnPrefix = 'g',
): void {
  if (context.teamId === null) {
    conditions.push(`${columnPrefix}.team_id IS NULL`);
  } else {
    params.push(context.teamId);
    conditions.push(
      `(${columnPrefix}.team_id IS NULL OR ${columnPrefix}.team_id = $${params.length})`,
    );
  }
  params.push(context.maxRequiredLevel);
  conditions.push(`${columnPrefix}.required_level <= $${params.length}`);
  if (filters.scopes.length > 0) {
    params.push(filters.scopes);
    conditions.push(`${columnPrefix}.scope = ANY($${params.length}::text[])`);
  }
  if (filters.labels.length > 0) {
    params.push(JSON.stringify(filters.labels));
    conditions.push(`${columnPrefix}.labels @> $${params.length}::jsonb`);
  }
}

/**
 * Build a document string for gene search projections.
 * Shared between read-side vector recall and write-side projection writes.
 */
export function buildGeneSearchDocument(gene: {
  title: string;
  summary: string;
  strategy: readonly string[];
  avoid: readonly string[];
  validation: readonly string[];
}): string {
  return [gene.title, gene.summary, ...gene.strategy, ...gene.avoid, ...gene.validation].join('\n');
}

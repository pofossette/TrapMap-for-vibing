import type { Pool } from 'pg';

import {
  type ExperienceGeneRecallCandidate,
  normalizeQuery,
  selectExperienceGenes,
} from '@trapmap/backend-core';
import type { ExperienceGeneMetricsPort } from '@trapmap/backend-core';
import {
  type ExperienceGene,
  type ExperienceGeneMode,
  type GeneSearchQuery,
  type GeneSearchResponse,
  disabledExperienceGeneSearchResponse,
} from '@trapmap/contracts';
import { appendExperienceGeneGovernanceFilters, formatVectorLiteral } from '@trapmap/infra';

import { withExperienceGeneSearchMetrics } from './experience-gene-metrics.js';

type Queryable = Pick<Pool, 'query'>;

export interface ExperienceGeneDbContext {
  teamId: string | null;
  maxRequiredLevel: number;
}

interface ExperienceGeneSqlFilters {
  labels: string[];
  scopes: Array<'global' | 'project'>;
}

type GeneRow = Omit<Record<string, unknown>, 'semantic_score' | 'keyword_score'> & {
  semantic_score?: number | null;
  keyword_score?: number | null;
};

export interface PgExperienceGeneSearchPort {
  searchGenes(
    input: {
      seed: string;
      filters: { teamId?: string | null; labels: string[]; scopes: Array<'global' | 'project'> };
      maxResults: number;
      includeActivationHints: boolean;
    },
    context: ExperienceGeneDbContext,
  ): Promise<GeneSearchResponse>;
}

function array(value: unknown): string[] {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === 'string')
    : [];
}

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function number(value: unknown): number {
  return typeof value === 'number' ? value : Number(value ?? 0);
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function mapGene(row: GeneRow): ExperienceGene {
  const sourceKind = row.source_type;
  return {
    geneId: String(row.id),
    schemaVersion: '1',
    status: 'solidified',
    title: String(row.title),
    signalsMatch: array(row.signals_match),
    summary: String(row.summary),
    strategy: array(row.strategy),
    avoid: array(row.avoid),
    constraints: array(row.constraints),
    validation: array(row.validation),
    labels: array(row.labels),
    scope: row.scope === 'global' ? 'global' : 'project',
    teamId: nullableString(row.team_id),
    requiredLevel: number(row.required_level),
    source: {
      kind:
        sourceKind === 'trap'
          ? 'trap'
          : sourceKind === 'skill-capsule'
            ? 'skill-capsule'
            : 'skill-artifact',
      sourceId: String(row.source_id),
      sourceRevision: number(row.source_revision),
      sourceHash: String(row.source_hash),
      artifactId: nullableString(row.artifact_id),
      capsuleId: nullableString(row.capsule_id),
      artifactRevision:
        row.artifact_revision === null || row.artifact_revision === undefined
          ? null
          : number(row.artifact_revision),
    },
    lineage: {
      derivationUnitId: String(row.derivation_unit_id),
      parentEventId: nullableString(row.parent_event_id),
      promptVersion: String(row.prompt_version),
      priorGeneHash: nullableString(row.prior_gene_hash),
    },
    generator: {
      kind:
        row.generator_kind === 'llm' ? 'llm' : row.generator_kind === 'hybrid' ? 'hybrid' : 'rule',
      model: nullableString(row.generator_model),
      promptVersion: String(row.prompt_version),
    },
    indexing: {
      status: 'ready',
      lastError: nullableString(row.index_last_error),
      updatedAt: iso(row.updated_at),
    },
    contentHash: String(row.content_hash),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function governanceFilters(
  conditions: string[],
  params: unknown[],
  context: ExperienceGeneDbContext,
  filters: { labels: string[]; scopes: Array<'global' | 'project'> },
): void {
  appendExperienceGeneGovernanceFilters(conditions, params, context, filters, 'g');
}

async function keywordRecall(
  pool: Queryable,
  seed: string,
  context: ExperienceGeneDbContext,
  filters: ExperienceGeneSqlFilters,
) {
  const params: unknown[] = [seed];
  const conditions = ["g.status = 'solidified'", "p.status = 'ready'"];
  governanceFilters(conditions, params, context, filters);
  params.push(20);
  const result = await pool.query<GeneRow>(
    `SELECT g.*, p.document,
            least(1.0, greatest(0.0,
              ts_rank(p.document, websearch_to_tsquery('english', $1)) * 5)) AS keyword_score,
            0.0 AS semantic_score
     FROM experience_genes g
     JOIN experience_gene_search_documents p ON p.gene_id = g.id
     WHERE ${conditions.join(' AND ')}
       AND p.document @@ websearch_to_tsquery('english', $1)
     ORDER BY keyword_score DESC, g.id ASC
     LIMIT $${params.length}`,
    params,
  );
  return result.rows;
}

async function vectorRecall(
  pool: Queryable,
  vector: number[],
  context: ExperienceGeneDbContext,
  filters: ExperienceGeneSqlFilters,
) {
  const params: unknown[] = [];
  const conditions = ["g.status = 'solidified'", "p.status = 'ready'"];
  governanceFilters(conditions, params, context, filters);
  params.push(formatVectorLiteral(vector), 20);
  const vectorIndex = params.length - 1;
  const result = await pool.query<GeneRow>(
    `SELECT g.*, 0.0 AS keyword_score,
            least(1.0, greatest(0.0, 1 - (p.embedding <=> $${vectorIndex}::vector))) AS semantic_score
     FROM experience_genes g
     JOIN experience_gene_embeddings p ON p.gene_id = g.id AND p.content_hash = g.content_hash
     WHERE ${conditions.join(' AND ')}
     ORDER BY p.embedding <=> $${vectorIndex}::vector
     LIMIT $${params.length}`,
    params,
  );
  return result.rows;
}

function mergeRecallRows(
  rows: GeneRow[],
  queryTokens: Set<string>,
): ExperienceGeneRecallCandidate[] {
  const candidatesById = new Map<string, ExperienceGeneRecallCandidate>();
  for (const row of rows) {
    const aggregate = mapGene(row);
    const signalText = aggregate.signalsMatch.join('\n').toLowerCase();
    const boundaryText = [aggregate.title, ...aggregate.labels].join('\n').toLowerCase();
    const exactSignalMatch = [...queryTokens].some((token) => signalText.includes(token));
    const existing = candidatesById.get(aggregate.geneId);
    candidatesById.set(aggregate.geneId, {
      gene: aggregate,
      semanticScore: Math.max(number(existing?.semanticScore), number(row.semantic_score)),
      keywordScore: Math.max(number(existing?.keywordScore), number(row.keyword_score)),
      exactSignalMatch,
      errorTextMatch:
        exactSignalMatch ||
        [...queryTokens].some((token) => aggregate.summary.toLowerCase().includes(token)),
      boundaryMatch: [...queryTokens].some((token) => boundaryText.includes(token)),
      freshValidation: aggregate.validation.length > 0,
      broadMatch: number(row.semantic_score) < 0.35 && number(row.keyword_score) < 0.35,
    });
  }
  return [...candidatesById.values()];
}

function toSearchResponse(
  result: ReturnType<typeof selectExperienceGenes>,
  usedVector: boolean,
): GeneSearchResponse {
  const primary = result.primaryGene;
  if (!primary) return disabledExperienceGeneSearchResponse();
  return {
    primaryGene: {
      gene: primary.gene,
      score: primary.score,
      reason: primary.reasons.join('; ') || 'keyword and semantic overlap',
      sourceCitation: {
        kind: primary.aggregate.source.kind,
        sourceId: primary.aggregate.source.sourceId,
        sourceRevision: primary.aggregate.source.sourceRevision,
        artifactId: primary.aggregate.source.artifactId,
        capsuleId: primary.aggregate.source.capsuleId,
      },
      warnings: [],
    },
    supplementaryAvoid: result.supplementaryAvoid,
    routingTrace: {
      selectedMode: usedVector ? 'hybrid' : 'local',
      routeFamily: 'entry',
      routingReason: 'fallback-default',
      fallbackApplied: false,
      channelsUsed: usedVector ? ['keyword', 'semantic'] : ['keyword'],
      fallbackTarget: null,
      confidenceScore: primary.score,
      confidenceBucket: primary.score >= 0.7 ? 'high' : primary.score >= 0.4 ? 'medium' : 'low',
    },
  };
}

export function createPgExperienceGeneSearchPort(deps: {
  pool: Queryable;
  embed?: ((text: string) => Promise<number[]>) | undefined;
  metrics?: ExperienceGeneMetricsPort;
  mode?: ExperienceGeneMode;
}): PgExperienceGeneSearchPort {
  const search = {
    async searchGenes(
      input: GeneSearchQuery,
      context: ExperienceGeneDbContext,
    ): Promise<GeneSearchResponse> {
      let vector: number[] | null = null;
      if (deps.embed) {
        try {
          vector = await deps.embed(input.seed);
        } catch {
          vector = null;
        }
      }

      const [keywordRows, vectorRows] = await Promise.all([
        keywordRecall(deps.pool, input.seed, context, input.filters),
        vector ? vectorRecall(deps.pool, vector, context, input.filters) : Promise.resolve([]),
      ]);
      if (keywordRows.length === 0 && vectorRows.length === 0) {
        return disabledExperienceGeneSearchResponse();
      }

      const candidates = mergeRecallRows(
        [...keywordRows, ...vectorRows],
        new Set(normalizeQuery(input.seed)),
      );
      const result = selectExperienceGenes(candidates, {
        maxResults: input.maxResults,
      });
      return toSearchResponse(result, vector !== null);
    },
  };

  if (!deps.metrics || !deps.mode) return search;
  const metrics = deps.metrics;
  const mode = deps.mode;
  return {
    async searchGenes(input, context) {
      return withExperienceGeneSearchMetrics(search.searchGenes, {
        metrics,
        mode,
      })(input, context);
    },
  };
}

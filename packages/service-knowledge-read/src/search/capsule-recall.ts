/**
 * Capsule-native recall for the v2 retrieval surface.
 *
 * Reads the persisted capsule projections (`skill_artifact_capsules` +
 * `skill_artifact_capsule_embeddings`) which the artifact-derivation pipeline
 * already writes, runs three channels over them, fuses with RRF and gates on
 * `TRAPMAP_MIN_CAPSULE_SCORE`.
 *
 * Provenance: see `capsule-scoring.ts` — this is a re-implementation, not a
 * restoration of the retired `packages/server` pipeline.
 */

import type { CapsuleMatch, ProfileHint } from '@trapmap/contracts';
import type { Pool } from 'pg';

import {
  combineFinalScore,
  fuseChannelRanks,
  normalizeFused,
  resolveMinCapsuleScore,
  scoreCapsuleDimensions,
  type ScorableCapsule,
} from './capsule-scoring.js';

export interface CapsuleRecallContext {
  teamId: string | null;
  maxRequiredLevel: number;
  scopes: Array<'global' | 'project'>;
  labels: string[];
}

/** A capsule row joined with its artifact root metadata. */
export interface CapsuleRow extends ScorableCapsule {
  artifactId: string;
  revision: number;
  sourcePaths: string[];
  scope: 'global' | 'project';
  requiredLevel: number;
  teamId: string | null;
  title: string;
  slug: string;
}

interface RawCapsuleRow {
  capsule_id: string;
  artifact_id: string;
  revision_no: number;
  source_paths: string[] | null;
  content: string;
  situation: string | null;
  problem: string | null;
  goal: string | null;
  contextual_prefix: string | null;
  labels: string[] | null;
  scope: string;
  required_level: number;
  team_id: string | null;
  title: string;
  slug: string;
}

/**
 * Load the candidate capsule pool under governance filters.
 *
 * Ordering is by most recent revision so a later derivation wins over an older
 * one when both are present.
 */
/**
 * Pool cache: `loadCapsulePool` fetched EVERY capsule row + artifact join on
 * every query (the snapshot stage's dominant cost). Keyed by the governance
 * context; TTL bounds staleness for capsule writes that bypass this process
 * (artifact derivation), matching the read-model cache precedent.
 */
const POOL_CACHE_TTL_MS = Number(process.env.TRAPMAP_CAPSULE_POOL_TTL_MS ?? 60_000);
const poolCache = new Map<string, { rows: CapsuleRow[]; builtAt: number }>();

function poolCacheKey(context: CapsuleRecallContext): string {
  return JSON.stringify([context.teamId, context.maxRequiredLevel, context.scopes, context.labels]);
}

export function clearCapsulePoolCacheForTests(): void {
  poolCache.clear();
}

export async function loadCapsulePool(
  pool: Pool,
  context: CapsuleRecallContext,
): Promise<CapsuleRow[]> {
  const cacheKey = poolCacheKey(context);
  const cached = poolCache.get(cacheKey);
  if (cached && Date.now() - cached.builtAt < POOL_CACHE_TTL_MS) {
    return cached.rows;
  }
  const rows = await loadCapsulePoolFromDb(pool, context);
  poolCache.set(cacheKey, { rows, builtAt: Date.now() });
  return rows;
}

async function loadCapsulePoolFromDb(
  pool: Pool,
  context: CapsuleRecallContext,
): Promise<CapsuleRow[]> {
  // `required_level::bigint` because a system-admin context passes
  // `Number.MAX_SAFE_INTEGER` as its security level, which overflows int4.
  const values: unknown[] = [context.scopes, context.maxRequiredLevel];
  const conditions = [
    'cap.scope = ANY($1::text[])',
    'cap.required_level::bigint <= $2::bigint',
    "art.lifecycle_state = 'approved'",
  ];
  if (context.teamId) {
    values.push(context.teamId);
    // Capsules carry no team column in the applied schema; governance is
    // inherited from the artifact root (T-14-01).
    conditions.push(`(art.team_id IS NULL OR art.team_id = $${values.length})`);
  }
  if (context.labels.length > 0) {
    values.push(context.labels);
    conditions.push(`art.labels ?| $${values.length}::text[]`);
  }

  const result = await pool.query<RawCapsuleRow>(
    `SELECT cap.capsule_id, cap.artifact_id, cap.revision_no, cap.source_paths,
            cap.content, cap.situation, cap.problem, cap.goal, cap.contextual_prefix,
            cap.labels, cap.scope, cap.required_level, art.team_id,
            art.title, art.slug
       FROM skill_artifact_capsules cap
       JOIN skill_artifacts art ON art.id = cap.artifact_id
      WHERE ${conditions.join('\n        AND ')}
      ORDER BY cap.revision_no DESC`,
    values,
  );

  return result.rows.map((row) => ({
    capsuleId: row.capsule_id,
    artifactId: row.artifact_id,
    revision: row.revision_no,
    sourcePaths: row.source_paths ?? [],
    content: row.content,
    situation: row.situation,
    problem: row.problem,
    goal: row.goal,
    contextualPrefix: row.contextual_prefix,
    labels: row.labels ?? [],
    scope: row.scope === 'project' ? 'project' : 'global',
    requiredLevel: row.required_level,
    teamId: row.team_id,
    title: row.title,
    slug: row.slug,
  }));
}

// ---------------------------------------------------------------------------
// Channels — each returns capsule ids, best first
// ---------------------------------------------------------------------------

/**
 * Lexical channel: PostgreSQL full-text search over the capsule text fields.
 *
 * Note on schema reality: `packages/db/src/schema/artifacts.ts` declares
 * `keyword_tokens` / `field_keyword_tokens` on this table, but the applied
 * schema (`packages/db/migrations/schema.sql`) has neither, and no writer ever
 * populated them. The channel therefore ranks on an expression over the real
 * columns instead of a pre-tokenized column that does not exist.
 */
export async function keywordCapsuleChannel(
  pool: Pool,
  seed: string,
  context: CapsuleRecallContext,
  limit: number,
): Promise<string[]> {
  if (seed.trim().length === 0) return [];

  const documentExpression =
    "to_tsvector('english', cap.content || ' ' || coalesce(cap.contextual_prefix, ''))";
  const values: unknown[] = [seed, context.scopes, context.maxRequiredLevel];
  const conditions = [
    `${documentExpression} @@ plainto_tsquery('english', $1)`,
    'cap.scope = ANY($2::text[])',
    'cap.required_level::bigint <= $3::bigint',
    "art.lifecycle_state = 'approved'",
  ];
  if (context.teamId) {
    values.push(context.teamId);
    conditions.push(`(art.team_id IS NULL OR art.team_id = $${values.length})`);
  }
  values.push(limit);

  const result = await pool.query<{ capsule_id: string }>(
    `SELECT cap.capsule_id
       FROM skill_artifact_capsules cap
       JOIN skill_artifacts art ON art.id = cap.artifact_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY ts_rank(${documentExpression}, plainto_tsquery('english', $1)) DESC
      LIMIT $${values.length}`,
    values,
  );
  return result.rows.map((row) => row.capsule_id);
}

/**
 * Vector channel over the pre-computed capsule embeddings.
 *
 * Returns [] when the embeddings table has no rows for the pool — that is a
 * legitimate state (index not built yet), not an error, and the fusion handles
 * a missing channel without penalty.
 */
export async function semanticCapsuleChannel(
  pool: Pool,
  queryVector: number[],
  context: CapsuleRecallContext,
  limit: number,
): Promise<string[]> {
  const values: unknown[] = [
    `[${queryVector.join(',')}]`,
    context.scopes,
    context.maxRequiredLevel,
  ];
  const conditions = [
    'emb.scope = ANY($2::text[])',
    'emb.required_level::bigint <= $3::bigint',
    "emb.status = 'synced'",
    "art.lifecycle_state = 'approved'",
  ];
  if (context.teamId) {
    values.push(context.teamId);
    conditions.push(`(emb.team_id IS NULL OR emb.team_id = $${values.length})`);
  }
  values.push(limit);

  const result = await pool.query<{ capsule_id: string }>(
    `SELECT emb.capsule_id, emb.embedding <=> $1::vector AS distance
       FROM skill_artifact_capsule_embeddings emb
       JOIN skill_artifacts art ON art.id = emb.artifact_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY emb.embedding <=> $1::vector
      LIMIT $${values.length}`,
    values,
  );
  return result.rows.map((row) => row.capsule_id);
}

/**
 * Heuristic channel: content-only scoring over the already-loaded pool.
 *
 * Deliberately in-process (no SQL) so it stays available when the vector index
 * is missing — that is what makes it the pipeline's floor.
 */
export function heuristicCapsuleChannel(
  queryTokens: Set<string>,
  poolCapsules: CapsuleRow[],
  limit: number,
): string[] {
  return poolCapsules
    .map((capsule) => ({
      capsuleId: capsule.capsuleId,
      score: scoreCapsuleDimensions(queryTokens, capsule).total,
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((entry) => entry.capsuleId);
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

export interface CapsuleRecallResult {
  capsules: CapsuleMatch[];
  profileHints: ProfileHint[];
  channelsUsed: string[];
  channelSizes: Record<string, number>;
  candidateCount: number;
  gatedOutCount: number;
}

function toMatch(capsule: CapsuleRow, score: number): CapsuleMatch {
  return {
    capsuleId: capsule.capsuleId,
    artifactId: capsule.artifactId,
    revision: capsule.revision,
    sourcePaths: capsule.sourcePaths.length > 0 ? capsule.sourcePaths : ['SKILL.md'],
    content: capsule.content,
    situation: capsule.situation && capsule.situation.length > 0 ? capsule.situation : null,
    problem: capsule.problem && capsule.problem.length > 0 ? capsule.problem : null,
    goal: capsule.goal && capsule.goal.length > 0 ? capsule.goal : null,
    labels: capsule.labels.length > 0 ? capsule.labels : ['uncategorized'],
    scope: capsule.scope,
    requiredLevel: capsule.requiredLevel,
    score,
    reason: 'capsule-recall: content overlap + reciprocal rank fusion',
  };
}

/**
 * Fuse the three channels, gate, and project the survivors.
 *
 * The gate is applied to `finalScore` only — a capsule that no channel ranked
 * is never considered, so a high content score alone cannot smuggle in a
 * candidate the recall stage never surfaced.
 */
export function assembleCapsuleResults(options: {
  pool: CapsuleRow[];
  channelIds: Record<string, string[]>;
  queryTokens: Set<string>;
  maxResults: number;
  minScore?: number;
}): CapsuleRecallResult {
  const { pool, channelIds, queryTokens, maxResults } = options;
  const minScore = options.minScore ?? resolveMinCapsuleScore();

  const poolById = new Map(pool.map((capsule) => [capsule.capsuleId, capsule]));
  const fused = fuseChannelRanks(channelIds);
  const normalized = normalizeFused(fused, Object.keys(channelIds).length);

  const scored = [...normalized.entries()]
    .map(([capsuleId, fusionScore]) => {
      const capsule = poolById.get(capsuleId);
      if (!capsule) return null;
      const dimensions = scoreCapsuleDimensions(queryTokens, capsule);
      return {
        capsule,
        finalScore: combineFinalScore(dimensions.total, fusionScore),
      };
    })
    .filter((entry): entry is { capsule: CapsuleRow; finalScore: number } => entry !== null)
    .sort((left, right) => right.finalScore - left.finalScore);

  const survivors = scored.filter((entry) => entry.finalScore >= minScore).slice(0, maxResults);
  const gatedOutCount = scored.length - scored.filter((e) => e.finalScore >= minScore).length;

  const seenArtifacts = new Set<string>();
  const profileHints: ProfileHint[] = [];
  for (const entry of survivors) {
    if (seenArtifacts.has(entry.capsule.artifactId)) continue;
    seenArtifacts.add(entry.capsule.artifactId);
    profileHints.push({
      artifactId: entry.capsule.artifactId,
      title: entry.capsule.title,
      slug: entry.capsule.slug,
      labels: entry.capsule.labels.length > 0 ? entry.capsule.labels : ['uncategorized'],
    });
  }

  return {
    capsules: survivors.map((entry) => toMatch(entry.capsule, entry.finalScore)),
    profileHints,
    channelsUsed: Object.entries(channelIds)
      .filter(([, ids]) => ids.length > 0)
      .map(([name]) => name),
    channelSizes: Object.fromEntries(
      Object.entries(channelIds).map(([name, ids]) => [name, ids.length]),
    ),
    candidateCount: normalized.size,
    gatedOutCount,
  };
}

/**
 * Capsule keyword recall channel.
 *
 * Provides lexical recall over capsule text fields with field-weighted scoring.
 * Reuses v1 tokenize/normalizeQuery to keep token rules consistent across versions.
 *
 * Field weights (from v2 multi-recall plan):
 *   labels 3.0 | problem 2.5 | goal 2.0 | situation 1.5 | contextualPrefix 1.5 | content 1.0
 *
 * Supports dual-path recall:
 *   - PG path: uses skill_artifact_capsule_keywords index table (when pool + feature flag)
 *   - Memory path: in-memory tokenization and field-weighted scoring (always available)
 */

import { extractGovernedCapsules } from '@trapmap/server/lib/retrieval/capsules/capsule-recall.js';
import {
  type PgCapsuleKeywordFilters,
  createPgCapsuleKeywordRecall,
} from '@trapmap/server/lib/retrieval/capsules/repositories/pg-capsule-keyword.js';
import { normalizeQuery, tokenize } from '@trapmap/server/lib/retrieval/recall/keyword.js';
import type {
  ArtifactGovernanceFilters,
  CapsuleRecallCandidate,
  CapsuleRecallChannel,
  CapsuleRecallChannelName,
  ParsedIntent,
} from '@trapmap/server/lib/retrieval/types.js';
import type { SkillArtifactRecord } from '@trapmap/server/lib/store.js';
import type { Pool } from 'pg';

const FIELD_WEIGHTS: Record<string, number> = {
  labels: 3.0,
  problem: 2.5,
  goal: 2.0,
  situation: 1.5,
  contextualPrefix: 1.5,
  content: 1.0,
};

const MAX_WEIGHT_SUM = Object.values(FIELD_WEIGHTS).reduce((a, b) => a + b, 0);

function tokenizeField(text: string): Set<string> {
  return new Set(tokenize(text));
}

function fieldTokenizeCapsule(capsule: {
  content: string;
  situation: string;
  problem: string;
  goal: string;
  contextualPrefix?: string;
  labels: string[];
}) {
  return {
    labels: new Set(capsule.labels.flatMap((l) => tokenize(l))),
    problem: tokenizeField(capsule.problem),
    goal: tokenizeField(capsule.goal),
    situation: tokenizeField(capsule.situation),
    contextualPrefix: capsule.contextualPrefix
      ? tokenizeField(capsule.contextualPrefix)
      : new Set<string>(),
    content: tokenizeField(capsule.content),
  };
}

/**
 * Score a capsule against query tokens with field-weighted scoring.
 */
function scoreCapsuleKeywords(
  queryTokens: string[],
  fieldTokens: ReturnType<typeof fieldTokenizeCapsule>,
): { score: number; matchedTokens: string[] } {
  if (queryTokens.length === 0) return { score: 0, matchedTokens: [] };

  const matchedTokens: string[] = [];
  let totalWeightedScore = 0;

  for (const token of queryTokens) {
    let tokenScore = 0;

    for (const [field, weight] of Object.entries(FIELD_WEIGHTS)) {
      const tokens = fieldTokens[field as keyof typeof fieldTokens];
      if (tokens instanceof Set && tokens.has(token)) {
        tokenScore += weight;
      }
    }

    if (tokenScore > 0) {
      matchedTokens.push(token);
      totalWeightedScore += tokenScore;
    }
  }

  const maxPossible = queryTokens.length * MAX_WEIGHT_SUM;
  const score = maxPossible > 0 ? Math.min(1, totalWeightedScore / maxPossible) : 0;

  return { score, matchedTokens };
}

/**
 * Perform memory-based keyword recall over governed capsule candidates.
 *
 * @param artifacts - Skill artifact records (must be pre-filtered by governance)
 * @param intent - Parsed intent from seed
 * @param filters - Governance filters
 * @param maxResults - Maximum candidates to return
 */
export async function capsuleKeywordRecall(
  artifacts: SkillArtifactRecord[],
  intent: ParsedIntent,
  filters: ArtifactGovernanceFilters,
  maxResults: number,
): Promise<CapsuleRecallCandidate[]> {
  const governed = extractGovernedCapsules(artifacts, filters);

  if (governed.length === 0) return [];

  const queryTokens = normalizeQuery(intent.seed);

  if (queryTokens.length === 0) return [];

  const candidates: CapsuleRecallCandidate[] = [];

  for (const { capsule } of governed) {
    const fieldTokens = fieldTokenizeCapsule(capsule);
    const { score, matchedTokens } = scoreCapsuleKeywords(queryTokens, fieldTokens);

    if (matchedTokens.length > 0) {
      candidates.push({
        capsuleId: capsule.capsuleId,
        artifactId: capsule.artifactId,
        revision: capsule.revision,
        channel: 'capsule-keyword' as CapsuleRecallChannelName,
        score,
        matchedTokens,
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  return candidates.slice(0, maxResults);
}

function governanceToPgKeywordFilters(filters: ArtifactGovernanceFilters): PgCapsuleKeywordFilters {
  return {
    teamId: filters.teamId,
    securityLevel: filters.securityLevel,
    isSystemAdmin: filters.isSystemAdmin,
    scopes: filters.scopes,
    labels: filters.labels,
  };
}

export interface CapsuleKeywordChannelOptions {
  pgPool?: Pool;
  pgFeatureFlag?: () => boolean;
}

/**
 * Create a capsule keyword recall channel.
 *
 * When pgPool is provided and pgFeatureFlag returns true (or is absent),
 * uses PostgreSQL lexical search via skill_artifact_capsule_keywords index.
 * Falls back to in-memory tokenization when PG is unavailable
 * or returns no results.
 */
export function createCapsuleKeywordChannel(
  options?: CapsuleKeywordChannelOptions,
): CapsuleRecallChannel {
  const pgRecall = options?.pgPool
    ? createPgCapsuleKeywordRecall({
        pool: options.pgPool,
        featureFlag: options.pgFeatureFlag ?? undefined,
      } as Parameters<typeof createPgCapsuleKeywordRecall>[0])
    : null;

  return {
    name: 'capsule-keyword' as CapsuleRecallChannelName,

    async recall(
      artifacts: SkillArtifactRecord[],
      intent: ParsedIntent,
      filters: ArtifactGovernanceFilters,
      maxResults: number,
    ): Promise<CapsuleRecallCandidate[]> {
      if (pgRecall) {
        const pgFilters = governanceToPgKeywordFilters(filters);
        const pgResults = await pgRecall(intent.seed, pgFilters, maxResults);
        if (pgResults.length > 0) return pgResults;
      }
      return capsuleKeywordRecall(artifacts, intent, filters, maxResults);
    },
  };
}

/** @deprecated Use createCapsuleKeywordChannel() instead. */
export const capsuleKeywordChannel: CapsuleRecallChannel = createCapsuleKeywordChannel();

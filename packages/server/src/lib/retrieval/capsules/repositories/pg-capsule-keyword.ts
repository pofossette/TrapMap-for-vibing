/**
 * PostgreSQL capsule keyword recall for lexical search.
 *
 * Provides token-based matching via text[] overlap on the
 * skill_artifact_capsule_keywords derived index table.
 *
 * Field weights match the in-memory capsule keyword recall:
 *   labels 3.0 | problem 2.5 | goal 2.0 | situation 1.5 | contextualPrefix 1.5 | content 1.0
 */

import { and, eq, inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';

import { skillArtifactCapsuleKeywords } from '@trapmap/server/lib/persistence/schema.js';
import { normalizeQuery } from '@trapmap/server/lib/retrieval/recall/keyword.js';
import type {
  CapsuleRecallCandidate,
  CapsuleRecallChannelName,
} from '@trapmap/server/lib/retrieval/types.js';

export interface PgCapsuleKeywordConfig {
  pool: Pool;
  featureFlag?: () => boolean;
}

export interface PgCapsuleKeywordFilters {
  teamId: string | null;
  securityLevel: number;
  isSystemAdmin: boolean;
  scopes: string[];
  labels: string[];
}

const FIELD_WEIGHTS: Record<string, number> = {
  labels: 3.0,
  problem: 2.5,
  goal: 2.0,
  situation: 1.5,
  contextualPrefix: 1.5,
  content: 1.0,
};

const MAX_WEIGHT_SUM = Object.values(FIELD_WEIGHTS).reduce((a, b) => a + b, 0);

/**
 * Create a PostgreSQL capsule keyword recall function.
 */
export function createPgCapsuleKeywordRecall(config: PgCapsuleKeywordConfig) {
  const db = drizzle(config.pool, { schema: { skillArtifactCapsuleKeywords } });

  return async function pgCapsuleKeywordRecall(
    queryText: string,
    filters: PgCapsuleKeywordFilters,
    maxResults: number,
  ): Promise<CapsuleRecallCandidate[]> {
    if (config.featureFlag && !config.featureFlag()) return [];

    const queryTokens = normalizeQuery(queryText);
    if (queryTokens.length === 0) return [];

    const conditions = [eq(skillArtifactCapsuleKeywords.status, 'synced')];

    if (!filters.isSystemAdmin) {
      if (filters.teamId) {
        conditions.push(
          sql`(${skillArtifactCapsuleKeywords.teamId} IS NULL OR ${skillArtifactCapsuleKeywords.teamId} = ${filters.teamId})`,
        );
      } else {
        conditions.push(sql`${skillArtifactCapsuleKeywords.teamId} IS NULL`);
      }
    }

    conditions.push(sql`${skillArtifactCapsuleKeywords.requiredLevel} <= ${filters.securityLevel}`);

    if (filters.scopes.length > 0) {
      conditions.push(
        inArray(skillArtifactCapsuleKeywords.scope, filters.scopes as ('global' | 'project')[]),
      );
    }

    if (filters.labels.length > 0) {
      const labelTokens = filters.labels.flatMap((label) => normalizeQuery(label));
      if (labelTokens.length > 0) {
        const labelArray = labelTokens.map((t) => `'${t}'`).join(',');
        conditions.push(
          sql`${skillArtifactCapsuleKeywords.fieldTokensLabels} @> ${sql.raw(`ARRAY[${labelArray}]::text[]`)}`,
        );
      }
    }

    const tokenArray = queryTokens.map((t) => `'${t}'`).join(',');
    conditions.push(
      sql`${skillArtifactCapsuleKeywords.tokens} && ${sql.raw(`ARRAY[${tokenArray}]::text[]`)}`,
    );

    const rows = await db
      .select({
        capsuleId: skillArtifactCapsuleKeywords.capsuleId,
        artifactId: skillArtifactCapsuleKeywords.artifactId,
        revisionNo: skillArtifactCapsuleKeywords.revisionNo,
        tokens: skillArtifactCapsuleKeywords.tokens,
        fieldTokensContent: skillArtifactCapsuleKeywords.fieldTokensContent,
        fieldTokensSituation: skillArtifactCapsuleKeywords.fieldTokensSituation,
        fieldTokensProblem: skillArtifactCapsuleKeywords.fieldTokensProblem,
        fieldTokensGoal: skillArtifactCapsuleKeywords.fieldTokensGoal,
        fieldTokensLabels: skillArtifactCapsuleKeywords.fieldTokensLabels,
        fieldTokensContextualPrefix: skillArtifactCapsuleKeywords.fieldTokensContextualPrefix,
      })
      .from(skillArtifactCapsuleKeywords)
      .where(and(...conditions))
      .limit(maxResults * 2);

    const candidates: CapsuleRecallCandidate[] = rows.map((r) => {
      const fieldTokens = {
        content: r.fieldTokensContent,
        situation: r.fieldTokensSituation,
        problem: r.fieldTokensProblem,
        goal: r.fieldTokensGoal,
        labels: r.fieldTokensLabels,
        contextualPrefix: r.fieldTokensContextualPrefix,
      };

      const matchedTokens: string[] = [];
      let totalWeightedScore = 0;

      for (const token of queryTokens) {
        let tokenScore = 0;

        for (const [field, weight] of Object.entries(FIELD_WEIGHTS)) {
          const tokens = fieldTokens[field as keyof typeof fieldTokens];
          if (tokens && Array.isArray(tokens) && tokens.includes(token)) {
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

      const result: CapsuleRecallCandidate = {
        capsuleId: r.capsuleId,
        artifactId: r.artifactId,
        revision: r.revisionNo,
        channel: 'capsule-keyword' as CapsuleRecallChannelName,
        score,
      };
      if (matchedTokens.length > 0) {
        result.matchedTokens = matchedTokens;
      }
      return result;
    });

    return candidates
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);
  };
}

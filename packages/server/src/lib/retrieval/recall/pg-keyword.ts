/**
 * PostgreSQL keyword recall for lexical search.
 *
 * This module provides:
 * - Token-based matching using JSONB array containment
 * - Field-weighted scoring (label > shortcut > detail)
 * - Team, scope, and security level filtering
 * - Feature flag support for gradual rollout
 */

import { and, eq, inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';

import { knowledgeKeywords } from '../../persistence/schema.js';
import type { TokenMatchDetail } from '../types.js';
import { normalizeQuery } from './keyword.js';

interface PgKeywordRecallConfig {
  /** PostgreSQL connection pool */
  pool: Pool;
  /** Optional feature flag check - return empty if disabled */
  featureFlag?: () => boolean;
}

/**
 * Filters for keyword recall query.
 */
export interface KeywordRecallFilters {
  /** Team ID for access control (null for global-only access) */
  teamId: string | null;
  /** Maximum required level the user can access */
  securityLevel: number;
  /** Whether user is system admin (bypasses team filter) */
  isSystemAdmin: boolean;
  /** Scopes to include in search */
  scopes: string[];
}

export interface KeywordRecallResult {
  entryId: string;
  score: number;
  tokenMatches: TokenMatchDetail[];
}

// Scoring weights (must match in-memory keyword.ts)
const LABEL_WEIGHT = 3.0;
const SHORTCUT_WEIGHT = 2.0;
const DETAIL_WEIGHT = 1.0;

/**
 * Create a PostgreSQL keyword recall function.
 *
 * Returns a function that performs lexical search using JSONB array operators.
 */
export function createPgKeywordRecall(config: PgKeywordRecallConfig) {
  const db = drizzle(config.pool, { schema: { knowledgeKeywords } });

  return async function pgKeywordRecall(
    queryText: string,
    filters: KeywordRecallFilters,
    maxResults: number,
  ): Promise<KeywordRecallResult[]> {
    // Feature flag check - return empty if disabled
    if (config.featureFlag && !config.featureFlag()) {
      return [];
    }

    const queryTokens = normalizeQuery(queryText);

    if (queryTokens.length === 0) {
      return [];
    }

    // Build filter conditions
    const conditions = [eq(knowledgeKeywords.status, 'synced')];

    // Team filter
    if (!filters.isSystemAdmin) {
      if (filters.teamId) {
        conditions.push(
          sql`(${knowledgeKeywords.teamId} IS NULL OR ${knowledgeKeywords.teamId} = ${filters.teamId})`,
        );
      } else {
        conditions.push(sql`${knowledgeKeywords.teamId} IS NULL`);
      }
    }

    // Security level filter
    conditions.push(sql`${knowledgeKeywords.requiredLevel} <= ${filters.securityLevel}`);

    // Scope filter
    if (filters.scopes.length > 0) {
      conditions.push(inArray(knowledgeKeywords.scope, filters.scopes));
    }

    // Check if ANY query token is in the tokens array
    // Using JSONB containment: tokens::jsonb ?| array[...]
    const tokenArray = queryTokens.map((t) => `'${t}'`).join(',');
    conditions.push(sql`${knowledgeKeywords.tokens}::jsonb ?| ${sql.raw(`ARRAY[${tokenArray}]`)}`);

    const results = await db
      .select({
        entryId: knowledgeKeywords.entryId,
        tokens: knowledgeKeywords.tokens,
        fieldTokens: knowledgeKeywords.fieldTokens,
      })
      .from(knowledgeKeywords)
      .where(and(...conditions))
      .limit(maxResults * 2); // Fetch more to allow for re-ranking

    // Score results based on token overlap
    const scored: KeywordRecallResult[] = results.map((r) => {
      const fieldTokens = r.fieldTokens as {
        shortcut: string[];
        detail: string[];
        labels: string[];
      };

      const tokenMatches: TokenMatchDetail[] = [];
      let totalScore = 0;

      for (const token of queryTokens) {
        const fields: TokenMatchDetail['fields'] = [];
        let tokenScore = 0;

        if (fieldTokens.labels.includes(token)) {
          tokenScore += LABEL_WEIGHT;
          fields.push('labels');
        }
        if (fieldTokens.shortcut.includes(token)) {
          tokenScore += SHORTCUT_WEIGHT;
          fields.push('shortcut');
        }
        if (fieldTokens.detail.includes(token)) {
          tokenScore += DETAIL_WEIGHT;
          fields.push('detail');
        }

        if (fields.length > 0) {
          tokenMatches.push({ token, fields });
          totalScore += tokenScore;
        }
      }

      // Normalize score
      const maxPossible = queryTokens.length * (LABEL_WEIGHT + SHORTCUT_WEIGHT + DETAIL_WEIGHT);
      const score = maxPossible > 0 ? Math.min(1, totalScore / maxPossible) : 0;

      return {
        entryId: r.entryId,
        score,
        tokenMatches,
      };
    });

    // Sort by score and return top results
    return scored
      .filter((r) => r.tokenMatches.length > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);
  };
}

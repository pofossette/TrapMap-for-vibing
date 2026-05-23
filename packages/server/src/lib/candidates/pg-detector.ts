/**
 * PostgreSQL-based duplicate detector for candidate submissions.
 *
 * This module provides:
 * - Vector-based similarity search using pgvector for semantic similarity
 * - Keyword-based matching using JSONB array containment
 * - Hybrid scoring combining both channels
 * - LLM refinement for top-K matches (Phase 2)
 * - Backward-compatible DuplicateCase output
 *
 * Phase: Replace Jaccard overlap with pgvector recall + LLM refinement
 */

import { and, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';

import type { DuplicateCase, DuplicateMatch } from '@trapmap/contracts';
import type { ChatProvider } from '@trapmap/server/lib/ai/types.js';
import { generateEmbedding } from '@trapmap/server/lib/embeddings.js';
import { createDuplicateCaseId } from '@trapmap/server/lib/ids.js';
import {
  knowledgeEmbeddings,
  knowledgeEntries,
  knowledgeKeywords,
} from '@trapmap/server/lib/persistence/schema.js';
import type { KnowledgeRecord, SkillArtifactRecord } from '@trapmap/server/lib/store.js';
import { nowIso } from '@trapmap/server/lib/store.js';
import { judgeDuplicateWithLLM } from './llm-dedup.js';

// Thresholds (match detector.ts for compatibility)
const HIGH_OVERLAP_THRESHOLD = 0.72;
const MEDIUM_OVERLAP_THRESHOLD = 0.38;
const DETECTION_VERSION = '3.0.0'; // Bumped for LLM-enhanced detection

/** Maximum number of top-K matches sent to LLM for refinement */
const LLM_TOP_K = 5;

/** Minimum LLM confidence to confirm a duplicate */
const LLM_DUPLICATE_CONFIDENCE = 0.8;

export interface PgDuplicateDetectorConfig {
  /** PostgreSQL connection pool */
  pool: Pool;
  /** Optional feature flag - falls back to in-memory if false */
  featureFlag?: () => boolean;
  /** Optional ChatProvider for LLM-enhanced duplicate detection */
  chat?: ChatProvider;
}

/**
 * Create a PostgreSQL-based duplicate detector.
 *
 * Uses pgvector for semantic similarity and JSONB for keyword matching.
 * Combines both channels for hybrid scoring.
 */
export function createPgDuplicateDetector(config: PgDuplicateDetectorConfig) {
  const db = drizzle(config.pool, { schema: { knowledgeEmbeddings, knowledgeKeywords } });

  return async function detectDuplicatesPg(
    input: {
      candidateId: string;
      candidateText: string; // shortcut + detail for embedding
      candidateTokens: string[];
      candidateKeywords: string[];
      candidateFingerprint: string;
      teamId: string | null;
      maxMatches?: number;
    },
    fallbackData?: {
      trapEntries: KnowledgeRecord[];
      skillArtifacts: SkillArtifactRecord[];
    },
  ): Promise<{
    duplicateCase: DuplicateCase | null;
    analysisSnapshot: {
      normalizedAt: string;
      fingerprint: string;
      keywords: string[];
      tokens: string[];
    };
  }> {
    const maxMatches = input.maxMatches ?? 10;

    // Feature flag check - fall back to in-memory if disabled
    if (config.featureFlag && !config.featureFlag()) {
      // Import and use the in-memory detector
      const { detectDuplicates } = await import('./detector.js');
      return detectDuplicates(
        {
          candidateId: input.candidateId,
          candidateFingerprint: input.candidateFingerprint,
          candidateKeywords: input.candidateKeywords,
          candidateTokens: input.candidateTokens,
          trapEntries: fallbackData?.trapEntries ?? [],
          skillArtifacts: fallbackData?.skillArtifacts ?? [],
          threshold: MEDIUM_OVERLAP_THRESHOLD,
        },
        config.chat,
      );
    }

    const normalizedAt = nowIso();
    const matches: DuplicateMatch[] = [];

    // Channel 1: Vector similarity search
    const candidateVector = await generateEmbedding(input.candidateText);
    const vectorLiteral = `[${candidateVector.join(',')}]`;

    // Build team filter for vector search
    const teamFilter =
      input.teamId !== null
        ? sql`(${knowledgeEmbeddings.teamId} IS NULL OR ${knowledgeEmbeddings.teamId} = ${input.teamId})`
        : sql`${knowledgeEmbeddings.teamId} IS NULL`;

    const vectorResults = await db
      .select({
        entryId: knowledgeEmbeddings.entryId,
        entryTitle: knowledgeEntries.shortcut,
        scope: knowledgeEmbeddings.scope,
        labels: knowledgeEmbeddings.labels,
        distance: sql<number>`(${knowledgeEmbeddings.vector} <=> ${sql.raw(`'${vectorLiteral}'::vector`)})`,
      })
      .from(knowledgeEmbeddings)
      .innerJoin(knowledgeEntries, eq(knowledgeEmbeddings.entryId, knowledgeEntries.id))
      .where(and(eq(knowledgeEmbeddings.status, 'synced'), teamFilter))
      .orderBy(sql`${knowledgeEmbeddings.vector} <=> ${sql.raw(`'${vectorLiteral}'::vector`)}`)
      .limit(maxMatches * 2);

    // Channel 2: Keyword matching
    const tokenArray = input.candidateTokens.map((t) => `'${t}'`).join(',');
    const keywordResults = await db
      .select({
        entryId: knowledgeKeywords.entryId,
        entryTitle: knowledgeEntries.shortcut,
        tokens: knowledgeKeywords.tokens,
        fieldTokensShortcut: knowledgeKeywords.fieldTokensShortcut,
        fieldTokensDetail: knowledgeKeywords.fieldTokensDetail,
        fieldTokensLabels: knowledgeKeywords.fieldTokensLabels,
      })
      .from(knowledgeKeywords)
      .innerJoin(knowledgeEntries, eq(knowledgeKeywords.entryId, knowledgeEntries.id))
      .where(
        and(
          eq(knowledgeKeywords.status, 'synced'),
          teamFilter,
          sql`${knowledgeKeywords.tokens} && ${sql.raw(`ARRAY[${tokenArray}]::text[]`)}`,
        ),
      )
      .limit(maxMatches * 2);

    // Merge and score results
    const entryScores = new Map<
      string,
      { vectorScore: number; keywordScore: number; sharedTokens: string[]; title: string }
    >();

    // Process vector results
    for (const r of vectorResults) {
      const vectorScore = 1 - (r.distance ?? 0);
      const existing = entryScores.get(r.entryId) ?? {
        vectorScore: 0,
        keywordScore: 0,
        sharedTokens: [],
        title: r.entryTitle,
      };
      existing.vectorScore = vectorScore;
      existing.title = r.entryTitle;
      entryScores.set(r.entryId, existing);
    }

    // Process keyword results
    for (const r of keywordResults) {
      const fieldTokens = {
        shortcut: r.fieldTokensShortcut,
        detail: r.fieldTokensDetail,
        labels: r.fieldTokensLabels,
      };
      const sharedTokens: string[] = [];

      let keywordScore = 0;
      const maxTokenScore = input.candidateTokens.length * 6; // 3+2+1 weights

      for (const token of input.candidateTokens) {
        if (fieldTokens.labels.includes(token)) {
          keywordScore += 3;
          sharedTokens.push(token);
        }
        if (fieldTokens.shortcut.includes(token)) {
          keywordScore += 2;
          sharedTokens.push(token);
        }
        if (fieldTokens.detail.includes(token)) {
          keywordScore += 1;
          sharedTokens.push(token);
        }
      }

      keywordScore = maxTokenScore > 0 ? keywordScore / maxTokenScore : 0;

      const existing = entryScores.get(r.entryId) ?? {
        vectorScore: 0,
        keywordScore: 0,
        sharedTokens: [],
        title: r.entryTitle,
      };
      existing.keywordScore = keywordScore;
      existing.sharedTokens = sharedTokens;
      existing.title = r.entryTitle;
      entryScores.set(r.entryId, existing);
    }

    // Combine scores and build matches
    for (const [entryId, scores] of entryScores) {
      // Hybrid score: weighted average (0.6 vector + 0.4 keyword)
      const hybridScore = scores.vectorScore * 0.6 + scores.keywordScore * 0.4;

      if (hybridScore < MEDIUM_OVERLAP_THRESHOLD) {
        continue;
      }

      const matchType = hybridScore >= HIGH_OVERLAP_THRESHOLD ? 'high-overlap' : 'semantic-similar';

      matches.push({
        entityType: 'trap',
        entityId: entryId,
        entityTitle: scores.title ?? entryId,
        similarityScore: Math.round(hybridScore * 1000) / 1000,
        matchType,
        overlapDetails: {
          sharedKeywords: input.candidateKeywords.slice(0, 10),
          sharedTokens: scores.sharedTokens.slice(0, 50),
          textOverlapPercent: Math.round(scores.keywordScore * 100),
        },
      });
    }

    // Sort by similarity and limit
    matches.sort((a, b) => b.similarityScore - a.similarityScore);

    // Stage 2: LLM refinement (if configured)
    let finalMatches: DuplicateMatch[];
    const useLLM = config.chat?.isConfigured ?? false;

    if (useLLM && matches.length > 0) {
      const topK = matches.slice(0, LLM_TOP_K);
      const refinedMatches: DuplicateMatch[] = [];

      for (const match of topK) {
        // Use the entry ID to look up the candidate text for comparison
        // The entryId from vector/keyword search maps to a knowledge entry
        const existingTitle = match.entityTitle;
        const existingBody = ''; // pg-detector doesn't have full body; use title-based comparison

        const candidateTitle = input.candidateKeywords.slice(0, 5).join(', ');
        const candidateBody = input.candidateTokens.slice(0, 100).join(' ');

        const judgment = await judgeDuplicateWithLLM(
          config.chat!,
          { title: candidateTitle, body: candidateBody },
          { title: existingTitle, body: existingBody },
        );

        if (judgment?.isDuplicate && judgment.confidence >= LLM_DUPLICATE_CONFIDENCE) {
          refinedMatches.push({
            ...match,
            matchType:
              judgment.overlapType === 'exact'
                ? 'exact'
                : judgment.overlapType === 'semantic'
                  ? 'high-overlap'
                  : match.matchType,
            similarityScore: Math.max(match.similarityScore, judgment.confidence),
          });
        }
      }

      finalMatches = refinedMatches;
    } else {
      finalMatches = matches;
    }

    const topMatches = finalMatches.slice(0, maxMatches);

    // Build duplicate case
    const hasMatches = topMatches.length > 0;
    const highestSimilarity = hasMatches && topMatches[0] ? topMatches[0].similarityScore : 0;
    const hasExactDuplicate = topMatches.some((m) => m.matchType === 'exact');

    let duplicateType: 'exact' | 'semantic' | 'none' = 'none';
    if (hasExactDuplicate) {
      duplicateType = 'exact';
    } else if (highestSimilarity >= HIGH_OVERLAP_THRESHOLD) {
      duplicateType = 'semantic';
    }

    const duplicateCase: DuplicateCase | null = hasMatches
      ? {
          id: createDuplicateCaseId(),
          candidateId: input.candidateId,
          detectedAt: normalizedAt,
          detectionVersion: DETECTION_VERSION,
          matches: topMatches,
          highestSimilarity,
          hasExactDuplicate,
          duplicateType,
        }
      : null;

    return {
      duplicateCase,
      analysisSnapshot: {
        normalizedAt,
        fingerprint: input.candidateFingerprint,
        keywords: input.candidateKeywords,
        tokens: input.candidateTokens,
      },
    };
  };
}

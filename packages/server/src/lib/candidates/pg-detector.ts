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
 *
 * Heavy lifting is split into:
 * - pg-detector-queries.ts  — SQL query builders
 * - pg-detector-scorer.ts   — scoring, aggregation, LLM refinement
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';

import type { DuplicateCase } from '@trapmap/contracts';
import type { ChatProvider } from '@trapmap/server/lib/ai/types.js';
import { generateEmbedding } from '@trapmap/server/lib/embeddings.js';
import { createDuplicateCaseId } from '@trapmap/server/lib/ids.js';
import {
  knowledgeEmbeddings,
  knowledgeEntries,
  knowledgeKeywords,
  skillArtifactCapsuleEmbeddings,
  skillArtifactCapsuleKeywords,
  skillArtifactProfiles,
  skillArtifacts,
} from '@trapmap/server/lib/persistence/schema.js';
import type { KnowledgeRecord, SkillArtifactRecord } from '@trapmap/server/lib/store.js';
import { nowIso } from '@trapmap/server/lib/store.js';

import {
  appendPgSkillExactMatches,
  buildFinalDuplicateCase,
  buildRecalledMatches,
  collectFallbackExactMatches,
  mergeScores,
  refineWithLLM,
} from './pg-detector-scorer.js';
import {
  buildSkillEmbeddingTeamFilter,
  buildSkillKeywordTeamFilter,
  buildTrapKeywordTeamFilter,
  buildTrapVectorTeamFilter,
  querySkillExactMatches,
  querySkillKeywordMatches,
  querySkillVectorMatches,
  queryTrapKeywordMatches,
  queryTrapVectorMatches,
} from './pg-detector-queries.js';
import type { DuplicateDetectionResult } from './types.js';

// Thresholds (match detector.ts for compatibility)
const MEDIUM_OVERLAP_THRESHOLD = 0.38;
const DETECTION_VERSION = '3.0.0'; // Bumped for LLM-enhanced detection

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
  const db = drizzle(config.pool, {
    schema: {
      knowledgeEmbeddings,
      knowledgeEntries,
      knowledgeKeywords,
      skillArtifactCapsuleEmbeddings,
      skillArtifactCapsuleKeywords,
      skillArtifactProfiles,
      skillArtifacts,
    },
  });

  return async function detectDuplicatesPg(
    input: {
      candidateId: string;
      candidateText: string;
      candidateTokens: string[];
      candidateKeywords: string[];
      candidateFingerprint: string;
      candidateExactLookupKey?: string;
      teamId: string | null;
      maxMatches?: number;
      candidateTitle?: string;
      candidateBody?: string;
    },
    fallbackData?: {
      trapEntries: KnowledgeRecord[];
      skillArtifacts: SkillArtifactRecord[];
    },
  ): Promise<DuplicateDetectionResult> {
    const maxMatches = input.maxMatches ?? 10;
    const candidateExactLookupKey = input.candidateExactLookupKey ?? input.candidateFingerprint;

    // Feature flag check - fall back to in-memory if disabled
    if (config.featureFlag && !config.featureFlag()) {
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
    const entityContent = new Map<string, { title: string; body: string }>();
    const exactMatches = [];
    const exactMatchKeys = new Set<string>();

    // --- Stage 1: collect exact matches from fallback data ---
    if (fallbackData) {
      const fallback = collectFallbackExactMatches(
        {
          candidateId: input.candidateId,
          candidateKeywords: input.candidateKeywords,
          candidateTokens: input.candidateTokens,
          candidateExactLookupKey,
        },
        fallbackData,
      );
      exactMatches.push(...fallback.exactMatches);
      for (const key of fallback.exactMatchKeys) exactMatchKeys.add(key);
      for (const [k, v] of fallback.entityContent) entityContent.set(k, v);
    }

    // --- Stage 1b: exact matches from PostgreSQL skill profiles ---
    const skillExactResults = await querySkillExactMatches(
      db,
      input.teamId,
      candidateExactLookupKey,
    );
    appendPgSkillExactMatches(
      skillExactResults,
      input.candidateKeywords,
      input.candidateTokens,
      exactMatchKeys,
      exactMatches,
      entityContent,
    );

    // Short-circuit on exact matches
    if (exactMatches.length > 0) {
      exactMatches.sort((a, b) => b.similarityScore - a.similarityScore);
      return {
        duplicateCase: {
          id: createDuplicateCaseId(),
          candidateId: input.candidateId,
          detectedAt: normalizedAt,
          detectionVersion: DETECTION_VERSION,
          matches: exactMatches,
          highestSimilarity: 1,
          hasExactDuplicate: true,
          duplicateType: 'exact',
        },
        analysisSnapshot: {
          normalizedAt,
          fingerprint: input.candidateFingerprint,
          keywords: input.candidateKeywords,
          tokens: input.candidateTokens,
          duplicateTrace: {
            detector: 'postgresql',
            matchedLane: 'exact',
          },
        },
      };
    }

    // --- Stage 2: vector similarity + keyword recall ---
    const candidateVector = await generateEmbedding(input.candidateText);
    const vectorLiteral = `[${candidateVector.join(',')}]`;
    const recallLimit = maxMatches * 2;

    const [trapVectorResults, skillVectorResults, trapKeywordResults, skillKeywordResults] =
      await Promise.all([
        queryTrapVectorMatches(
          db,
          vectorLiteral,
          buildTrapVectorTeamFilter(input.teamId),
          recallLimit,
        ),
        querySkillVectorMatches(
          db,
          vectorLiteral,
          buildSkillEmbeddingTeamFilter(input.teamId),
          recallLimit,
        ),
        queryTrapKeywordMatches(
          db,
          input.candidateTokens ?? [],
          buildTrapKeywordTeamFilter(input.teamId),
          recallLimit,
        ),
        querySkillKeywordMatches(
          db,
          input.candidateTokens ?? [],
          buildSkillKeywordTeamFilter(input.teamId),
          recallLimit,
        ),
      ]);

    // --- Stage 3: merge scores ---
    const entryScores = mergeScores({
      trapVectorResults,
      skillVectorResults,
      trapKeywordResults,
      skillKeywordResults,
      candidateTokens: input.candidateTokens ?? [],
    });

    const { recalledMatches } = buildRecalledMatches({
      entryScores,
      exactMatchKeys,
      candidateKeywords: input.candidateKeywords,
      entityContent,
    });

    recalledMatches.sort((a, b) => b.similarityScore - a.similarityScore);

    // --- Stage 4: optional LLM refinement ---
    const useLLM = config.chat?.isConfigured ?? false;
    const finalRecalledMatches =
      useLLM && recalledMatches.length > 0
        ? await refineWithLLM({
            recalledMatches,
            chat: config.chat!,
            entityContent,
            candidateTitle: input.candidateTitle,
            candidateBody: input.candidateBody,
            candidateKeywords: input.candidateKeywords,
            candidateTokens: input.candidateTokens,
          })
        : recalledMatches;

    // --- Stage 5: assemble final result ---
    const { topMatches, highestSimilarity, hasExactDuplicate, duplicateType } =
      buildFinalDuplicateCase({
        exactMatches,
        recalledMatches: finalRecalledMatches,
        maxMatches,
      });

    const hasMatches = topMatches.length > 0;

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

    const matchedLane = hasExactDuplicate
      ? 'exact'
      : topMatches.length > 0
        ? 'indexed-recall'
        : 'none';

    return {
      duplicateCase,
      analysisSnapshot: {
        normalizedAt,
        fingerprint: input.candidateFingerprint,
        keywords: input.candidateKeywords,
        tokens: input.candidateTokens,
        duplicateTrace: {
          detector: 'postgresql',
          matchedLane,
        },
      },
    };
  };
}

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

import { and, eq, or, sql } from 'drizzle-orm';
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
  skillArtifactCapsuleEmbeddings,
  skillArtifactCapsuleKeywords,
  skillArtifactProfiles,
  skillArtifacts,
} from '@trapmap/server/lib/persistence/schema.js';
import type { KnowledgeRecord, SkillArtifactRecord } from '@trapmap/server/lib/store.js';
import { nowIso } from '@trapmap/server/lib/store.js';
import { computeTrapFingerprint } from './fingerprint.js';
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
      candidateText: string; // shortcut + detail for embedding
      candidateTokens: string[];
      candidateKeywords: string[];
      candidateFingerprint: string;
      candidateExactLookupKey?: string;
      teamId: string | null;
      maxMatches?: number;
      /** Optional normalized title (Phase 2) for LLM refinement. */
      candidateTitle?: string;
      /** Optional normalized body (Phase 2) for LLM refinement. */
      candidateBody?: string;
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
      duplicateTrace?: {
        detector: 'in-memory' | 'postgresql';
        matchedLane: 'exact' | 'indexed-recall' | 'fallback' | 'none';
      };
    };
  }> {
    const maxMatches = input.maxMatches ?? 10;
    const candidateExactLookupKey = input.candidateExactLookupKey ?? input.candidateFingerprint;

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
    const exactMatches: DuplicateMatch[] = [];
    const recalledMatches: DuplicateMatch[] = [];
    const entityContent = new Map<string, { title: string; body: string }>();
    const exactMatchKeys = new Set<string>();

    if (fallbackData) {
      for (const entry of fallbackData.trapEntries) {
        if (entry.lifecycleState !== 'approved') continue;
        const trapFingerprint = computeTrapFingerprint({
          shortcut: entry.shortcut,
          detail: entry.detail,
          labels: entry.labels,
        });
        if (trapFingerprint !== candidateExactLookupKey) continue;
        const key = `trap:${entry.id}`;
        if (exactMatchKeys.has(key)) continue;
        exactMatchKeys.add(key);
        entityContent.set(key, { title: entry.shortcut, body: entry.detail });
        exactMatches.push({
          entityType: 'trap',
          entityId: entry.id,
          entityTitle: entry.shortcut.slice(0, 280),
          similarityScore: 1,
          matchType: 'exact',
          overlapDetails: {
            sharedKeywords: input.candidateKeywords.filter((k) =>
              entry.labels.some((l) => l.toLowerCase() === k.toLowerCase()),
            ),
            sharedTokens: input.candidateTokens.slice(0, 50),
            textOverlapPercent: 100,
          },
        });
      }

      for (const artifact of fallbackData.skillArtifacts) {
        if (artifact.lifecycleState !== 'approved') continue;
        const profile = artifact.latestRevision.derived?.profile;
        if (!profile) continue;
        if (
          profile.contentHash !== candidateExactLookupKey &&
          profile.sourceHash !== candidateExactLookupKey
        ) {
          continue;
        }
        const key = `skill:${artifact.id}`;
        if (exactMatchKeys.has(key)) continue;
        exactMatchKeys.add(key);
        entityContent.set(key, { title: profile.title, body: profile.summary });
        exactMatches.push({
          entityType: 'skill',
          entityId: artifact.id,
          entityTitle: profile.title.slice(0, 280),
          similarityScore: 1,
          matchType: 'exact',
          overlapDetails: {
            sharedKeywords: input.candidateKeywords.filter((k) =>
              profile.keywords.some((keyword) => keyword.toLowerCase() === k.toLowerCase()),
            ),
            sharedTokens: input.candidateTokens.slice(0, 50),
            textOverlapPercent: 100,
          },
        });
      }
    }

    const skillExactResults = await db
      .select({
        artifactId: skillArtifactProfiles.artifactId,
        title: skillArtifactProfiles.title,
        summary: skillArtifactProfiles.summary,
      })
      .from(skillArtifactProfiles)
      .innerJoin(skillArtifacts, eq(skillArtifactProfiles.artifactId, skillArtifacts.id))
      .where(
        and(
          eq(skillArtifacts.lifecycleState, 'approved'),
          input.teamId !== null
            ? or(eq(skillArtifacts.teamId, input.teamId), sql`${skillArtifacts.teamId} IS NULL`)
            : sql`${skillArtifacts.teamId} IS NULL`,
          or(
            eq(skillArtifactProfiles.contentHash, candidateExactLookupKey),
            eq(skillArtifactProfiles.sourceHash, candidateExactLookupKey),
          ),
        ),
      );

    for (const row of skillExactResults) {
      const exactEntityId = String(
        (row as { artifactId?: string }).artifactId ??
          (row as { artifact_id?: string }).artifact_id ??
          '',
      );
      if (exactEntityId.length === 0) {
        continue;
      }
      const exactEntityTitle = String(
        (row as { title?: string }).title ?? exactEntityId,
      ).slice(0, 280);
      const exactSummary = String((row as { summary?: string }).summary ?? '');
      const key = `skill:${exactEntityId}`;
      if (exactMatchKeys.has(key)) continue;
      exactMatchKeys.add(key);
      entityContent.set(key, { title: exactEntityTitle, body: exactSummary });
      exactMatches.push({
        entityType: 'skill',
        entityId: exactEntityId,
        entityTitle: exactEntityTitle,
        similarityScore: 1,
        matchType: 'exact',
        overlapDetails: {
          sharedKeywords: input.candidateKeywords.slice(0, 10),
          sharedTokens: input.candidateTokens.slice(0, 50),
          textOverlapPercent: 100,
        },
      });
    }

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

    // Channel 1: Vector similarity search
    const candidateVector = await generateEmbedding(input.candidateText);
    const vectorLiteral = `[${candidateVector.join(',')}]`;

    // Build team filter for vector/keyword search
    const trapTeamFilter =
      input.teamId !== null
        ? sql`(${knowledgeEmbeddings.teamId} IS NULL OR ${knowledgeEmbeddings.teamId} = ${input.teamId})`
        : sql`${knowledgeEmbeddings.teamId} IS NULL`;
    const trapKeywordTeamFilter =
      input.teamId !== null
        ? sql`(${knowledgeKeywords.teamId} IS NULL OR ${knowledgeKeywords.teamId} = ${input.teamId})`
        : sql`${knowledgeKeywords.teamId} IS NULL`;
    const skillEmbeddingTeamFilter =
      input.teamId !== null
        ? sql`(${skillArtifactCapsuleEmbeddings.teamId} IS NULL OR ${skillArtifactCapsuleEmbeddings.teamId} = ${input.teamId})`
        : sql`${skillArtifactCapsuleEmbeddings.teamId} IS NULL`;
    const skillKeywordTeamFilter =
      input.teamId !== null
        ? sql`(${skillArtifactCapsuleKeywords.teamId} IS NULL OR ${skillArtifactCapsuleKeywords.teamId} = ${input.teamId})`
        : sql`${skillArtifactCapsuleKeywords.teamId} IS NULL`;

    const trapVectorResults = await db
      .select({
        entryId: knowledgeEmbeddings.entryId,
        entryTitle: knowledgeEntries.shortcut,
        entryBody: knowledgeEntries.detail,
        distance: sql<number>`(${knowledgeEmbeddings.vector} <=> ${sql.raw(`'${vectorLiteral}'::vector`)})`,
      })
      .from(knowledgeEmbeddings)
      .innerJoin(knowledgeEntries, eq(knowledgeEmbeddings.entryId, knowledgeEntries.id))
      .where(
        and(
          eq(knowledgeEmbeddings.status, 'synced'),
          eq(knowledgeEntries.lifecycleState, 'approved'),
          trapTeamFilter,
        ),
      )
      .orderBy(sql`${knowledgeEmbeddings.vector} <=> ${sql.raw(`'${vectorLiteral}'::vector`)}`)
      .limit(maxMatches * 2);

    const skillVectorResults = await db
      .select({
        artifactId: skillArtifactCapsuleEmbeddings.artifactId,
        artifactTitle: skillArtifactProfiles.title,
        artifactBody: skillArtifactProfiles.summary,
        distance: sql<number>`(${skillArtifactCapsuleEmbeddings.embedding} <=> ${sql.raw(`'${vectorLiteral}'::vector`)})`,
      })
      .from(skillArtifactCapsuleEmbeddings)
      .innerJoin(skillArtifacts, eq(skillArtifactCapsuleEmbeddings.artifactId, skillArtifacts.id))
      .innerJoin(
        skillArtifactProfiles,
        and(
          eq(skillArtifactCapsuleEmbeddings.artifactId, skillArtifactProfiles.artifactId),
          eq(skillArtifactCapsuleEmbeddings.revisionNo, skillArtifactProfiles.revisionNo),
        ),
      )
      .where(
        and(
          eq(skillArtifactCapsuleEmbeddings.status, 'synced'),
          eq(skillArtifacts.lifecycleState, 'approved'),
          skillEmbeddingTeamFilter,
        ),
      )
      .orderBy(
        sql`${skillArtifactCapsuleEmbeddings.embedding} <=> ${sql.raw(`'${vectorLiteral}'::vector`)}`,
      )
      .limit(maxMatches * 2);

    // Channel 2: Keyword matching
    const candidateTokens = input.candidateTokens ?? [];
    const tokenArray = candidateTokens.map((t) => `'${t}'`).join(',');
    const trapKeywordResults =
      candidateTokens.length === 0
        ? []
        : await db
      .select({
        entryId: knowledgeKeywords.entryId,
        entryTitle: knowledgeEntries.shortcut,
        entryBody: knowledgeEntries.detail,
      })
      .from(knowledgeKeywords)
      .innerJoin(knowledgeEntries, eq(knowledgeKeywords.entryId, knowledgeEntries.id))
      .where(
        and(
          eq(knowledgeKeywords.status, 'synced'),
          eq(knowledgeEntries.lifecycleState, 'approved'),
          trapKeywordTeamFilter,
          sql`${knowledgeKeywords.tokens} && ${sql.raw(`ARRAY[${tokenArray}]::text[]`)}`,
        ),
      )
      .limit(maxMatches * 2);

    const skillKeywordResults =
      candidateTokens.length === 0
        ? []
        : await db
            .select({
              artifactId: skillArtifactCapsuleKeywords.artifactId,
              artifactTitle: skillArtifactProfiles.title,
              artifactBody: skillArtifactProfiles.summary,
            })
            .from(skillArtifactCapsuleKeywords)
            .innerJoin(
              skillArtifacts,
              eq(skillArtifactCapsuleKeywords.artifactId, skillArtifacts.id),
            )
            .innerJoin(
              skillArtifactProfiles,
              and(
                eq(skillArtifactCapsuleKeywords.artifactId, skillArtifactProfiles.artifactId),
                eq(skillArtifactCapsuleKeywords.revisionNo, skillArtifactProfiles.revisionNo),
              ),
            )
            .where(
              and(
                eq(skillArtifactCapsuleKeywords.status, 'synced'),
                eq(skillArtifacts.lifecycleState, 'approved'),
                skillKeywordTeamFilter,
                sql`${skillArtifactCapsuleKeywords.tokens} && ${sql.raw(`ARRAY[${tokenArray}]::text[]`)}`,
              ),
            )
            .limit(maxMatches * 2);

    // Merge and score results
    const entryScores = new Map<
      string,
      {
        entityType: 'trap' | 'skill';
        vectorScore: number;
        keywordScore: number;
        sharedTokens: Set<string>;
        title: string;
        body: string;
      }
    >();

    // Process trap vector results
    for (const r of trapVectorResults) {
      const entryId = String(
        (r as { entryId?: string }).entryId ?? (r as { entry_id?: string }).entry_id ?? '',
      );
      if (entryId.length === 0) {
        continue;
      }
      const entryTitle = String(
        (r as { entryTitle?: string }).entryTitle ??
          (r as { entry_title?: string }).entry_title ??
          entryId,
      );
      const entryBody = String(
        (r as { entryBody?: string }).entryBody ?? (r as { entry_body?: string }).entry_body ?? '',
      );
      const vectorScore = 1 - (r.distance ?? 0);
      const existing = entryScores.get(`trap:${entryId}`) ?? {
        entityType: 'trap' as const,
        vectorScore: 0,
        keywordScore: 0,
        sharedTokens: new Set<string>(),
        title: entryTitle,
        body: entryBody,
      };
      existing.vectorScore = Math.max(existing.vectorScore, vectorScore);
      existing.title = entryTitle;
      existing.body = entryBody;
      entryScores.set(`trap:${entryId}`, existing);
    }

    // Process skill vector results
    for (const r of skillVectorResults) {
      const artifactId = String(
        (r as { artifactId?: string }).artifactId ??
          (r as { artifact_id?: string }).artifact_id ??
          '',
      );
      if (artifactId.length === 0) {
        continue;
      }
      const artifactTitle = String(
        (r as { artifactTitle?: string }).artifactTitle ??
          (r as { artifact_title?: string }).artifact_title ??
          artifactId,
      );
      const artifactBody = String(
        (r as { artifactBody?: string }).artifactBody ??
          (r as { artifact_body?: string }).artifact_body ??
          '',
      );
      const vectorScore = 1 - (r.distance ?? 0);
      const existing = entryScores.get(`skill:${artifactId}`) ?? {
        entityType: 'skill' as const,
        vectorScore: 0,
        keywordScore: 0,
        sharedTokens: new Set<string>(),
        title: artifactTitle,
        body: artifactBody,
      };
      existing.vectorScore = Math.max(existing.vectorScore, vectorScore);
      existing.title = artifactTitle;
      existing.body = artifactBody;
      entryScores.set(`skill:${artifactId}`, existing);
    }

    // Process trap keyword results
    for (const r of trapKeywordResults) {
      const entryId = String(
        (r as { entryId?: string }).entryId ?? (r as { entry_id?: string }).entry_id ?? '',
      );
      if (entryId.length === 0) {
        continue;
      }
      const entryTitle = String(
        (r as { entryTitle?: string }).entryTitle ??
          (r as { entry_title?: string }).entry_title ??
          entryId,
      );
      const entryBody = String(
        (r as { entryBody?: string }).entryBody ?? (r as { entry_body?: string }).entry_body ?? '',
      );
      const sharedTokens = new Set(candidateTokens);
      const keywordScore = candidateTokens.length > 0 ? 0.5 : 0;

      const existing = entryScores.get(`trap:${entryId}`) ?? {
        entityType: 'trap' as const,
        vectorScore: 0,
        keywordScore: 0,
        sharedTokens: new Set<string>(),
        title: entryTitle,
        body: entryBody,
      };
      existing.keywordScore = Math.max(existing.keywordScore, keywordScore);
      for (const token of sharedTokens) {
        existing.sharedTokens.add(token);
      }
      existing.title = entryTitle;
      existing.body = entryBody;
      entryScores.set(`trap:${entryId}`, existing);
    }

    // Process skill keyword results
    for (const r of skillKeywordResults) {
      const artifactId = String(
        (r as { artifactId?: string }).artifactId ??
          (r as { artifact_id?: string }).artifact_id ??
          '',
      );
      if (artifactId.length === 0) {
        continue;
      }
      const artifactTitle = String(
        (r as { artifactTitle?: string }).artifactTitle ??
          (r as { artifact_title?: string }).artifact_title ??
          artifactId,
      );
      const artifactBody = String(
        (r as { artifactBody?: string }).artifactBody ??
          (r as { artifact_body?: string }).artifact_body ??
          '',
      );
      const sharedTokens = new Set(candidateTokens);
      const keywordScore = candidateTokens.length > 0 ? 0.5 : 0;

      const existing = entryScores.get(`skill:${artifactId}`) ?? {
        entityType: 'skill' as const,
        vectorScore: 0,
        keywordScore: 0,
        sharedTokens: new Set<string>(),
        title: artifactTitle,
        body: artifactBody,
      };
      existing.keywordScore = Math.max(existing.keywordScore, keywordScore);
      for (const token of sharedTokens) {
        existing.sharedTokens.add(token);
      }
      existing.title = artifactTitle;
      existing.body = artifactBody;
      entryScores.set(`skill:${artifactId}`, existing);
    }

    // Combine scores and build matches
    for (const [entityKey, scores] of entryScores) {
      if (exactMatchKeys.has(entityKey)) {
        continue;
      }

      // Hybrid score: weighted average (0.6 vector + 0.4 keyword)
      const hybridScore = scores.vectorScore * 0.6 + scores.keywordScore * 0.4;

      if (hybridScore < MEDIUM_OVERLAP_THRESHOLD) {
        continue;
      }

      const matchType = hybridScore >= HIGH_OVERLAP_THRESHOLD ? 'high-overlap' : 'semantic-similar';
      const [entityType, entityId] = entityKey.split(':') as ['trap' | 'skill', string];
      entityContent.set(entityKey, { title: scores.title, body: scores.body });

      recalledMatches.push({
        entityType,
        entityId,
        entityTitle: scores.title ?? entityId,
        similarityScore: Math.round(hybridScore * 1000) / 1000,
        matchType,
        overlapDetails: {
          sharedKeywords: input.candidateKeywords.slice(0, 10),
          sharedTokens: [...scores.sharedTokens].slice(0, 50),
          textOverlapPercent: Math.round(scores.keywordScore * 100),
        },
      });
    }

    // Sort by similarity and limit
    recalledMatches.sort((a, b) => b.similarityScore - a.similarityScore);

    // Stage 2: LLM refinement (if configured)
    let finalMatches: DuplicateMatch[];
    const useLLM = config.chat?.isConfigured ?? false;

    if (useLLM && recalledMatches.length > 0) {
      const topK = recalledMatches.slice(0, LLM_TOP_K);
      const refinedMatches: DuplicateMatch[] = [];

      for (const match of topK) {
        const existing = entityContent.get(`${match.entityType}:${match.entityId}`);
        const existingTitle = existing?.title ?? match.entityTitle;
        const existingBody = existing?.body ?? '';

        const candidateTitle =
          input.candidateTitle ?? input.candidateKeywords.slice(0, 5).join(', ');
        const candidateBody = input.candidateBody ?? input.candidateTokens.slice(0, 100).join(' ');

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

      finalMatches = [...exactMatches, ...refinedMatches];
    } else {
      finalMatches = [...exactMatches, ...recalledMatches];
    }

    finalMatches.sort((a, b) => b.similarityScore - a.similarityScore);

    const exactTopMatches = finalMatches.filter((match) => match.matchType === 'exact');
    const nonExactTopMatches = finalMatches.filter((match) => match.matchType !== 'exact');
    const topMatches =
      exactTopMatches.length > 0
        ? [...exactTopMatches, ...nonExactTopMatches.slice(0, Math.max(maxMatches - exactTopMatches.length, 0))]
        : nonExactTopMatches.slice(0, maxMatches);

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

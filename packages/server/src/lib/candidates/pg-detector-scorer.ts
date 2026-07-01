/**
 * Scoring, result aggregation, and match-building helpers for the
 * PostgreSQL duplicate detector.
 *
 * Extracted from pg-detector.ts to keep the orchestration layer thin.
 *
 * @module candidates/pg-detector-scorer
 */

import type { DuplicateMatch } from '@trapmap/contracts';
import type { ChatProvider } from '@trapmap/server/lib/ai/types.js';
import type { KnowledgeRecord, SkillArtifactRecord } from '@trapmap/server/lib/store.js';

import { computeTrapFingerprint } from './fingerprint.js';
import { judgeDuplicateWithLLM } from './llm-dedup.js';
import type {
  SkillExactRow,
  SkillKeywordRow,
  SkillVectorRow,
  TrapKeywordRow,
  TrapVectorRow,
} from './pg-detector-queries.js';

// ---------------------------------------------------------------------------
// Thresholds (must match pg-detector.ts for compatibility)
// ---------------------------------------------------------------------------

const HIGH_OVERLAP_THRESHOLD = 0.72;
const MEDIUM_OVERLAP_THRESHOLD = 0.38;
const MIN_NON_EXACT_SHARED_TOKENS = 4;

/** Maximum number of top-K matches sent to LLM for refinement */
const LLM_TOP_K = 5;

/** Minimum LLM confidence to confirm a duplicate */
const LLM_DUPLICATE_CONFIDENCE = 0.8;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EntityScore {
  entityType: 'trap' | 'skill';
  vectorScore: number;
  keywordScore: number;
  sharedTokens: Set<string>;
  title: string;
  body: string;
}

export interface EntityContent {
  title: string;
  body: string;
}

// ---------------------------------------------------------------------------
// Exact-match collection from fallback data
// ---------------------------------------------------------------------------

/**
 * Collect exact matches from in-memory fallback data (trap entries and skill
 * artifacts). Returns the list of exact `DuplicateMatch`es and a set of
 * entity keys that were matched.
 */
export function collectFallbackExactMatches(
  input: {
    candidateId: string;
    candidateKeywords: string[];
    candidateTokens: string[];
    candidateExactLookupKey: string;
  },
  fallbackData: {
    trapEntries: KnowledgeRecord[];
    skillArtifacts: SkillArtifactRecord[];
  },
): {
  exactMatches: DuplicateMatch[];
  exactMatchKeys: Set<string>;
  entityContent: Map<string, EntityContent>;
} {
  const exactMatches: DuplicateMatch[] = [];
  const exactMatchKeys = new Set<string>();
  const entityContent = new Map<string, EntityContent>();

  // Trap entries
  for (const entry of fallbackData.trapEntries) {
    if (entry.lifecycleState !== 'approved') continue;
    const trapFingerprint = computeTrapFingerprint({
      shortcut: entry.shortcut,
      detail: entry.detail,
      labels: entry.labels,
    });
    if (trapFingerprint !== input.candidateExactLookupKey) continue;
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

  // Skill artifacts
  for (const artifact of fallbackData.skillArtifacts) {
    if (artifact.lifecycleState !== 'approved') continue;
    const profile = artifact.latestRevision.derived?.profile;
    if (!profile) continue;
    if (
      profile.contentHash !== input.candidateExactLookupKey &&
      profile.sourceHash !== input.candidateExactLookupKey
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

  return { exactMatches, exactMatchKeys, entityContent };
}

/**
 * Process PostgreSQL exact-match rows from the skill_artifact_profiles query
 * and append them to the exactMatches array (mutates in place).
 */
export function appendPgSkillExactMatches(
  rows: SkillExactRow[],
  candidateKeywords: string[],
  candidateTokens: string[],
  exactMatchKeys: Set<string>,
  exactMatches: DuplicateMatch[],
  entityContent: Map<string, EntityContent>,
): void {
  for (const row of rows) {
    const exactEntityId = String(
      (row as { artifactId?: string }).artifactId ??
        (row as { artifact_id?: string }).artifact_id ??
        '',
    );
    if (exactEntityId.length === 0) continue;
    const exactEntityTitle = String((row as { title?: string }).title ?? exactEntityId).slice(
      0,
      280,
    );
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
        sharedKeywords: candidateKeywords.slice(0, 10),
        sharedTokens: candidateTokens.slice(0, 50),
        textOverlapPercent: 100,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Score merging
// ---------------------------------------------------------------------------

/**
 * Merge vector and keyword query results into a single score map keyed by
 * `entityType:entityId`.
 */
export function mergeScores(params: {
  trapVectorResults: TrapVectorRow[];
  skillVectorResults: SkillVectorRow[];
  trapKeywordResults: TrapKeywordRow[];
  skillKeywordResults: SkillKeywordRow[];
  candidateTokens: string[];
}): Map<string, EntityScore> {
  const {
    trapVectorResults,
    skillVectorResults,
    trapKeywordResults,
    skillKeywordResults,
    candidateTokens,
  } = params;

  const entryScores = new Map<string, EntityScore>();

  // Trap vector results
  for (const r of trapVectorResults) {
    const entryId = String(
      (r as { entryId?: string }).entryId ?? (r as { entry_id?: string }).entry_id ?? '',
    );
    if (entryId.length === 0) continue;
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

  // Skill vector results
  for (const r of skillVectorResults) {
    const artifactId = String(
      (r as { artifactId?: string }).artifactId ??
        (r as { artifact_id?: string }).artifact_id ??
        '',
    );
    if (artifactId.length === 0) continue;
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

  // Trap keyword results
  for (const r of trapKeywordResults) {
    const entryId = String(
      (r as { entryId?: string }).entryId ?? (r as { entry_id?: string }).entry_id ?? '',
    );
    if (entryId.length === 0) continue;
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

  // Skill keyword results
  for (const r of skillKeywordResults) {
    const artifactId = String(
      (r as { artifactId?: string }).artifactId ??
        (r as { artifact_id?: string }).artifact_id ??
        '',
    );
    if (artifactId.length === 0) continue;
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

  return entryScores;
}

// ---------------------------------------------------------------------------
// Hybrid scoring and match building
// ---------------------------------------------------------------------------

/**
 * Convert merged scores into recalled matches by applying the hybrid score
 * formula and threshold filters.
 */
export function buildRecalledMatches(params: {
  entryScores: Map<string, EntityScore>;
  exactMatchKeys: Set<string>;
  candidateKeywords: string[];
  entityContent: Map<string, EntityContent>;
}): { recalledMatches: DuplicateMatch[] } {
  const { entryScores, exactMatchKeys, candidateKeywords, entityContent } = params;
  const recalledMatches: DuplicateMatch[] = [];

  for (const [entityKey, scores] of entryScores) {
    if (exactMatchKeys.has(entityKey)) continue;

    // Hybrid score: weighted average (0.6 vector + 0.4 keyword)
    const hybridScore = scores.vectorScore * 0.6 + scores.keywordScore * 0.4;

    if (scores.sharedTokens.size > 0 && scores.sharedTokens.size < MIN_NON_EXACT_SHARED_TOKENS) {
      continue;
    }

    if (hybridScore < MEDIUM_OVERLAP_THRESHOLD) continue;

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
        sharedKeywords: candidateKeywords.slice(0, 10),
        sharedTokens: [...scores.sharedTokens].slice(0, 50),
        textOverlapPercent: Math.round(scores.keywordScore * 100),
      },
    });
  }

  return { recalledMatches };
}

// ---------------------------------------------------------------------------
// LLM refinement
// ---------------------------------------------------------------------------

/**
 * Apply LLM refinement to the top-K recalled matches. Returns only the
 * matches that the LLM confirms as duplicates above the confidence threshold.
 */
export async function refineWithLLM(params: {
  recalledMatches: DuplicateMatch[];
  chat: ChatProvider;
  entityContent: Map<string, EntityContent>;
  candidateTitle?: string;
  candidateBody?: string;
  candidateKeywords: string[];
  candidateTokens: string[];
}): Promise<DuplicateMatch[]> {
  const {
    recalledMatches,
    chat,
    entityContent,
    candidateTitle,
    candidateBody,
    candidateKeywords,
    candidateTokens,
  } = params;

  const topK = recalledMatches.slice(0, LLM_TOP_K);
  const refinedMatches: DuplicateMatch[] = [];

  for (const match of topK) {
    const existing = entityContent.get(`${match.entityType}:${match.entityId}`);
    const existingTitle = existing?.title ?? match.entityTitle;
    const existingBody = existing?.body ?? '';

    const resolvedCandidateTitle = candidateTitle ?? candidateKeywords.slice(0, 5).join(', ');
    const resolvedCandidateBody = candidateBody ?? candidateTokens.slice(0, 100).join(' ');

    const judgment = await judgeDuplicateWithLLM(
      chat,
      { title: resolvedCandidateTitle, body: resolvedCandidateBody },
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

  return refinedMatches;
}

// ---------------------------------------------------------------------------
// Final match assembly
// ---------------------------------------------------------------------------

/**
 * Build the final duplicate case from combined exact + recalled matches.
 * Applies sorting, limit, and duplicate-type classification.
 */
export function buildFinalDuplicateCase(params: {
  exactMatches: DuplicateMatch[];
  recalledMatches: DuplicateMatch[];
  maxMatches: number;
}): {
  topMatches: DuplicateMatch[];
  highestSimilarity: number;
  hasExactDuplicate: boolean;
  duplicateType: 'exact' | 'semantic' | 'none';
} {
  const { exactMatches, recalledMatches, maxMatches } = params;

  const combined = [...exactMatches, ...recalledMatches];
  combined.sort((a, b) => b.similarityScore - a.similarityScore);

  const exactTopMatches = combined.filter((m) => m.matchType === 'exact');
  const nonExactTopMatches = combined.filter((m) => m.matchType !== 'exact');
  const topMatches =
    exactTopMatches.length > 0
      ? [
          ...exactTopMatches,
          ...nonExactTopMatches.slice(0, Math.max(maxMatches - exactTopMatches.length, 0)),
        ]
      : nonExactTopMatches.slice(0, maxMatches);

  const hasMatches = topMatches.length > 0;
  const highestSimilarity = hasMatches && topMatches[0] ? topMatches[0].similarityScore : 0;
  const hasExactDuplicate = topMatches.some((m) => m.matchType === 'exact');

  let duplicateType: 'exact' | 'semantic' | 'none' = 'none';
  if (hasExactDuplicate) {
    duplicateType = 'exact';
  } else if (highestSimilarity >= HIGH_OVERLAP_THRESHOLD) {
    duplicateType = 'semantic';
  }

  return { topMatches, highestSimilarity, hasExactDuplicate, duplicateType };
}

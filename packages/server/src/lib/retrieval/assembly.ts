/**
 * Response assembly module for retrieval results.
 *
 * This module handles:
 * - Generating human-readable match reasons
 * - Converting knowledge entries to retrieval match schema
 * - Assembling globalConstraints and projectKnowledge buckets
 * - Ensuring no entry appears in both buckets
 * - Attaching citations to matches when available
 *
 * v2 capsule-first assembly:
 * - Building capsule matches from ranked capsule candidates
 * - Building profile hints from artifact metadata
 * - Assembling v2 responses with distilled capsule results
 * - Never exposing raw bundle file contents (T-14-07)
 *
 * This module is called after recall candidates are generated and scored,
 * transforming them into the API response shape.
 */

import type {
  RetrievalQuery,
  RetrievalResponse,
  RetrievalCitation,
  RetrievalSummary,
  CapsuleMatch,
  ProfileHint,
  RetrievalV2Response,
} from '@skill-shareer/contracts';
import {
  retrievalMatchSchema,
  retrievalResponseSchema,
  retrievalV2ResponseSchema,
  capsuleMatchSchema,
  profileHintSchema,
} from '@skill-shareer/contracts';
import type { ScoredEntry, CapsuleCandidate } from './types.js';
import type { DerivedSkillCapsuleRecord, SkillArtifactRecord, ClientManifestRecord } from '../store.js';

// Type inference from schema - use the return type of parse()
type RetrievalMatch = ReturnType<typeof retrievalMatchSchema.parse>;

/**
 * Generate a human-readable reason for the match.
 */
export function generateMatchReason(
  entry: { labels: string[]; scope: string },
  score: number,
  filters: RetrievalQuery['filters'],
): string {
  const parts: string[] = [];

  if (filters.labels.length > 0) {
    const matchingLabels = filters.labels.filter((label) => entry.labels.includes(label));
    if (matchingLabels.length > 0) {
      parts.push(`matches labels: ${matchingLabels.join(', ')}`);
    }
  }

  if (filters.scopes.length === 1 && filters.scopes[0] === entry.scope) {
    parts.push(`scope: ${entry.scope}`);
  }

  const baseReason = parts.length > 0 ? parts.join('; ') : 'semantic similarity';
  return `${baseReason} (score: ${score.toFixed(2)})`;
}

/**
 * Convert a scored entry to a retrieval match.
 * Optionally includes citation if provided.
 */
export function toRetrievalMatch(
  scoredEntry: ScoredEntry,
  filters: RetrievalQuery['filters'],
  citation?: RetrievalCitation,
): RetrievalMatch {
  const { entry, score } = scoredEntry;
  return retrievalMatchSchema.parse({
    entryId: entry.id,
    scope: entry.scope,
    requiredLevel: entry.requiredLevel,
    shortcut: entry.shortcut,
    detail: entry.detail,
    labels: entry.labels,
    score,
    reason: generateMatchReason(entry, score, filters),
    citation,
  });
}

/**
 * Assemble scored entries into globalConstraints and projectKnowledge buckets.
 * Ensures no entry appears in both buckets.
 * Optionally includes citations if provided.
 */
export function assembleResponseBuckets(
  scoredEntries: ScoredEntry[],
  filters: RetrievalQuery['filters'],
  citations?: Map<string, RetrievalCitation>,
): {
  globalConstraints: RetrievalMatch[];
  projectKnowledge: RetrievalMatch[];
} {
  const globalConstraints: RetrievalMatch[] = [];
  const projectKnowledge: RetrievalMatch[] = [];

  for (const scoredEntry of scoredEntries) {
    const citation = citations?.get(scoredEntry.entry.id);
    const match = toRetrievalMatch(scoredEntry, filters, citation);
    if (scoredEntry.entry.scope === 'global') {
      globalConstraints.push(match);
    } else {
      projectKnowledge.push(match);
    }
  }

  return { globalConstraints, projectKnowledge };
}

/**
 * Build the complete retrieval response.
 * Includes match buckets, optional refinement summary, and optional summary.
 */
export function buildRetrievalResponse(
  globalConstraints: RetrievalMatch[],
  projectKnowledge: RetrievalMatch[],
  refinementSummary: string | null,
  summary: RetrievalSummary | null = null,
): RetrievalResponse {
  return retrievalResponseSchema.parse({
    globalConstraints,
    projectKnowledge,
    refinementSummary,
    summary,
  });
}

/**
 * Create an empty retrieval response when no matches are found.
 */
export function buildEmptyResponse(): RetrievalResponse {
  return retrievalResponseSchema.parse({
    globalConstraints: [],
    projectKnowledge: [],
    refinementSummary: null,
    summary: null,
  });
}

// =============================================================================
// Phase 14 v2 Assembly: Capsule-first response shaping (RETR-04, T-14-07)
// Pure helpers for building v2 responses from distilled capsule hits.
// =============================================================================

/**
 * Build a capsule match from a capsule record and candidate.
 * Per T-14-07: Emits distilled capsule/profile metadata only;
 * does not include raw bundle file contents or activation-only payloads.
 *
 * @param capsule - Derived capsule record with distilled content
 * @param candidate - Ranked capsule candidate with scores
 * @returns CapsuleMatch for v2 response
 */
export function buildCapsuleMatch(
  capsule: DerivedSkillCapsuleRecord,
  candidate: CapsuleCandidate,
): CapsuleMatch {
  return capsuleMatchSchema.parse({
    capsuleId: capsule.capsuleId,
    artifactId: capsule.artifactId,
    revision: capsule.revision,
    sourcePaths: capsule.sourcePaths,
    content: capsule.content,
    situation: capsule.situation,
    problem: capsule.problem,
    goal: capsule.goal,
    errorText: capsule.errorText,
    labels: capsule.labels,
    scope: capsule.scope,
    requiredLevel: capsule.requiredLevel,
    score: candidate.finalScore,
    reason: candidate.reason,
  });
}

/**
 * Build a profile hint from artifact metadata.
 * Provides lightweight artifact metadata without full profile content.
 *
 * @param artifact - Skill artifact record (partial with needed fields)
 * @returns ProfileHint for v2 response
 */
export function buildProfileHint(
  artifact: Pick<SkillArtifactRecord, 'id' | 'title' | 'slug' | 'labels'>,
): ProfileHint {
  return profileHintSchema.parse({
    artifactId: artifact.id,
    title: artifact.title,
    slug: artifact.slug,
    labels: artifact.labels,
  });
}

/**
 * Build the complete v2 retrieval response.
 * Capsule-first distilled results with optional summary and activation hints.
 *
 * Per T-14-07: Does not include raw bundle file contents or
 * activation-only payloads in the response.
 *
 * Phase 15: Includes optional activation hints from governed clientManifest (RETR-05, ACTV-01).
 *
 * @param capsules - Ranked capsule matches
 * @param profileHints - Lightweight artifact metadata
 * @param summary - Optional summary over filtered capsule hits
 * @param activationHints - Optional activation hints for references/assets/scripts
 * @returns v2 retrieval response
 */
export function buildV2RetrievalResponse(
  capsules: CapsuleMatch[],
  profileHints: ProfileHint[],
  summary?: RetrievalSummary | null,
  activationHints?: Array<{
    artifactId: string;
    readNextReferences: Array<{
      path: string;
      sha256: string;
      sizeBytes: number;
      mediaType: string;
    }>;
    availableAssets: Array<{
      path: string;
      sha256: string;
      sizeBytes: number;
      mediaType: string;
    }>;
    availableScripts: Array<{
      path: string;
      sha256: string;
      capability: string;
      argsSchemaSummary: string;
      sideEffectSummary: string;
      defaultPolicy: 'manual' | 'auto' | 'blocked';
    }>;
  }>,
): RetrievalV2Response {
  return retrievalV2ResponseSchema.parse({
    capsules,
    profileHints,
    refinementSummary: null,
    summary: summary ?? null,
    ...(activationHints && activationHints.length > 0 ? { activationHints } : {}),
  });
}

/**
 * Build an empty v2 retrieval response when no matches are found.
 */
export function buildEmptyV2Response(): RetrievalV2Response {
  return retrievalV2ResponseSchema.parse({
    capsules: [],
    profileHints: [],
    refinementSummary: null,
    summary: null,
  });
}

// =============================================================================
// Phase 15 Activation Hint Assembly (RETR-05, ACTV-01)
// Pure helpers for building activation hints from governed clientManifest.
// =============================================================================

/**
 * Build activation hint from client manifest.
 * Per T-15-01: Emits metadata-only (path, hash, size, mediaType, capability)
 * without including file contents or script bodies.
 *
 * @param clientManifest - Client manifest from artifact derivation
 * @returns Activation hint for v2 response
 */
export function buildActivationHint(clientManifest: ClientManifestRecord): {
  artifactId: string;
  readNextReferences: Array<{
    path: string;
    sha256: string;
    sizeBytes: number;
    mediaType: string;
  }>;
  availableAssets: Array<{
    path: string;
    sha256: string;
    sizeBytes: number;
    mediaType: string;
  }>;
  availableScripts: Array<{
    path: string;
    sha256: string;
    capability: string;
    argsSchemaSummary: string;
    sideEffectSummary: string;
    defaultPolicy: 'manual' | 'auto' | 'blocked';
  }>;
} {
  return {
    artifactId: clientManifest.artifactId,
    readNextReferences: clientManifest.references.map((ref) => ({
      path: ref.path,
      sha256: ref.sha256,
      sizeBytes: ref.sizeBytes,
      mediaType: ref.mediaType,
    })),
    availableAssets: clientManifest.assets.map((asset) => ({
      path: asset.path,
      sha256: asset.sha256,
      sizeBytes: asset.sizeBytes,
      mediaType: asset.mediaType,
    })),
    availableScripts: clientManifest.scripts.map((script) => ({
      path: script.path,
      sha256: script.sha256,
      capability: script.capability,
      argsSchemaSummary: script.argsSchemaSummary,
      sideEffectSummary: script.sideEffectSummary,
      defaultPolicy: script.defaultPolicy,
    })),
  };
}

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
  AssetAvailabilityHint,
  CapsuleActivationHints,
  CapsuleMatch,
  ProfileHint,
  ReadNextReferenceHint,
  RetrievalCitation,
  RetrievalQuery,
  RetrievalResponse,
  RetrievalSummary,
  RetrievalV2Response,
  ScriptProfileHint,
} from '@skill-shareer/contracts';
import {
  capsuleActivationHintsSchema,
  capsuleMatchSchema,
  profileHintSchema,
  retrievalMatchSchema,
  retrievalResponseSchema,
  retrievalV2ResponseSchema,
} from '@skill-shareer/contracts';
import type {
  ClientManifestRecord,
  DerivedSkillCapsuleRecord,
  SkillArtifactRecord,
} from '../store.js';
import type { CapsuleCandidate, ScoredEntry } from './types.js';

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
 * Per T-15-01: Activation hints are metadata-only without file bodies.
 *
 * @param capsules - Ranked capsule matches
 * @param profileHints - Lightweight artifact metadata
 * @param summary - Optional summary over filtered capsule hits
 * @param activationHints - Optional activation hints per capsule
 * @returns v2 retrieval response
 */
export function buildV2RetrievalResponse(
  capsules: CapsuleMatch[],
  profileHints: ProfileHint[],
  summary?: RetrievalSummary | null,
  activationHints?: CapsuleActivationHints[],
): RetrievalV2Response {
  return retrievalV2ResponseSchema.parse({
    capsules,
    profileHints,
    refinementSummary: null,
    summary: summary ?? null,
    // Note: activationHints are added to the response shape
    // but the base schema doesn't include them - they're optional
    // The route will use retrievalV2ResponseWithHintsSchema if needed
    ...(activationHints ? { activationHints } : {}),
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
// Phase 15: Activation hint shaping (RETR-05, ACTV-01, T-15-01, T-15-02)
// Pure helpers for building activation metadata from governed clientManifest.
// All hints are metadata-only - no file bodies or script content included.
// =============================================================================

/**
 * Build a read-next reference hint from client manifest reference metadata.
 * Per T-15-01: Metadata-only, no file content.
 *
 * @param artifactId - Artifact identifier
 * @param revision - Revision number
 * @param ref - Client manifest reference record
 * @returns ReadNextReferenceHint for activation guidance
 */
export function buildReadNextHint(
  artifactId: string,
  revision: number,
  ref: ClientManifestRecord['references'][number],
): ReadNextReferenceHint {
  return {
    artifactId,
    revision,
    path: ref.path,
    sha256: ref.sha256,
  };
}

/**
 * Build an asset availability hint from client manifest asset metadata.
 * Per T-15-01: Metadata-only, no asset body.
 *
 * @param artifactId - Artifact identifier
 * @param revision - Revision number
 * @param asset - Client manifest asset record
 * @returns AssetAvailabilityHint for activation guidance
 */
export function buildAssetHint(
  artifactId: string,
  revision: number,
  asset: ClientManifestRecord['assets'][number],
): AssetAvailabilityHint {
  return {
    artifactId,
    revision,
    path: asset.path,
    sha256: asset.sha256,
    sizeBytes: asset.sizeBytes,
    mediaType: asset.mediaType,
  };
}

/**
 * Build a script profile hint from client manifest script metadata.
 * Per T-15-01, T-15-03: Metadata-only, no script body.
 *
 * @param artifactId - Artifact identifier
 * @param revision - Revision number
 * @param script - Client manifest script record
 * @returns ScriptProfileHint for activation guidance
 */
export function buildScriptHint(
  artifactId: string,
  revision: number,
  script: ClientManifestRecord['scripts'][number],
): ScriptProfileHint {
  return {
    artifactId,
    revision,
    path: script.path,
    sha256: script.sha256,
    capability: script.capability,
    argsSchemaSummary: script.argsSchemaSummary,
    sideEffectSummary: script.sideEffectSummary,
    defaultPolicy: script.defaultPolicy,
  };
}

/**
 * Build activation hints for a single capsule from its artifact's client manifest.
 * Per T-15-02: Sources activation metadata only from governed clientManifest.
 * Per T-15-01: All hints remain metadata-only without file bodies.
 *
 * @param capsule - Capsule match to build hints for
 * @param manifest - Client manifest from artifact's latest revision (may be null)
 * @returns CapsuleActivationHints for the capsule
 */
export function buildActivationHints(
  capsule: CapsuleMatch,
  manifest: ClientManifestRecord | null,
): CapsuleActivationHints {
  // If no manifest, return empty hints
  if (!manifest) {
    return capsuleActivationHintsSchema.parse({
      capsuleId: capsule.capsuleId,
      readNext: [],
      assets: [],
      scripts: [],
    });
  }

  // Build read-next hints from manifest references
  const readNext: ReadNextReferenceHint[] = manifest.references.map((ref) =>
    buildReadNextHint(manifest.artifactId, manifest.revision, ref),
  );

  // Build asset hints from manifest assets
  const assets: AssetAvailabilityHint[] = manifest.assets.map((asset) =>
    buildAssetHint(manifest.artifactId, manifest.revision, asset),
  );

  // Build script hints from manifest scripts
  const scripts: ScriptProfileHint[] = manifest.scripts.map((script) =>
    buildScriptHint(manifest.artifactId, manifest.revision, script),
  );

  return capsuleActivationHintsSchema.parse({
    capsuleId: capsule.capsuleId,
    readNext,
    assets,
    scripts,
  });
}

/**
 * Build activation hints for all capsules from their artifacts.
 * Maps capsule artifact IDs to their corresponding manifests.
 *
 * @param capsules - Ranked capsule matches
 * @param artifacts - Skill artifacts with manifests
 * @returns Array of activation hints, one per capsule (empty if no manifest)
 */
export function buildAllActivationHints(
  capsules: CapsuleMatch[],
  artifacts: SkillArtifactRecord[],
): CapsuleActivationHints[] {
  // Build artifact lookup by ID
  const artifactMap = new Map<string, SkillArtifactRecord>();
  for (const artifact of artifacts) {
    artifactMap.set(artifact.id, artifact);
  }

  // Build hints for each capsule
  return capsules.map((capsule) => {
    const artifact = artifactMap.get(capsule.artifactId);
    const manifest = artifact?.latestRevision.derived?.clientManifest ?? null;
    return buildActivationHints(capsule, manifest);
  });
}

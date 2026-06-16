/**
 * Skill lookup helper for Phase 18 CLI skill search-by-content command (SKED-01).
 * Provides artifact-first search by ranking governed capsules and collapsing to unique artifacts.
 *
 * Uses the shared CapsuleRecallCoordinator for multi-channel recall (heuristic, keyword,
 * semantic, graph) with merge + rerank, matching the v2 retrieval pipeline.
 */

import type {
  SkillLookupQuery,
  SkillLookupResponse,
  SkillLookupResultItem,
  SkillSourceKind,
} from '@trapmap/contracts';
import { skillLookupQuerySchema } from '@trapmap/contracts';

import type { ResolvedAuthContext, SkillShareerServices } from '@trapmap/server/lib/context.js';
import { PostgresStore } from '@trapmap/server/lib/persistence/postgres-store.js';
import { buildRetrievalReadModel } from '@trapmap/server/lib/retrieval/read-model.js';
import type { CapsuleCandidate } from '@trapmap/server/lib/retrieval/types.js';
import type { SkillArtifactRecord } from '@trapmap/server/lib/store.js';
import { createFullCapsuleChannelRegistry } from './capsule-channel-registry.js';
import { CapsuleRecallCoordinator } from './capsule-recall-coordinator.js';
import { isArtifactGovernanceEligible } from './capsule-recall.js';
import { InMemoryIntentCache } from './intent-cache.js';
import { parseSeedIntentWithLLM } from './intent.js';

const skillLookupIntentCache = new InMemoryIntentCache();

/**
 * Deduplicate ranked capsule candidates by artifactId.
 * Keeps the highest-scoring capsule for each artifact.
 *
 * @param candidates - Ranked capsule candidates
 * @returns Deduplicated candidates, one per artifact
 */
function dedupeByArtifactId(candidates: CapsuleCandidate[]): CapsuleCandidate[] {
  const bestByArtifactId = new Map<string, CapsuleCandidate>();

  for (const candidate of candidates) {
    const existing = bestByArtifactId.get(candidate.artifactId);
    if (!existing || candidate.finalScore > existing.finalScore) {
      bestByArtifactId.set(candidate.artifactId, candidate);
    }
  }

  // Sort by score descending
  return Array.from(bestByArtifactId.values()).sort((a, b) => b.finalScore - a.finalScore);
}

/**
 * Determine the source kind for an artifact.
 * Maps artifact metadata to the SkillSourceKind enum.
 *
 * @param artifact - Skill artifact record
 * @returns Source kind classification
 */
function determineSourceKind(artifact: SkillArtifactRecord): SkillSourceKind {
  // Use metadata.sourceKind for source classification
  return artifact.metadata.sourceKind;
}

/**
 * Build a SkillLookupResultItem from an artifact and capsule candidate.
 *
 * @param artifact - Skill artifact record
 * @param candidate - Highest-ranked capsule for this artifact
 * @returns Lookup result item with metadata-only fields
 */
function buildLookupItem(
  artifact: SkillArtifactRecord,
  candidate: CapsuleCandidate,
): SkillLookupResultItem {
  const profile = artifact.latestRevision.derived?.profile;

  return {
    artifactId: artifact.id,
    title: profile?.title ?? artifact.slug,
    slug: artifact.slug,
    labels: profile?.labels ?? artifact.labels,
    scope: artifact.scope,
    requiredLevel: artifact.requiredLevel,
    sourceKind: determineSourceKind(artifact),
    score: candidate.finalScore,
    reason: candidate.reason,
  };
}

/**
 * Search for governed skill artifacts by content text.
 * Returns artifact-first matches with metadata-only fields.
 *
 * Pipeline:
 * 1. Parse seed text into intent signals
 * 2. Build governance filters from auth context
 * 3. Rank capsules against parsed intent
 * 4. Dedupe to unique artifacts (highest score per artifact)
 * 5. Transform to artifact-first result items
 *
 * @param services - Server services (config, store)
 * @param auth - Resolved auth context
 * @param query - Skill lookup query with text and maxResults
 * @returns Skill lookup response with artifact-first matches
 */
export async function searchSkillsByContent(
  services: SkillShareerServices,
  auth: ResolvedAuthContext,
  query: SkillLookupQuery,
): Promise<SkillLookupResponse> {
  // Parse and validate query
  const parsed = skillLookupQuerySchema.parse(query);

  // Parse seed text into intent signals (RETR-02 pattern)
  const intent = await parseSeedIntentWithLLM(parsed.text, services.ai.chat, {
    cache: skillLookupIntentCache,
  });

  // Get current data snapshot
  const readModel = await buildRetrievalReadModel(services.repos);

  // Build governance filters from auth context (T-14-04 pattern)
  const governanceFilters = {
    teamId: auth.activeTeamId,
    securityLevel: auth.securityLevel,
    isSystemAdmin: auth.subjectType === 'system-admin',
    scopes: [] as Array<'global' | 'project'>,
    labels: [] as string[],
  };

  // Get governed artifacts
  const artifacts = readModel.skillArtifacts;

  // Pre-filter artifacts by governance before capsule ranking
  const governedArtifacts = artifacts.filter((artifact) =>
    isArtifactGovernanceEligible(artifact, governanceFilters),
  );

  // Early return if no governed artifacts
  if (governedArtifacts.length === 0) {
    return { matches: [] };
  }

  // Rank capsules using shared CapsuleRecallCoordinator (multi-channel recall + merge + rerank)
  // This replaces the standalone rankCapsules() path to reuse the same indexed recall,
  // governance, and observability as v2 capsule retrieval.
  const pgPool = services.store instanceof PostgresStore ? services.store.getPool() : null;
  const channelRegistry = await createFullCapsuleChannelRegistry({
    pgPool,
    pgKeywordFlag: () => process.env.RETRIEVAL_CAPSULE_PG_KEYWORD === 'true',
    pgSemanticFlag: () => process.env.RETRIEVAL_CAPSULE_PG_SEMANTIC === 'true',
    graphQueryBackend: services.graphQueryBackend,
  });
  const coordinator = new CapsuleRecallCoordinator(channelRegistry);

  const recallResult = await coordinator.execute({
    artifacts: governedArtifacts,
    intent,
    governanceFilters,
    maxResults: parsed.maxResults * 3,
  });

  const rankedCandidates = recallResult.capsuleCandidates;

  // Dedupe to unique artifacts
  const uniqueCandidates = dedupeByArtifactId(rankedCandidates);

  // Limit to maxResults
  const limitedCandidates = uniqueCandidates.slice(0, parsed.maxResults);

  // Build lookup result items
  const matches: SkillLookupResultItem[] = [];

  for (const candidate of limitedCandidates) {
    const artifact = governedArtifacts.find((a) => a.id === candidate.artifactId);
    if (artifact) {
      matches.push(buildLookupItem(artifact, candidate));
    }
  }

  return { matches };
}

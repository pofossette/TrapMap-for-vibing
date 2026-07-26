/**
 * Cross-domain graph reconciliation and stale-state cleanup.
 *
 * This module rebuilds graph projections from owner-local indexing sources.
 *
 * Security note: Stale graph documents for deactivated or rejected entities are
 * treated as security-sensitive removals, not warnings. Hard dependency cycles
 * in rebuild candidates are rejected, but removals persist.
 *
 * T-36-13: Remove stale graph documents (missing, deactivated, rejected, old revision)
 * T-36-14: Rebuild missing approved trap and skill documents
 * T-36-16: Derive allowed source set from current governance metadata
 */

import type {
  ArtifactIndexingEntry,
  ArtifactReadProjection,
  GraphIndexRepositoryPort,
  KnowledgeIndexingEntry,
  KnowledgeOwnerPort,
} from '@trapmap/contracts';
import type { GraphQueryBackend } from '@trapmap/server/lib/graph-query/index.js';
import { buildTrapGraphDocument } from './adapters/graph-builders.js';
import { type GraphIndexDocumentRecord, assertNoHardDependencyCycles } from './graph-lite/index.js';
import { normalizeKnowledgeIndexDocument } from './normalize.js';
import { buildSkillGraphDocument } from './skill-events.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Result of a graph reconciliation pass.
 */
export interface GraphReconcileResult {
  /** Total graph documents processed */
  totalDocuments: number;
  /** Documents removed (stale/deactivated/rejected/old revision) */
  documentsRemoved: number;
  /** Documents rebuilt (missing approved sources) */
  documentsRebuilt: number;
  /** Documents unchanged */
  documentsUnchanged: number;
  /** Whether rebuild had validation errors */
  rebuildHadErrors: boolean;
  /** Error message if rebuild validation failed */
  rebuildError: string | null;
}

/**
 * Snapshot view of approved sources for reconciliation.
 */
interface ApprovedSource {
  sourceType: 'trap' | 'skill';
  sourceId: string;
  revision: number;
  teamId: string | null;
  scope: import('@trapmap/contracts').Scope;
  requiredLevel: number;
  entity: KnowledgeIndexingEntry | ArtifactIndexingEntry;
}

// ---------------------------------------------------------------------------
// Reconciliation helpers
// ---------------------------------------------------------------------------

/**
 * Check if a knowledge entry is currently approved.
 */
function isApprovedKnowledge(entry: { lifecycleState: string }): boolean {
  return entry.lifecycleState === 'approved';
}

/**
 * Check if a skill artifact is currently approved.
 */
function isApprovedSkill(artifact: { lifecycleState: string }): boolean {
  return artifact.lifecycleState === 'approved';
}

/**
 * Build a key for matching graph documents to approved sources.
 */
function sourceKey(sourceType: 'trap' | 'skill', sourceId: string): string {
  return `${sourceType}:${sourceId}`;
}

/**
 * Determine if a graph document is stale relative to approved sources.
 *
 * A document is stale if:
 * - Its source is not in the approved set
 * - Its source is deactivated or rejected
 * - Its revision is not the current approved revision
 */
function isStaleDocument(
  doc: GraphIndexDocumentRecord,
  approvedSourcesByKey: Map<string, ApprovedSource>,
): boolean {
  const key = sourceKey(doc.sourceType, doc.sourceId);
  const approved = approvedSourcesByKey.get(key);

  // Source not in approved set (missing, deactivated, rejected)
  if (!approved) {
    return true;
  }

  // Revision mismatch (old revision)
  if (doc.revision !== approved.revision) {
    return true;
  }

  return false;
}

/**
 * Build a candidate graph document for a trap source.
 */
function buildCandidateForTrap(source: ApprovedSource): GraphIndexDocumentRecord | null {
  const entry = source.entity as KnowledgeIndexingEntry;

  const normalized = normalizeKnowledgeIndexDocument(entry);

  return buildTrapGraphDocument({
    normalizedDocument: normalized,
    nodes: [],
    edges: [],
  });
}

/**
 * Build a candidate graph document for a skill source.
 */
async function buildCandidateForSkill(
  source: ApprovedSource,
): Promise<GraphIndexDocumentRecord | null> {
  const artifact = source.entity as ArtifactIndexingEntry;
  return buildSkillGraphDocument(artifact);
}

// ---------------------------------------------------------------------------
// Main reconciliation function
// ---------------------------------------------------------------------------

/**
 * Reconcile graph indexes from an explicit data snapshot.
 *
 * This function:
 * 1. Loads all persisted graph documents
 * 2. Computes the allowed source set from approved knowledgeEntries and skillArtifacts
 * 3. Removes stale documents (security-sensitive: missing, deactivated, rejected, old revision)
 * 4. Builds candidates for missing approved documents
 * 5. Validates rebuild candidates against post-removal state for hard-edge cycles
 * 6. If validation fails, rejects rebuild upserts but keeps removals durable
 *
 * @param args - Store and data snapshot
 * @returns Reconciliation result with counts and error status
 */
async function reconcileGraphIndexesFromApprovedSources(args: {
  approvedSources: ApprovedSource[];
  graphIndex: GraphIndexRepositoryPort;
}): Promise<GraphReconcileResult> {
  const { approvedSources, graphIndex } = args;

  // The knowledge-read owner is the sole durable graph projection authority.
  const existingDocs = await graphIndex.listAll();
  const totalDocuments = existingDocs.length;

  const approvedSourcesByKey = new Map<string, ApprovedSource>();
  for (const source of approvedSources) {
    approvedSourcesByKey.set(sourceKey(source.sourceType, source.sourceId), source);
  }

  // Track what documents exist by source key
  const existingDocsByKey = new Map<string, GraphIndexDocumentRecord>();
  for (const doc of existingDocs) {
    existingDocsByKey.set(sourceKey(doc.sourceType, doc.sourceId), doc);
  }

  // Phase 1: Remove stale documents (security-sensitive)
  let documentsRemoved = 0;
  const staleSourceIds: Array<{ sourceType: 'trap' | 'skill'; sourceId: string }> = [];

  for (const doc of existingDocs) {
    if (isStaleDocument(doc, approvedSourcesByKey)) {
      staleSourceIds.push({ sourceType: doc.sourceType, sourceId: doc.sourceId });
      documentsRemoved++;
    }
  }

  // Persist removals (security-sensitive, must happen before rebuild validation)
  for (const { sourceType, sourceId } of staleSourceIds) {
    await graphIndex.removeBySource(sourceType, sourceId);
  }

  // Phase 2: Build candidates for missing approved documents
  const candidates: GraphIndexDocumentRecord[] = [];
  let documentsUnchanged = 0;

  for (const source of approvedSources) {
    const key = sourceKey(source.sourceType, source.sourceId);
    const existing = existingDocsByKey.get(key);

    // Check if we already have a current document for this source
    if (existing && !isStaleDocument(existing, approvedSourcesByKey)) {
      documentsUnchanged++;
      continue;
    }

    // Build candidate document
    let candidate: GraphIndexDocumentRecord | null = null;
    if (source.sourceType === 'trap') {
      candidate = buildCandidateForTrap(source);
    } else {
      candidate = await buildCandidateForSkill(source);
    }

    if (candidate) {
      candidates.push(candidate);
    }
  }

  // Phase 3: Validate rebuild candidates against post-removal state
  let documentsRebuilt = 0;
  let rebuildHadErrors = false;
  let rebuildError: string | null = null;

  if (candidates.length > 0) {
    const durableDocs = existingDocs.filter(
      (document) =>
        !staleSourceIds.some(
          (stale) =>
            stale.sourceType === document.sourceType && stale.sourceId === document.sourceId,
        ),
    );
    const validationSet = [...durableDocs, ...candidates];

    try {
      assertNoHardDependencyCycles(validationSet);

      // Validation passed: persist rebuild upserts
      for (const candidate of candidates) {
        await graphIndex.upsert(candidate);
        documentsRebuilt++;
      }
    } catch (error) {
      // Validation failed: reject rebuild upserts but keep removals
      rebuildHadErrors = true;
      rebuildError = error instanceof Error ? error.message : String(error);
      // Do NOT roll back removals - they are security-sensitive
    }
  }

  return {
    totalDocuments,
    documentsRemoved,
    documentsRebuilt,
    documentsUnchanged,
    rebuildHadErrors,
    rebuildError,
  };
}

async function listOwnerEntries<T>(input: {
  listPage: (page: { offset: number; limit: number }) => Promise<{
    entries: T[];
    nextOffset: number | null;
  }>;
}): Promise<T[]> {
  const entries: T[] = [];
  let offset = 0;
  while (true) {
    const page = await input.listPage({ offset, limit: 100 });
    entries.push(...page.entries);
    if (page.nextOffset === null) return entries;
    if (page.nextOffset <= offset) {
      throw new Error('Owner indexing projection returned a non-advancing page offset');
    }
    offset = page.nextOffset;
  }
}

/**
 * Reconcile graph documents from the authoritative owner projections.
 *
 * Unlike the compatibility path, this does not read a snapshot or checkpoint
 * prompt/rebuild state. A fresh owner projection is the only source of truth.
 */
export async function reconcileGraphIndexesFromOwners(args: {
  knowledgeOwner: Pick<KnowledgeOwnerPort, 'listIndexingEntries'>;
  artifactReadProjection: Pick<ArtifactReadProjection, 'listIndexingEntries'>;
  graphIndex: GraphIndexRepositoryPort;
  graphQueryBackend?: GraphQueryBackend;
  syncProjection?: boolean;
}): Promise<GraphReconcileResult> {
  const [knowledgeEntries, artifacts] = await Promise.all([
    listOwnerEntries({ listPage: args.knowledgeOwner.listIndexingEntries }),
    listOwnerEntries({ listPage: args.artifactReadProjection.listIndexingEntries }),
  ]);
  const approvedSources: ApprovedSource[] = [
    ...knowledgeEntries.filter(isApprovedKnowledge).map((entry) => ({
      sourceType: 'trap' as const,
      sourceId: entry.id,
      revision: entry.revision,
      teamId: entry.teamId,
      scope: entry.scope,
      requiredLevel: entry.requiredLevel,
      entity: entry,
    })),
    ...artifacts.filter(isApprovedSkill).map((artifact) => ({
      sourceType: 'skill' as const,
      sourceId: artifact.id,
      revision: artifact.revision,
      teamId: artifact.teamId,
      scope: artifact.scope,
      requiredLevel: artifact.requiredLevel,
      entity: artifact,
    })),
  ];
  const result = await reconcileGraphIndexesFromApprovedSources({
    approvedSources,
    graphIndex: args.graphIndex,
  });
  if (args.syncProjection && args.graphQueryBackend) {
    await rebuildGraphProjectionFromTruth({
      graphIndexRepo: args.graphIndex,
      graphQueryBackend: args.graphQueryBackend,
    });
  }
  return result;
}

export async function rebuildGraphProjectionFromTruth(args: {
  graphIndexRepo: GraphIndexRepositoryPort;
  graphQueryBackend: GraphQueryBackend;
}): Promise<number> {
  const documents = await args.graphIndexRepo.listAll();
  await args.graphQueryBackend.rebuildProjection(documents);
  return documents.length;
}

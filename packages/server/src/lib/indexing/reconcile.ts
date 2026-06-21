/**
 * Cross-domain graph reconciliation and stale-state cleanup.
 *
 * This module provides:
 * - reconcileGraphIndexes: Repair drift between approved content and persisted graph state
 * - reconcileGraphIndexesFromSnapshot: Same operation with explicit data snapshot
 *
 * Security note: Stale graph documents for deactivated or rejected entities are
 * treated as security-sensitive removals, not warnings. Hard dependency cycles
 * in rebuild candidates are rejected, but removals persist.
 *
 * T-36-13: Remove stale graph documents (missing, deactivated, rejected, old revision)
 * T-36-14: Rebuild missing approved trap and skill documents
 * T-36-16: Derive allowed source set from current governance metadata
 * Phase 4: Full rebuild on prompt version change with interrupt recovery
 */

import type { GraphIndexRepository } from '@trapmap/server/lib/graph-index/repository.js';
import type { GraphQueryBackend } from '@trapmap/server/lib/graph-query/backend.js';
import type {
  KnowledgeRecord,
  SkillArtifactRecord,
  SkillShareerStore,
  StoreData,
} from '@trapmap/server/lib/store.js';
import { buildTrapGraphDocument } from './adapters/graph-builders.js';
import type { GraphIndexDocumentRecord } from './graph-lite/documents.js';
import { assertNoHardDependencyCycles } from './graph-lite/graphology.js';
import { PROMPT_VERSION } from './graph-lite/llm-cache.js';
import {
  getGraphIndexDocuments,
  removeGraphIndexDocumentsForSource,
  upsertGraphIndexDocument,
} from './graph-lite/store.js';
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
  entity: KnowledgeRecord | SkillArtifactRecord;
}

// ---------------------------------------------------------------------------
// Reconciliation helpers
// ---------------------------------------------------------------------------

/**
 * Check if a knowledge entry is currently approved.
 */
function isApprovedKnowledge(entry: KnowledgeRecord): boolean {
  return entry.lifecycleState === 'approved';
}

/**
 * Check if a skill artifact is currently approved.
 */
function isApprovedSkill(artifact: SkillArtifactRecord): boolean {
  return artifact.lifecycleState === 'approved';
}

/**
 * Compute the set of approved sources from knowledge entries and skill artifacts.
 */
function computeApprovedSources(data: StoreData): ApprovedSource[] {
  const sources: ApprovedSource[] = [];

  // Add approved knowledge entries (traps)
  for (const entry of data.knowledgeEntries) {
    if (isApprovedKnowledge(entry)) {
      sources.push({
        sourceType: 'trap',
        sourceId: entry.id,
        revision: entry.history.length > 0 ? entry.history.length : 1,
        teamId: entry.teamId,
        scope: entry.scope,
        requiredLevel: entry.requiredLevel,
        entity: entry,
      });
    }
  }

  // Add approved skill artifacts
  for (const artifact of data.skillArtifacts) {
    if (isApprovedSkill(artifact)) {
      sources.push({
        sourceType: 'skill',
        sourceId: artifact.id,
        revision: artifact.latestRevision.revision,
        teamId: artifact.teamId,
        scope: artifact.scope,
        requiredLevel: artifact.requiredLevel,
        entity: artifact,
      });
    }
  }

  return sources;
}

/**
 * Result of a full rebuild triggered by prompt version change.
 */
export interface FullRebuildResult {
  /** Whether a rebuild was triggered */
  triggered: boolean;
  /** Previous prompt version (null if first run) */
  previousVersion: number | null;
  /** Current prompt version */
  currentVersion: number;
  /** Total sources to rebuild */
  totalSources: number;
  /** Sources rebuilt successfully in this pass */
  sourcesRebuilt: number;
  /** Sources that errored during rebuild */
  sourcesErrored: number;
  /** Whether the rebuild completed or was interrupted */
  completed: boolean;
  /** Error messages for failed sources */
  errors: Array<{ sourceKey: string; error: string }>;
}

/**
 * A candidate for rebuild: an approved source that needs its graph document regenerated.
 */
interface RebuildCandidate {
  sourceKey: string;
  sourceType: 'trap' | 'skill';
  sourceId: string;
  entity: KnowledgeRecord | SkillArtifactRecord;
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
  const entry = source.entity as KnowledgeRecord;

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
  const artifact = source.entity as SkillArtifactRecord;
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
export async function reconcileGraphIndexesFromSnapshot(args: {
  store: SkillShareerStore;
  data: StoreData;
}): Promise<GraphReconcileResult> {
  const { store: _store, data } = args;

  // Load current graph documents
  const existingDocs = getGraphIndexDocuments(data);
  const totalDocuments = existingDocs.length;

  // Compute approved sources
  const approvedSources = computeApprovedSources(data);
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
    removeGraphIndexDocumentsForSource(data, sourceType, sourceId);
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
    // Get post-removal durable state
    const durableDocs = getGraphIndexDocuments(data);
    const validationSet = [...durableDocs, ...candidates];

    try {
      assertNoHardDependencyCycles(validationSet);

      // Validation passed: persist rebuild upserts
      for (const candidate of candidates) {
        upsertGraphIndexDocument(data, candidate);
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

/**
 * Perform a full rebuild of all graph index documents.
 *
 * This is triggered when PROMPT_VERSION changes. It regenerates graph documents
 * for all approved sources using the current extraction logic, replacing stale
 * documents that were built with an older prompt version.
 *
 * Supports interrupt recovery: if a previous rebuild was interrupted,
 * it resumes from the last completed source (tracked in data.rebuildState).
 *
 * @param args - Store and data snapshot
 * @returns Full rebuild result with counts and completion status
 */
export async function fullRebuildGraphIndexes(args: {
  data: StoreData;
}): Promise<FullRebuildResult> {
  const { data } = args;

  const currentVersion = PROMPT_VERSION;
  const previousVersion = data.promptVersion;

  // Compute all approved sources
  const approvedSources = computeApprovedSources(data);

  // Determine which sources need rebuild (resume from interrupt if applicable)
  const completedKeys = new Set(data.rebuildState?.completedSourceKeys ?? []);
  const pendingSources: RebuildCandidate[] = [];

  for (const source of approvedSources) {
    const key = sourceKey(source.sourceType, source.sourceId);
    if (completedKeys.has(key)) continue;

    pendingSources.push({
      sourceKey: key,
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      entity: source.entity,
    });
  }

  const totalSources = approvedSources.length;

  // If nothing to rebuild (all completed or no sources), finalize
  if (pendingSources.length === 0) {
    data.promptVersion = currentVersion;
    data.rebuildState = null;
    return {
      triggered: true,
      previousVersion,
      currentVersion,
      totalSources,
      sourcesRebuilt: 0,
      sourcesErrored: 0,
      completed: true,
      errors: [],
    };
  }

  console.log(
    `[reconcile] Full rebuild triggered: promptVersion ${previousVersion ?? 'null'} -> ${currentVersion}. ` +
      `${pendingSources.length}/${totalSources} sources pending.`,
  );

  let sourcesRebuilt = 0;
  let sourcesErrored = 0;
  const errors: Array<{ sourceKey: string; error: string }> = [];

  for (const source of pendingSources) {
    try {
      // Remove existing document for this source
      removeGraphIndexDocumentsForSource(data, source.sourceType, source.sourceId);

      // Rebuild the document
      let candidate: GraphIndexDocumentRecord | null = null;
      if (source.sourceType === 'trap') {
        const trapSource = computeApprovedSources(data).find(
          (s) => s.sourceId === source.sourceId && s.sourceType === source.sourceType,
        );
        if (trapSource) {
          candidate = buildCandidateForTrap(trapSource);
        }
      } else {
        const skillSource = computeApprovedSources(data).find(
          (s) => s.sourceId === source.sourceId && s.sourceType === source.sourceType,
        );
        if (skillSource) {
          candidate = await buildCandidateForSkill(skillSource);
        }
      }

      if (candidate) {
        upsertGraphIndexDocument(data, candidate);
        sourcesRebuilt++;
        console.log(
          `[reconcile] Rebuilt ${source.sourceType}:${source.sourceId} (${sourcesRebuilt}/${pendingSources.length})`,
        );
      }

      // Update rebuild state for interrupt recovery
      completedKeys.add(source.sourceKey);
      data.rebuildState = {
        targetVersion: currentVersion,
        completedSourceKeys: [...completedKeys],
      };
    } catch (error) {
      sourcesErrored++;
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push({ sourceKey: source.sourceKey, error: errorMsg });
      console.error(`[reconcile] Error rebuilding ${source.sourceKey}: ${errorMsg}`);
      // Continue with next source rather than aborting
    }
  }

  // Mark rebuild as completed
  const completed = sourcesErrored === 0;
  if (completed) {
    data.promptVersion = currentVersion;
    data.rebuildState = null;
    console.log(`[reconcile] Full rebuild completed: ${sourcesRebuilt} sources rebuilt.`);
  } else {
    console.log(
      `[reconcile] Full rebuild partially completed: ${sourcesRebuilt} rebuilt, ${sourcesErrored} errored. Will resume on next reconcile.`,
    );
  }

  return {
    triggered: true,
    previousVersion,
    currentVersion,
    totalSources,
    sourcesRebuilt,
    sourcesErrored,
    completed,
    errors,
  };
}

/**
 * Reconcile graph indexes with automatic snapshot.
 *
 * Runs reconciliation within a transaction, ensuring atomic updates
 * to the graph index. After normal reconciliation, checks if the prompt
 * version has changed and triggers a full rebuild if needed.
 *
 * @param args - Store instance
 * @returns Reconciliation result with counts and error status
 */
export async function reconcileGraphIndexes(args: {
  store: SkillShareerStore;
  graphIndexRepo?: GraphIndexRepository;
  graphQueryBackend?: GraphQueryBackend;
  syncProjection?: boolean;
}): Promise<GraphReconcileResult> {
  const { store } = args;

  let result: GraphReconcileResult = {
    totalDocuments: 0,
    documentsRemoved: 0,
    documentsRebuilt: 0,
    documentsUnchanged: 0,
    rebuildHadErrors: false,
    rebuildError: null,
  };

  await store.transact(async (data) => {
    // Normal reconciliation pass
    result = await reconcileGraphIndexesFromSnapshot({ store, data });

    // Phase 4: Check if prompt version changed — trigger full rebuild
    // Only trigger if a version was previously stored AND differs from current
    // (null means first run — normal reconciliation handles initial build)
    const storedVersion = data.promptVersion;
    const hasPendingRebuild = data.rebuildState !== null;
    const versionChanged = storedVersion !== null && storedVersion !== PROMPT_VERSION;
    if (versionChanged || hasPendingRebuild) {
      const rebuildResult = await fullRebuildGraphIndexes({ data });

      // Merge rebuild errors into reconciliation result
      if (rebuildResult.sourcesErrored > 0) {
        result.rebuildHadErrors = true;
        result.rebuildError = `Full rebuild: ${rebuildResult.sourcesErrored} source(s) failed. ${rebuildResult.errors.map((e) => `${e.sourceKey}: ${e.error}`).join('; ')}`;
      }

      // Increment documentsRebuilt count
      result.documentsRebuilt += rebuildResult.sourcesRebuilt;
    } else if (storedVersion === null) {
      // First run: store the prompt version so future changes can be detected
      data.promptVersion = PROMPT_VERSION;
    }
  });

  if (args.syncProjection && args.graphIndexRepo && args.graphQueryBackend) {
    await rebuildGraphProjectionFromTruth({
      graphIndexRepo: args.graphIndexRepo,
      graphQueryBackend: args.graphQueryBackend,
    });
  }

  return result;
}

export async function rebuildGraphProjectionFromTruth(args: {
  graphIndexRepo: GraphIndexRepository;
  graphQueryBackend: GraphQueryBackend;
}): Promise<number> {
  const documents = await args.graphIndexRepo.listAll();
  await args.graphQueryBackend.rebuildProjection(documents);
  return documents.length;
}

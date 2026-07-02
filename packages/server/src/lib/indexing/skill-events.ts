/**
 * Skill graph lifecycle orchestration for GraphRAG-lite indexing.
 *
 * This module provides:
 * - determineSkillIndexAction: Map lifecycle transitions to index actions
 * - runSkillIndexEvent: Execute indexing through artifact adapter pipeline
 *
 * Graph primitive types, extraction, and document building have been moved to:
 * - skill-extract.ts: extractSkillGraphPrimitives and supporting types
 * - skill-graph-build.ts: buildSkillGraphDocument
 *
 * This file re-exports all public API from those modules for backward compatibility.
 *
 * T-36-09: Build graph text only from derived.profile and derived.capsules
 * T-36-10: Persist teamId, scope, requiredLevel from artifact root
 * T-36-12: Remove graph documents on deactivation
 *
 * Security note: This module reads only derived outputs, never raw asset/script bodies.
 */

import type { LifecycleState } from '@trapmap/contracts';

import type { ChatProvider } from '@trapmap/server/lib/ai/types.js';
import { AppError } from '@trapmap/server/lib/errors.js';
import type { GraphQueryBackend } from '@trapmap/server/lib/graph-query/index.js';
import type { SkillShareerStore, StoreData } from '@trapmap/server/lib/store.js';
import type { ArtifactGraphAdapter } from './adapters/artifact-graph.js';
import {
  resolveArtifactAdapters,
  runArtifactAdapterFanOut,
  runArtifactAdapterRemoval,
} from './artifact-pipeline.js';
import { assertNoHardDependencyCycles, getGraphIndexDocuments } from './graph-lite/index.js';

// ---------------------------------------------------------------------------
// Re-export public API from extracted modules (backward compatibility)
// ---------------------------------------------------------------------------

export type {
  SkillGraphNodeKind,
  SkillGraphRelationType,
  SkillGraphRelationStrength,
  SkillGraphNodePrimitive,
  SkillGraphEdgePrimitive,
  SkillGraphPrimitives,
} from './skill-extract.js';

export { extractSkillGraphPrimitives } from './skill-extract.js';

export { buildSkillGraphDocument } from './skill-graph-build.js';

// ---------------------------------------------------------------------------
// Lifecycle mapping
// ---------------------------------------------------------------------------

/**
 * Determine the indexing action for a skill lifecycle transition.
 *
 * @param previousState - The previous lifecycle state
 * @param nextState - The new lifecycle state
 * @returns The index action to perform: 'upsert', 'remove', or 'noop'
 */
export function determineSkillIndexAction(
  previousState: LifecycleState,
  nextState: LifecycleState,
): 'upsert' | 'remove' | 'noop' {
  // Leaving approved - always remove index (agent-pass, agent-rejected, rejected, deactivated)
  if (previousState === 'approved' && nextState !== 'approved') {
    return 'remove';
  }

  // Transition to approved - sync index
  if (nextState === 'approved') {
    return 'upsert';
  }

  // All other transitions are no-ops for indexing
  return 'noop';
}

// ---------------------------------------------------------------------------
// Lifecycle event runner
// ---------------------------------------------------------------------------

/**
 * Run a skill indexing event for a lifecycle transition.
 *
 * This function uses the artifact adapter pipeline for fan-out instead of
 * writing directly to graph-lite/store.
 *
 * Post-commit pattern: Must be called AFTER the transaction commits.
 *
 * @param args - Event arguments
 */
export async function runSkillIndexEvent(args: {
  services: {
    store: SkillShareerStore;
    data: StoreData;
    ai?: { chat: ChatProvider };
    graphQueryBackend?: GraphQueryBackend;
  };
  artifactId: string;
  previousState: LifecycleState;
  nextState: LifecycleState;
  reason: string;
  adapters?: ArtifactGraphAdapter[];
}): Promise<void> {
  const { services, artifactId, previousState, nextState } = args;
  const { store, data: _data } = services;
  const adapters = args.adapters ?? resolveArtifactAdapters(store);

  const action = determineSkillIndexAction(previousState, nextState);

  // All modifications must be done within a transaction to persist
  await store.transact(async (txData) => {
    // Find the artifact
    const artifact = txData.skillArtifacts?.find((a) => a.id === artifactId);
    if (!artifact) {
      throw new Error(`Artifact ${artifactId} not found`);
    }

    switch (action) {
      case 'upsert': {
        // Guard: approved artifacts must have derived outputs before indexing
        if (!artifact.latestRevision.derived) {
          throw new AppError(
            500,
            'indexing_no_derived',
            `Cannot index artifact ${artifactId}: approved artifact must have derived outputs. Run derivation before approving or re-edit the artifact.`,
          );
        }

        // Build the graph document
        const { buildSkillGraphDocument } = await import('./skill-graph-build.js');
        const doc = await buildSkillGraphDocument(artifact, services.ai?.chat, store);
        if (!doc) {
          // No derived content, skip indexing
          return;
        }

        // Check for hard dependency cycles before persistence (D-06)
        // Include existing documents excluding this artifact's current document
        const existingDocs = getGraphIndexDocuments(txData).filter(
          (d) => !(d.sourceType === 'skill' && d.sourceId === artifactId),
        );
        const allDocs = [...existingDocs, doc];

        try {
          assertNoHardDependencyCycles(allDocs);
        } catch (error) {
          if (error instanceof Error && error.message === 'hard dependency cycle detected') {
            // Reject the cycle - do not persist
            throw new Error(`Cannot index skill ${artifactId}: hard dependency cycle detected`);
          }
          throw error;
        }

        const result = await runArtifactAdapterFanOut({
          data: txData,
          artifact,
          store,
          ...(services.ai ? { chat: services.ai.chat } : {}),
          adapters,
          ...(args.services.graphQueryBackend !== undefined
            ? { graphQueryBackend: args.services.graphQueryBackend }
            : {}),
        });
        const firstFailure = result.results.find((entry) => !entry.success);
        if (firstFailure) {
          throw new Error(firstFailure.error ?? `Artifact indexing failed for ${artifactId}`);
        }
        break;
      }

      case 'remove': {
        await runArtifactAdapterRemoval({
          data: txData,
          artifactId,
          store,
          adapters,
          ...(args.services.graphQueryBackend !== undefined
            ? { graphQueryBackend: args.services.graphQueryBackend }
            : {}),
        });
        break;
      }

      case 'noop':
        // No action needed for this transition
        break;
    }
  });
}

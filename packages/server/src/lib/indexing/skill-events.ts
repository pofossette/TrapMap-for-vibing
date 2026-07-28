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

import type {
  ArtifactReadProjection,
  GraphIndexRepositoryPort,
  LifecycleState,
} from '@trapmap/contracts';

import type { ChatProvider } from '@trapmap/ai-providers';
import { AppError } from '@trapmap/server/lib/errors.js';
import type { GraphQueryBackend } from '@trapmap/service-knowledge-read';
import type { SkillShareerStore } from '@trapmap/server/lib/store.js';
import type { ArtifactGraphAdapter } from './adapters/artifact-graph.js';
import {
  resolveArtifactAdapters,
  runArtifactAdapterFanOut,
  runArtifactAdapterRemoval,
} from './artifact-pipeline.js';

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
    ai?: { chat: ChatProvider };
    graphQueryBackend?: GraphQueryBackend;
    graphIndex?: GraphIndexRepositoryPort;
    artifactReadProjection?: Pick<ArtifactReadProjection, 'getIndexingEntry'>;
  };
  artifactId: string;
  previousState: LifecycleState;
  nextState: LifecycleState;
  reason: string;
  adapters?: ArtifactGraphAdapter[];
}): Promise<void> {
  const { services, artifactId, previousState, nextState } = args;
  const { store } = services;
  const adapters = args.adapters ?? resolveArtifactAdapters(store);

  const action = determineSkillIndexAction(previousState, nextState);

  if (action === 'noop') {
    return;
  }

  if (!services.artifactReadProjection) {
    throw new Error('Artifact owner projection is required for skill lifecycle indexing');
  }
  if (!services.graphIndex) {
    throw new Error('Graph index owner is required for owner-local skill indexing');
  }

  if (action === 'upsert') {
    const artifact = await services.artifactReadProjection.getIndexingEntry(artifactId);
    if (!artifact) throw new Error(`Artifact ${artifactId} not found`);
    if (!artifact.derived) {
      throw new AppError(
        500,
        'indexing_no_derived',
        `Cannot index artifact ${artifactId}: approved artifact must have derived outputs. Run derivation before approving or re-edit the artifact.`,
      );
    }
    const result = await runArtifactAdapterFanOut({
      artifact,
      store,
      ...(services.ai ? { chat: services.ai.chat } : {}),
      adapters,
      ...(services.graphQueryBackend !== undefined
        ? { graphQueryBackend: services.graphQueryBackend }
        : {}),
      graphIndex: services.graphIndex,
    });
    const firstFailure = result.results.find((entry) => !entry.success);
    if (firstFailure) {
      throw new Error(firstFailure.error ?? `Artifact indexing failed for ${artifactId}`);
    }
    return;
  }

  await runArtifactAdapterRemoval({
    artifactId,
    store,
    adapters,
    ...(services.graphQueryBackend !== undefined
      ? { graphQueryBackend: services.graphQueryBackend }
      : {}),
    graphIndex: services.graphIndex,
  });
}

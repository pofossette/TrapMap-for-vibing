/**
 * Lifecycle event mapping and approval-triggered indexing.
 *
 * This module provides:
 * - determineKnowledgeIndexAction: map lifecycle transitions to index actions
 * - runKnowledgeIndexEvent: execute the appropriate index action for a transition
 *
 * Security: All transitions are gated on lifecycle state changes.
 * Only approved content receives index upserts.
 */

import type {
  GraphIndexRepositoryPort,
  KnowledgeOwnerPort,
  LifecycleState,
} from '@trapmap/contracts';
import type { ChatProvider } from '@trapmap/server/lib/ai/types.js';
import type { GraphQueryBackend } from '@trapmap/server/lib/graph-query/index.js';
import type { SkillShareerStore } from '@trapmap/server/lib/store.js';
import { syncKnowledgeIndexFromOwner } from './pipeline.js';
import type { AdapterRegistry } from './registry.js';

/**
 * Determine the indexing action for a lifecycle transition.
 *
 * @param previousState - The previous lifecycle state
 * @param nextState - The new lifecycle state
 * @returns The index action to perform: 'upsert', 'remove', or 'noop'
 */
export function determineKnowledgeIndexAction(
  _previousState: LifecycleState,
  nextState: LifecycleState,
): 'upsert' | 'remove' | 'noop' {
  // Transition to approved - sync index
  if (nextState === 'approved') {
    return 'upsert';
  }

  // Transition to deactivated - remove index
  if (nextState === 'deactivated') {
    return 'remove';
  }

  // All other transitions are no-ops for indexing
  // This includes: submitted, agent-pass, agent-rejected, rejected
  return 'noop';
}

/**
 * Run an indexing event for a lifecycle transition.
 *
 * @param args - Event arguments
 * @param args.services - Store and owner-owned indexing dependencies
 * @param args.entryId - ID of the entry being transitioned
 * @param args.previousState - Previous lifecycle state
 * @param args.nextState - New lifecycle state
 * @param args.reason - Reason for the transition
 * @param args.registry - Adapter registry with all registered adapters
 */
export async function runKnowledgeIndexEvent(args: {
  services: {
    store: SkillShareerStore;
    ai?: { chat: ChatProvider };
    graphQueryBackend?: GraphQueryBackend;
    graphIndex?: GraphIndexRepositoryPort;
    knowledgeOwner?: Pick<KnowledgeOwnerPort, 'getIndexingEntry' | 'updateIndexMetadata'>;
  };
  entryId: string;
  previousState: LifecycleState;
  nextState: LifecycleState;
  reason: string;
  registry: AdapterRegistry;
}): Promise<void> {
  const { services, entryId, previousState, nextState, registry } = args;

  const action = determineKnowledgeIndexAction(previousState, nextState);

  if (action === 'noop') return;
  if (!services.knowledgeOwner) {
    throw new Error('Knowledge owner is required for lifecycle indexing');
  }
  await syncKnowledgeIndexFromOwner(services, entryId, registry);
}

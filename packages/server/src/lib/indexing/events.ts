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

import type { LifecycleState } from '@trapmap/contracts';
import type { SkillShareerStore, StoreData } from '../store.js';
import { removeGraphIndexDocumentsForSource } from './graph-lite/store.js';
import { syncKnowledgeIndex } from './pipeline.js';
import type { IndexAdapter } from './types.js';

/**
 * Determine the indexing action for a lifecycle transition.
 *
 * @param previousState - The previous lifecycle state
 * @param nextState - The new lifecycle state
 * @returns The index action to perform: 'upsert', 'remove', or 'noop'
 */
export function determineKnowledgeIndexAction(
  previousState: LifecycleState,
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
 * @param args.services - Store and data snapshot
 * @param args.entryId - ID of the entry being transitioned
 * @param args.previousState - Previous lifecycle state
 * @param args.nextState - New lifecycle state
 * @param args.reason - Reason for the transition
 * @param args.adapters - Array of registered adapters
 */
export async function runKnowledgeIndexEvent(args: {
  services: { store: SkillShareerStore; data: StoreData };
  entryId: string;
  previousState: LifecycleState;
  nextState: LifecycleState;
  reason: string;
  adapters: IndexAdapter[];
}): Promise<void> {
  const { services, entryId, previousState, nextState, adapters } = args;
  const { store } = services;

  const action = determineKnowledgeIndexAction(previousState, nextState);

  // All modifications must be done within a transaction to persist
  await store.transact(async (data) => {
    const entry = data.knowledgeEntries.find((e) => e.id === entryId);
    if (!entry) {
      throw new Error(`Entry ${entryId} not found`);
    }

    switch (action) {
      case 'upsert':
        // Sync the entry to all adapters
        await syncKnowledgeIndex({ store, data }, entryId, adapters);
        break;

      case 'remove':
        // Remove from all adapters
        if (entry.indexState) {
          await Promise.all(
            adapters.map((adapter) =>
              adapter.remove({
                entryId: entry.id,
                revision: entry.history.length,
              }),
            ),
          );
          entry.indexState = null;
          // Also clear embedding cache when index is removed (IDX-06)
          entry.embeddingCache = null;
        }
        // Also remove graph index documents directly (T-36-13)
        removeGraphIndexDocumentsForSource(data, 'trap', entry.id);
        break;

      case 'noop':
        // No action needed for this transition
        break;
    }
  });
}

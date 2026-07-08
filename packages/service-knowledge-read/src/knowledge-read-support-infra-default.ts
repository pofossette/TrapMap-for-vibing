import {
  buildKnowledgeRefinementSystemPrompt,
  buildKnowledgeRefinementSystemPromptBlocks,
} from '@trapmap/server/lib/ai/prompts.js';
import {
  createCacheInvalidationEvent,
  emitCacheInvalidation,
  recordCacheStaleRecovery,
  registerCacheInvalidationListener,
} from '@trapmap/server/lib/cache/invalidation.js';
import { RetrievalCache } from '@trapmap/server/lib/cache/retrieval-cache.js';
import { computeDecayState, loadDecayConfig } from '@trapmap/server/lib/decay/index.js';
import {
  extractGovernanceContext,
  isGovernanceEligible,
  matchesGovernanceFilters,
} from '@trapmap/server/lib/governance/index.js';

import type { KnowledgeReadSupportInfra } from './context.js';
import type { KnowledgeRecord } from './store.js';

function toGovernedEntity(entry: KnowledgeRecord) {
  const config = loadDecayConfig();
  const decayResult = config.enabled ? computeDecayState(entry.decayMeta, config) : null;

  const base = {
    teamId: entry.teamId,
    scope: entry.scope,
    requiredLevel: entry.requiredLevel,
    lifecycleState: entry.lifecycleState,
    labels: entry.labels,
  };

  if (decayResult !== null) {
    return { ...base, decayState: decayResult.decayState };
  }

  return base;
}

export function createDefaultKnowledgeReadSupportInfra(): KnowledgeReadSupportInfra {
  return {
    governance: {
      isEntryEligible(entry, auth, filters) {
        const context = extractGovernanceContext(auth);
        const entity = toGovernedEntity(entry);
        return (
          isGovernanceEligible(entity, context) &&
          matchesGovernanceFilters(entity, {
            scopes: filters.scopes,
            labels: filters.labels,
          })
        );
      },
    },
    cache: {
      createRetrievalReadModelCache(options) {
        return new RetrievalCache(options);
      },
      registerInvalidationListener(options) {
        registerCacheInvalidationListener({
          namespaces: options.namespaces,
          invalidate(event) {
            options.invalidate(event.reason);
          },
        });
      },
      emitInvalidation(reason) {
        emitCacheInvalidation(
          createCacheInvalidationEvent({
            sourceType: 'trap',
            sourceId: 'global',
            reason,
            owner: 'knowledge-lifecycle-projection',
            trigger: 'operator-request',
          }),
        );
      },
      recordStaleRecovery: recordCacheStaleRecovery,
    },
    refinement: {
      buildSystemPrompt: (maxSentences) => buildKnowledgeRefinementSystemPrompt({ maxSentences }),
      buildSystemPromptBlocks: (maxSentences) =>
        buildKnowledgeRefinementSystemPromptBlocks({ maxSentences }),
    },
  };
}

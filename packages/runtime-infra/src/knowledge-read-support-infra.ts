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
import {
  RetrievalCache,
  type RetrievalCacheOptions,
} from '@trapmap/server/lib/cache/retrieval-cache.js';
import { computeDecayState, loadDecayConfig } from '@trapmap/server/lib/decay/index.js';
import {
  extractGovernanceContext,
  isGovernanceEligible,
  matchesGovernanceFilters,
} from '@trapmap/server/lib/governance/index.js';

type RuntimeInfraKnowledgeGovernedEntity = Parameters<typeof isGovernanceEligible>[0];
type RuntimeInfraKnowledgeReadSupportAuth = Parameters<typeof extractGovernanceContext>[0];
type RuntimeInfraKnowledgeReadSupportFilterInput = Parameters<typeof matchesGovernanceFilters>[1];
type RuntimeInfraKnowledgeReadCacheInvalidationReason = Parameters<
  typeof createCacheInvalidationEvent
>[0]['reason'];

export interface RuntimeInfraKnowledgeReadSupportRecord {
  teamId: RuntimeInfraKnowledgeGovernedEntity['teamId'];
  scope: RuntimeInfraKnowledgeGovernedEntity['scope'];
  requiredLevel: RuntimeInfraKnowledgeGovernedEntity['requiredLevel'];
  lifecycleState: RuntimeInfraKnowledgeGovernedEntity['lifecycleState'];
  labels: RuntimeInfraKnowledgeGovernedEntity['labels'];
  decayMeta: Parameters<typeof computeDecayState>[0] | null;
}

export interface RuntimeInfraKnowledgeReadProjectionCache<V> {
  get(key: string): V | null;
  set(key: string, value: V): void;
  clear(): void;
}

export interface RuntimeInfraKnowledgeReadSupportInfra {
  governance: {
    isEntryEligible(
      entry: RuntimeInfraKnowledgeReadSupportRecord,
      auth: RuntimeInfraKnowledgeReadSupportAuth,
      filters: RuntimeInfraKnowledgeReadSupportFilterInput,
    ): boolean;
  };
  cache: {
    createRetrievalReadModelCache<V>(
      options: RetrievalCacheOptions,
    ): RuntimeInfraKnowledgeReadProjectionCache<V>;
    registerInvalidationListener(options: {
      namespaces: readonly string[];
      invalidate(reason: RuntimeInfraKnowledgeReadCacheInvalidationReason): void;
    }): void;
    emitInvalidation(reason: RuntimeInfraKnowledgeReadCacheInvalidationReason): void;
    recordStaleRecovery(namespace: string): void;
  };
  refinement: {
    buildSystemPrompt(
      maxSentences: number,
    ): ReturnType<typeof buildKnowledgeRefinementSystemPrompt>;
    buildSystemPromptBlocks(
      maxSentences: number,
    ): ReturnType<typeof buildKnowledgeRefinementSystemPromptBlocks>;
  };
}

function toGovernedEntity(
  entry: RuntimeInfraKnowledgeReadSupportRecord,
): RuntimeInfraKnowledgeGovernedEntity {
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

export function createDefaultKnowledgeReadSupportInfra(): RuntimeInfraKnowledgeReadSupportInfra {
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

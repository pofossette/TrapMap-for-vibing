import {
  buildRefinementSystemPrompt,
  buildRefinementSystemPromptBlocks,
  isRetrievalEntryEligible,
} from '@trapmap/backend-core';
import { decayConfigSchema } from '@trapmap/contracts';

import type { KnowledgeReadProjectionCache, KnowledgeReadSupportInfra } from './context.js';

function loadDecayConfig() {
  return decayConfigSchema.parse({
    reviewDueDays: Number(process.env.TRAPMAP_DECAY_REVIEW_DUE_DAYS ?? 90),
    staleDays: Number(process.env.TRAPMAP_DECAY_STALE_DAYS ?? 180),
    expireDays: Number(process.env.TRAPMAP_DECAY_EXPIRE_DAYS ?? 365),
    enabled: process.env.TRAPMAP_DECAY_ENABLED === 'true',
  });
}

export function createDefaultKnowledgeReadSupportInfra(): KnowledgeReadSupportInfra {
  const listeners = new Set<
    (
      reason: 'approved' | 'deactivated' | 'remediation-suppressed' | 'remediation-reactivated',
    ) => void
  >();
  return {
    governance: {
      isEntryEligible(entry, auth, filters) {
        return isRetrievalEntryEligible(entry, auth, filters, loadDecayConfig());
      },
    },
    cache: {
      createRetrievalReadModelCache<V>(options: {
        maxSize: number;
        ttlMs: number;
        namespace: string;
      }): KnowledgeReadProjectionCache<V> {
        const values = new Map<string, { value: V; createdAt: number }>();
        return {
          get(key) {
            const entry = values.get(key);
            if (!entry || Date.now() - entry.createdAt > options.ttlMs) return null;
            return entry.value;
          },
          set(key, value) {
            if (values.size >= options.maxSize && !values.has(key)) {
              const oldestKey = values.keys().next().value;
              if (oldestKey !== undefined) values.delete(oldestKey);
            }
            values.set(key, { value, createdAt: Date.now() });
          },
          clear() {
            values.clear();
          },
        };
      },
      registerInvalidationListener(options) {
        listeners.add(options.invalidate);
      },
      emitInvalidation(reason) {
        for (const listener of listeners) listener(reason);
      },
      recordStaleRecovery() {},
    },
    refinement: {
      buildSystemPrompt: buildRefinementSystemPrompt,
      buildSystemPromptBlocks: buildRefinementSystemPromptBlocks,
    },
  };
}

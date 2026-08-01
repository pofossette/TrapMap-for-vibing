import { decayConfigSchema } from '@trapmap/contracts';

import type { KnowledgeReadSupportInfra } from './context.js';

function computeDecayState(entry: {
  decayMeta: {
    lastVerifiedAt: string;
    decayState: string;
    supersededById: string | null;
  } | null;
}): string | undefined {
  if (!entry.decayMeta) return undefined;
  const config = loadDecayConfig();
  if (!config.enabled) return entry.decayMeta.decayState;
  if (entry.decayMeta.supersededById || entry.decayMeta.decayState === 'superseded')
    return 'superseded';
  return decayStateForAge(entry.decayMeta.lastVerifiedAt, config);
}

function loadDecayConfig() {
  return decayConfigSchema.parse({
    reviewDueDays: Number(process.env.TRAPMAP_DECAY_REVIEW_DUE_DAYS ?? 90),
    staleDays: Number(process.env.TRAPMAP_DECAY_STALE_DAYS ?? 180),
    expireDays: Number(process.env.TRAPMAP_DECAY_EXPIRE_DAYS ?? 365),
    enabled: process.env.TRAPMAP_DECAY_ENABLED === 'true',
  });
}

function decayStateForAge(
  lastVerifiedAt: string,
  config: ReturnType<typeof loadDecayConfig>,
): 'active' | 'review-due' | 'stale' | 'expired' {
  const ageDays = (Date.now() - new Date(lastVerifiedAt).getTime()) / 86_400_000;
  if (ageDays >= config.expireDays) return 'expired';
  if (ageDays >= config.staleDays) return 'stale';
  if (ageDays >= config.reviewDueDays) return 'review-due';
  return 'active';
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
        const decayState = computeDecayState(entry);
        return (
          entry.lifecycleState === 'approved' &&
          isEligibleForActor(entry, auth, decayState) &&
          matchesRetrievalFilters(entry, filters)
        );
      },
    },
    cache: {
      createRetrievalReadModelCache(options) {
        const values = new Map<string, { value: unknown; createdAt: number }>();
        return {
          get(key) {
            const entry = values.get(key);
            if (!entry || Date.now() - entry.createdAt > options.ttlMs) return null;
            return entry.value as never;
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
      buildSystemPrompt: (maxSentences) =>
        `You are a knowledge refinement assistant. Keep the response under ${maxSentences} sentences.`,
      buildSystemPromptBlocks: (maxSentences) => [
        {
          type: 'text',
          text: `You are a knowledge refinement assistant. Keep the response under ${maxSentences} sentences.`,
        },
      ],
    },
  };
}

function isEligibleForActor(
  entry: Parameters<KnowledgeReadSupportInfra['governance']['isEntryEligible']>[0],
  auth: Parameters<KnowledgeReadSupportInfra['governance']['isEntryEligible']>[1],
  decayState: string | undefined,
): boolean {
  if (auth.subjectType === 'system-admin') return true;
  return (
    decayState !== 'expired' &&
    decayState !== 'superseded' &&
    auth.securityLevel >= entry.requiredLevel &&
    (entry.teamId === null || entry.teamId === auth.activeTeamId)
  );
}

function matchesRetrievalFilters(
  entry: Parameters<KnowledgeReadSupportInfra['governance']['isEntryEligible']>[0],
  filters: Parameters<KnowledgeReadSupportInfra['governance']['isEntryEligible']>[2],
): boolean {
  return (
    (filters.scopes.length === 0 || filters.scopes.includes(entry.scope)) &&
    filters.labels.every((label) => entry.labels.includes(label))
  );
}

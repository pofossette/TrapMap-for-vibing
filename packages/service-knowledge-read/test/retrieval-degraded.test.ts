import { retrievalQuerySchema } from '@trapmap/contracts';
import { describe, expect, it, vi } from 'vitest';

import type { ResolvedAuthContext, SkillShareerServices } from '../src/context.js';
import { hybridRecall } from '../src/recall/hybrid-channel.js';
import { semanticRecall } from '../src/recall/semantic-channel.js';
import { createDefaultKnowledgeReadRetrievalInfra } from '../src/retrieval-infra-default.js';

/**
 * The DB recall branches answer successfully through the in-memory fallback,
 * so before this the only trace of a broken DB path was a `console.error`.
 * These tests pin the counter that makes the failure visible.
 */

function collector() {
  const degraded: Array<{ endpoint: string; reason: string }> = [];
  return {
    degraded,
    metrics: {
      recordSearch: vi.fn(),
      recordStage: vi.fn(),
      recordChannel: vi.fn(),
      recordDegraded: vi.fn((params: { endpoint: string; reason: string }) => {
        degraded.push({ endpoint: params.endpoint, reason: params.reason });
      }),
    },
  };
}

function buildServices(
  metrics: ReturnType<typeof collector>['metrics'],
  overrides: {
    keywordRecall?: () => Promise<never>;
    vectorSimilaritySearch?: () => Promise<never>;
  },
): SkillShareerServices {
  const infra = createDefaultKnowledgeReadRetrievalInfra();
  return {
    retrievalInfra: {
      ...infra,
      pgRecall: {
        ...infra.pgRecall,
        isEnabled: () => true,
        getPool: () => ({}) as never,
        keywordRecall: overrides.keywordRecall ?? infra.pgRecall.keywordRecall,
        vectorSimilaritySearch:
          overrides.vectorSimilaritySearch ?? infra.pgRecall.vectorSimilaritySearch,
      },
    },
    retrievalMetrics: metrics,
  } as unknown as SkillShareerServices;
}

const auth: ResolvedAuthContext = {
  subjectType: 'user',
  actorId: 'user-1',
  handle: 'user-1',
  activeTeamId: null,
  securityLevel: 0,
  effectivePermissions: [],
  user: null,
  membership: null,
  team: null,
};

const query = retrievalQuerySchema.parse({ seed: 'react refresh', latencyEndpoint: 'v1-search' });

describe('retrieval degraded-path counters', () => {
  it('counts the hybrid DB branch falling back to the in-memory path', async () => {
    const { degraded, metrics } = collector();
    const services = buildServices(metrics, {
      keywordRecall: async () => {
        throw new Error('relation "knowledge_search_documents" does not exist');
      },
    });
    // The call site keeps its console.error for local debugging; assert it is
    // still there without letting the deliberate failure pollute the output.
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await hybridRecall('react refresh', [], query, services, auth);

    expect(degraded).toEqual([{ endpoint: 'v1-search', reason: 'db-search-failed' }]);
    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining('[hybridRecall] DB search failed'),
      expect.anything(),
    );
    logged.mockRestore();
  });

  it('counts the semantic DB branch falling back to the in-memory path', async () => {
    const { degraded, metrics } = collector();
    const services = buildServices(metrics, {
      vectorSimilaritySearch: async () => {
        throw new Error('column "tokens" does not exist');
      },
    });
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await semanticRecall('react refresh', [], query, services, auth);

    expect(degraded).toEqual([{ endpoint: 'v1-search', reason: 'db-vector-search-failed' }]);
    logged.mockRestore();
  });

  it('stays silent when the port is absent', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const infra = createDefaultKnowledgeReadRetrievalInfra();
    const services = {
      retrievalInfra: {
        ...infra,
        pgRecall: {
          ...infra.pgRecall,
          isEnabled: () => true,
          getPool: () => ({}) as never,
          keywordRecall: async () => {
            throw new Error('db down');
          },
        },
      },
    } as unknown as SkillShareerServices;

    await expect(hybridRecall('react refresh', [], query, services, auth)).resolves.toBeDefined();
  });
});

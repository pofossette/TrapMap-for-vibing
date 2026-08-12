import { InvocationError } from '@trapmap/backend-core';
import { describe, expect, it, vi } from 'vitest';

import type { SkillShareerRepos, SkillShareerServices } from './context.js';
import { updateEntryEmbeddingCache } from './search-knowledge.js';

function createServices(): SkillShareerServices {
  return {
    config: {
      ragLog: {
        enabled: false,
        logDir: 'logs/rag',
        maxFileSizeBytes: 1024,
        maxBackupFiles: 1,
      },
    },
    repos: {
      knowledge: {
        getById: vi.fn(async () => null),
        updateEmbeddingCache: vi.fn(),
      },
    } as SkillShareerRepos,
    strategyRegistry: {
      get: vi.fn(),
      all: vi.fn(() => []),
    },
    channelRegistry: {
      get: vi.fn(),
      all: vi.fn(() => []),
    },
    ai: {
      chat: {
        isConfigured: false,
        invoke: vi.fn(),
      },
    },
    store: {},
    graphQuery: {
      backendKind: 'memory',
      failOpen: true,
      mode: 'disabled',
    },
  };
}

describe('updateEntryEmbeddingCache', () => {
  it('throws a backend-core not-found invocation error when the entry is missing', async () => {
    const services = createServices();

    await expect(updateEntryEmbeddingCache(services, 'missing-entry')).rejects.toMatchObject({
      name: 'InvocationError',
      kind: 'not-found',
      message: 'Knowledge entry not found',
    });
    await expect(updateEntryEmbeddingCache(services, 'missing-entry')).rejects.toBeInstanceOf(
      InvocationError,
    );
  });
});

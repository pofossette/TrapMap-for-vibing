import { describe, expect, it, vi } from 'vitest';

import type {
  KnowledgeReadGraphQueryRuntimeState,
  SkillShareerRepos,
  SkillShareerServices,
} from '../src/context.js';
import { generateRefinement } from '../src/response-refinement.js';

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
    repos: {} as SkillShareerRepos,
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
        isConfigured: true,
        invoke: vi.fn(async () => 'fallback-summary'),
        invokeWithBlocks: vi.fn(async () => 'block-summary'),
      },
    },
    store: {},
    knowledgeReadSupportInfra: {
      governance: {
        isEntryEligible: vi.fn(() => true),
      },
      cache: {
        createRetrievalReadModelCache: vi.fn(),
        registerInvalidationListener: vi.fn(),
        emitInvalidation: vi.fn(),
        recordStaleRecovery: vi.fn(),
      },
      refinement: {
        buildSystemPrompt: vi.fn(() => 'system-prompt'),
        buildSystemPromptBlocks: vi.fn(() => [{ type: 'text', text: 'block-prompt' }]),
      },
    },
    graphQuery: {} as KnowledgeReadGraphQueryRuntimeState,
  };
}

describe('generateRefinement', () => {
  it('prefers invokeWithBlocks when the chat provider supports it', async () => {
    const services = createServices();

    const result = await generateRefinement(
      services,
      'how do I deploy this',
      [{ shortcut: 'G1', detail: 'global detail' }],
      [{ shortcut: 'P1', detail: 'project detail' }],
    );

    expect(result).toBe('block-summary');
    expect(
      services.knowledgeReadSupportInfra?.refinement.buildSystemPromptBlocks,
    ).toHaveBeenCalledWith(3);
    expect(services.ai.chat.invokeWithBlocks).toHaveBeenCalledOnce();
    expect(services.ai.chat.invoke).not.toHaveBeenCalled();
  });

  it('falls back to invoke when invokeWithBlocks is unavailable', async () => {
    const services = createServices();
    services.ai.chat.invokeWithBlocks = undefined;

    const result = await generateRefinement(
      services,
      'how do I deploy this',
      [{ shortcut: 'G1', detail: 'global detail' }],
      [],
    );

    expect(result).toBe('fallback-summary');
    expect(services.knowledgeReadSupportInfra?.refinement.buildSystemPrompt).toHaveBeenCalledWith(
      3,
    );
    expect(services.ai.chat.invoke).toHaveBeenCalledWith(
      'system-prompt',
      expect.stringContaining('Search results for "how do I deploy this"'),
    );
  });

  it('returns null when the provider throws', async () => {
    const services = createServices();
    services.ai.chat.invokeWithBlocks = vi.fn(async () => {
      throw new Error('boom');
    });

    await expect(
      generateRefinement(services, 'q', [{ shortcut: 'G1', detail: 'detail' }], []),
    ).resolves.toBeNull();
  });
});

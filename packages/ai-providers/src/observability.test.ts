import { describe, expect, it, vi } from 'vitest';

import type { AiProviders, ChatProvider, EmbeddingsProvider } from './types.js';
import { wrapProvidersWithObservation, type LlmObservationSink } from './observability.js';

function createMockChatProvider(overrides: Partial<ChatProvider> = {}): ChatProvider {
  return {
    provider: 'openai',
    isConfigured: true,
    invoke: vi.fn(async () => 'chat response'),
    invokeWithBlocks: vi.fn(async () => 'blocks response'),
    ...overrides,
  };
}

function createMockEmbeddingsProvider(
  overrides: Partial<EmbeddingsProvider> = {},
): EmbeddingsProvider {
  return {
    provider: 'openai',
    isConfigured: true,
    embed: vi.fn(async () => [0.1, 0.2, 0.3]),
    ...overrides,
  };
}

function createMockSink(): LlmObservationSink {
  return {
    onChatObservation: vi.fn(),
    onEmbeddingObservation: vi.fn(),
  };
}

describe('wrapProvidersWithObservation', () => {
  describe('ChatProvider wrapper', () => {
    it('passes through invoke result unchanged', async () => {
      const inner = createMockChatProvider();
      const sink = createMockSink();
      const wrapped = wrapProvidersWithObservation(
        { chat: inner, embeddings: createMockEmbeddingsProvider() },
        sink,
      );

      const result = await wrapped.chat.invoke('system prompt', 'user message');

      expect(result).toBe('chat response');
      expect(inner.invoke).toHaveBeenCalledWith('system prompt', 'user message');
    });

    it('passes through invokeWithBlocks result unchanged', async () => {
      const inner = createMockChatProvider();
      const sink = createMockSink();
      const wrapped = wrapProvidersWithObservation(
        { chat: inner, embeddings: createMockEmbeddingsProvider() },
        sink,
      );

      const blocks = [{ content: 'block 1' }, { content: 'block 2' }];
      const result = await wrapped.chat.invokeWithBlocks!(blocks, 'user message');

      expect(result).toBe('blocks response');
      expect(inner.invokeWithBlocks).toHaveBeenCalledWith(blocks, 'user message');
    });

    it('preserves provider and isConfigured from inner provider', () => {
      const inner = createMockChatProvider({ provider: 'anthropic', isConfigured: false });
      const sink = createMockSink();
      const wrapped = wrapProvidersWithObservation(
        { chat: inner, embeddings: createMockEmbeddingsProvider() },
        sink,
      );

      expect(wrapped.chat.provider).toBe('anthropic');
      expect(wrapped.chat.isConfigured).toBe(false);
    });

    it('preserves invokeWithBlocks absence when inner provider lacks it', () => {
      const inner = createMockChatProvider();
      delete (inner as Record<string, unknown>).invokeWithBlocks;
      const sink = createMockSink();
      const wrapped = wrapProvidersWithObservation(
        { chat: inner, embeddings: createMockEmbeddingsProvider() },
        sink,
      );

      expect(wrapped.chat.invokeWithBlocks).toBeUndefined();
    });

    it('emits chat observation with approved metadata on success', async () => {
      const inner = createMockChatProvider({ provider: 'openai' });
      const sink = createMockSink();
      const wrapped = wrapProvidersWithObservation(
        { chat: inner, embeddings: createMockEmbeddingsProvider() },
        sink,
      );

      await wrapped.chat.invoke('system prompt', 'user message');

      expect(sink.onChatObservation).toHaveBeenCalledTimes(1);
      const obs = (sink.onChatObservation as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(obs.provider).toBe('openai');
      expect(obs.model).toBe('chat');
      expect(obs.operation).toBe('invoke');
      expect(obs.outcome).toBe('success');
      expect(obs.latencyMs).toBeGreaterThanOrEqual(0);
      expect(obs.error).toBeUndefined();
      expect(obs).toHaveProperty('startTimestamp');
      expect(obs).toHaveProperty('endTimestamp');
    });

    it('emits chat observation with error classification on failure', async () => {
      const inner = createMockChatProvider({
        invoke: vi.fn(async () => {
          throw new Error('rate limited');
        }),
      });
      const sink = createMockSink();
      const wrapped = wrapProvidersWithObservation(
        { chat: inner, embeddings: createMockEmbeddingsProvider() },
        sink,
      );

      await expect(wrapped.chat.invoke('sys', 'user')).rejects.toThrow('rate limited');

      expect(sink.onChatObservation).toHaveBeenCalledTimes(1);
      const obs = (sink.onChatObservation as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(obs.outcome).toBe('error');
      expect(obs.error).toBe('rate limited');
      expect(obs.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('never includes raw prompt content in observation', async () => {
      const inner = createMockChatProvider();
      const sink = createMockSink();
      const wrapped = wrapProvidersWithObservation(
        { chat: inner, embeddings: createMockEmbeddingsProvider() },
        sink,
      );

      await wrapped.chat.invoke('SECRET SYSTEM PROMPT', 'SECRET USER MESSAGE');

      const obs = (sink.onChatObservation as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      const obsStr = JSON.stringify(obs);
      expect(obsStr).not.toContain('SECRET SYSTEM PROMPT');
      expect(obsStr).not.toContain('SECRET USER MESSAGE');
      expect(obsStr).not.toContain('chat response');
    });

    it('never includes raw prompt content in error observation', async () => {
      const inner = createMockChatProvider({
        invoke: vi.fn(async () => {
          throw new Error('SECRET_API_KEY leaked');
        }),
      });
      const sink = createMockSink();
      const wrapped = wrapProvidersWithObservation(
        { chat: inner, embeddings: createMockEmbeddingsProvider() },
        sink,
      );

      await expect(wrapped.chat.invoke('SECRET SYSTEM', 'SECRET USER')).rejects.toThrow();

      const obs = (sink.onChatObservation as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      const obsStr = JSON.stringify(obs);
      expect(obsStr).not.toContain('SECRET SYSTEM');
      expect(obsStr).not.toContain('SECRET USER');
      // Error message is allowed but raw prompts are never included
    });

    it('treats sink failure as safe diagnostic, not provider failure', async () => {
      const inner = createMockChatProvider();
      const sink: LlmObservationSink = {
        onChatObservation: vi.fn(() => {
          throw new Error('sink exploded');
        }),
        onEmbeddingObservation: vi.fn(),
      };
      const wrapped = wrapProvidersWithObservation(
        { chat: inner, embeddings: createMockEmbeddingsProvider() },
        sink,
      );

      // The provider call should succeed despite sink failure
      const result = await wrapped.chat.invoke('sys', 'user');
      expect(result).toBe('chat response');
    });

    it('still returns provider result even when sink throws during invokeWithBlocks', async () => {
      const inner = createMockChatProvider();
      const sink: LlmObservationSink = {
        onChatObservation: vi.fn(() => {
          throw new Error('sink exploded');
        }),
        onEmbeddingObservation: vi.fn(),
      };
      const wrapped = wrapProvidersWithObservation(
        { chat: inner, embeddings: createMockEmbeddingsProvider() },
        sink,
      );

      const result = await wrapped.chat.invokeWithBlocks!([{ content: 'block' }], 'user');
      expect(result).toBe('blocks response');
    });

    it('re-throws provider errors even when sink also throws', async () => {
      const inner = createMockChatProvider({
        invoke: vi.fn(async () => {
          throw new Error('provider error');
        }),
      });
      const sink: LlmObservationSink = {
        onChatObservation: vi.fn(() => {
          throw new Error('sink exploded');
        }),
        onEmbeddingObservation: vi.fn(),
      };
      const wrapped = wrapProvidersWithObservation(
        { chat: inner, embeddings: createMockEmbeddingsProvider() },
        sink,
      );

      await expect(wrapped.chat.invoke('sys', 'user')).rejects.toThrow('provider error');
    });

    it('emits invokeWithBlocks observation with operation=invokeWithBlocks', async () => {
      const inner = createMockChatProvider();
      const sink = createMockSink();
      const wrapped = wrapProvidersWithObservation(
        { chat: inner, embeddings: createMockEmbeddingsProvider() },
        sink,
      );

      await wrapped.chat.invokeWithBlocks!([{ content: 'block' }], 'user');

      const obs = (sink.onChatObservation as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(obs.operation).toBe('invokeWithBlocks');
    });
  });

  describe('EmbeddingsProvider wrapper', () => {
    it('passes through embed result unchanged', async () => {
      const inner = createMockEmbeddingsProvider();
      const sink = createMockSink();
      const wrapped = wrapProvidersWithObservation(
        { chat: createMockChatProvider(), embeddings: inner },
        sink,
      );

      const result = await wrapped.embeddings.embed('test text');

      expect(result).toEqual([0.1, 0.2, 0.3]);
      expect(inner.embed).toHaveBeenCalledWith('test text');
    });

    it('preserves provider and isConfigured from inner provider', () => {
      const inner = createMockEmbeddingsProvider({ provider: 'google', isConfigured: false });
      const sink = createMockSink();
      const wrapped = wrapProvidersWithObservation(
        { chat: createMockChatProvider(), embeddings: inner },
        sink,
      );

      expect(wrapped.embeddings.provider).toBe('google');
      expect(wrapped.embeddings.isConfigured).toBe(false);
    });

    it('emits embedding observation with approved metadata on success', async () => {
      const inner = createMockEmbeddingsProvider({ provider: 'openai' });
      const sink = createMockSink();
      const wrapped = wrapProvidersWithObservation(
        { chat: createMockChatProvider(), embeddings: inner },
        sink,
      );

      await wrapped.embeddings.embed('test text');

      expect(sink.onEmbeddingObservation).toHaveBeenCalledTimes(1);
      const obs = (sink.onEmbeddingObservation as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(obs.provider).toBe('openai');
      expect(obs.model).toBe('embed');
      expect(obs.operation).toBe('embed');
      expect(obs.outcome).toBe('success');
      expect(obs.latencyMs).toBeGreaterThanOrEqual(0);
      expect(obs.inputLength).toBe(9);
      expect(obs.outputDimensions).toBe(3);
      expect(obs.error).toBeUndefined();
    });

    it('emits embedding observation with error on failure', async () => {
      const inner = createMockEmbeddingsProvider({
        embed: vi.fn(async () => {
          throw new Error('quota exceeded');
        }),
      });
      const sink = createMockSink();
      const wrapped = wrapProvidersWithObservation(
        { chat: createMockChatProvider(), embeddings: inner },
        sink,
      );

      await expect(wrapped.embeddings.embed('text')).rejects.toThrow('quota exceeded');

      const obs = (sink.onEmbeddingObservation as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(obs.outcome).toBe('error');
      expect(obs.error).toBe('quota exceeded');
    });

    it('never includes raw text or embedding vector in observation', async () => {
      const inner = createMockEmbeddingsProvider({
        embed: vi.fn(async () => [0.111, 0.222, 0.333]),
      });
      const sink = createMockSink();
      const wrapped = wrapProvidersWithObservation(
        { chat: createMockChatProvider(), embeddings: inner },
        sink,
      );

      await wrapped.embeddings.embed('SECRET EMBEDDING TEXT');

      const obs = (sink.onEmbeddingObservation as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      const obsStr = JSON.stringify(obs);
      expect(obsStr).not.toContain('SECRET EMBEDDING TEXT');
      expect(obsStr).not.toContain('0.111');
      expect(obsStr).not.toContain('0.222');
      expect(obsStr).not.toContain('0.333');
      // Only lengths/dimensions are included
      expect(obs.inputLength).toBe('SECRET EMBEDDING TEXT'.length);
      expect(obs.outputDimensions).toBe(3);
    });

    it('treats sink failure as safe diagnostic, not provider failure', async () => {
      const inner = createMockEmbeddingsProvider();
      const sink: LlmObservationSink = {
        onChatObservation: vi.fn(),
        onEmbeddingObservation: vi.fn(() => {
          throw new Error('sink exploded');
        }),
      };
      const wrapped = wrapProvidersWithObservation(
        { chat: createMockChatProvider(), embeddings: inner },
        sink,
      );

      const result = await wrapped.embeddings.embed('text');
      expect(result).toEqual([0.1, 0.2, 0.3]);
    });

    it('re-throws provider errors even when sink also throws', async () => {
      const inner = createMockEmbeddingsProvider({
        embed: vi.fn(async () => {
          throw new Error('provider error');
        }),
      });
      const sink: LlmObservationSink = {
        onChatObservation: vi.fn(),
        onEmbeddingObservation: vi.fn(() => {
          throw new Error('sink exploded');
        }),
      };
      const wrapped = wrapProvidersWithObservation(
        { chat: createMockChatProvider(), embeddings: inner },
        sink,
      );

      await expect(wrapped.embeddings.embed('text')).rejects.toThrow('provider error');
    });
  });

  describe('correlation IDs', () => {
    it('passes correlation context from wrapper options to chat observation', async () => {
      const inner = createMockChatProvider();
      const sink = createMockSink();
      const wrapped = wrapProvidersWithObservation(
        { chat: inner, embeddings: createMockEmbeddingsProvider() },
        sink,
        {
          traceId: 'trace-123',
          requestId: 'req-456',
          operationId: 'op-789',
        },
      );

      await wrapped.chat.invoke('sys', 'user');

      const obs = (sink.onChatObservation as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(obs.traceId).toBe('trace-123');
      expect(obs.requestId).toBe('req-456');
      expect(obs.operationId).toBe('op-789');
    });

    it('passes correlation context from wrapper options to embedding observation', async () => {
      const inner = createMockEmbeddingsProvider();
      const sink = createMockSink();
      const wrapped = wrapProvidersWithObservation(
        { chat: createMockChatProvider(), embeddings: inner },
        sink,
        {
          traceId: 'trace-123',
          requestId: 'req-456',
          operationId: 'op-789',
        },
      );

      await wrapped.embeddings.embed('text');

      const obs = (sink.onEmbeddingObservation as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(obs.traceId).toBe('trace-123');
      expect(obs.requestId).toBe('req-456');
      expect(obs.operationId).toBe('op-789');
    });

    it('omits correlation IDs when not provided', async () => {
      const inner = createMockChatProvider();
      const sink = createMockSink();
      const wrapped = wrapProvidersWithObservation(
        { chat: inner, embeddings: createMockEmbeddingsProvider() },
        sink,
      );

      await wrapped.chat.invoke('sys', 'user');

      const obs = (sink.onChatObservation as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(obs.traceId).toBeUndefined();
      expect(obs.requestId).toBeUndefined();
      expect(obs.operationId).toBeUndefined();
    });
  });

  describe('no-op when no sink provided', () => {
    it('passes through chat invoke without errors when sink is undefined', async () => {
      const inner = createMockChatProvider();
      const wrapped = wrapProvidersWithObservation({
        chat: inner,
        embeddings: createMockEmbeddingsProvider(),
      });

      const result = await wrapped.chat.invoke('sys', 'user');
      expect(result).toBe('chat response');
    });

    it('passes through embed without errors when sink is undefined', async () => {
      const inner = createMockEmbeddingsProvider();
      const wrapped = wrapProvidersWithObservation({
        chat: createMockChatProvider(),
        embeddings: inner,
      });

      const result = await wrapped.embeddings.embed('text');
      expect(result).toEqual([0.1, 0.2, 0.3]);
    });
  });
});

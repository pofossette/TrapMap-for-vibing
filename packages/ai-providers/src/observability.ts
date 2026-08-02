/**
 * Vendor-neutral LLM observation wrapper for AI providers.
 *
 * This module wraps ChatProvider and EmbeddingsProvider to emit best-effort
 * observation metadata after each call. It does NOT import any vendor SDK
 * (e.g. langfuse); the actual sink is injected by the host composition root.
 *
 * Design constraints:
 * - Raw prompts, outputs, embedding vectors, request bodies, credentials,
 *   and dynamic IDs never leave the wrapper.
 * - Only approved metadata is emitted: provider, model, operation/task
 *   category, start/end/latency, outcome/error classification,
 *   available token counts, hashes/lengths, and OTel correlation IDs.
 * - Sink failure is treated as a safe diagnostic, never as a provider failure.
 */

import type { AiPromptBlock, AiProviders, ChatProvider, EmbeddingsProvider } from './types.js';

// ---------------------------------------------------------------------------
// Observation types (vendor-neutral)
// ---------------------------------------------------------------------------

export interface ChatObservation {
  readonly provider: string;
  readonly model: string;
  readonly operation: 'invoke' | 'invokeWithBlocks';
  readonly outcome: 'success' | 'error';
  readonly latencyMs: number;
  readonly startTimestamp: string;
  readonly endTimestamp: string;
  readonly error?: string;
  readonly traceId?: string;
  readonly requestId?: string;
  readonly operationId?: string;
}

export interface EmbeddingObservation {
  readonly provider: string;
  readonly model: string;
  readonly operation: 'embed';
  readonly outcome: 'success' | 'error';
  readonly latencyMs: number;
  readonly startTimestamp: string;
  readonly endTimestamp: string;
  readonly inputLength?: number;
  readonly outputDimensions?: number;
  readonly error?: string;
  readonly traceId?: string;
  readonly requestId?: string;
  readonly operationId?: string;
}

/**
 * Vendor-neutral observation sink. Host composition roots inject an
 * implementation that forwards to the actual backend (Langfuse, console, etc.).
 */
export interface LlmObservationSink {
  onChatObservation(observation: ChatObservation): void;
  onEmbeddingObservation(observation: EmbeddingObservation): void;
}

/**
 * Optional correlation context from OTel or request middleware.
 */
export interface ObservationCorrelationContext {
  traceId?: string;
  requestId?: string;
  operationId?: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function safeInvokeSink(fn: () => void): void {
  try {
    fn();
  } catch {
    // Sink failure is a safe diagnostic; never affects the provider path.
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Wrap AI providers with best-effort observation.
 *
 * When `sink` is omitted or undefined, providers pass through without
 * any observation overhead.
 *
 * @param providers - The original AI providers to wrap.
 * @param sink - Optional observation sink to receive metadata.
 * @param correlation - Optional OTel/request correlation IDs.
 * @returns New providers with identical interface and semantics.
 */
export function wrapProvidersWithObservation(
  providers: AiProviders,
  sink?: LlmObservationSink,
  correlation?: ObservationCorrelationContext,
): AiProviders {
  if (!sink) {
    return providers;
  }

  return {
    chat: wrapChatProvider(providers.chat, sink, correlation),
    embeddings: wrapEmbeddingsProvider(providers.embeddings, sink, correlation),
  };
}

function wrapChatProvider(
  inner: ChatProvider,
  sink: LlmObservationSink,
  correlation?: ObservationCorrelationContext,
): ChatProvider {
  const wrapped: ChatProvider = {
    get provider() {
      return inner.provider;
    },
    get isConfigured() {
      return inner.isConfigured;
    },
    async invoke(systemPrompt: string, userMessage: string): Promise<string> {
      const startTimestamp = new Date().toISOString();
      const startTime = performance.now();
      try {
        const result = await inner.invoke(systemPrompt, userMessage);
        const endTime = performance.now();
        safeInvokeSink(() =>
          sink.onChatObservation({
            provider: inner.provider,
            model: 'chat',
            operation: 'invoke',
            outcome: 'success',
            latencyMs: Math.round(endTime - startTime),
            startTimestamp,
            endTimestamp: new Date().toISOString(),
            ...correlation,
          }),
        );
        return result;
      } catch (error) {
        const endTime = performance.now();
        safeInvokeSink(() =>
          sink.onChatObservation({
            provider: inner.provider,
            model: 'chat',
            operation: 'invoke',
            outcome: 'error',
            latencyMs: Math.round(endTime - startTime),
            startTimestamp,
            endTimestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : String(error),
            ...correlation,
          }),
        );
        throw error;
      }
    },
  };

  if (inner.invokeWithBlocks) {
    wrapped.invokeWithBlocks = async (
      blocks: AiPromptBlock[],
      userMessage: string,
    ): Promise<string> => {
      const startTimestamp = new Date().toISOString();
      const startTime = performance.now();
      try {
        const result = await inner.invokeWithBlocks!(blocks, userMessage);
        const endTime = performance.now();
        safeInvokeSink(() =>
          sink.onChatObservation({
            provider: inner.provider,
            model: 'chat',
            operation: 'invokeWithBlocks',
            outcome: 'success',
            latencyMs: Math.round(endTime - startTime),
            startTimestamp,
            endTimestamp: new Date().toISOString(),
            ...correlation,
          }),
        );
        return result;
      } catch (error) {
        const endTime = performance.now();
        safeInvokeSink(() =>
          sink.onChatObservation({
            provider: inner.provider,
            model: 'chat',
            operation: 'invokeWithBlocks',
            outcome: 'error',
            latencyMs: Math.round(endTime - startTime),
            startTimestamp,
            endTimestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : String(error),
            ...correlation,
          }),
        );
        throw error;
      }
    };
  }

  return wrapped;
}

function wrapEmbeddingsProvider(
  inner: EmbeddingsProvider,
  sink: LlmObservationSink,
  correlation?: ObservationCorrelationContext,
): EmbeddingsProvider {
  return {
    get provider() {
      return inner.provider;
    },
    get isConfigured() {
      return inner.isConfigured;
    },
    async embed(text: string): Promise<number[]> {
      const startTimestamp = new Date().toISOString();
      const startTime = performance.now();
      try {
        const result = await inner.embed(text);
        const endTime = performance.now();
        safeInvokeSink(() =>
          sink.onEmbeddingObservation({
            provider: inner.provider,
            model: 'embed',
            operation: 'embed',
            outcome: 'success',
            latencyMs: Math.round(endTime - startTime),
            startTimestamp,
            endTimestamp: new Date().toISOString(),
            inputLength: text.length,
            outputDimensions: result.length,
            ...correlation,
          }),
        );
        return result;
      } catch (error) {
        const endTime = performance.now();
        safeInvokeSink(() =>
          sink.onEmbeddingObservation({
            provider: inner.provider,
            model: 'embed',
            operation: 'embed',
            outcome: 'error',
            latencyMs: Math.round(endTime - startTime),
            startTimestamp,
            endTimestamp: new Date().toISOString(),
            inputLength: text.length,
            error: error instanceof Error ? error.message : String(error),
            ...correlation,
          }),
        );
        throw error;
      }
    },
  };
}

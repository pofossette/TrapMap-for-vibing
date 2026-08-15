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
  /** Input token count, if reported by the provider. */
  readonly inputTokens?: number;
  /** Output token count, if reported by the provider. */
  readonly outputTokens?: number;
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
  /** Input token count, if reported by the provider. */
  readonly inputTokens?: number;
  /** Output token count, if reported by the provider. */
  readonly outputTokens?: number;
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

/**
 * A correlation source is either a static context or a getter function
 * that resolves the context at observation time. Getter functions allow
 * the wrapper to pick up per-request correlation IDs from AsyncLocalStorage
 * without requiring them at composition time.
 */
export type ObservationCorrelationSource =
  | ObservationCorrelationContext
  | (() => ObservationCorrelationContext | undefined);

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

/**
 * Resolve a correlation source to a concrete context.
 * If the source is a function, it is called at observation time.
 */
function resolveCorrelation(
  source?: ObservationCorrelationSource,
): ObservationCorrelationContext | undefined {
  if (!source) return undefined;
  if (typeof source === 'function') {
    try {
      return source();
    } catch {
      // Getter failure is a safe diagnostic; correlation is best-effort.
      return undefined;
    }
  }
  return source;
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
 * @param correlation - Optional OTel/request correlation IDs. May be a
 *   static object or a getter function for per-request resolution.
 * @returns New providers with identical interface and semantics.
 */
export function wrapProvidersWithObservation(
  providers: AiProviders,
  sink?: LlmObservationSink,
  correlation?: ObservationCorrelationSource,
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
  correlation?: ObservationCorrelationSource,
): ChatProvider {
  const emitChatObservation = (
    operation: 'invoke' | 'invokeWithBlocks',
    outcome: 'error' | 'success',
    startTimestamp: string,
    startTime: number,
    error?: unknown,
  ): void => {
    const endTime = performance.now();
    const resolved = resolveCorrelation(correlation);
    safeInvokeSink(() =>
      sink.onChatObservation({
        provider: inner.provider,
        model: inner.provider,
        operation,
        outcome,
        latencyMs: Math.round(endTime - startTime),
        startTimestamp,
        endTimestamp: new Date().toISOString(),
        ...(error !== undefined
          ? { error: error instanceof Error ? error.message : String(error) }
          : {}),
        ...resolved,
      }),
    );
  };

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
        emitChatObservation('invoke', 'success', startTimestamp, startTime);
        return result;
      } catch (error) {
        emitChatObservation('invoke', 'error', startTimestamp, startTime, error);
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
        emitChatObservation('invokeWithBlocks', 'success', startTimestamp, startTime);
        return result;
      } catch (error) {
        emitChatObservation('invokeWithBlocks', 'error', startTimestamp, startTime, error);
        throw error;
      }
    };
  }

  return wrapped;
}

function wrapEmbeddingsProvider(
  inner: EmbeddingsProvider,
  sink: LlmObservationSink,
  correlation?: ObservationCorrelationSource,
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
        const resolved = resolveCorrelation(correlation);
        safeInvokeSink(() =>
          sink.onEmbeddingObservation({
            provider: inner.provider,
            model: inner.provider,
            operation: 'embed',
            outcome: 'success',
            latencyMs: Math.round(endTime - startTime),
            startTimestamp,
            endTimestamp: new Date().toISOString(),
            inputLength: text.length,
            outputDimensions: result.length,
            ...resolved,
          }),
        );
        return result;
      } catch (error) {
        const endTime = performance.now();
        const resolved = resolveCorrelation(correlation);
        safeInvokeSink(() =>
          sink.onEmbeddingObservation({
            provider: inner.provider,
            model: inner.provider,
            operation: 'embed',
            outcome: 'error',
            latencyMs: Math.round(endTime - startTime),
            startTimestamp,
            endTimestamp: new Date().toISOString(),
            inputLength: text.length,
            error: error instanceof Error ? error.message : String(error),
            ...resolved,
          }),
        );
        throw error;
      }
    },
  };
}

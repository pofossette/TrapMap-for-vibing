/**
 * Centralized Vercel AI SDK adapter.
 *
 * This module is the ONLY place in the repo that imports `ai` and
 * `@ai-sdk/*` provider packages. All LLM calls (chat + embeddings,
 * including temperature / structured variants) flow through these helpers,
 * so provider selection, baseURL/auth wiring, and SDK upgrade fallout are
 * contained here.
 *
 * Design:
 * - `resolveChatModel(config)` / `resolveEmbeddingModel(...)` map the
 *   vendor-neutral `AiProviderConfig` to an AI SDK `LanguageModel` /
 *   `EmbeddingModel`. Consumers never touch provider SDKs directly.
 * - `generateChatText` / `embedSingle` / `embedBatch` wrap `generateText` /
 *   `embed` / `embedMany` with a stable error surface.
 *
 * Official API mapping (AI SDK docs):
 * - chat text: `generateText({ model, system, prompt, temperature })`
 * - single embedding: `embed({ model, value })`
 * - batch embeddings: `embedMany({ model, values })`
 */

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { EmbeddingModel, LanguageModel } from 'ai';
import { embed, embedMany, generateText } from 'ai';

import type { AiProviderConfig } from '../provider-config.js';

export interface ResolvedChatModel {
  model: LanguageModel;
  provider: string;
  modelId: string;
}

export interface ResolvedEmbeddingModel {
  model: EmbeddingModel;
  provider: string;
  modelId: string;
}

function normalizedBaseUrl(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.replace(/\/+$/, '') : undefined;
}

/**
 * Resolve an AI SDK chat (language) model from vendor-neutral config.
 * OpenAI-compatible endpoints (including Ollama's `/v1`) share the
 * OpenAI-Compatible provider; native Google GenAI uses the Google provider.
 */
export function resolveChatModel(config: AiProviderConfig): ResolvedChatModel {
  const provider = config.provider;
  const modelId = config.chatModel;

  if (provider === 'google-genai') {
    const baseURL = normalizedBaseUrl(config.baseUrl);
    const google = createGoogleGenerativeAI(
      baseURL ? { apiKey: config.apiKey, baseURL } : { apiKey: config.apiKey },
    );
    return { model: google.chat(modelId), provider, modelId };
  }

  if (provider === 'openai') {
    const baseURL = normalizedBaseUrl(config.baseUrl);
    const openai = createOpenAI(
      baseURL && baseURL !== 'https://api.openai.com/v1'
        ? { apiKey: config.apiKey, baseURL }
        : { apiKey: config.apiKey },
    );
    return { model: openai.chat(modelId), provider, modelId };
  }

  // 'openai-compatible' | 'ollama' (and any future OpenAI-wire endpoint)
  const baseURL = normalizedBaseUrl(config.baseUrl);
  if (!baseURL) {
    throw new Error(`OpenAI-compatible chat provider requires a baseUrl (provider=${provider})`);
  }
  const compatible = createOpenAICompatible({
    name: provider,
    apiKey: config.apiKey,
    baseURL,
  });
  return { model: compatible.chatModel(modelId), provider, modelId };
}

export interface EmbeddingModelConfig {
  readonly provider: string;
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
}

/**
 * Resolve an AI SDK embedding model from a flattened embedding config.
 * Kept separate from `AiProviderConfig` so the split embedding-provider
 * override (`embeddingProvider`) reuses the same path.
 */
export function resolveEmbeddingModel(config: EmbeddingModelConfig): ResolvedEmbeddingModel {
  const provider = config.provider;
  const modelId = config.model;

  if (provider === 'google-genai') {
    const baseURL = normalizedBaseUrl(config.baseUrl);
    const google = createGoogleGenerativeAI(
      baseURL ? { apiKey: config.apiKey, baseURL } : { apiKey: config.apiKey },
    );
    return { model: google.textEmbeddingModel(modelId), provider, modelId };
  }

  if (provider === 'openai') {
    const baseURL = normalizedBaseUrl(config.baseUrl ?? '');
    const openai = createOpenAI(
      baseURL && baseURL !== 'https://api.openai.com/v1'
        ? { apiKey: config.apiKey, baseURL }
        : { apiKey: config.apiKey },
    );
    return { model: openai.embedding(modelId), provider, modelId };
  }

  const baseURL = normalizedBaseUrl(config.baseUrl);
  if (!baseURL) {
    throw new Error(
      `OpenAI-compatible embedding provider requires a baseUrl (provider=${provider})`,
    );
  }
  const compatible = createOpenAICompatible({
    name: provider,
    apiKey: config.apiKey,
    baseURL,
  });
  return { model: compatible.embeddingModel(modelId), provider, modelId };
}

export function toEmbeddingConfig(config: AiProviderConfig): EmbeddingModelConfig {
  return {
    provider: config.provider,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model: config.embeddingModel,
  };
}

/** Generate chat text via AI SDK. Centralizes all `generateText` calls. */
export async function generateChatText(options: {
  resolved: ResolvedChatModel;
  system: string;
  prompt: string;
  temperature?: number;
}): Promise<string> {
  const { text } = await generateText({
    model: options.resolved.model,
    system: options.system,
    prompt: options.prompt,
    ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
  });
  return text;
}

/** Embed a single value via AI SDK. Centralizes all `embed` calls. */
export async function embedSingle(
  resolved: ResolvedEmbeddingModel,
  value: string,
): Promise<number[]> {
  const { embedding } = await embed({ model: resolved.model, value });
  return embedding;
}

/** Embed a batch via AI SDK. Centralizes all `embedMany` calls. */
export async function embedBatch(
  resolved: ResolvedEmbeddingModel,
  values: string[],
): Promise<number[][]> {
  const { embeddings } = await embedMany({ model: resolved.model, values });
  return embeddings;
}

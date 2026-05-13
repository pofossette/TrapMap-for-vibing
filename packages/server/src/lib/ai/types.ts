import type { PromptBlock } from './cache/api-integration.js';

export interface EmbeddingsProvider {
  readonly provider: string;
  readonly isConfigured: boolean;
  embed(text: string): Promise<number[]>;
}

export interface ChatProvider {
  readonly provider: string;
  readonly isConfigured: boolean;
  invoke(systemPrompt: string, userMessage: string): Promise<string>;
  invokeWithBlocks?(blocks: PromptBlock[], userMessage: string): Promise<string>;
}

export interface AiProviders {
  embeddings: EmbeddingsProvider;
  chat: ChatProvider;
}

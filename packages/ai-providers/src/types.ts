export interface AiPromptBlock {
  content: string;
}

export interface EmbeddingsProvider {
  readonly provider: string;
  readonly isConfigured: boolean;
  readonly model?: string | null;
  embed(text: string): Promise<number[]>;
  embedMany?(texts: string[]): Promise<number[][]>;
}

export interface ChatProvider {
  readonly provider: string;
  readonly isConfigured: boolean;
  readonly model?: string | null;
  invoke(systemPrompt: string, userMessage: string): Promise<string>;
  invokeWithTemperature?(
    systemPrompt: string,
    userMessage: string,
    temperature: number,
  ): Promise<string>;
  invokeWithBlocks?(blocks: AiPromptBlock[], userMessage: string): Promise<string>;
}

export interface AiProviders {
  embeddings: EmbeddingsProvider;
  chat: ChatProvider;
}

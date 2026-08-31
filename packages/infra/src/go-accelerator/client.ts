import type { GoAcceleratorConfig } from './types.js';

export interface GoAcceleratorClientOptions extends GoAcceleratorConfig {
  fetchImpl?: typeof fetch;
}

export class GoAcceleratorClient {
  private readonly config: GoAcceleratorConfig;
  private readonly fetchImpl: typeof fetch;

  constructor(options: GoAcceleratorClientOptions) {
    this.config = {
      enabled: options.enabled,
      baseUrl: options.baseUrl.replace(/\/$/, ''),
      timeoutMs: options.timeoutMs,
    };
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  get isEnabled(): boolean {
    return this.config.enabled;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    if (!this.config.enabled) {
      throw new Error('Go accelerator disabled');
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.config.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Go accelerator ${path} failed: ${res.status} ${text}`);
      }
      return (await res.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  async canonicalHash(payload: unknown): Promise<{ canonical: string; hash: string }> {
    return this.post('/v1/hash/canonical', { payload });
  }

  async cosine(
    a: number[],
    b: number[],
  ): Promise<{ similarity: number; normA: number; normB: number }> {
    return this.post('/v1/vector/cosine', { a, b });
  }

  async batchCosine(query: number[], vectors: number[][]): Promise<{ scores: number[] }> {
    return this.post('/v1/vector/batch-cosine', { query, vectors });
  }

  async tokenize(
    text: string,
    chunkSize?: number,
    overlap?: number,
  ): Promise<{ tokens: string[]; chunks: string[]; count: number }> {
    return this.post('/v1/text/tokenize', { text, chunkSize, overlap });
  }

  async retrievalScore(params: {
    entries: Array<{
      id: string;
      scope: string;
      labels: string[];
      requiredLevel: number;
      shortcut: string;
      detail: string;
      score?: number;
    }>;
    query: string;
    filters: { labels: string[]; scopes: string[] };
    limit?: number;
  }): Promise<{ globalConstraints: unknown[]; projectKnowledge: unknown[]; reason: string }> {
    return this.post('/v1/retrieval/score', params);
  }

  async geneSelect(params: {
    candidates: Array<{
      geneId: string;
      semanticScore: number;
      keywordScore: number;
      exactSignalMatch: boolean;
      errorTextMatch: boolean;
      boundaryMatch: boolean;
      freshValidation: boolean;
      broadMatch: boolean;
      sourceKind: string;
    }>;
    query: string;
    maxResults?: number;
  }): Promise<{ selected: Array<{ geneId: string; score: number; reasons: string[] }> }> {
    return this.post('/v1/gene/select', params);
  }

  async health(): Promise<{ status: string; service: string }> {
    const res = await this.fetchImpl(`${this.config.baseUrl}/health`);
    if (!res.ok) throw new Error(`health failed ${res.status}`);
    return (await res.json()) as { status: string; service: string };
  }
}

export function createGoAcceleratorClientFromEnv(
  env: Record<string, string | undefined>,
): GoAcceleratorClient {
  const enabled =
    env.TRAPMAP_GO_ACCELERATOR_ENABLED === 'true' || env.GO_ACCELERATOR_ENABLED === 'true';
  const baseUrl =
    env.TRAPMAP_GO_ACCELERATOR_URL ?? env.GO_ACCELERATOR_URL ?? 'http://localhost:4100';
  const timeoutMs = Number.parseInt(env.TRAPMAP_GO_ACCELERATOR_TIMEOUT_MS ?? '3000', 10);
  return new GoAcceleratorClient({
    enabled,
    baseUrl,
    timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 3000,
  });
}

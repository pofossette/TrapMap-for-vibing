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

  async fallbackVector(text: string, dim?: number): Promise<{ vector: number[]; dim: number }> {
    return this.post('/v1/vector/fallback', { text, dim });
  }

  async rankingBatch(params: {
    entries: Array<{
      id: string;
      semanticScore: number;
      keywordScore: number;
      graphScore?: number;
      channelScores: Record<string, number>;
      combinedScore: number;
      tokenMatches: Array<{ token: string; fields: string[] }>;
      channels: string[];
      preRerankScore: number;
      finalScore: number;
      labels: string[];
      scope: string;
      shortcut: string;
      detail: string;
      decayState?: string;
      boundary?: { context?: string[]; exclusions?: Array<{ kind: string; description: string }> };
    }>;
    semanticEntries?: typeof params.entries;
    keywordEntries?: typeof params.entries;
    graphEntries?: typeof params.entries;
    queryTokens?: string[];
    maxCandidates?: number;
    boundaryContext?: { contexts: string[]; platform?: string };
  }): Promise<{ merged: typeof params.entries }> {
    return this.post('/v1/retrieval/ranking-batch', params);
  }

  async keywordScore(params: {
    queryTokens: string[];
    entryTokens: { shortcut: string[]; detail: string[]; labels: string[] };
  }): Promise<{ score: number; tokenMatches: Array<{ token: string; fields: string[] }> }> {
    return this.post('/v1/retrieval/keyword-score', params);
  }

  async dedupFingerprint(parts: string[]): Promise<{ fingerprint: string }> {
    return this.post('/v1/dedup/fingerprint', { parts });
  }

  async dedupSimilarity(
    leftTokens: string[],
    rightTokens: string[],
  ): Promise<{ similarity: number; sharedCount: number; unionCount: number }> {
    return this.post('/v1/dedup/similarity', { leftTokens, rightTokens });
  }

  async geneDeriveBatch(
    traps: Array<{ trapId: string; trapText: string; derivationUnitId: string }>,
  ): Promise<{
    results: Array<{
      trapId: string;
      derivationUnitId: string;
      sections: {
        MATCH: string[];
        GOAL: string[];
        STRATEGY: string[];
        AVOID: string[];
        VERIFY: string[];
      };
      contentHash: string;
      sourceHash: string;
    }>;
  }> {
    return this.post('/v1/gene/derive-batch', { traps });
  }

  async health(): Promise<{ status: string; service: string }> {
    const res = await this.fetchImpl(`${this.config.baseUrl}/health`);
    if (!res.ok) throw new Error(`health failed ${res.status}`);
    return (await res.json()) as { status: string; service: string };
  }
}

let cachedClient: GoAcceleratorClient | null = null;

export function getGoAcceleratorClient(): GoAcceleratorClient {
  if (cachedClient) return cachedClient;
  const env =
    typeof process !== 'undefined' ? (process.env as Record<string, string | undefined>) : {};
  cachedClient = createGoAcceleratorClientFromEnv(env);
  return cachedClient;
}

export function setGoAcceleratorClient(client: GoAcceleratorClient | null): void {
  cachedClient = client;
}

export function resetGoAcceleratorClient(): void {
  cachedClient = null;
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

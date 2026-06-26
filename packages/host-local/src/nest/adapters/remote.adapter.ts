import {
  InvocationError,
  type KnowledgeReadPort,
  type KnowledgeEntryRecord,
  type RetrievalSearchResponse,
  type ReadModelProjectionStatus,
} from '@trapmap/backend-core';

/**
 * Remote adapter for KnowledgeReadPort.
 *
 * Used in the distributed profile when the gateway needs to call
 * a separate knowledge-read service over HTTP.
 *
 * Per Phase 1 rules:
 * - Remote adapter must NOT leak fetch Response, URL, HTTP headers,
 *   or status-code switches to the caller.
 * - Caller only sees Port return values or InvocationError.
 * - Propagates requestId/traceId headers for observability.
 */
export class RemoteKnowledgeReadAdapter implements KnowledgeReadPort {
  constructor(
    private readonly baseUrl: string,
    private readonly getHeaders?: () => Record<string, string>,
    private readonly timeoutMs = 10_000,
  ) {}

  async getById(entryId: string): Promise<KnowledgeEntryRecord | null> {
    const response = await this.fetch(`GET`, `/internal/knowledge/${encodeURIComponent(entryId)}`);

    if (response.status === 404) {
      return null;
    }

    return this.parseJson<KnowledgeEntryRecord>(response);
  }

  async listMine(userId: string, teamId?: string): Promise<KnowledgeEntryRecord[]> {
    const params = new URLSearchParams({ userId });
    if (teamId) {
      params.set('teamId', teamId);
    }
    const response = await this.fetch('GET', `/internal/knowledge/mine?${params.toString()}`);
    return this.parseJson<KnowledgeEntryRecord[]>(response);
  }

  async search(params: {
    query: string;
    teamId?: string;
    limit?: number;
  }): Promise<RetrievalSearchResponse> {
    const response = await this.fetch('POST', '/internal/retrieval/search', {
      query: params.query,
      ...(params.teamId !== undefined ? { teamId: params.teamId } : {}),
      ...(params.limit !== undefined ? { limit: params.limit } : {}),
    });
    return this.parseJson<RetrievalSearchResponse>(response);
  }

  async getProjectionStatus(): Promise<ReadModelProjectionStatus> {
    const response = await this.fetch('GET', '/internal/knowledge-read/projection-status');
    return this.parseJson<ReadModelProjectionStatus>(response);
  }

  private async fetch(method: string, path: string, body?: unknown): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      ...this.getHeaders?.(),
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await globalThis.fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      return response;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw InvocationError.timeout(
          `Remote knowledge-read call timed out after ${this.timeoutMs}ms`,
        );
      }
      throw InvocationError.unavailable(
        `Remote knowledge-read service unavailable: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private async parseJson<T>(response: Response): Promise<T> {
    if (!response.ok) {
      throw this.mapHttpError(response);
    }
    try {
      return (await response.json()) as T;
    } catch {
      throw InvocationError.internal('Failed to parse remote response body');
    }
  }

  private mapHttpError(response: Response): InvocationError {
    const { status } = response;
    switch (status) {
      case 400:
        return InvocationError.validation('Remote validation error');
      case 403:
        return InvocationError.forbidden('Remote access denied');
      case 404:
        return InvocationError.notFound('Remote resource not found');
      case 409:
        return InvocationError.conflict('Remote state conflict');
      case 503:
        return InvocationError.unavailable('Remote service unavailable');
      case 504:
        return InvocationError.timeout('Remote service timeout');
      default:
        return InvocationError.internal(`Remote error: HTTP ${status}`);
    }
  }
}

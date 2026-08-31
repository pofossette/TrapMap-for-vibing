import { describe, expect, it, vi } from 'vitest';
import { GoAcceleratorClient } from '../src/go-accelerator/client.js';
import {
  batchCosineWithFallback,
  canonicalHashWithFallback,
  cosineWithFallback,
} from '../src/go-accelerator/fallback.js';

describe('go-accelerator client fallback', () => {
  it('canonicalHash fallback when disabled', async () => {
    const client = new GoAcceleratorClient({
      enabled: false,
      baseUrl: 'http://localhost:4100',
      timeoutMs: 1000,
    });
    const { hash, canonical } = await canonicalHashWithFallback({ a: 1, b: 2 }, client);
    expect(canonical).toBe('{"a":1,"b":2}');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('cosine fallback when disabled', async () => {
    const client = new GoAcceleratorClient({
      enabled: false,
      baseUrl: 'http://localhost:4100',
      timeoutMs: 1000,
    });
    const sim = await cosineWithFallback([1, 0, 0], [1, 0, 0], client);
    expect(sim).toBe(1);
  });

  it('batchCosine fallback when disabled', async () => {
    const client = new GoAcceleratorClient({
      enabled: false,
      baseUrl: 'http://localhost:4100',
      timeoutMs: 1000,
    });
    const scores = await batchCosineWithFallback(
      [1, 0],
      [
        [1, 0],
        [0, 1],
      ],
      client,
    );
    expect(scores[0]).toBeGreaterThan(scores[1]);
  });

  it('uses Go when enabled and succeeds', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ similarity: 0.9, normA: 1, normB: 1 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    const client = new GoAcceleratorClient({
      enabled: true,
      baseUrl: 'http://localhost:4100',
      timeoutMs: 1000,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const sim = await cosineWithFallback([1, 0], [1, 0], client);
    expect(sim).toBe(0.9);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('falls back on Go failure', async () => {
    const fetchMock = vi.fn(async () => new Response('err', { status: 500 }));
    const client = new GoAcceleratorClient({
      enabled: true,
      baseUrl: 'http://localhost:4100',
      timeoutMs: 100,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const sim = await cosineWithFallback([1, 0, 0], [0, 1, 0], client);
    expect(sim).toBe(0); // fallback cosine of orthogonal vectors
  });

  it('health disabled client throws post but health works', async () => {
    const client = new GoAcceleratorClient({
      enabled: false,
      baseUrl: 'http://localhost:4100',
      timeoutMs: 1000,
    });
    await expect(client.canonicalHash({ a: 1 })).rejects.toThrow('disabled');
  });
});

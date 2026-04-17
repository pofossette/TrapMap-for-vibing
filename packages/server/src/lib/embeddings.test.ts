import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateEmbedding, getEmbeddingsAdapter, hashEmbeddingText } from './embeddings.js';

describe('embeddings', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('hashEmbeddingText', () => {
    it('produces deterministic hash for identical text', () => {
      const text = 'test embedding text';
      const hash1 = hashEmbeddingText(text);
      const hash2 = hashEmbeddingText(text);
      expect(hash1).toBe(hash2);
    });

    it('produces different hashes for different text', () => {
      const hash1 = hashEmbeddingText('text one');
      const hash2 = hashEmbeddingText('text two');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('getEmbeddingsAdapter', () => {
    it('returns fallback adapter when no provider is configured', async () => {
      process.env.OPENAI_API_KEY = undefined;

      const adapter = await getEmbeddingsAdapter();
      expect(adapter.isConfigured).toBe(false);
      expect(adapter.provider).toBe('fallback');
    });

    it('fallback adapter returns deterministic vectors', async () => {
      process.env.OPENAI_API_KEY = undefined;

      const adapter = await getEmbeddingsAdapter();
      const text = 'test embedding text';

      const embedding1 = await adapter.embed(text);
      const embedding2 = await adapter.embed(text);

      expect(embedding1).toEqual(embedding2);
      expect(embedding1.length).toBe(384); // Default fallback dimension
    });

    it('fallback vectors have consistent magnitude', async () => {
      process.env.OPENAI_API_KEY = undefined;

      const adapter = await getEmbeddingsAdapter();

      const embedding = await adapter.embed('some test content');
      const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));

      // Should be normalized (magnitude close to 1)
      expect(magnitude).toBeCloseTo(1, 2);
    });
  });

  describe('generateEmbedding', () => {
    it('returns embedding array for valid text', async () => {
      process.env.OPENAI_API_KEY = undefined;

      const embedding = await generateEmbedding('test content');
      expect(Array.isArray(embedding)).toBe(true);
      expect(embedding.length).toBeGreaterThan(0);
    });
  });
});

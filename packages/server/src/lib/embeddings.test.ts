import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { FallbackEmbeddings } from '@trapmap/ai-providers';
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

  it('delegates provider selection to the shared AI provider package', async () => {
    const source = await readFile(resolve(import.meta.dirname, 'embeddings.ts'), 'utf8');

    expect(source).toContain("from '@trapmap/ai-providers'");
    expect(source).not.toContain('class FallbackEmbeddings');
    expect(source).not.toContain('class OpenAIEmbeddings');
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
    it('uses the installed global provider before the shared adapter', async () => {
      vi.resetModules();
      process.env = {};
      const embed = vi.fn().mockResolvedValue([0.1, 0.2, 0.3]);
      const { generateEmbedding: generateWithGlobal, setGlobalEmbeddingsProvider } = await import(
        './embeddings.js'
      );

      setGlobalEmbeddingsProvider({ provider: 'global', isConfigured: true, embed });

      await expect(generateWithGlobal('same input')).resolves.toEqual([0.1, 0.2, 0.3]);
      expect(embed).toHaveBeenCalledWith('same input');
    });

    it('falls back to the shared adapter when the global provider fails', async () => {
      vi.resetModules();
      process.env = {};
      const { generateEmbedding: generateWithFailingGlobal, setGlobalEmbeddingsProvider } =
        await import('./embeddings.js');
      const expected = await new FallbackEmbeddings().embed('same input');

      setGlobalEmbeddingsProvider({
        provider: 'global',
        isConfigured: true,
        embed: vi.fn().mockRejectedValue(new Error('provider unavailable')),
      });

      await expect(generateWithFailingGlobal('same input')).resolves.toEqual(expected);
    });

    it('matches the shared fallback when no global provider is installed', async () => {
      vi.resetModules();
      process.env = {};

      const { generateEmbedding: generateWithResetAdapter } = await import('./embeddings.js');
      const expected = await new FallbackEmbeddings().embed('same input');

      await expect(generateWithResetAdapter('same input')).resolves.toEqual(expected);
      expect(Math.sqrt(expected.reduce((sum, value) => sum + value * value, 0))).toBeCloseTo(1, 5);
    });

    it('returns embedding array for valid text', async () => {
      process.env.OPENAI_API_KEY = undefined;

      const embedding = await generateEmbedding('test content');
      expect(Array.isArray(embedding)).toBe(true);
      expect(embedding.length).toBeGreaterThan(0);
    });
  });
});

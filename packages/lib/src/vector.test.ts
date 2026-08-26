import { describe, expect, it } from 'vitest';

import { cosineSimilarity, createDeterministicFallbackVector, normalizeVector } from './vector.js';

describe('cosineSimilarity', () => {
  it('computes similarity and returns zero for zero vectors', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });

  it('rejects mismatched dimensions and non-finite values', () => {
    expect(() => cosineSimilarity([1], [1, 0])).toThrow('Vector dimensions must match');
    expect(() => cosineSimilarity([Number.NaN, 0], [1, 0])).toThrow('Vector values must be finite');
    expect(() => cosineSimilarity([1, 0], [Number.POSITIVE_INFINITY, 0])).toThrow(
      'Vector values must be finite',
    );
  });
});

describe('normalizeVector', () => {
  it('returns a new unit vector without mutating the input', () => {
    const input = [3, 4];
    const output = normalizeVector(input);

    expect(output).toEqual([0.6, 0.8]);
    expect(input).toEqual([3, 4]);
  });

  it('returns all zeros for a zero vector and rejects non-finite values', () => {
    expect(normalizeVector([0, 0])).toEqual([0, 0]);
    expect(() => normalizeVector([Number.NaN])).toThrow('Vector values must be finite');
  });
});

describe('createDeterministicFallbackVector', () => {
  it('produces the same unit vector for equivalent calls', async () => {
    const first = createDeterministicFallbackVector('hello world', 384);
    const second = createDeterministicFallbackVector('hello world', 384);

    expect(first).toHaveLength(384);
    expect(second).toEqual(first);
    expect(Math.sqrt(first.reduce((sum, value) => sum + value * value, 0))).toBeCloseTo(1, 5);
    expect(await Promise.resolve(first)).toEqual(second);
  });

  it('uses token and empty-text paths deterministically', () => {
    const tokens = createDeterministicFallbackVector('deploy kubernetes cluster', 8);
    const empty = createDeterministicFallbackVector('', 8);

    expect(tokens).toHaveLength(8);
    expect(empty).toHaveLength(8);
    expect(tokens).toEqual(createDeterministicFallbackVector('deploy kubernetes cluster', 8));
    expect(empty).toEqual(createDeterministicFallbackVector('', 8));
  });
});

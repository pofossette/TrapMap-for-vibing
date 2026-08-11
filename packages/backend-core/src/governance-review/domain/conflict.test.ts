import { describe, expect, it } from 'vitest';

import {
  ALTERNATIVE_THRESHOLD,
  CONTRADICTORY_THRESHOLD,
  PROBLEM_OVERLAP_THRESHOLD,
  SOLUTION_DIFF_THRESHOLD,
  canonicalEntries,
  classifyConflict,
  generateConflictContext,
  overlapScore,
  relationKey,
  tokenize,
} from './conflict.js';

describe('governance-review conflict rules', () => {
  it('locks the classification thresholds', () => {
    expect(PROBLEM_OVERLAP_THRESHOLD).toBe(0.3);
    expect(SOLUTION_DIFF_THRESHOLD).toBe(0.3);
    expect(CONTRADICTORY_THRESHOLD).toBe(0.8);
    expect(ALTERNATIVE_THRESHOLD).toBe(0.4);
  });

  it('tokenizes lowercase alphanumeric parts of length >= 3', () => {
    expect([...tokenize('Postgres query TIMEOUT!! avoid-abc')]).toEqual([
      'postgres',
      'query',
      'timeout',
      'avoid',
      'abc',
    ]);
    expect([...tokenize('a b c')]).toEqual([]);
  });

  it('computes Jaccard overlap scores', () => {
    const a = tokenize('postgres query timeout');
    const b = tokenize('postgres query');
    expect(overlapScore(a, b)).toBeCloseTo(2 / 3);
    expect(overlapScore(new Set(), new Set(['x']))).toBe(0);
    expect(overlapScore(a, a)).toBe(1);
  });

  it('classifies conflict types from the threshold bands', () => {
    expect(classifyConflict(0.2, 0.9)).toBeNull();
    expect(classifyConflict(0.9, 0.2)).toBeNull();
    expect(classifyConflict(0.9, 0.9)).toBe('contradictory');
    expect(classifyConflict(0.9, 0.8)).toBe('contradictory');
    expect(classifyConflict(0.9, 0.5)).toBe('alternative');
    expect(classifyConflict(0.9, 0.4)).toBe('alternative');
    expect(classifyConflict(0.9, 0.31)).toBe('superseded');
  });

  it('generates conflict context with the entry shortcuts', () => {
    expect(generateConflictContext({ shortcut: 'a' }, { shortcut: 'b' }, 'contradictory')).toBe(
      'Opposing solutions for the same problem: "a" vs "b"',
    );
    expect(generateConflictContext({ shortcut: 'a' }, { shortcut: 'b' }, 'alternative')).toBe(
      'Different approaches to the same problem: "a" vs "b"',
    );
    expect(generateConflictContext({ shortcut: 'a' }, { shortcut: 'b' }, 'superseded')).toBe(
      'Newer approach supersedes older one: "a" vs "b"',
    );
  });

  it('builds canonical pair keys and orders entries by id', () => {
    expect(relationKey('entry-b', 'entry-a')).toBe('entry-b\u0000entry-a');
    const [first, second] = canonicalEntries(
      { id: 'entry-z' },
      { id: 'entry-a' },
    );
    expect(first.id).toBe('entry-a');
    expect(second.id).toBe('entry-z');
    expect(canonicalEntries({ id: 'entry-a' }, { id: 'entry-b' })[0]!.id).toBe('entry-a');
  });
});

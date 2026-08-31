import { describe, expect, it } from 'vitest';

import {
  KEYWORD_DETAIL_WEIGHT,
  KEYWORD_LABEL_WEIGHT,
  KEYWORD_SHORTCUT_WEIGHT,
  normalizeQuery,
  scoreKeywordEntry,
  tokenizeText,
} from '../../../src/knowledge-read/domain/index.js';

describe('knowledge-read tokenization rules', () => {
  it('tokenizes and normalizes query text', () => {
    expect(tokenizeText('JWT Token Validation!')).toEqual(['jwt', 'token', 'validation']);
    expect(normalizeQuery('a JWT token')).toEqual(['jwt', 'token']);
    expect(normalizeQuery('')).toEqual([]);
  });

  it('scores keyword candidates by label, shortcut and detail weights', () => {
    const tokens = ['jwt', 'token'];
    const { score, tokenMatches } = scoreKeywordEntry(tokens, {
      labels: new Set(['jwt']),
      shortcut: new Set(['token']),
      detail: new Set(['jwt', 'token']),
    });
    const maxFieldScore = KEYWORD_LABEL_WEIGHT + KEYWORD_SHORTCUT_WEIGHT + KEYWORD_DETAIL_WEIGHT;
    const expectedScore =
      (KEYWORD_LABEL_WEIGHT +
        KEYWORD_DETAIL_WEIGHT +
        KEYWORD_SHORTCUT_WEIGHT +
        KEYWORD_DETAIL_WEIGHT) /
      (maxFieldScore * tokens.length);
    expect(score).toBeCloseTo(expectedScore);
    expect(tokenMatches).toEqual([
      { token: 'jwt', fields: ['labels', 'detail'] },
      { token: 'token', fields: ['shortcut', 'detail'] },
    ]);
  });

  it('returns a zero score for an empty query', () => {
    expect(
      scoreKeywordEntry([], { labels: new Set(), shortcut: new Set(), detail: new Set() }),
    ).toEqual({ score: 0, tokenMatches: [] });
  });

  it('clamps keyword scores into the 0..1 range', () => {
    const weights = [KEYWORD_LABEL_WEIGHT, KEYWORD_SHORTCUT_WEIGHT, KEYWORD_DETAIL_WEIGHT];
    expect(weights).toEqual([3, 2, 1]);
    const { score } = scoreKeywordEntry(['react'], {
      labels: new Set(['react']),
      shortcut: new Set(['react']),
      detail: new Set(['react']),
    });
    expect(score).toBe(1);
  });
});

/**
 * Unit tests for judge module.
 *
 * Phase 27-02: SEVAL-01, SEVAL-02
 */

import { describe, expect, it } from 'vitest';
import {
  createJudge,
  fallbackCheckForbidden,
  fallbackJudge,
  fallbackVerifyClaims,
} from '../lib/judge.js';

describe('fallbackVerifyClaims', () => {
  it('should verify claims with matching context', () => {
    const result = fallbackVerifyClaims({
      claims: [{ text: 'Docker is a container tool' }],
      context: ['Docker is a container tool for running applications'],
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.supported).toBe(true);
    expect(result[0]!.evidence).toBeDefined();
  });

  it('should mark claims as unsupported when no match', () => {
    const result = fallbackVerifyClaims({
      claims: [{ text: 'This claim does not match anything' }],
      context: ['Docker is a container tool'],
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.supported).toBe(false);
    expect(result[0]!.evidence).toBeUndefined();
  });

  it('should handle empty claims', () => {
    const result = fallbackVerifyClaims({
      claims: [],
      context: ['Some context'],
    });

    expect(result).toHaveLength(0);
  });

  it('should support partial term matching', () => {
    const result = fallbackVerifyClaims({
      claims: [{ text: 'docker container running' }],
      context: ['The docker container is running successfully'],
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.supported).toBe(true);
  });
});

describe('fallbackCheckForbidden', () => {
  it('should detect forbidden claims', () => {
    const result = fallbackCheckForbidden({
      summaryText: 'The password is secret123 and should not be shared',
      forbiddenClaims: ['password', 'secret'],
    });

    expect(result).toHaveLength(2);
    expect(result).toContain('password');
    expect(result).toContain('secret');
  });

  it('should return empty array when no forbidden claims found', () => {
    const result = fallbackCheckForbidden({
      summaryText: 'Docker is a useful container tool',
      forbiddenClaims: ['password', 'secret', 'token'],
    });

    expect(result).toHaveLength(0);
  });

  it('should be case-insensitive', () => {
    const result = fallbackCheckForbidden({
      summaryText: 'The PASSWORD is secret',
      forbiddenClaims: ['password'],
    });

    expect(result).toHaveLength(1);
    expect(result).toContain('password');
  });

  it('should handle empty forbidden claims list', () => {
    const result = fallbackCheckForbidden({
      summaryText: 'Some summary text',
      forbiddenClaims: [],
    });

    expect(result).toHaveLength(0);
  });
});

describe('fallbackJudge', () => {
  it('should return complete judge result', () => {
    const result = fallbackJudge({
      summaryText: 'Docker is a container tool. Kubernetes orchestrates containers.',
      context: ['Docker is a container tool for running applications'],
      requiredFacts: ['Docker', 'container'],
      forbiddenClaims: ['password'],
    });

    expect(result.provider).toBe('fallback');
    expect(result.groundednessScore).toBeGreaterThanOrEqual(0);
    expect(result.groundednessScore).toBeLessThanOrEqual(1);
    expect(result.coverageScore).toBeGreaterThanOrEqual(0);
    expect(result.coverageScore).toBeLessThanOrEqual(1);
    expect(result.claims).toBeDefined();
    expect(result.requiredFactsCovered).toBeDefined();
    expect(result.requiredFactsMissing).toBeDefined();
    expect(result.forbiddenClaimsFound).toBeDefined();
  });

  it('should calculate coverage correctly', () => {
    const result = fallbackJudge({
      summaryText: 'Docker is a container tool',
      context: ['Docker is a container tool'],
      requiredFacts: ['Docker', 'container', 'kubernetes'],
      forbiddenClaims: [],
    });

    expect(result.requiredFactsCovered).toContain('Docker');
    expect(result.requiredFactsCovered).toContain('container');
    expect(result.requiredFactsMissing).toContain('kubernetes');
    expect(result.coverageScore).toBe(2 / 3);
  });

  it('should handle empty required facts', () => {
    const result = fallbackJudge({
      summaryText: 'Some summary',
      context: ['Some context'],
      requiredFacts: [],
      forbiddenClaims: [],
    });

    expect(result.coverageScore).toBe(1.0);
  });
});

describe('createJudge', () => {
  it('should create fallback judge', async () => {
    const judge = createJudge({ provider: 'fallback' });
    expect(judge.config.provider).toBe('fallback');

    const result = await judge.evaluate(
      'Docker is a container tool',
      ['Docker is a container tool'],
      {
        requiredFacts: [],
        forbiddenClaims: [],
      },
    );

    expect(result.provider).toBe('fallback');
  });

  it('should create openai judge (falls back to fallback)', async () => {
    const judge = createJudge({ provider: 'openai', model: 'gpt-4o-mini' });
    expect(judge.config.provider).toBe('openai');

    // Currently falls back to rules-based judge when no API key
    const result = await judge.evaluate(
      'Docker is a container tool',
      ['Docker is a container tool'],
      {
        requiredFacts: [],
        forbiddenClaims: [],
      },
    );

    expect(result).toBeDefined();
  });
});

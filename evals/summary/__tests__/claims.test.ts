/**
 * Unit tests for claims extraction module.
 *
 * Phase 27-02: SEVAL-01, SEVAL-02
 */

import { describe, it, expect } from 'vitest';
import { extractClaims, extractClaimsFromSummary, simplifyClaim } from '../lib/claims.js';

describe('extractClaims', () => {
  it('should extract claims from simple text', () => {
    const claims = extractClaims('Hello world. This is a test.');
    expect(claims).toHaveLength(2);
    expect(claims[0]!.text).toBe('Hello world');
    expect(claims[1]!.text).toBe('This is a test');
  });

  it('should handle empty text', () => {
    const claims = extractClaims('');
    expect(claims).toHaveLength(0);
  });

  it('should handle null/undefined text', () => {
    expect(extractClaims(null as unknown as string)).toHaveLength(0);
    expect(extractClaims(undefined as unknown as string)).toHaveLength(0);
  });

  it('should extract citation references', () => {
    const claims = extractClaims('Docker is a container tool [1]. Kubernetes is an orchestrator [2].');
    expect(claims).toHaveLength(2);
    expect(claims[0]!.citationId).toBe('1');
    expect(claims[1]!.citationId).toBe('2');
  });

  it('should handle question and exclamation marks', () => {
    const claims = extractClaims('Is this correct? Yes! Absolutely.');
    expect(claims).toHaveLength(3);
    expect(claims[0]!.text).toBe('Is this correct');
    expect(claims[1]!.text).toBe('Yes');
    expect(claims[2]!.text).toBe('Absolutely');
  });

  it('should skip empty sentences', () => {
    const claims = extractClaims('Hello... World.');
    expect(claims).toHaveLength(2);
    expect(claims[0]!.text).toBe('Hello');
    expect(claims[1]!.text).toBe('World');
  });
});

describe('extractClaimsFromSummary', () => {
  it('should extract claims from summary object', () => {
    const summary = {
      text: 'Docker is useful [1]. Kubernetes is powerful [2].',
      citations: [
        { source: { entryId: 'entry-1' } },
        { source: { entryId: 'entry-2' } },
      ],
    };

    const claims = extractClaimsFromSummary(summary);
    expect(claims).toHaveLength(2);
    expect(claims[0]!.citationId).toBe('entry-1');
    expect(claims[1]!.citationId).toBe('entry-2');
  });

  it('should handle summary without citations', () => {
    const summary = {
      text: 'Simple summary without citations.',
      citations: [],
    };

    const claims = extractClaimsFromSummary(summary);
    expect(claims).toHaveLength(1);
    expect(claims[0]!.text).toBe('Simple summary without citations');
    expect(claims[0]!.citationId).toBeUndefined();
  });
});

describe('simplifyClaim', () => {
  it('should lowercase the claim', () => {
    expect(simplifyClaim('The Docker Container')).toBe('docker container');
  });

  it('should remove articles', () => {
    expect(simplifyClaim('The quick brown fox')).toBe('quick brown fox');
    expect(simplifyClaim('A container is running')).toBe('container is running');
    expect(simplifyClaim('An error occurred')).toBe('error occurred');
  });

  it('should remove punctuation', () => {
    expect(simplifyClaim('Hello, world!')).toBe('hello world');
    expect(simplifyClaim('test-value_here')).toBe('test value here');
  });

  it('should normalize whitespace', () => {
    expect(simplifyClaim('  multiple   spaces   ')).toBe('multiple spaces');
  });

  it('should handle empty input', () => {
    expect(simplifyClaim('')).toBe('');
    expect(simplifyClaim(null as unknown as string)).toBe('');
  });

  it('should preserve numbers', () => {
    expect(simplifyClaim('Version 1.2.3 is released')).toBe('version 1 2 3 is released');
  });
});

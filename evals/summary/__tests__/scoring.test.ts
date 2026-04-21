/**
 * Unit tests for scoring modules.
 *
 * Phase 27-02: SEVAL-01, SEVAL-02
 */

import { describe, it, expect } from 'vitest';
import {
  calculateGroundednessScore,
  identifyUnsupportedClaims,
  formatGroundednessReport,
} from '../lib/groundedness.js';
import {
  calculateCoverageScore,
  formatCoverageReport,
} from '../lib/coverage.js';

describe('calculateGroundednessScore', () => {
  it('should calculate score from mixed claims', () => {
    const score = calculateGroundednessScore([
      { text: 'a', supported: true },
      { text: 'b', supported: false },
    ]);
    expect(score).toBe(0.5);
  });

  it('should return 1.0 for all supported claims', () => {
    const score = calculateGroundednessScore([
      { text: 'a', supported: true },
      { text: 'b', supported: true },
    ]);
    expect(score).toBe(1.0);
  });

  it('should return 0.0 for all unsupported claims', () => {
    const score = calculateGroundednessScore([
      { text: 'a', supported: false },
      { text: 'b', supported: false },
    ]);
    expect(score).toBe(0.0);
  });

  it('should return 1.0 for empty claims', () => {
    const score = calculateGroundednessScore([]);
    expect(score).toBe(1.0);
  });

  it('should handle single claim', () => {
    expect(calculateGroundednessScore([{ text: 'a', supported: true }])).toBe(1.0);
    expect(calculateGroundednessScore([{ text: 'a', supported: false }])).toBe(0.0);
  });
});

describe('identifyUnsupportedClaims', () => {
  it('should identify unsupported claims', () => {
    const unsupported = identifyUnsupportedClaims([
      { text: 'supported claim', supported: true },
      { text: 'unsupported claim', supported: false },
      { text: 'another unsupported', supported: false },
    ]);

    expect(unsupported).toHaveLength(2);
    expect(unsupported).toContain('unsupported claim');
    expect(unsupported).toContain('another unsupported');
  });

  it('should return empty array for all supported', () => {
    const unsupported = identifyUnsupportedClaims([
      { text: 'a', supported: true },
      { text: 'b', supported: true },
    ]);
    expect(unsupported).toHaveLength(0);
  });

  it('should handle empty claims', () => {
    const unsupported = identifyUnsupportedClaims([]);
    expect(unsupported).toHaveLength(0);
  });
});

describe('formatGroundednessReport', () => {
  it('should format report with mixed claims', () => {
    const report = formatGroundednessReport([
      { text: 'supported claim', supported: true, evidence: 'evidence text' },
      { text: 'unsupported claim', supported: false },
    ]);

    expect(report).toContain('1/2 supported');
    expect(report).toContain('Supported claims:');
    expect(report).toContain('Unsupported claims:');
    expect(report).toContain('supported claim');
    expect(report).toContain('unsupported claim');
  });

  it('should handle empty claims', () => {
    const report = formatGroundednessReport([]);
    expect(report).toContain('No claims to verify');
  });
});

describe('calculateCoverageScore', () => {
  it('should calculate coverage correctly', () => {
    const result = calculateCoverageScore({
      summaryText: 'docker compose is useful',
      requiredFacts: ['docker', 'kubernetes'],
    });

    expect(result.score).toBe(0.5);
    expect(result.covered).toContain('docker');
    expect(result.missing).toContain('kubernetes');
  });

  it('should return 1.0 for all covered', () => {
    const result = calculateCoverageScore({
      summaryText: 'docker and kubernetes are both useful',
      requiredFacts: ['docker', 'kubernetes'],
    });

    expect(result.score).toBe(1.0);
    expect(result.covered).toHaveLength(2);
    expect(result.missing).toHaveLength(0);
  });

  it('should return 1.0 for no required facts', () => {
    const result = calculateCoverageScore({
      summaryText: 'some summary',
      requiredFacts: [],
    });

    expect(result.score).toBe(1.0);
  });

  it('should be case-insensitive', () => {
    const result = calculateCoverageScore({
      summaryText: 'DOCKER IS A CONTAINER TOOL',
      requiredFacts: ['docker'],
    });

    expect(result.score).toBe(1.0);
    expect(result.covered).toContain('docker');
  });
});

describe('formatCoverageReport', () => {
  it('should format coverage report', () => {
    const report = formatCoverageReport({
      covered: ['docker'],
      missing: ['kubernetes'],
    });

    expect(report).toContain('1/2 covered');
    expect(report).toContain('Covered facts:');
    expect(report).toContain('Missing facts:');
    expect(report).toContain('docker');
    expect(report).toContain('kubernetes');
  });

  it('should handle no required facts', () => {
    const report = formatCoverageReport({
      covered: [],
      missing: [],
    });

    expect(report).toContain('No required facts');
  });
});

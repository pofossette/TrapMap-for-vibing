/**
 * Tests for live retrieval evaluation contracts and snapshot infrastructure.
 *
 * Covers:
 * - liveSnapshotMetaSchema validation
 * - Snapshot loading and validation
 * - Service profile detection and verification
 * - Live report meta schema
 * - Backend client response normalization
 */

import { describe, expect, it } from 'vitest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import {
  liveSnapshotMetaSchema,
  liveEvalServiceProfileSchema,
  liveSnapshotDerivationContextSchema,
  liveEvalReportMetaSchema,
  assertionStabilitySchema,
  liveEvalCaseDiffSchema,
  liveEvalSliceDiffSchema,
  liveEvalComparisonReportSchema,
} from '@trapmap/contracts/evals';

import {
  detectServiceProfile,
  verifyServiceProfile,
  loadSnapshot,
} from './snapshot-orchestrator.js';

// =============================================================================
// Contract Tests
// =============================================================================

describe('liveSnapshotMetaSchema', () => {
  const validMeta = {
    schemaVersion: 1 as const,
    version: '2026-07-baseline',
    description: 'Baseline snapshot for live eval',
    source: {
      environment: 'local' as const,
      exportedAt: '2026-07-01T00:00:00.000Z',
      exportedBy: 'test',
      teamId: 'team_1',
    },
    serviceProfile: {
      embeddingModel: 'text-embedding-3-small',
      useDbSearch: true,
      capsulePgKeyword: true,
      capsulePgSemantic: true,
      graphDbEnabled: false,
      graphDbProvider: null,
      decayEnabled: false,
    },
    derivationContext: {
      mode: 'frozen' as const,
      pipelineVersion: null,
      embeddingModelUsed: 'text-embedding-3-small',
    },
    corpusSummary: {
      knowledgeEntryCount: 10,
      skillArtifactCount: 5,
      graphIndexDocumentCount: 8,
      capsuleEmbeddingCount: 12,
      capsuleKeywordCount: 12,
    },
    fingerprint: 'abc123def456',
    compatibleEndpoints: ['/v2/retrieval/search' as const, '/v3/retrieval/search' as const],
    knownLimitations: ['Small corpus size'],
  };

  it('accepts valid frozen meta', () => {
    const parsed = liveSnapshotMetaSchema.parse(validMeta);
    expect(parsed.version).toBe('2026-07-baseline');
    expect(parsed.derivationContext.mode).toBe('frozen');
    expect(parsed.schemaVersion).toBe(1);
  });

  it('accepts valid rebuild meta', () => {
    const parsed = liveSnapshotMetaSchema.parse({
      ...validMeta,
      derivationContext: {
        mode: 'rebuild',
        pipelineVersion: 'abc123',
        embeddingModelUsed: 'fallback-hash',
      },
      serviceProfile: {
        ...validMeta.serviceProfile,
        embeddingModel: 'fallback-hash',
      },
    });
    expect(parsed.derivationContext.mode).toBe('rebuild');
    expect(parsed.derivationContext.pipelineVersion).toBe('abc123');
  });

  it('rejects invalid derivation mode', () => {
    expect(() =>
      liveSnapshotMetaSchema.parse({
        ...validMeta,
        derivationContext: { ...validMeta.derivationContext, mode: 'invalid' },
      }),
    ).toThrow();
  });

  it('requires fingerprint', () => {
    expect(() =>
      liveSnapshotMetaSchema.parse({
        ...validMeta,
        fingerprint: '',
      }),
    ).toThrow();
  });

  it('requires at least one compatible endpoint', () => {
    expect(() =>
      liveSnapshotMetaSchema.parse({
        ...validMeta,
        compatibleEndpoints: [],
      }),
    ).toThrow();
  });

  it('defaults knownLimitations to empty array', () => {
    const { knownLimitations, ...rest } = validMeta;
    const parsed = liveSnapshotMetaSchema.parse(rest);
    expect(parsed.knownLimitations).toEqual([]);
  });
});

describe('liveEvalServiceProfileSchema', () => {
  it('accepts full profile with graph enabled', () => {
    const profile = {
      embeddingModel: 'text-embedding-3-small',
      useDbSearch: true,
      capsulePgKeyword: true,
      capsulePgSemantic: true,
      graphDbEnabled: true,
      graphDbProvider: 'neo4j',
      decayEnabled: false,
    };
    const parsed = liveEvalServiceProfileSchema.parse(profile);
    expect(parsed.graphDbEnabled).toBe(true);
    expect(parsed.graphDbProvider).toBe('neo4j');
  });

  it('accepts minimal profile with everything disabled', () => {
    const profile = {
      embeddingModel: 'fallback-hash',
      useDbSearch: false,
      capsulePgKeyword: false,
      capsulePgSemantic: false,
      graphDbEnabled: false,
      graphDbProvider: null,
      decayEnabled: false,
    };
    const parsed = liveEvalServiceProfileSchema.parse(profile);
    expect(parsed.graphDbProvider).toBeNull();
  });
});

describe('liveEvalReportMetaSchema', () => {
  it('accepts valid live report meta', () => {
    const meta = {
      schemaVersion: 1 as const,
      timestamp: '2026-07-01T12:00:00.000Z',
      durationMs: 5000,
      options: {
        tier: 'smoke' as const,
        endpoint: '/v2/retrieval/search' as const,
        dryRun: false,
        allowEmpty: false,
        verbose: 0,
      },
      snapshotVersion: '2026-07-baseline',
      snapshotFingerprint: 'abc123',
      restoreMode: 'frozen' as const,
      backendBaseUrl: 'http://localhost:3000',
      serviceProfileSnapshot: {
        embeddingModel: 'fallback-hash',
        useDbSearch: false,
        capsulePgKeyword: false,
        capsulePgSemantic: false,
        graphDbEnabled: false,
        graphDbProvider: null,
        decayEnabled: false,
      },
      indexHealthSummary: {
        knowledgeEntryCount: 10,
        skillArtifactCount: 5,
        graphDocCount: 8,
        capsuleEmbeddingCount: 12,
        graphProjectionHealthy: true,
      },
    };

    const parsed = liveEvalReportMetaSchema.parse(meta);
    expect(parsed.snapshotVersion).toBe('2026-07-baseline');
    expect(parsed.restoreMode).toBe('frozen');
    expect(parsed.indexHealthSummary.graphProjectionHealthy).toBe(true);
  });
});

describe('assertionStabilitySchema', () => {
  it('accepts stable and version-sensitive', () => {
    expect(assertionStabilitySchema.parse('stable')).toBe('stable');
    expect(assertionStabilitySchema.parse('version-sensitive')).toBe('version-sensitive');
  });

  it('rejects invalid values', () => {
    expect(() => assertionStabilitySchema.parse('unstable')).toThrow();
  });
});

describe('liveEvalComparisonReportSchema', () => {
  it('accepts valid comparison report', () => {
    const report = {
      baseline: {
        snapshotVersion: 'v1',
        snapshotFingerprint: 'abc',
        restoreMode: 'frozen' as const,
        timestamp: '2026-07-01T00:00:00.000Z',
      },
      current: {
        snapshotVersion: 'v2',
        snapshotFingerprint: 'def',
        restoreMode: 'frozen' as const,
        timestamp: '2026-07-02T00:00:00.000Z',
      },
      slices: [
        {
          endpoint: '/v2/retrieval/search' as const,
          caseCount: 3,
          hitAt1Baseline: 0.8,
          hitAt1Current: 0.87,
          hitAt1Diff: 0.07,
          mrrBaseline: 0.9,
          mrrCurrent: 0.93,
          mrrDiff: 0.03,
          governanceFailuresBaseline: 0,
          governanceFailuresCurrent: 0,
          verdict: 'improved' as const,
        },
      ],
      cases: [
        {
          caseId: 'test-case-1',
          endpoint: '/v2/retrieval/search' as const,
          hitAt1Diff: 1,
          mrrDiff: 0.1,
          outcomeChanged: false,
          governanceChanged: false,
          verdict: 'improved' as const,
        },
      ],
      overallVerdict: 'improved' as const,
    };

    const parsed = liveEvalComparisonReportSchema.parse(report);
    expect(parsed.overallVerdict).toBe('improved');
    expect(parsed.slices).toHaveLength(1);
    expect(parsed.cases).toHaveLength(1);
  });
});

// =============================================================================
// Service Profile Detection Tests
// =============================================================================

describe('detectServiceProfile', () => {
  it('returns a valid service profile from environment', () => {
    const profile = detectServiceProfile();
    const parsed = liveEvalServiceProfileSchema.parse(profile);
    expect(parsed.embeddingModel).toBeTruthy();
  });
});

describe('verifyServiceProfile', () => {
  it('returns empty array when profiles match', () => {
    const profile = {
      embeddingModel: 'fallback-hash',
      useDbSearch: false,
      capsulePgKeyword: false,
      capsulePgSemantic: false,
      graphDbEnabled: false,
      graphDbProvider: null,
      decayEnabled: false,
    };
    const mismatches = verifyServiceProfile(profile, profile);
    expect(mismatches).toEqual([]);
  });

  it('detects embedding model mismatch', () => {
    const expected = {
      embeddingModel: 'text-embedding-3-small',
      useDbSearch: false,
      capsulePgKeyword: false,
      capsulePgSemantic: false,
      graphDbEnabled: false,
      graphDbProvider: null,
      decayEnabled: false,
    };
    const actual = { ...expected, embeddingModel: 'fallback-hash' };
    const mismatches = verifyServiceProfile(expected, actual);
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]).toContain('embeddingModel');
  });

  it('detects multiple mismatches', () => {
    const expected = {
      embeddingModel: 'text-embedding-3-small',
      useDbSearch: true,
      capsulePgKeyword: true,
      capsulePgSemantic: true,
      graphDbEnabled: true,
      graphDbProvider: 'neo4j',
      decayEnabled: true,
    };
    const actual = {
      embeddingModel: 'fallback-hash',
      useDbSearch: false,
      capsulePgKeyword: false,
      capsulePgSemantic: false,
      graphDbEnabled: false,
      graphDbProvider: null,
      decayEnabled: false,
    };
    const mismatches = verifyServiceProfile(expected, actual);
    expect(mismatches.length).toBeGreaterThanOrEqual(4);
  });
});

// =============================================================================
// Snapshot Loading Tests
// =============================================================================

describe('loadSnapshot', () => {
  it('loads and validates a valid snapshot from disk', async () => {
    const snapshotDir = path.resolve('evals/retrieval-live/snapshots/test-smoke-baseline');
    const { meta, corpus } = await loadSnapshot(snapshotDir);

    expect(meta.version).toBe('test-smoke-baseline');
    expect(meta.derivationContext.mode).toBe('frozen');
    expect(meta.schemaVersion).toBe(1);

    expect(corpus).toHaveProperty('knowledgeEntries');
    expect(corpus).toHaveProperty('skillArtifacts');
    expect(corpus).toHaveProperty('graphIndexDocuments');
    expect((corpus.knowledgeEntries as unknown[]).length).toBe(2);
    expect((corpus.skillArtifacts as unknown[]).length).toBe(1);
    expect((corpus.graphIndexDocuments as unknown[]).length).toBe(1);
  });

  it('rejects snapshot with invalid meta schema', async () => {
    const dir = path.join(tmpdir(), `test-snapshot-invalid-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    try {
      await writeFile(
        path.join(dir, 'meta.json'),
        JSON.stringify({ schemaVersion: 2, version: '' }),
      );
      await writeFile(path.join(dir, 'corpus.json'), JSON.stringify({}));

      await expect(loadSnapshot(dir)).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

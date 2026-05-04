/**
 * Phase 70 Nyquist Gap Validation - Gap 4: Artifact pipeline.
 *
 * Tests that the artifact pipeline correctly processes indexing artifacts
 * end-to-end: registration, fan-out, error collection, and removal.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SkillArtifactRecord, StoreData } from '../store.js';
import { createEmptyStoreData, nowIso } from '../store.js';
import type { ArtifactGraphAdapter } from '../indexing/adapters/artifact-graph.js';
import {
  getArtifactAdapters,
  registerArtifactAdapters,
  runArtifactAdapterFanOut,
  runArtifactAdapterRemoval,
} from '../indexing/artifact-pipeline.js';

function makeMockAdapter(overrides: Partial<ArtifactGraphAdapter> = {}): ArtifactGraphAdapter {
  return {
    sync: vi.fn().mockResolvedValue({ success: true, performedWork: true, error: null }),
    remove: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeArtifact(overrides: Partial<SkillArtifactRecord> = {}): SkillArtifactRecord {
  const now = nowIso();
  return {
    id: 'artifact-val-1',
    teamId: null,
    scope: 'global',
    labels: ['test'],
    title: 'Validation Artifact',
    slug: 'val-artifact',
    requiredLevel: 0,
    lifecycleState: 'approved',
    ownerUserId: 'user-1',
    latestRevision: {
      revision: 1,
      sourceHash: 'hash-1',
      files: [],
      submittedAt: now,
      submittedByUserId: 'user-1',
      scriptDescriptors: [],
      derived: {
        profile: {
          artifactId: 'artifact-val-1',
          revision: 1,
          sourceHash: 'hash-1',
          title: 'Validation Artifact',
          summary: 'Summary',
          keywords: ['test'],
          referencePaths: [],
          contentHash: 'profile-hash',
        },
        capsules: [],
        clientManifest: null,
        sourceHash: 'derived-hash',
        derivedAt: now,
      },
    },
    history: [],
    metadata: {
      sourceKind: 'skill-directory',
      submissionCount: 1,
      resubmissionCount: 0,
      revisionCount: 1,
      latestSubmissionId: 'sub-1',
      latestSubmittedAt: now,
      latestReviewedAt: now,
      latestDecision: 'approve',
    },
    agentReview: null,
    reviewHistory: [],
    reviewNotes: [],
    lifecycleHistory: [],
    boundary: null,
    decayMeta: null,
    evidenceMeta: null,
    maintenanceMeta: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('Gap 4: Artifact pipeline processes indexing artifacts end-to-end', () => {
  afterEach(() => {
    registerArtifactAdapters([]);
  });

  it('fan-out continues after adapter throws, collecting all results', async () => {
    const exploding = makeMockAdapter({
      sync: vi.fn().mockRejectedValue(new Error('boom')),
    });
    const ok = makeMockAdapter({
      sync: vi.fn().mockResolvedValue({ success: true, performedWork: true, error: null }),
    });

    registerArtifactAdapters([exploding, ok]);

    const result = await runArtifactAdapterFanOut({
      data: createEmptyStoreData(),
      artifact: makeArtifact(),
    });

    expect(result.success).toBe(false);
    expect(result.results).toHaveLength(2);
    expect(result.results[0]!.success).toBe(false);
    expect(result.results[0]!.error).toBe('boom');
    expect(result.results[1]!.success).toBe(true);
  });

  it('fan-out with all adapters succeeding returns success=true', async () => {
    const a1 = makeMockAdapter();
    const a2 = makeMockAdapter();
    registerArtifactAdapters([a1, a2]);

    const result = await runArtifactAdapterFanOut({
      data: createEmptyStoreData(),
      artifact: makeArtifact(),
    });

    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(2);
    expect(result.results.every((r) => r.success)).toBe(true);
  });

  it('removal propagates artifactId to all adapters', async () => {
    const a1 = makeMockAdapter();
    const a2 = makeMockAdapter();
    registerArtifactAdapters([a1, a2]);

    await runArtifactAdapterRemoval({
      data: createEmptyStoreData(),
      artifactId: 'artifact-xyz',
    });

    expect(a1.remove).toHaveBeenCalledWith(
      expect.objectContaining({ artifactId: 'artifact-xyz' }),
    );
    expect(a2.remove).toHaveBeenCalledWith(
      expect.objectContaining({ artifactId: 'artifact-xyz' }),
    );
  });

  it('override adapters parameter does not mutate registered adapters', async () => {
    const registered = makeMockAdapter();
    const override = makeMockAdapter();
    registerArtifactAdapters([registered]);

    await runArtifactAdapterFanOut({
      data: createEmptyStoreData(),
      artifact: makeArtifact(),
      adapters: [override],
    });

    expect(override.sync).toHaveBeenCalledTimes(1);
    expect(registered.sync).not.toHaveBeenCalled();
    expect(getArtifactAdapters()).toEqual([registered]);
  });

  it('fan-out with zero adapters returns success=true with empty results', async () => {
    registerArtifactAdapters([]);

    const result = await runArtifactAdapterFanOut({
      data: createEmptyStoreData(),
      artifact: makeArtifact(),
    });

    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(0);
  });

  it('registering new adapters replaces previous registration', () => {
    const first = makeMockAdapter();
    const second = makeMockAdapter();

    registerArtifactAdapters([first]);
    expect(getArtifactAdapters()).toEqual([first]);

    registerArtifactAdapters([second]);
    expect(getArtifactAdapters()).toEqual([second]);
  });

  it('non-Error thrown by adapter converts to string error message', async () => {
    const throwing = makeMockAdapter({
      sync: vi.fn().mockRejectedValue('string error message'),
    });
    registerArtifactAdapters([throwing]);

    const result = await runArtifactAdapterFanOut({
      data: createEmptyStoreData(),
      artifact: makeArtifact(),
    });

    expect(result.results[0]!.error).toBe('string error message');
    expect(result.results[0]!.success).toBe(false);
  });
});

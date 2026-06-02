/**
 * Unit tests for the PostgreSQL-based duplicate detector (pg-detector).
 *
 * Phase 1: covers exact-hit short-circuit behavior for the trap
 * canonicalization lane and the skill contentHash lane.
 *
 * Uses an in-memory mock pool that intercepts `pool.query` to verify
 * the detector's behavior without a real PostgreSQL backend.
 *
 * @module candidates/pg-detector
 */

import { describe, expect, it } from 'vitest';

import type { KnowledgeRecord, SkillArtifactRecord } from '@trapmap/server/lib/store.js';
import { nowIso } from '@trapmap/server/lib/store.js';
import { computeTrapFingerprint } from './fingerprint.js';
import { createPgDuplicateDetector } from './pg-detector.js';

// ---------------------------------------------------------------------------
// Mock pool — intercepts `pool.query(text, params)` calls from drizzle
// ---------------------------------------------------------------------------

type QueryResult = { rows: unknown[]; rowCount: number };

function buildMockPool(
  handler: (sql: string, params: unknown[]) => QueryResult | undefined = () => undefined,
) {
  const query = async (...args: unknown[]): Promise<QueryResult> => {
    let sql: string;
    let params: unknown[];

    if (typeof args[0] === 'string') {
      sql = args[0];
      params = (args[1] as unknown[]) ?? [];
    } else if (args[0] && typeof args[0] === 'object') {
      const cfg = args[0] as { text?: string; sql?: string };
      sql = String(cfg.text ?? cfg.sql ?? '');
      params = (args[1] as unknown[]) ?? [];
    } else {
      sql = String(args[0] ?? '');
      params = (args[1] as unknown[]) ?? [];
    }

    return handler(sql, params) ?? { rows: [], rowCount: 0 };
  };

  return {
    query,
    connect: () => Promise.resolve({ query, release: () => {} }),
    end: () => Promise.resolve(),
  };
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function createTestTrap(overrides: Partial<KnowledgeRecord> = {}): KnowledgeRecord {
  return {
    id: 'trap_1',
    teamId: null,
    scope: 'global',
    labels: ['test'],
    shortcut: 'Test trap',
    detail: 'Test detail',
    requiredLevel: 0,
    lifecycleState: 'approved',
    ownerUserId: 'user_1',
    latestRevision: {
      revision: 1,
      submittedAt: nowIso(),
      submittedByUserId: 'user_1',
      shortcut: 'Test trap',
      detail: 'Test detail',
      labels: ['test'],
      reviewNotes: [],
    },
    history: [],
    metadata: {
      scopeLabel: 'global-constraint',
      submissionCount: 1,
      resubmissionCount: 0,
      revisionCount: 1,
      latestSubmissionId: null,
      latestSubmittedAt: null,
      latestReviewedAt: null,
      latestDecision: null,
    },
    latestSubmissionId: null,
    submissionHistory: [],
    agentReview: null,
    reviewHistory: [],
    reviewNotes: [],
    lifecycleHistory: [],
    embeddingCache: null,
    indexState: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    ...overrides,
  };
}

function createTestSkill(
  contentHash: string,
  overrides: Partial<SkillArtifactRecord> = {},
): SkillArtifactRecord {
  return {
    id: 'skill_1',
    teamId: null,
    scope: 'global',
    labels: ['test'],
    title: 'Test Skill',
    slug: 'test-skill',
    requiredLevel: 0,
    lifecycleState: 'approved',
    ownerUserId: 'user_1',
    latestRevision: {
      revision: 1,
      sourceHash: 'hash',
      files: [],
      submittedAt: nowIso(),
      submittedByUserId: 'user_1',
      scriptDescriptors: [],
      derived: {
        profile: {
          artifactId: 'skill_1',
          revision: 1,
          sourceHash: 'hash',
          title: 'Test Skill',
          summary: 'Test summary',
          keywords: ['test'],
          referencePaths: [],
          contentHash,
        },
        capsules: [],
        clientManifest: null,
        sourceHash: 'hash',
        derivedAt: nowIso(),
      },
    },
    history: [],
    metadata: {
      sourceKind: 'skill-directory',
      submissionCount: 1,
      resubmissionCount: 0,
      revisionCount: 1,
      latestSubmissionId: null,
      latestSubmittedAt: null,
      latestReviewedAt: null,
      latestDecision: null,
    },
    agentReview: null,
    reviewHistory: [],
    reviewNotes: [],
    lifecycleHistory: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Trap exact-fingerprint lane
// ---------------------------------------------------------------------------

describe('createPgDuplicateDetector — trap exact-fingerprint lane', () => {
  it('trap exact fingerprint match returns matchType "exact" with similarity 1', async () => {
    const trap = createTestTrap({
      id: 'trap_exact',
      shortcut: 'Trap pg-exact test title',
      detail: 'Trap pg-exact test detail content',
      labels: ['fingerprint'],
    });

    const expectedFingerprint = computeTrapFingerprint({
      shortcut: trap.shortcut,
      detail: trap.detail,
      labels: trap.labels,
    });

    const pool = buildMockPool(); // empty rows for all queries
    const detect = createPgDuplicateDetector({ pool: pool as never });

    const result = await detect(
      {
        candidateId: 'cand_1',
        candidateText: `${trap.shortcut}\n${trap.detail}`,
        candidateTokens: ['pg', 'exact', 'test', 'title', 'detail', 'content'],
        candidateKeywords: ['fingerprint'],
        candidateFingerprint: expectedFingerprint,
        teamId: null,
      },
      {
        trapEntries: [trap],
        skillArtifacts: [],
      },
    );

    expect(result.duplicateCase).not.toBeNull();
    const exact = result.duplicateCase!.matches.find((m) => m.entityId === 'trap_exact');
    expect(exact).toBeDefined();
    expect(exact!.matchType).toBe('exact');
    expect(exact!.similarityScore).toBe(1);
    expect(exact!.entityType).toBe('trap');
    expect(result.duplicateCase!.hasExactDuplicate).toBe(true);
    expect(result.duplicateCase!.duplicateType).toBe('exact');
  });

  it('trap with overlapping text but no fingerprint match does NOT return matchType "exact"', async () => {
    const trap = createTestTrap({
      id: 'trap_overlap_no_exact',
      shortcut: 'Trap overlap test title',
      detail: 'Trap overlap test detail content',
      labels: ['original-labels'],
    });

    // Candidate shares near-identical text but adds an extra label,
    // producing a different canonical fingerprint.
    const candidateFingerprint = computeTrapFingerprint({
      shortcut: trap.shortcut,
      detail: trap.detail,
      labels: ['original-labels', 'extra-label'],
    });

    const pool = buildMockPool();
    const detect = createPgDuplicateDetector({ pool: pool as never });

    const result = await detect(
      {
        candidateId: 'cand_1',
        candidateText: `${trap.shortcut}\n${trap.detail}`,
        candidateTokens: ['trap', 'overlap', 'test', 'title', 'detail', 'content'],
        candidateKeywords: ['original-labels'],
        candidateFingerprint,
        teamId: null,
      },
      {
        trapEntries: [trap],
        skillArtifacts: [],
      },
    );

    // No fingerprint match and the mock pool returns no hybrid matches.
    // The exact lane must not produce a "exact" match for this case.
    const exact = result.duplicateCase?.matches.find(
      (m) => m.matchType === 'exact' && m.entityId === 'trap_overlap_no_exact',
    );
    expect(exact).toBeUndefined();
  });

  it('does not require fallbackData for the empty case (returns null duplicateCase)', async () => {
    const pool = buildMockPool();
    const detect = createPgDuplicateDetector({ pool: pool as never });

    const result = await detect({
      candidateId: 'cand_empty',
      candidateText: 'some random text',
      candidateTokens: ['some', 'random', 'text'],
      candidateKeywords: ['random'],
      candidateFingerprint: 'a'.repeat(64),
      teamId: null,
    });

    expect(result.duplicateCase).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Skill exact-contentHash lane
// ---------------------------------------------------------------------------

describe('createPgDuplicateDetector — skill exact-contentHash lane', () => {
  it('skill contentHash match returns matchType "exact" with similarity 1', async () => {
    const contentHash = 'a'.repeat(64);
    const skill = createTestSkill(contentHash, {
      id: 'skill_exact',
    });

    const pool = buildMockPool();
    const detect = createPgDuplicateDetector({ pool: pool as never });

    const result = await detect(
      {
        candidateId: 'cand_1',
        candidateText: 'skill content',
        candidateTokens: ['skill', 'content'],
        candidateKeywords: ['test'],
        candidateFingerprint: contentHash,
        teamId: null,
      },
      {
        trapEntries: [],
        skillArtifacts: [skill],
      },
    );

    expect(result.duplicateCase).not.toBeNull();
    const exact = result.duplicateCase!.matches.find((m) => m.entityId === 'skill_exact');
    expect(exact).toBeDefined();
    expect(exact!.matchType).toBe('exact');
    expect(exact!.similarityScore).toBe(1);
    expect(exact!.entityType).toBe('skill');
    expect(result.duplicateCase!.hasExactDuplicate).toBe(true);
    expect(result.duplicateCase!.duplicateType).toBe('exact');
  });

  it('skill with overlapping summary but no contentHash match does NOT return matchType "exact"', async () => {
    const skill = createTestSkill('b'.repeat(64), {
      id: 'skill_overlap',
    });

    const pool = buildMockPool();
    const detect = createPgDuplicateDetector({ pool: pool as never });

    const result = await detect(
      {
        candidateId: 'cand_1',
        candidateText: 'test summary',
        candidateTokens: ['test', 'summary'],
        candidateKeywords: ['test'],
        candidateFingerprint: 'c'.repeat(64), // different from skill's contentHash
        teamId: null,
      },
      {
        trapEntries: [],
        skillArtifacts: [skill],
      },
    );

    const exact = result.duplicateCase?.matches.find(
      (m) => m.matchType === 'exact' && m.entityId === 'skill_overlap',
    );
    expect(exact).toBeUndefined();
  });
});

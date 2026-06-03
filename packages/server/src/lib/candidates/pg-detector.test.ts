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

function toSnakeCase(value: string): string {
  return value.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
}

function toCamelCase(value: string): string {
  return value.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
}

function expandRowKeys<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  const expanded: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    expanded[key] = value;
    expanded[toSnakeCase(key)] = value;
    expanded[toCamelCase(key)] = value;
  }
  return expanded;
}

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

    const result = handler(sql, params) ?? { rows: [], rowCount: 0 };
    return {
      ...result,
      rows: result.rows.map((row) =>
        row && typeof row === 'object' ? expandRowKeys(row as Record<string, unknown>) : row,
      ),
    };
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
    expect(result.analysisSnapshot.duplicateTrace).toEqual({
      detector: 'postgresql',
      matchedLane: 'exact',
    });
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
    expect(result.analysisSnapshot.duplicateTrace).toEqual({
      detector: 'postgresql',
      matchedLane: 'none',
    });
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

    const pool = buildMockPool((queryText) => {
      if (queryText.includes('skill_artifact_profiles') && queryText.includes('content_hash')) {
        return {
          rows: [
            {
              artifact_id: 'skill_exact',
              title: 'Test Skill',
              summary: 'Test summary',
              keywords: ['test'],
            },
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });
    const detect = createPgDuplicateDetector({ pool: pool as never });

    const result = await detect(
      {
        candidateId: 'cand_1',
        candidateText: 'skill content',
        candidateTokens: ['skill', 'content'],
        candidateKeywords: ['test'],
        candidateFingerprint: contentHash,
        candidateExactLookupKey: contentHash,
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

  it('preserves all exact matches even when maxMatches is smaller', async () => {
    const contentHash = 'c'.repeat(64);
    const pool = buildMockPool();
    const skillOne = createTestSkill(contentHash, { id: 'skill_exact_1', title: 'Exact Skill One' });
    const skillTwo = createTestSkill(contentHash, { id: 'skill_exact_2', title: 'Exact Skill Two' });

    const detect = createPgDuplicateDetector({ pool: pool as never });
    const result = await detect(
      {
        candidateId: 'cand_exact_overflow',
        candidateText: 'exact skill content',
        candidateTokens: ['exact', 'skill', 'content'],
        candidateKeywords: ['test'],
        candidateFingerprint: contentHash,
        candidateExactLookupKey: contentHash,
        teamId: null,
        maxMatches: 1,
      },
      {
        trapEntries: [],
        skillArtifacts: [skillOne, skillTwo],
      },
    );

    expect(result.duplicateCase).not.toBeNull();
    expect(result.duplicateCase!.matches).toHaveLength(2);
    expect(result.duplicateCase!.matches.every((match) => match.matchType === 'exact')).toBe(true);
  });

  it('short-circuits before PostgreSQL recall when an exact match is found via sourceHash', async () => {
    const sourceHash = 'd'.repeat(64);
    let recallQuerySeen = false;

    const pool = buildMockPool((queryText) => {
      if (
        queryText.includes('knowledge_embeddings') ||
        queryText.includes('knowledge_keywords') ||
        queryText.includes('skill_artifact_capsule_embeddings') ||
        queryText.includes('skill_artifact_capsule_keywords')
      ) {
        recallQuerySeen = true;
      }
      return { rows: [], rowCount: 0 };
    });

    const skill = createTestSkill('c'.repeat(64), {
      id: 'skill_exact_source_hash',
      latestRevision: {
        revision: 1,
        sourceHash,
        files: [],
        submittedAt: nowIso(),
        submittedByUserId: 'user_1',
        scriptDescriptors: [],
        derived: {
          profile: {
            artifactId: 'skill_exact_source_hash',
            revision: 1,
            sourceHash,
            title: 'Source Hash Skill',
            summary: 'Matches by derivation-eligible file hashes.',
            keywords: ['source-hash'],
            referencePaths: [],
            contentHash: 'c'.repeat(64),
          },
          capsules: [],
          clientManifest: null,
          sourceHash,
          derivedAt: nowIso(),
        },
      },
    });

    const detect = createPgDuplicateDetector({ pool: pool as never });
    const result = await detect(
      {
        candidateId: 'cand_source_hash_exact',
        candidateText: 'unrelated text that should never be embedded',
        candidateTokens: ['unrelated'],
        candidateKeywords: ['unrelated'],
        candidateFingerprint: 'f'.repeat(64),
        candidateExactLookupKey: sourceHash,
        teamId: null,
      },
      {
        trapEntries: [],
        skillArtifacts: [skill],
      },
    );

    expect(result.duplicateCase).not.toBeNull();
    expect(result.duplicateCase!.duplicateType).toBe('exact');
    expect(result.duplicateCase!.matches[0]?.entityId).toBe('skill_exact_source_hash');
    expect(recallQuerySeen).toBe(false);
    expect(result.analysisSnapshot.duplicateTrace).toEqual({
      detector: 'postgresql',
      matchedLane: 'exact',
    });
  });

  it('skill with overlapping summary but no contentHash match does NOT return matchType "exact"', async () => {
    const skill = createTestSkill('b'.repeat(64), {
      id: 'skill_overlap',
    });

    const pool = buildMockPool((queryText) => {
      if (queryText.includes('skill_artifact_profiles') && queryText.includes('content_hash')) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });
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

// ---------------------------------------------------------------------------
// Phase 3: PostgreSQL recall across traps and skills
// ---------------------------------------------------------------------------

describe('createPgDuplicateDetector — PostgreSQL hybrid recall', () => {
  it('queries trap and skill PostgreSQL recall sources for a trap-like candidate', async () => {
    let trapVectorCalled = false;
    let trapKeywordCalled = false;
    let skillVectorCalled = false;
    let skillKeywordCalled = false;

    const pool = buildMockPool((queryText) => {
      if (queryText.includes('skill_artifact_profiles') && queryText.includes('content_hash')) {
        return { rows: [], rowCount: 0 };
      }
      if (queryText.includes('knowledge_embeddings')) {
        trapVectorCalled = true;
        return { rows: [], rowCount: 0 };
      }
      if (queryText.includes('knowledge_keywords')) {
        trapKeywordCalled = true;
        return { rows: [], rowCount: 0 };
      }
      if (queryText.includes('skill_artifact_capsule_embeddings')) {
        skillVectorCalled = true;
        return { rows: [], rowCount: 0 };
      }
      if (queryText.includes('skill_artifact_capsule_keywords')) {
        skillKeywordCalled = true;
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });

    const detect = createPgDuplicateDetector({ pool: pool as never });
    const result = await detect({
      candidateId: 'cand_trap_pg',
      candidateText: 'Proxy timeout after deploy\nKeepalive exhaustion on upstream',
      candidateTokens: ['proxy', 'timeout', 'deploy', 'upstream'],
      candidateKeywords: ['network'],
      candidateFingerprint: 'f'.repeat(64),
      teamId: null,
    });

    expect(result.duplicateCase).toBeNull();
    expect(trapVectorCalled).toBe(true);
    expect(trapKeywordCalled).toBe(true);
    expect(skillVectorCalled).toBe(true);
    expect(skillKeywordCalled).toBe(true);
  });

  it('queries skill-side PostgreSQL recall sources without using fallback full scans', async () => {
    let skillVectorCalled = false;
    let skillKeywordCalled = false;

    const pool = buildMockPool((queryText) => {
      if (queryText.includes('skill_artifact_profiles') && queryText.includes('content_hash')) {
        return { rows: [], rowCount: 0 };
      }
      if (queryText.includes('skill_artifact_capsule_embeddings')) {
        skillVectorCalled = true;
        return { rows: [], rowCount: 0 };
      }
      if (queryText.includes('skill_artifact_capsule_keywords')) {
        skillKeywordCalled = true;
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });

    const detect = createPgDuplicateDetector({ pool: pool as never });
    const result = await detect(
      {
        candidateId: 'cand_skill_pg',
        candidateText: 'Cloudflare SSL redirect troubleshooting\nOrigin certificate mismatch',
        candidateTokens: ['cloudflare', 'ssl', 'redirect', 'origin'],
        candidateKeywords: ['cloudflare'],
        candidateFingerprint: 'e'.repeat(64),
        teamId: null,
      },
      {
        trapEntries: [],
        skillArtifacts: [],
      },
    );

    expect(result.duplicateCase).toBeNull();
    expect(skillVectorCalled).toBe(true);
    expect(skillKeywordCalled).toBe(true);
  });

  it('plans all trap and skill PostgreSQL recall queries for mixed duplicate search', async () => {
    let trapVectorCalled = false;
    let trapKeywordCalled = false;
    let skillVectorCalled = false;
    let skillKeywordCalled = false;

    const pool = buildMockPool((queryText) => {
      if (queryText.includes('skill_artifact_profiles') && queryText.includes('content_hash')) {
        return { rows: [], rowCount: 0 };
      }
      if (queryText.includes('knowledge_embeddings')) {
        trapVectorCalled = true;
        return { rows: [], rowCount: 0 };
      }
      if (queryText.includes('knowledge_keywords')) {
        trapKeywordCalled = true;
        return { rows: [], rowCount: 0 };
      }
      if (queryText.includes('skill_artifact_capsule_embeddings')) {
        skillVectorCalled = true;
        return { rows: [], rowCount: 0 };
      }
      if (queryText.includes('skill_artifact_capsule_keywords')) {
        skillKeywordCalled = true;
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });

    const detect = createPgDuplicateDetector({ pool: pool as never });
    const result = await detect(
      {
        candidateId: 'cand_mixed_pg',
        candidateText: 'Jest worker hangs in CI\nOpen handle deadlocks after tests',
        candidateTokens: ['jest', 'worker', 'ci', 'deadlocks'],
        candidateKeywords: ['testing'],
        candidateFingerprint: 'd'.repeat(64),
        teamId: null,
      },
      {
        trapEntries: [],
        skillArtifacts: [],
      },
    );

    expect(result.duplicateCase).toBeNull();
    expect(trapVectorCalled).toBe(true);
    expect(trapKeywordCalled).toBe(true);
    expect(skillVectorCalled).toBe(true);
    expect(skillKeywordCalled).toBe(true);
  });
});

/**
 * Unit tests for the candidate duplicate detector module.
 *
 * Covers detectDuplicates() and getDetectionVersion() with all internal
 * functions (overlapScore, keywordOverlapPercent, checkTrapDuplicate,
 * checkSkillDuplicate) exercised through the public API.
 *
 * @module candidates/detector
 */

import { describe, expect, it } from 'vitest';

import type { KnowledgeRecord, SkillArtifactRecord } from '@trapmap/server/lib/store.js';
import { nowIso } from '@trapmap/server/lib/store.js';
import { detectDuplicates, getDetectionVersion } from './detector.js';
import { tokenize } from './fingerprint.js';
import type { DuplicateDetectionInput } from './types.js';

// ---------------------------------------------------------------------------
// Factory helpers (adapted from reconcile.test.ts pattern)
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

function createTestSkill(overrides: Partial<SkillArtifactRecord> = {}): SkillArtifactRecord {
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
      derived: null,
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

function createTestInput(
  overrides: Partial<DuplicateDetectionInput> = {},
): DuplicateDetectionInput {
  return {
    candidateId: 'cand_1',
    candidateFingerprint: 'abc123hash',
    candidateKeywords: ['test'],
    candidateTokens: ['test'],
    trapEntries: [],
    skillArtifacts: [],
    threshold: 0.3,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// getDetectionVersion
// ---------------------------------------------------------------------------

describe('getDetectionVersion', () => {
  it('returns "2.0.0"', () => {
    expect(getDetectionVersion()).toBe('2.0.0');
  });
});

// ---------------------------------------------------------------------------
// detectDuplicates
// ---------------------------------------------------------------------------

describe('detectDuplicates', () => {
  // ---- Empty / no-match cases ----

  it('returns null duplicateCase for empty corpus', async () => {
    const input = createTestInput();
    const result = await detectDuplicates(input);

    expect(result.duplicateCase).toBeNull();
  });

  it('returns null duplicateCase when all trap entries are below threshold', async () => {
    const trap = createTestTrap({
      shortcut: 'Completely different topic',
      detail: 'Nothing like the candidate tokens here',
      lifecycleState: 'approved',
    });
    const input = createTestInput({
      candidateTokens: ['unique', 'tokens', 'only'],
      trapEntries: [trap],
      threshold: 0.9, // very high threshold
    });

    const result = await detectDuplicates(input);
    expect(result.duplicateCase).toBeNull();
  });

  it('returns null duplicateCase when trap entries have lifecycleState != "approved"', async () => {
    const trapSubmitted = createTestTrap({
      id: 'trap_submitted',
      lifecycleState: 'submitted',
      shortcut: 'Same title here',
      detail: 'Same detail text here',
      labels: ['test'],
    });
    const trapAgentPass = createTestTrap({
      id: 'trap_agent_pass',
      lifecycleState: 'agent-pass',
      shortcut: 'Same title here',
      detail: 'Same detail text here',
      labels: ['test'],
    });

    // Use tokens that would normally produce a high overlap with the trap text
    const tokens = [...tokenize('Same title here\nSame detail text here')];
    const input = createTestInput({
      candidateTokens: tokens,
      candidateKeywords: ['test'],
      trapEntries: [trapSubmitted, trapAgentPass],
      threshold: 0.3,
    });

    const result = await detectDuplicates(input);
    expect(result.duplicateCase).toBeNull();
  });

  it('returns null duplicateCase when all skill artifacts are below threshold', async () => {
    const skill = createTestSkill({
      lifecycleState: 'approved',
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
            title: 'Totally different skill',
            summary: 'This has nothing in common with candidate tokens',
            keywords: ['unrelated'],
            referencePaths: [],
            contentHash: 'somehash',
          },
          capsules: [],
          clientManifest: null,
          sourceHash: 'hash',
          derivedAt: nowIso(),
        },
      },
    });

    const input = createTestInput({
      candidateTokens: ['unique', 'tokens', 'only'],
      skillArtifacts: [skill],
      threshold: 0.9,
    });

    const result = await detectDuplicates(input);
    expect(result.duplicateCase).toBeNull();
  });

  it('returns null duplicateCase when skill artifacts have lifecycleState != "approved"', async () => {
    const skillSubmitted = createTestSkill({
      id: 'skill_submitted',
      lifecycleState: 'submitted',
      latestRevision: {
        revision: 1,
        sourceHash: 'hash',
        files: [],
        submittedAt: nowIso(),
        submittedByUserId: 'user_1',
        scriptDescriptors: [],
        derived: {
          profile: {
            artifactId: 'skill_submitted',
            revision: 1,
            sourceHash: 'hash',
            title: 'Same title here',
            summary: 'Same detail text here',
            keywords: ['test'],
            referencePaths: [],
            contentHash: 'somehash',
          },
          capsules: [],
          clientManifest: null,
          sourceHash: 'hash',
          derivedAt: nowIso(),
        },
      },
    });

    const tokens = [...tokenize('Same title here\nSame detail text here')];
    const input = createTestInput({
      candidateTokens: tokens,
      candidateKeywords: ['test'],
      skillArtifacts: [skillSubmitted],
      threshold: 0.3,
    });

    const result = await detectDuplicates(input);
    expect(result.duplicateCase).toBeNull();
  });

  // ---- Trap match cases ----

  it('detects trap match when candidate tokens overlap with approved trap above threshold', async () => {
    const trap = createTestTrap({
      id: 'trap_match',
      shortcut: 'Same title here',
      detail: 'Same detail text here',
      labels: ['test'],
      lifecycleState: 'approved',
    });

    // Use the actual tokenized output of the trap's text for deterministic similarity
    const tokens = [...tokenize('Same title here\nSame detail text here')];
    const input = createTestInput({
      candidateTokens: tokens,
      candidateKeywords: ['test'],
      trapEntries: [trap],
      threshold: 0.3,
    });

    const result = await detectDuplicates(input);
    expect(result.duplicateCase).not.toBeNull();
    expect(result.duplicateCase!.matches.length).toBeGreaterThanOrEqual(1);
    expect(result.duplicateCase!.matches[0].entityType).toBe('trap');
    expect(result.duplicateCase!.matches[0].entityId).toBe('trap_match');
  });

  it('trap match result includes correct entityType, entityId, entityTitle, similarityScore, and matchType', async () => {
    const trap = createTestTrap({
      id: 'trap_fields',
      shortcut: 'Duplicate knowledge entry about React hooks',
      detail: 'This trap explains how to use React hooks effectively',
      labels: ['react'],
      lifecycleState: 'approved',
    });

    const tokens = [
      ...tokenize(
        'Duplicate knowledge entry about React hooks\nThis trap explains how to use React hooks effectively',
      ),
    ];
    const input = createTestInput({
      candidateTokens: tokens,
      candidateKeywords: ['react'],
      trapEntries: [trap],
      threshold: 0.3,
    });

    const result = await detectDuplicates(input);
    const match = result.duplicateCase!.matches[0];

    expect(match.entityType).toBe('trap');
    expect(match.entityId).toBe('trap_fields');
    // entityTitle should be shortcut truncated to 280 chars
    expect(match.entityTitle).toBe(trap.shortcut.slice(0, 280));
    expect(typeof match.similarityScore).toBe('number');
    expect(match.similarityScore).toBeGreaterThan(0);
    // Since no exact fingerprint match for traps, should be high-overlap or semantic-similar
    expect(['high-overlap', 'semantic-similar']).toContain(match.matchType);
  });

  it('trap match overlapDetails includes sharedKeywords and sharedTokens', async () => {
    const trap = createTestTrap({
      id: 'trap_overlap',
      shortcut: 'Test knowledge entry for overlapping',
      detail: 'Detailed explanation about testing patterns',
      labels: ['testing'],
      lifecycleState: 'approved',
    });

    const tokens = [
      ...tokenize(
        'Test knowledge entry for overlapping\nDetailed explanation about testing patterns',
      ),
    ];
    const input = createTestInput({
      candidateTokens: tokens,
      candidateKeywords: ['testing'],
      trapEntries: [trap],
      threshold: 0.3,
    });

    const result = await detectDuplicates(input);
    const match = result.duplicateCase!.matches[0];

    expect(match.overlapDetails).toBeDefined();
    expect(Array.isArray(match.overlapDetails.sharedKeywords)).toBe(true);
    expect(Array.isArray(match.overlapDetails.sharedTokens)).toBe(true);
    // 'testing' is in candidateKeywords and trap labels
    expect(match.overlapDetails.sharedKeywords).toContain('testing');
    // There should be shared tokens since we used the same text
    expect(match.overlapDetails.sharedTokens.length).toBeGreaterThan(0);
  });

  // ---- Skill match cases ----

  it('detects skill match when candidate tokens overlap with approved skill above threshold', async () => {
    const skill = createTestSkill({
      id: 'skill_match',
      lifecycleState: 'approved',
      latestRevision: {
        revision: 1,
        sourceHash: 'hash',
        files: [],
        submittedAt: nowIso(),
        submittedByUserId: 'user_1',
        scriptDescriptors: [],
        derived: {
          profile: {
            artifactId: 'skill_match',
            revision: 1,
            sourceHash: 'hash',
            title: 'Same title here',
            summary: 'Same detail text here',
            keywords: ['test'],
            referencePaths: [],
            contentHash: 'somehash',
          },
          capsules: [],
          clientManifest: null,
          sourceHash: 'hash',
          derivedAt: nowIso(),
        },
      },
    });

    const tokens = [...tokenize('Same title here\nSame detail text here')];
    const input = createTestInput({
      candidateTokens: tokens,
      candidateKeywords: ['test'],
      skillArtifacts: [skill],
      threshold: 0.3,
    });

    const result = await detectDuplicates(input);
    expect(result.duplicateCase).not.toBeNull();
    const match = result.duplicateCase!.matches[0];
    expect(match.entityType).toBe('skill');
    expect(match.entityId).toBe('skill_match');
  });

  it('exact fingerprint match produces matchType "exact"', async () => {
    const contentHash = 'exact_fingerprint_hash_value';
    const skill = createTestSkill({
      id: 'skill_exact',
      lifecycleState: 'approved',
      latestRevision: {
        revision: 1,
        sourceHash: 'hash',
        files: [],
        submittedAt: nowIso(),
        submittedByUserId: 'user_1',
        scriptDescriptors: [],
        derived: {
          profile: {
            artifactId: 'skill_exact',
            revision: 1,
            sourceHash: 'hash',
            title: 'Exact fingerprint test title',
            summary: 'Exact fingerprint test summary content',
            keywords: ['fingerprint'],
            referencePaths: [],
            contentHash,
          },
          capsules: [],
          clientManifest: null,
          sourceHash: 'hash',
          derivedAt: nowIso(),
        },
      },
    });

    const tokens = [
      ...tokenize('Exact fingerprint test title\nExact fingerprint test summary content'),
    ];
    const input = createTestInput({
      candidateTokens: tokens,
      candidateKeywords: ['fingerprint'],
      candidateFingerprint: contentHash, // match the contentHash
      skillArtifacts: [skill],
      threshold: 0.3,
    });

    const result = await detectDuplicates(input);
    expect(result.duplicateCase).not.toBeNull();
    const match = result.duplicateCase!.matches[0];
    expect(match.matchType).toBe('exact');
  });

  it('skill without profile (derived=null) returns no match for that artifact', async () => {
    const skill = createTestSkill({
      id: 'skill_no_profile',
      lifecycleState: 'approved',
      latestRevision: {
        revision: 1,
        sourceHash: 'hash',
        files: [],
        submittedAt: nowIso(),
        submittedByUserId: 'user_1',
        scriptDescriptors: [],
        derived: null, // no profile
      },
    });

    const tokens = ['some', 'tokens', 'here'];
    const input = createTestInput({
      candidateTokens: tokens,
      skillArtifacts: [skill],
      threshold: 0.3,
    });

    const result = await detectDuplicates(input);
    expect(result.duplicateCase).toBeNull();
  });

  // ---- Sorting and limiting ----

  it('sorts matches by similarityScore descending (highest first)', async () => {
    // High similarity trap: identical text
    const trapHigh = createTestTrap({
      id: 'trap_high',
      shortcut: 'Completely identical knowledge entry text',
      detail: 'Completely identical knowledge entry detail text',
      labels: ['test'],
      lifecycleState: 'approved',
    });

    // Medium similarity trap: partially overlapping
    const trapMed = createTestTrap({
      id: 'trap_med',
      shortcut: 'Partially overlapping topic here',
      detail: 'Some different detail about something else entirely unique',
      labels: ['test'],
      lifecycleState: 'approved',
    });

    // Low similarity trap: very different
    const trapLow = createTestTrap({
      id: 'trap_low',
      shortcut: 'Entirely unrelated content discussion',
      detail: 'Completely separate topic about different matters altogether',
      labels: ['other'],
      lifecycleState: 'approved',
    });

    const tokens = [
      ...tokenize(
        'Completely identical knowledge entry text\nCompletely identical knowledge entry detail text',
      ),
    ];
    const input = createTestInput({
      candidateTokens: tokens,
      candidateKeywords: ['test'],
      trapEntries: [trapLow, trapHigh, trapMed], // pass in unsorted order
      threshold: 0.1,
    });

    const result = await detectDuplicates(input);
    expect(result.duplicateCase).not.toBeNull();
    const matches = result.duplicateCase!.matches;

    // Verify sorted descending
    for (let i = 1; i < matches.length; i++) {
      expect(matches[i - 1].similarityScore).toBeGreaterThanOrEqual(matches[i].similarityScore);
    }
  });

  it('limits matches to top 10', async () => {
    // Create 12 traps with identical content so they all match
    const traps: KnowledgeRecord[] = [];
    for (let i = 0; i < 12; i++) {
      traps.push(
        createTestTrap({
          id: `trap_dup_${i}`,
          shortcut: 'Duplicate knowledge entry text',
          detail: 'Duplicate knowledge entry detail text for limiting test',
          labels: ['test'],
          lifecycleState: 'approved',
        }),
      );
    }

    const tokens = [
      ...tokenize(
        'Duplicate knowledge entry text\nDuplicate knowledge entry detail text for limiting test',
      ),
    ];
    const input = createTestInput({
      candidateTokens: tokens,
      candidateKeywords: ['test'],
      trapEntries: traps,
      threshold: 0.3,
    });

    const result = await detectDuplicates(input);
    expect(result.duplicateCase).not.toBeNull();
    expect(result.duplicateCase!.matches.length).toBe(10);
  });

  // ---- Result structure ----

  it('duplicateCase has correct structural fields', async () => {
    const trap = createTestTrap({
      id: 'trap_struct',
      shortcut: 'Structural verification test title',
      detail: 'Structural verification test detail',
      labels: ['test'],
      lifecycleState: 'approved',
    });

    const tokens = [
      ...tokenize('Structural verification test title\nStructural verification test detail'),
    ];
    const input = createTestInput({
      candidateId: 'cand_struct',
      candidateTokens: tokens,
      candidateKeywords: ['test'],
      trapEntries: [trap],
      threshold: 0.3,
    });

    const result = await detectDuplicates(input);
    const dc = result.duplicateCase!;

    expect(dc.id).toMatch(/^dupcase_/);
    expect(dc.candidateId).toBe('cand_struct');
    expect(dc.detectedAt).toBeTruthy();
    expect(dc.detectionVersion).toBe('2.0.0');
    expect(Array.isArray(dc.matches)).toBe(true);
    expect(dc.matches.length).toBeGreaterThanOrEqual(1);
    expect(typeof dc.highestSimilarity).toBe('number');
    expect(typeof dc.hasExactDuplicate).toBe('boolean');
    expect(typeof dc.duplicateType).toBe('string');
  });

  it('duplicateType is "exact" when hasExactDuplicate is true', async () => {
    const contentHash = 'exact_dup_type_hash';
    const skill = createTestSkill({
      id: 'skill_dup_type',
      lifecycleState: 'approved',
      latestRevision: {
        revision: 1,
        sourceHash: 'hash',
        files: [],
        submittedAt: nowIso(),
        submittedByUserId: 'user_1',
        scriptDescriptors: [],
        derived: {
          profile: {
            artifactId: 'skill_dup_type',
            revision: 1,
            sourceHash: 'hash',
            title: 'Exact duplicate type testing title',
            summary: 'Exact duplicate type testing summary content',
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
    });

    const tokens = [
      ...tokenize(
        'Exact duplicate type testing title\nExact duplicate type testing summary content',
      ),
    ];
    const input = createTestInput({
      candidateTokens: tokens,
      candidateKeywords: ['test'],
      candidateFingerprint: contentHash,
      skillArtifacts: [skill],
      threshold: 0.3,
    });

    const result = await detectDuplicates(input);
    expect(result.duplicateCase!.hasExactDuplicate).toBe(true);
    expect(result.duplicateCase!.duplicateType).toBe('exact');
  });

  it('duplicateType is "semantic" when highestSimilarity >= 0.72 but no exact match', async () => {
    // Create a trap with identical text to guarantee very high overlap (>= 0.72)
    const trap = createTestTrap({
      id: 'trap_semantic',
      shortcut: 'Semantic type verification test title entry',
      detail: 'Semantic type verification test detail content explanation',
      labels: ['test'],
      lifecycleState: 'approved',
    });

    const tokens = [
      ...tokenize(
        'Semantic type verification test title entry\nSemantic type verification test detail content explanation',
      ),
    ];
    const input = createTestInput({
      candidateTokens: tokens,
      candidateKeywords: ['test'],
      trapEntries: [trap],
      threshold: 0.3,
    });

    const result = await detectDuplicates(input);
    expect(result.duplicateCase).not.toBeNull();
    expect(result.duplicateCase!.hasExactDuplicate).toBe(false);
    // Traps never produce exact fingerprint matches, so if similarity >= 0.72 -> semantic
    expect(result.duplicateCase!.highestSimilarity).toBeGreaterThanOrEqual(0.72);
    expect(result.duplicateCase!.duplicateType).toBe('semantic');
  });

  // ---- analysisSnapshot ----

  it('result includes analysisSnapshot with fields matching input', async () => {
    const input = createTestInput({
      candidateFingerprint: 'fp_snapshot_test',
      candidateKeywords: ['keyword1', 'keyword2'],
      candidateTokens: ['token1', 'token2', 'token3'],
    });

    const result = await detectDuplicates(input);

    expect(result.analysisSnapshot).toBeDefined();
    expect(result.analysisSnapshot.normalizedAt).toBeTruthy();
    expect(result.analysisSnapshot.fingerprint).toBe('fp_snapshot_test');
    expect(result.analysisSnapshot.keywords).toEqual(['keyword1', 'keyword2']);
    expect(result.analysisSnapshot.tokens).toEqual(['token1', 'token2', 'token3']);
  });
});

/**
 * Nyquist adversarial validation tests for candidate duplicate detector.
 *
 * Validates gap claims:
 * - detectDuplicates returns null for empty corpus
 * - detectDuplicates detects trap matches above threshold
 * - detectDuplicates detects skill matches with correct match types
 * - detectDuplicates respects lifecycle filtering (only 'approved')
 * - detectDuplicates sorts by similarity descending and limits to top 10
 * - Exact fingerprint produces matchType='exact'
 * - similarityScore has 3-decimal precision
 */

import type { KnowledgeRecord, SkillArtifactRecord } from '@trapmap/server/lib/store.js';
import { nowIso } from '@trapmap/server/lib/store.js';
import { describe, expect, it } from 'vitest';
import { detectDuplicates, getDetectionVersion } from './detector.js';
import { tokenize } from './fingerprint.js';
import type { DuplicateDetectionInput } from './types.js';

function makeTrap(overrides: Partial<KnowledgeRecord> = {}): KnowledgeRecord {
  return {
    id: 'trap_nyq',
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

function makeSkill(overrides: Partial<SkillArtifactRecord> = {}): SkillArtifactRecord {
  return {
    id: 'skill_nyq',
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

function makeInput(overrides: Partial<DuplicateDetectionInput> = {}): DuplicateDetectionInput {
  return {
    candidateId: 'cand_nyq',
    candidateFingerprint: 'fp_nyq',
    candidateKeywords: ['test'],
    candidateTokens: ['test'],
    trapEntries: [],
    skillArtifacts: [],
    threshold: 0.3,
    ...overrides,
  };
}

describe('Nyquist: detectDuplicates returns null for empty corpus', () => {
  it('returns null duplicateCase when no trapEntries and no skillArtifacts', async () => {
    const result = await detectDuplicates(makeInput());
    expect(result.duplicateCase).toBeNull();
  });

  it('still includes analysisSnapshot even for empty corpus', async () => {
    const result = await detectDuplicates(makeInput());
    expect(result.analysisSnapshot).toBeDefined();
    expect(result.analysisSnapshot.fingerprint).toBe('fp_nyq');
  });
});

describe('Nyquist: detectDuplicates skips non-approved entries', () => {
  it('returns null when only non-approved traps exist', async () => {
    const trap = makeTrap({ lifecycleState: 'submitted' });
    const tokens = [...tokenize('Test trap\nTest detail')];
    const input = makeInput({ candidateTokens: tokens, trapEntries: [trap] });
    const result = await detectDuplicates(input);
    expect(result.duplicateCase).toBeNull();
  });

  it('returns null when only non-approved skills exist', async () => {
    const skill = makeSkill({
      lifecycleState: 'agent-pass',
      latestRevision: {
        revision: 1,
        sourceHash: 'hash',
        files: [],
        submittedAt: nowIso(),
        submittedByUserId: 'user_1',
        scriptDescriptors: [],
        derived: {
          profile: {
            artifactId: 'skill_nyq',
            revision: 1,
            sourceHash: 'hash',
            title: 'Test Skill',
            summary: 'Test detail',
            keywords: ['test'],
            referencePaths: [],
            contentHash: 'hash',
          },
          capsules: [],
          clientManifest: null,
          sourceHash: 'hash',
          derivedAt: nowIso(),
        },
      },
    });
    const tokens = [...tokenize('Test Skill\nTest detail')];
    const input = makeInput({ candidateTokens: tokens, skillArtifacts: [skill] });
    const result = await detectDuplicates(input);
    expect(result.duplicateCase).toBeNull();
  });
});

describe('Nyquist: detectDuplicates detects trap matches above threshold', () => {
  it('produces a match when candidate tokens have high overlap with approved trap', async () => {
    const text = 'React hooks useEffect cleanup function pattern';
    const trap = makeTrap({ shortcut: text, detail: 'Detailed guide', lifecycleState: 'approved' });
    const tokens = [...tokenize(`${text}\nDetailed guide`)];
    const input = makeInput({ candidateTokens: tokens, trapEntries: [trap], threshold: 0.3 });

    const result = await detectDuplicates(input);
    expect(result.duplicateCase).not.toBeNull();
    expect(result.duplicateCase!.matches[0].entityType).toBe('trap');
  });

  it('produces no match when overlap is below threshold', async () => {
    const trap = makeTrap({
      shortcut: 'Completely different content',
      detail: 'No overlap at all',
    });
    const input = makeInput({
      candidateTokens: ['unique', 'tokens', 'only'],
      trapEntries: [trap],
      threshold: 0.99,
    });

    const result = await detectDuplicates(input);
    expect(result.duplicateCase).toBeNull();
  });
});

describe('Nyquist: detectDuplicates detects skill matches with exact fingerprint', () => {
  it('produces matchType "exact" when candidateFingerprint matches skill contentHash', async () => {
    const contentHash = 'exact_hash_nyquist_test';
    const skill = makeSkill({
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
            artifactId: 'skill_nyq',
            revision: 1,
            sourceHash: 'hash',
            title: 'Exact Match Test',
            summary: 'Exact match summary',
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

    const tokens = [...tokenize('Exact Match Test\nExact match summary')];
    const input = makeInput({
      candidateTokens: tokens,
      candidateFingerprint: contentHash,
      skillArtifacts: [skill],
      threshold: 0.3,
    });

    const result = await detectDuplicates(input);
    expect(result.duplicateCase).not.toBeNull();
    expect(result.duplicateCase!.matches[0].matchType).toBe('exact');
    expect(result.duplicateCase!.duplicateType).toBe('exact');
  });

  it('produces non-exact matchType when fingerprint does not match', async () => {
    const skill = makeSkill({
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
            artifactId: 'skill_nyq',
            revision: 1,
            sourceHash: 'hash',
            title: 'Non Exact Test',
            summary: 'Non exact summary',
            keywords: ['test'],
            referencePaths: [],
            contentHash: 'different_hash',
          },
          capsules: [],
          clientManifest: null,
          sourceHash: 'hash',
          derivedAt: nowIso(),
        },
      },
    });

    const tokens = [...tokenize('Non Exact Test\nNon exact summary')];
    const input = makeInput({
      candidateTokens: tokens,
      candidateFingerprint: 'does_not_match',
      skillArtifacts: [skill],
      threshold: 0.3,
    });

    const result = await detectDuplicates(input);
    expect(result.duplicateCase).not.toBeNull();
    // Without exact fingerprint, matchType should not be 'exact'
    expect(result.duplicateCase!.matches[0].matchType).not.toBe('exact');
  });
});

describe('Nyquist: detectDuplicates sorts and limits results', () => {
  it('sorts matches by similarityScore descending', async () => {
    const textHigh = 'High similarity text content for sorting test';
    const textLow = 'Low similarity completely different topic discussion';
    const trapHigh = makeTrap({
      id: 'high',
      shortcut: textHigh,
      detail: 'details',
      lifecycleState: 'approved',
    });
    const trapLow = makeTrap({
      id: 'low',
      shortcut: textLow,
      detail: 'other stuff',
      lifecycleState: 'approved',
    });

    const tokens = [...tokenize(`${textHigh}\ndetails`)];
    const input = makeInput({
      candidateTokens: tokens,
      trapEntries: [trapLow, trapHigh], // pass low first
      threshold: 0.1,
    });

    const result = await detectDuplicates(input);
    expect(result.duplicateCase).not.toBeNull();
    const scores = result.duplicateCase!.matches.map((m) => m.similarityScore);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i - 1]).toBeGreaterThanOrEqual(scores[i]);
    }
  });

  it('limits to at most 10 matches', async () => {
    const traps: KnowledgeRecord[] = [];
    const text = 'Identical content for all traps';
    for (let i = 0; i < 15; i++) {
      traps.push(
        makeTrap({
          id: `trap_limit_${i}`,
          shortcut: text,
          detail: 'identical detail',
          lifecycleState: 'approved',
        }),
      );
    }

    const tokens = [...tokenize(`${text}\nidentical detail`)];
    const input = makeInput({ candidateTokens: tokens, trapEntries: traps, threshold: 0.3 });

    const result = await detectDuplicates(input);
    expect(result.duplicateCase).not.toBeNull();
    expect(result.duplicateCase!.matches.length).toBeLessThanOrEqual(10);
  });
});

describe('Nyquist: getDetectionVersion returns correct version', () => {
  it('returns "2.0.0"', () => {
    expect(getDetectionVersion()).toBe('2.0.0');
  });
});

describe('Nyquist: detectDuplicates similarityScore has 3-decimal precision', () => {
  it('similarityScore is rounded to 3 decimal places', async () => {
    const text = 'Precision test for similarity score rounding';
    const trap = makeTrap({ shortcut: text, detail: 'rounding check', lifecycleState: 'approved' });
    const tokens = [...tokenize(`${text}\nrounding check`)];
    const input = makeInput({ candidateTokens: tokens, trapEntries: [trap], threshold: 0.1 });

    const result = await detectDuplicates(input);
    expect(result.duplicateCase).not.toBeNull();
    const score = result.duplicateCase!.matches[0].similarityScore;
    // A 3-decimal rounded number, when multiplied by 1000, should be an integer
    expect(score * 1000).toBe(Math.round(score * 1000));
  });
});

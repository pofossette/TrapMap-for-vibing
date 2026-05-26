import { describe, expect, it } from 'vitest';

import {
  CandidateSubmissionSchema,
  DuplicateCaseSchema,
  ResolutionOutcomeSchema,
  SkillBundleFileMetadataSchema,
  applyResolutionResponseSchema,
  candidateListResponseSchema,
  candidateSkillSubmissionSchema,
  candidateStatusResponseSchema,
} from './candidates.js';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const VALID_ISO = '2026-05-26T12:00:00+00:00';
const ENTITY_ID = 'entity-abc-123';

const validOverlapDetails = {
  sharedKeywords: ['test'],
  sharedTokens: ['tok'],
  textOverlapPercent: 50,
};

function makeMatch(overrides: Record<string, unknown> = {}) {
  return {
    entityType: 'trap' as const,
    entityId: 'match-1',
    entityTitle: 'Some match',
    similarityScore: 0.9,
    matchType: 'high-overlap' as const,
    overlapDetails: validOverlapDetails,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. SkillBundleFileMetadataSchema — sha256 hex + IANA mediaType
// ---------------------------------------------------------------------------

describe('SkillBundleFileMetadataSchema', () => {
  const validFile = {
    path: 'src/index.ts',
    sha256: 'a'.repeat(64),
    sizeBytes: 100,
    mediaType: 'text/plain',
  };

  it('accepts valid metadata with lowercase hex sha256 and IANA media type', () => {
    expect(() => SkillBundleFileMetadataSchema.parse(validFile)).not.toThrow();
  });

  it('rejects sha256 with uppercase hex characters', () => {
    expect(() =>
      SkillBundleFileMetadataSchema.parse({
        ...validFile,
        sha256: 'A'.repeat(64),
      }),
    ).toThrow();
  });

  it('rejects sha256 with non-hex characters', () => {
    expect(() =>
      SkillBundleFileMetadataSchema.parse({
        ...validFile,
        sha256: 'g'.repeat(64),
      }),
    ).toThrow();
  });

  it('rejects sha256 with wrong length', () => {
    expect(() =>
      SkillBundleFileMetadataSchema.parse({
        ...validFile,
        sha256: 'a'.repeat(63),
      }),
    ).toThrow();
  });

  it('accepts IANA media type with subtype specials (+, ., -)', () => {
    expect(() =>
      SkillBundleFileMetadataSchema.parse({
        ...validFile,
        mediaType: 'application/vnd.api+json',
      }),
    ).not.toThrow();
  });

  it('rejects mediaType without slash', () => {
    expect(() =>
      SkillBundleFileMetadataSchema.parse({
        ...validFile,
        mediaType: 'plaintext',
      }),
    ).toThrow();
  });

  it('rejects mediaType with spaces', () => {
    expect(() =>
      SkillBundleFileMetadataSchema.parse({
        ...validFile,
        mediaType: 'text / plain',
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 2. DuplicateCaseSchema — relationship constraints
// ---------------------------------------------------------------------------

describe('DuplicateCaseSchema', () => {
  const baseCase = {
    id: ENTITY_ID,
    candidateId: 'cand-1',
    detectedAt: VALID_ISO,
    detectionVersion: '1.0.0',
  };

  it('accepts valid duplicate case with sorted matches', () => {
    const result = DuplicateCaseSchema.parse({
      ...baseCase,
      matches: [
        makeMatch({ similarityScore: 0.95, matchType: 'exact' }),
        makeMatch({ similarityScore: 0.7 }),
      ],
      highestSimilarity: 0.95,
      hasExactDuplicate: true,
      duplicateType: 'exact',
    });
    expect(result.highestSimilarity).toBe(0.95);
  });

  it('rejects matches not sorted by similarity descending', () => {
    expect(() =>
      DuplicateCaseSchema.parse({
        ...baseCase,
        matches: [makeMatch({ similarityScore: 0.5 }), makeMatch({ similarityScore: 0.9 })],
        highestSimilarity: 0.9,
        hasExactDuplicate: false,
        duplicateType: 'semantic',
      }),
    ).toThrow(/sorted/i);
  });

  it('rejects when highestSimilarity does not equal max of matches', () => {
    expect(() =>
      DuplicateCaseSchema.parse({
        ...baseCase,
        matches: [makeMatch({ similarityScore: 0.9 }), makeMatch({ similarityScore: 0.7 })],
        highestSimilarity: 0.8,
        hasExactDuplicate: false,
        duplicateType: 'semantic',
      }),
    ).toThrow(/highestSimilarity/);
  });

  it('rejects hasExactDuplicate=true when no match has matchType "exact"', () => {
    expect(() =>
      DuplicateCaseSchema.parse({
        ...baseCase,
        matches: [makeMatch({ similarityScore: 0.8, matchType: 'high-overlap' })],
        highestSimilarity: 0.8,
        hasExactDuplicate: true,
        duplicateType: 'semantic',
      }),
    ).toThrow(/hasExactDuplicate/);
  });

  it('rejects hasExactDuplicate=false when a match has matchType "exact"', () => {
    expect(() =>
      DuplicateCaseSchema.parse({
        ...baseCase,
        matches: [makeMatch({ similarityScore: 1.0, matchType: 'exact' })],
        highestSimilarity: 1.0,
        hasExactDuplicate: false,
        duplicateType: 'semantic',
      }),
    ).toThrow(/hasExactDuplicate/);
  });

  it('rejects duplicateType="exact" when hasExactDuplicate is false', () => {
    expect(() =>
      DuplicateCaseSchema.parse({
        ...baseCase,
        matches: [makeMatch({ similarityScore: 0.8 })],
        highestSimilarity: 0.8,
        hasExactDuplicate: false,
        duplicateType: 'exact',
      }),
    ).toThrow(/duplicateType/);
  });

  it('rejects duplicateType="none" when hasExactDuplicate is true', () => {
    expect(() =>
      DuplicateCaseSchema.parse({
        ...baseCase,
        matches: [makeMatch({ similarityScore: 0.8, matchType: 'exact' })],
        highestSimilarity: 0.8,
        hasExactDuplicate: true,
        duplicateType: 'none',
      }),
    ).toThrow(/duplicateType/);
  });

  it('accepts duplicateType="semantic" regardless of hasExactDuplicate', () => {
    expect(() =>
      DuplicateCaseSchema.parse({
        ...baseCase,
        matches: [makeMatch({ similarityScore: 0.8, matchType: 'high-overlap' })],
        highestSimilarity: 0.8,
        hasExactDuplicate: false,
        duplicateType: 'semantic',
      }),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 3. CandidateSubmissionSchema — mergedWith required when decision='merged'
// ---------------------------------------------------------------------------

describe('CandidateSubmissionSchema', () => {
  const baseSubmission = {
    id: ENTITY_ID,
    sourceType: 'trap' as const,
    submittedBy: 'user-1',
    teamId: null,
    status: 'resolved' as const,
    originalPayload: {},
    analysisSnapshot: null,
    duplicateCase: null,
    receivedAt: VALID_ISO,
    queuedAt: null,
    analyzingAt: null,
    completedAt: null,
    lastError: null,
    retryCount: 0,
  };

  it('accepts null manualResult', () => {
    expect(() =>
      CandidateSubmissionSchema.parse({
        ...baseSubmission,
        manualResult: null,
      }),
    ).not.toThrow();
  });

  it('accepts merged decision with mergedWith present', () => {
    expect(() =>
      CandidateSubmissionSchema.parse({
        ...baseSubmission,
        manualResult: {
          decision: 'merged',
          notes: 'Duplicate of existing entry',
          mergedWith: {
            entityType: 'trap',
            entityId: 'existing-entity',
          },
          submittedAt: VALID_ISO,
          submittedBy: 'reviewer-1',
        },
      }),
    ).not.toThrow();
  });

  it('rejects merged decision without mergedWith', () => {
    expect(() =>
      CandidateSubmissionSchema.parse({
        ...baseSubmission,
        manualResult: {
          decision: 'merged',
          notes: 'Duplicate of existing entry',
          submittedAt: VALID_ISO,
          submittedBy: 'reviewer-1',
        },
      }),
    ).toThrow(/mergedWith/);
  });

  it('accepts independent decision without mergedWith', () => {
    expect(() =>
      CandidateSubmissionSchema.parse({
        ...baseSubmission,
        manualResult: {
          decision: 'independent',
          notes: 'Not a duplicate',
          submittedAt: VALID_ISO,
          submittedBy: 'reviewer-1',
        },
      }),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 4. candidateSkillSubmissionSchema — files .min(1)
// ---------------------------------------------------------------------------

describe('candidateSkillSubmissionSchema', () => {
  it('accepts at least one file', () => {
    expect(() =>
      candidateSkillSubmissionSchema.parse({
        files: [{ path: 'index.ts', content: 'Y29udGVudA==', mediaType: 'text/plain' }],
        scope: 'global',
        labels: ['test'],
      }),
    ).not.toThrow();
  });

  it('rejects empty files array', () => {
    expect(() =>
      candidateSkillSubmissionSchema.parse({
        files: [],
        scope: 'global',
        labels: ['test'],
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 5. candidateStatusResponseSchema — .strict()
// ---------------------------------------------------------------------------

describe('candidateStatusResponseSchema (strict)', () => {
  it('rejects objects with unknown properties', () => {
    expect(() =>
      candidateStatusResponseSchema.parse({
        candidate: {
          id: ENTITY_ID,
          sourceType: 'trap',
          submittedBy: 'user-1',
          teamId: null,
          status: 'received',
          originalPayload: {},
          analysisSnapshot: null,
          duplicateCase: null,
          receivedAt: VALID_ISO,
          queuedAt: null,
          analyzingAt: null,
          completedAt: null,
          lastError: null,
          retryCount: 0,
          manualResult: null,
        },
        extraProp: 'should fail',
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 6. candidateListResponseSchema — .strict()
// ---------------------------------------------------------------------------

describe('candidateListResponseSchema (strict)', () => {
  it('rejects objects with unknown properties', () => {
    expect(() =>
      candidateListResponseSchema.parse({
        items: [],
        total: 0,
        extraProp: 'should fail',
      }),
    ).toThrow();
  });

  it('accepts valid object without extra properties', () => {
    expect(() =>
      candidateListResponseSchema.parse({
        items: [],
        total: 0,
      }),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 7. ResolutionOutcomeSchema — .strict()
// ---------------------------------------------------------------------------

describe('ResolutionOutcomeSchema (strict)', () => {
  const validOutcome = {
    candidateId: ENTITY_ID,
    decision: 'independent' as const,
    publishedEntityId: 'pub-1',
    mergedIntoEntityId: null,
    entityType: 'trap' as const,
    resolvedAt: VALID_ISO,
    resolvedBy: 'reviewer-1',
    notes: 'Looks good',
  };

  it('accepts valid outcome without extra properties', () => {
    expect(() => ResolutionOutcomeSchema.parse(validOutcome)).not.toThrow();
  });

  it('rejects objects with unknown properties', () => {
    expect(() =>
      ResolutionOutcomeSchema.parse({
        ...validOutcome,
        extraProp: 'should fail',
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 8. applyResolutionResponseSchema — independent cannot have merged_into lineage
// ---------------------------------------------------------------------------

describe('applyResolutionResponseSchema', () => {
  const baseResponse = {
    candidateId: ENTITY_ID,
    status: 'resolved' as const,
    outcome: {
      candidateId: ENTITY_ID,
      decision: 'independent' as const,
      publishedEntityId: 'pub-1',
      mergedIntoEntityId: null,
      entityType: 'trap' as const,
      resolvedAt: VALID_ISO,
      resolvedBy: 'reviewer-1',
      notes: 'ok',
    },
  };

  const validLineage = {
    id: 'lineage-1',
    candidateId: ENTITY_ID,
    relationshipType: 'published_as' as const,
    sourceType: 'candidate' as const,
    sourceId: ENTITY_ID,
    targetType: 'trap' as const,
    targetId: 'pub-1',
    createdAt: VALID_ISO,
    notes: null,
  };

  it('accepts independent decision with published_as lineage', () => {
    expect(() =>
      applyResolutionResponseSchema.parse({
        ...baseResponse,
        lineage: validLineage,
      }),
    ).not.toThrow();
  });

  it('accepts independent decision with null lineage', () => {
    expect(() =>
      applyResolutionResponseSchema.parse({
        ...baseResponse,
        lineage: null,
      }),
    ).not.toThrow();
  });

  it('rejects independent decision with merged_into lineage', () => {
    expect(() =>
      applyResolutionResponseSchema.parse({
        ...baseResponse,
        lineage: {
          ...validLineage,
          relationshipType: 'merged_into',
        },
      }),
    ).toThrow(/merged_into/);
  });

  it('accepts merged decision with merged_into lineage', () => {
    expect(() =>
      applyResolutionResponseSchema.parse({
        ...baseResponse,
        outcome: {
          ...baseResponse.outcome,
          decision: 'merged' as const,
          publishedEntityId: null,
          mergedIntoEntityId: 'existing-entity',
        },
        lineage: {
          ...validLineage,
          relationshipType: 'merged_into' as const,
          targetId: 'existing-entity',
        },
      }),
    ).not.toThrow();
  });
});

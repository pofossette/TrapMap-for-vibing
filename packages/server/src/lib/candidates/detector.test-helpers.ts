import { createRetrievalKnowledgeFixture } from '@trapmap/contracts';
import type { KnowledgeRecord, SkillArtifactRecord } from '@trapmap/server/lib/store.js';
import { nowIso } from '@trapmap/server/lib/store.js';
import type { DuplicateDetectionInput } from './types.js';

export function createDetectorTrap(
  overrides: Partial<KnowledgeRecord> = {},
  id = 'trap_1',
): KnowledgeRecord {
  return {
    ...createRetrievalKnowledgeFixture(id, {
      shortcut: 'Test trap',
      detail: 'Test detail',
    }),
    ...overrides,
  };
}

export function createDetectorSkill(
  overrides: Partial<SkillArtifactRecord> = {},
  id = 'skill_1',
  contentHash?: string,
): SkillArtifactRecord {
  const now = nowIso();
  return {
    id,
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
      submittedAt: now,
      submittedByUserId: 'user_1',
      scriptDescriptors: [],
      derived: contentHash
        ? {
            profile: {
              artifactId: id,
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
            derivedAt: now,
          }
        : null,
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
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function createDetectorInput(
  overrides: Partial<DuplicateDetectionInput> = {},
  candidateId = 'cand_1',
): DuplicateDetectionInput {
  return {
    candidateId,
    candidateFingerprint: 'abc123hash',
    candidateKeywords: ['test'],
    candidateTokens: ['test'],
    trapEntries: [],
    skillArtifacts: [],
    threshold: 0.3,
    ...overrides,
  };
}

/**
 * Tests for manual result revalidation logic.
 *
 * This module covers:
 * - Candidate existence validation
 * - Status validation (must be duplicate_detected)
 * - Manual result attachment validation
 * - Merge target validation (exists and not deactivated)
 * - Idempotency checks
 */

import { describe, expect, it } from 'vitest';
import type { StoreData, KnowledgeRecord, SkillArtifactRecord } from '../store.js';
import { nowIso, JsonStore } from '../store.js';
import {
  revalidateManualResult,
  isAlreadyResolved,
  REVALIDATION_ERRORS,
  publishTrapCandidate,
  publishSkillCandidate,
} from './reconcile.js';
import type { CandidateSubmission, ManualResultSubmission } from '@trapmap/contracts';

// Helper to create minimal candidate
function createTestCandidate(overrides: Partial<CandidateSubmission> = {}): CandidateSubmission {
  return {
    id: 'candidate_1',
    sourceType: 'trap',
    submittedBy: 'user_1',
    teamId: null,
    status: 'duplicate_detected',
    originalPayload: {
      trap: {
        scope: 'global',
        labels: ['test'],
        shortcut: 'Test shortcut',
        detail: 'Test detail',
      },
    },
    analysisSnapshot: null,
    duplicateCase: null,
    receivedAt: nowIso(),
    queuedAt: null,
    analyzingAt: null,
    completedAt: null,
    lastError: null,
    retryCount: 0,
    manualResult: {
      decision: 'independent',
      notes: 'Test notes',
      submittedAt: nowIso(),
      submittedBy: 'user_1',
    },
    ...overrides,
  };
}

// Helper to create minimal knowledge entry (trap)
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

// Helper to create minimal skill artifact
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

// Helper to create minimal store data
function createTestData(overrides: Partial<StoreData> = {}): StoreData {
  return {
    counters: {},
    users: [],
    teams: [],
    memberships: [],
    accessKeys: [],
    sessions: [],
    knowledgeEntries: [],
    auditEvents: [],
    skillArtifacts: [],
    artifactFilePayloads: [],
    candidateSubmissions: [],
    duplicateCases: [],
    entityLineage: [],
    ...overrides,
  };
}

describe('revalidateManualResult', () => {
  it('should return invalid when candidate not found', () => {
    const data = createTestData();
    const result = revalidateManualResult(data, 'candidate_nonexistent');

    expect(result.valid).toBe(false);
    expect(result.error?.code).toBe(REVALIDATION_ERRORS.CANDIDATE_NOT_FOUND);
    expect(result.candidate).toBeUndefined();
  });

  it('should return invalid when candidate status is not duplicate_detected', () => {
    const candidate = createTestCandidate({ status: 'received' });
    const data = createTestData({ candidateSubmissions: [candidate] });
    const result = revalidateManualResult(data, 'candidate_1');

    expect(result.valid).toBe(false);
    expect(result.error?.code).toBe(REVALIDATION_ERRORS.INVALID_STATUS);
    expect(result.candidate).toBe(candidate);
  });

  it('should return invalid when no manual result attached', () => {
    const candidate = createTestCandidate({ manualResult: null });
    const data = createTestData({ candidateSubmissions: [candidate] });
    const result = revalidateManualResult(data, 'candidate_1');

    expect(result.valid).toBe(false);
    expect(result.error?.code).toBe(REVALIDATION_ERRORS.NO_MANUAL_RESULT);
    expect(result.candidate).toBe(candidate);
  });

  it('should return invalid when already resolved', () => {
    const candidate = createTestCandidate({
      status: 'resolved',
      manualResult: {
        decision: 'independent',
        notes: 'Already resolved',
        submittedAt: nowIso(),
        submittedBy: 'user_1',
      },
    });
    const data = createTestData({ candidateSubmissions: [candidate] });
    const result = revalidateManualResult(data, 'candidate_1');

    expect(result.valid).toBe(false);
    expect(result.error?.code).toBe(REVALIDATION_ERRORS.ALREADY_RESOLVED);
    expect(result.candidate).toBe(candidate);
  });

  it('should return invalid when merge target trap not found', () => {
    const candidate = createTestCandidate({
      manualResult: {
        decision: 'merged',
        notes: 'Merging with existing trap',
        mergedWith: {
          entityType: 'trap',
          entityId: 'trap_nonexistent',
        },
        submittedAt: nowIso(),
        submittedBy: 'user_1',
      },
    });
    const data = createTestData({ candidateSubmissions: [candidate] });
    const result = revalidateManualResult(data, 'candidate_1');

    expect(result.valid).toBe(false);
    expect(result.error?.code).toBe(REVALIDATION_ERRORS.MERGE_TARGET_NOT_FOUND);
  });

  it('should return invalid when merge target trap is deactivated', () => {
    const trap = createTestTrap({ id: 'trap_1', lifecycleState: 'deactivated' });
    const candidate = createTestCandidate({
      manualResult: {
        decision: 'merged',
        notes: 'Merging with existing trap',
        mergedWith: {
          entityType: 'trap',
          entityId: 'trap_1',
        },
        submittedAt: nowIso(),
        submittedBy: 'user_1',
      },
    });
    const data = createTestData({
      candidateSubmissions: [candidate],
      knowledgeEntries: [trap],
    });
    const result = revalidateManualResult(data, 'candidate_1');

    expect(result.valid).toBe(false);
    expect(result.error?.code).toBe(REVALIDATION_ERRORS.MERGE_TARGET_INCOMPATIBLE);
    expect(result.existingTrap).toBe(trap);
  });

  it('should return invalid when merge target skill not found', () => {
    const candidate = createTestCandidate({
      sourceType: 'skill',
      manualResult: {
        decision: 'merged',
        notes: 'Merging with existing skill',
        mergedWith: {
          entityType: 'skill',
          entityId: 'skill_nonexistent',
        },
        submittedAt: nowIso(),
        submittedBy: 'user_1',
      },
    });
    const data = createTestData({ candidateSubmissions: [candidate] });
    const result = revalidateManualResult(data, 'candidate_1');

    expect(result.valid).toBe(false);
    expect(result.error?.code).toBe(REVALIDATION_ERRORS.MERGE_TARGET_NOT_FOUND);
  });

  it('should return invalid when merge target skill is deactivated', () => {
    const skill = createTestSkill({ id: 'skill_1', lifecycleState: 'deactivated' });
    const candidate = createTestCandidate({
      sourceType: 'skill',
      manualResult: {
        decision: 'merged',
        notes: 'Merging with existing skill',
        mergedWith: {
          entityType: 'skill',
          entityId: 'skill_1',
        },
        submittedAt: nowIso(),
        submittedBy: 'user_1',
      },
    });
    const data = createTestData({
      candidateSubmissions: [candidate],
      skillArtifacts: [skill],
    });
    const result = revalidateManualResult(data, 'candidate_1');

    expect(result.valid).toBe(false);
    expect(result.error?.code).toBe(REVALIDATION_ERRORS.MERGE_TARGET_INCOMPATIBLE);
    expect(result.existingSkill).toBe(skill);
  });

  it('should return valid for independent decision', () => {
    const candidate = createTestCandidate({
      manualResult: {
        decision: 'independent',
        notes: 'This is a new, distinct entry',
        submittedAt: nowIso(),
        submittedBy: 'user_1',
      },
    });
    const data = createTestData({ candidateSubmissions: [candidate] });
    const result = revalidateManualResult(data, 'candidate_1');

    expect(result.valid).toBe(true);
    expect(result.candidate).toBe(candidate);
    expect(result.error).toBeUndefined();
  });

  it('should return valid for merged decision with existing active trap', () => {
    const trap = createTestTrap({ id: 'trap_1', lifecycleState: 'approved' });
    const candidate = createTestCandidate({
      manualResult: {
        decision: 'merged',
        notes: 'Merging with existing trap',
        mergedWith: {
          entityType: 'trap',
          entityId: 'trap_1',
        },
        submittedAt: nowIso(),
        submittedBy: 'user_1',
      },
    });
    const data = createTestData({
      candidateSubmissions: [candidate],
      knowledgeEntries: [trap],
    });
    const result = revalidateManualResult(data, 'candidate_1');

    expect(result.valid).toBe(true);
    expect(result.candidate).toBe(candidate);
    expect(result.existingTrap).toBe(trap);
  });

  it('should return valid for merged decision with existing active skill', () => {
    const skill = createTestSkill({ id: 'skill_1', lifecycleState: 'approved' });
    const candidate = createTestCandidate({
      sourceType: 'skill',
      manualResult: {
        decision: 'merged',
        notes: 'Merging with existing skill',
        mergedWith: {
          entityType: 'skill',
          entityId: 'skill_1',
        },
        submittedAt: nowIso(),
        submittedBy: 'user_1',
      },
    });
    const data = createTestData({
      candidateSubmissions: [candidate],
      skillArtifacts: [skill],
    });
    const result = revalidateManualResult(data, 'candidate_1');

    expect(result.valid).toBe(true);
    expect(result.candidate).toBe(candidate);
    expect(result.existingSkill).toBe(skill);
  });
});

describe('isAlreadyResolved', () => {
  it('should return false for non-resolved candidate', () => {
    const candidate = createTestCandidate({ status: 'duplicate_detected' });
    const manualResult: ManualResultSubmission = {
      decision: 'independent',
      notes: 'Test notes',
    };

    expect(isAlreadyResolved(candidate, manualResult)).toBe(false);
  });

  it('should return true for resolved candidate with matching manual result', () => {
    const candidate = createTestCandidate({
      status: 'resolved',
      manualResult: {
        decision: 'independent',
        notes: 'Test notes',
        submittedAt: nowIso(),
        submittedBy: 'user_1',
      },
    });
    const manualResult: ManualResultSubmission = {
      decision: 'independent',
      notes: 'Test notes',
    };

    expect(isAlreadyResolved(candidate, manualResult)).toBe(true);
  });

  it('should return false for resolved candidate with different decision', () => {
    const candidate = createTestCandidate({
      status: 'resolved',
      manualResult: {
        decision: 'independent',
        notes: 'Test notes',
        submittedAt: nowIso(),
        submittedBy: 'user_1',
      },
    });
    const manualResult: ManualResultSubmission = {
      decision: 'merged',
      notes: 'Test notes',
    };

    expect(isAlreadyResolved(candidate, manualResult)).toBe(false);
  });

  it('should return false for resolved candidate with different notes', () => {
    const candidate = createTestCandidate({
      status: 'resolved',
      manualResult: {
        decision: 'independent',
        notes: 'Original notes',
        submittedAt: nowIso(),
        submittedBy: 'user_1',
      },
    });
    const manualResult: ManualResultSubmission = {
      decision: 'independent',
      notes: 'Different notes',
    };

    expect(isAlreadyResolved(candidate, manualResult)).toBe(false);
  });

  it('should return false for resolved candidate with null manualResult', () => {
    const candidate = createTestCandidate({
      status: 'resolved',
      manualResult: null,
    });
    const manualResult: ManualResultSubmission = {
      decision: 'independent',
      notes: 'Test notes',
    };

    expect(isAlreadyResolved(candidate, manualResult)).toBe(false);
  });
});

// Mock JsonStore for testing
function createMockStore(): { store: JsonStore; data: StoreData } {
  const data = createTestData();
  const store = {
    nextId: (d: StoreData, prefix: string) => {
      const nextValue = (d.counters[prefix] ?? 0) + 1;
      d.counters[prefix] = nextValue;
      return `${prefix}_${nextValue}`;
    },
  } as unknown as JsonStore;
  return { store, data };
}

describe('publishTrapCandidate', () => {
  it('should create KnowledgeRecord with correct fields', () => {
    const { store, data } = createMockStore();
    const candidate = createTestCandidate();
    const resolvedAt = nowIso();

    const { entry, lineage } = publishTrapCandidate({
      store,
      data,
      candidate,
      resolvedBy: 'user_1',
      resolvedAt,
    });

    expect(entry.id).toBe('knowledge_1');
    expect(entry.teamId).toBe(candidate.teamId);
    expect(entry.scope).toBe('global');
    expect(entry.labels).toEqual(['test']);
    expect(entry.shortcut).toBe('Test shortcut');
    expect(entry.detail).toBe('Test detail');
    expect(entry.requiredLevel).toBe(0);
    expect(entry.ownerUserId).toBe('user_1');
  });

  it('should set lifecycleState to agent-pass', () => {
    const { store, data } = createMockStore();
    const candidate = createTestCandidate();
    const resolvedAt = nowIso();

    const { entry } = publishTrapCandidate({
      store,
      data,
      candidate,
      resolvedBy: 'user_1',
      resolvedAt,
    });

    expect(entry.lifecycleState).toBe('agent-pass');
    expect(entry.agentReview?.status).toBe('agent-pass');
  });

  it('should create lineage record', () => {
    const { store, data } = createMockStore();
    const candidate = createTestCandidate();
    const resolvedAt = nowIso();

    const { entry, lineage } = publishTrapCandidate({
      store,
      data,
      candidate,
      resolvedBy: 'user_1',
      resolvedAt,
    });

    expect(lineage.id).toBe('lineage_1');
    expect(lineage.candidateId).toBe(candidate.id);
    expect(lineage.relationshipType).toBe('published_as');
    expect(lineage.sourceType).toBe('candidate');
    expect(lineage.sourceId).toBe(candidate.id);
    expect(lineage.targetType).toBe('trap');
    expect(lineage.targetId).toBe(entry.id);
  });

  it('should push entry to knowledgeEntries', () => {
    const { store, data } = createMockStore();
    const candidate = createTestCandidate();
    const resolvedAt = nowIso();

    const { entry } = publishTrapCandidate({
      store,
      data,
      candidate,
      resolvedBy: 'user_1',
      resolvedAt,
    });

    expect(data.knowledgeEntries).toContain(entry);
    expect(data.knowledgeEntries.length).toBe(1);
  });

  it('should push lineage to entityLineage', () => {
    const { store, data } = createMockStore();
    const candidate = createTestCandidate();
    const resolvedAt = nowIso();

    const { lineage } = publishTrapCandidate({
      store,
      data,
      candidate,
      resolvedBy: 'user_1',
      resolvedAt,
    });

    expect(data.entityLineage).toContain(lineage);
    expect(data.entityLineage.length).toBe(1);
  });

  it('should throw when no trap payload', () => {
    const { store, data } = createMockStore();
    const candidate = createTestCandidate({
      sourceType: 'skill',
      originalPayload: {
        skill: {
          files: [],
          metadata: { title: 'Test', slug: 'test', labels: ['test'] },
        },
      },
    });
    const resolvedAt = nowIso();

    expect(() => publishTrapCandidate({
      store,
      data,
      candidate,
      resolvedBy: 'user_1',
      resolvedAt,
    })).toThrow('Candidate has no trap payload');
  });
});

describe('publishSkillCandidate', () => {
  it('should create SkillArtifactRecord with correct fields', () => {
    const { store, data } = createMockStore();
    const candidate = createTestCandidate({
      sourceType: 'skill',
      originalPayload: {
        skill: {
          files: [
            { path: 'SKILL.md', sha256: 'abc123', sizeBytes: 100, mediaType: 'text/markdown' },
          ],
          metadata: { title: 'Test Skill', slug: 'test-skill', labels: ['test'] },
        },
      },
    });
    const resolvedAt = nowIso();

    const { artifact, lineage } = publishSkillCandidate({
      store,
      data,
      candidate,
      resolvedBy: 'user_1',
      resolvedAt,
    });

    expect(artifact.id).toBe('artifact_1');
    expect(artifact.teamId).toBe(candidate.teamId);
    expect(artifact.scope).toBe('global');
    expect(artifact.labels).toEqual(['test']);
    expect(artifact.title).toBe('Test Skill');
    expect(artifact.slug).toBe('test-skill');
    expect(artifact.ownerUserId).toBe('user_1');
  });

  it('should set lifecycleState to agent-pass', () => {
    const { store, data } = createMockStore();
    const candidate = createTestCandidate({
      sourceType: 'skill',
      originalPayload: {
        skill: {
          files: [],
          metadata: { title: 'Test Skill', slug: 'test-skill', labels: ['test'] },
        },
      },
    });
    const resolvedAt = nowIso();

    const { artifact } = publishSkillCandidate({
      store,
      data,
      candidate,
      resolvedBy: 'user_1',
      resolvedAt,
    });

    expect(artifact.lifecycleState).toBe('agent-pass');
    expect(artifact.agentReview?.status).toBe('agent-pass');
  });

  it('should create lineage record', () => {
    const { store, data } = createMockStore();
    const candidate = createTestCandidate({
      sourceType: 'skill',
      originalPayload: {
        skill: {
          files: [],
          metadata: { title: 'Test Skill', slug: 'test-skill', labels: ['test'] },
        },
      },
    });
    const resolvedAt = nowIso();

    const { artifact, lineage } = publishSkillCandidate({
      store,
      data,
      candidate,
      resolvedBy: 'user_1',
      resolvedAt,
    });

    expect(lineage.id).toBe('lineage_1');
    expect(lineage.candidateId).toBe(candidate.id);
    expect(lineage.relationshipType).toBe('published_as');
    expect(lineage.sourceType).toBe('candidate');
    expect(lineage.sourceId).toBe(candidate.id);
    expect(lineage.targetType).toBe('skill');
    expect(lineage.targetId).toBe(artifact.id);
  });

  it('should push artifact to skillArtifacts', () => {
    const { store, data } = createMockStore();
    const candidate = createTestCandidate({
      sourceType: 'skill',
      originalPayload: {
        skill: {
          files: [],
          metadata: { title: 'Test Skill', slug: 'test-skill', labels: ['test'] },
        },
      },
    });
    const resolvedAt = nowIso();

    const { artifact } = publishSkillCandidate({
      store,
      data,
      candidate,
      resolvedBy: 'user_1',
      resolvedAt,
    });

    expect(data.skillArtifacts).toContain(artifact);
    expect(data.skillArtifacts.length).toBe(1);
  });

  it('should push lineage to entityLineage', () => {
    const { store, data } = createMockStore();
    const candidate = createTestCandidate({
      sourceType: 'skill',
      originalPayload: {
        skill: {
          files: [],
          metadata: { title: 'Test Skill', slug: 'test-skill', labels: ['test'] },
        },
      },
    });
    const resolvedAt = nowIso();

    const { lineage } = publishSkillCandidate({
      store,
      data,
      candidate,
      resolvedBy: 'user_1',
      resolvedAt,
    });

    expect(data.entityLineage).toContain(lineage);
    expect(data.entityLineage.length).toBe(1);
  });

  it('should throw when no skill payload', () => {
    const { store, data } = createMockStore();
    const candidate = createTestCandidate(); // has trap payload
    const resolvedAt = nowIso();

    expect(() => publishSkillCandidate({
      store,
      data,
      candidate,
      resolvedBy: 'user_1',
      resolvedAt,
    })).toThrow('Candidate has no skill payload');
  });
});

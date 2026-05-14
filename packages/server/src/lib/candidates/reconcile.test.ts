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

import type { CandidateSubmission, ManualResultSubmission } from '@trapmap/contracts';
import { describe, expect, it } from 'vitest';
import type { LineageRepository } from '../lineage/index.js';
import type { KnowledgeRecord, SkillArtifactRecord, StoreData } from '../store.js';
import { JsonStore, type SkillShareerStore, nowIso } from '../store.js';
import type { EntityLineageRecord } from '../store.js';
import {
  REVALIDATION_ERRORS,
  getLineageByCandidate,
  getLineageById,
  getLineageByTarget,
  isAlreadyResolved,
  publishSkillCandidate,
  publishTrapCandidate,
  recordMergeLineage,
  revalidateManualResult,
} from './reconcile.js';

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

// Mock SkillShareerStore for testing
function createMockStore(): { store: SkillShareerStore; data: StoreData } {
  const data = createTestData();
  const store = {
    nextId: (d: StoreData, prefix: string) => {
      const nextValue = (d.counters[prefix] ?? 0) + 1;
      d.counters[prefix] = nextValue;
      return `${prefix}_${nextValue}`;
    },
  } as unknown as SkillShareerStore;
  return { store, data };
}

function createMockLineageRepo(initial: EntityLineageRecord[] = []): LineageRepository {
  const records = [...initial];
  return {
    async insert(lineage) {
      records.push(lineage);
    },
    async getById(id) {
      return records.find((r) => r.id === id) ?? null;
    },
    async listBySource(sourceType, sourceId) {
      return records.filter((r) => r.sourceType === sourceType && r.sourceId === sourceId);
    },
    async listByTarget(targetType, targetId) {
      return records.filter((r) => r.targetType === targetType && r.targetId === targetId);
    },
    async listByCandidate(candidateId) {
      return records.filter((r) => r.candidateId === candidateId);
    },
  };
}

describe('publishTrapCandidate', () => {
  it('should create KnowledgeRecord with correct fields', () => {
    const { store, data } = createMockStore();
    const candidate = createTestCandidate();
    const resolvedAt = nowIso();

    const { entry, lineage: _lineage } = publishTrapCandidate({
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

  it('should return lineage but not push to data.entityLineage', () => {
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

    expect(lineage).toBeDefined();
    expect(data.entityLineage).not.toContain(lineage);
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

    expect(() =>
      publishTrapCandidate({
        store,
        data,
        candidate,
        resolvedBy: 'user_1',
        resolvedAt,
      }),
    ).toThrow('Candidate has no trap payload');
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

    const { artifact, lineage: _lineage } = publishSkillCandidate({
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

  it('should return lineage but not push to data.entityLineage', () => {
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

    expect(lineage).toBeDefined();
    expect(data.entityLineage).not.toContain(lineage);
  });

  it('should throw when no skill payload', () => {
    const { store, data } = createMockStore();
    const candidate = createTestCandidate(); // has trap payload
    const resolvedAt = nowIso();

    expect(() =>
      publishSkillCandidate({
        store,
        data,
        candidate,
        resolvedBy: 'user_1',
        resolvedAt,
      }),
    ).toThrow('Candidate has no skill payload');
  });
});

describe('recordMergeLineage', () => {
  it('should create lineage with merged_into relationship', () => {
    const { store, data } = createMockStore();
    const candidate = createTestCandidate();
    const trap = createTestTrap({ id: 'trap_1' });
    data.knowledgeEntries.push(trap);
    const resolvedAt = nowIso();

    const { lineage } = recordMergeLineage({
      store,
      data,
      candidate,
      existingEntityId: 'trap_1',
      existingEntityType: 'trap',
      resolvedBy: 'user_1',
      resolvedAt,
      notes: 'Duplicate content',
    });

    expect(lineage.id).toBe('lineage_1');
    expect(lineage.candidateId).toBe(candidate.id);
    expect(lineage.relationshipType).toBe('merged_into');
    expect(lineage.sourceType).toBe('candidate');
    expect(lineage.sourceId).toBe(candidate.id);
    expect(lineage.targetType).toBe('trap');
    expect(lineage.targetId).toBe('trap_1');
    expect(lineage.notes).toBe('Duplicate content');
  });

  it('should add review note to existing trap', () => {
    const { store, data } = createMockStore();
    const candidate = createTestCandidate();
    const trap = createTestTrap({ id: 'trap_1', reviewNotes: [] });
    data.knowledgeEntries.push(trap);
    const resolvedAt = nowIso();

    recordMergeLineage({
      store,
      data,
      candidate,
      existingEntityId: 'trap_1',
      existingEntityType: 'trap',
      resolvedBy: 'user_1',
      resolvedAt,
      notes: 'Duplicate content',
    });

    expect(trap.reviewNotes.length).toBe(1);
    expect(trap.reviewNotes[0].authorType).toBe('system');
    expect(trap.reviewNotes[0].message).toContain(candidate.id);
    expect(trap.reviewNotes[0].message).toContain('merged into this entry');
    expect(trap.updatedAt).toBe(resolvedAt);
  });

  it('should add review note to existing skill', () => {
    const { store, data } = createMockStore();
    const candidate = createTestCandidate({ sourceType: 'skill' });
    const skill = createTestSkill({ id: 'skill_1', reviewNotes: [] });
    data.skillArtifacts.push(skill);
    const resolvedAt = nowIso();

    recordMergeLineage({
      store,
      data,
      candidate,
      existingEntityId: 'skill_1',
      existingEntityType: 'skill',
      resolvedBy: 'user_1',
      resolvedAt,
      notes: 'Duplicate skill',
    });

    expect(skill.reviewNotes.length).toBe(1);
    expect(skill.reviewNotes[0].authorType).toBe('system');
    expect(skill.reviewNotes[0].message).toContain(candidate.id);
    expect(skill.reviewNotes[0].message).toContain('merged into this artifact');
    expect(skill.updatedAt).toBe(resolvedAt);
  });

  it('should not modify existing entity content fields', () => {
    const { store, data } = createMockStore();
    const candidate = createTestCandidate();
    const originalShortcut = 'Original shortcut';
    const originalDetail = 'Original detail';
    const trap = createTestTrap({
      id: 'trap_1',
      shortcut: originalShortcut,
      detail: originalDetail,
      reviewNotes: [],
    });
    data.knowledgeEntries.push(trap);
    const resolvedAt = nowIso();

    recordMergeLineage({
      store,
      data,
      candidate,
      existingEntityId: 'trap_1',
      existingEntityType: 'trap',
      resolvedBy: 'user_1',
      resolvedAt,
      notes: 'Duplicate content',
    });

    // Content fields should remain unchanged
    expect(trap.shortcut).toBe(originalShortcut);
    expect(trap.detail).toBe(originalDetail);
  });

  it('should return lineage but not push to data.entityLineage', () => {
    const { store, data } = createMockStore();
    const candidate = createTestCandidate();
    const trap = createTestTrap({ id: 'trap_1' });
    data.knowledgeEntries.push(trap);
    const resolvedAt = nowIso();

    const { lineage } = recordMergeLineage({
      store,
      data,
      candidate,
      existingEntityId: 'trap_1',
      existingEntityType: 'trap',
      resolvedBy: 'user_1',
      resolvedAt,
      notes: 'Duplicate content',
    });

    expect(lineage).toBeDefined();
    expect(data.entityLineage).not.toContain(lineage);
  });
});

describe('getLineageByCandidate', () => {
  it('should return lineage records for candidate', async () => {
    const lineageRepo = createMockLineageRepo([
      {
        id: 'lineage_1',
        candidateId: 'candidate_1',
        relationshipType: 'published_as',
        sourceType: 'candidate',
        sourceId: 'candidate_1',
        targetType: 'trap',
        targetId: 'trap_1',
        createdAt: nowIso(),
        notes: null,
      },
      {
        id: 'lineage_2',
        candidateId: 'candidate_2',
        relationshipType: 'merged_into',
        sourceType: 'candidate',
        sourceId: 'candidate_2',
        targetType: 'skill',
        targetId: 'skill_1',
        createdAt: nowIso(),
        notes: null,
      },
    ]);

    const result = await getLineageByCandidate(lineageRepo, 'candidate_1');
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('lineage_1');
  });

  it('should return empty array when no lineage found', async () => {
    const lineageRepo = createMockLineageRepo();
    const result = await getLineageByCandidate(lineageRepo, 'candidate_nonexistent');
    expect(result).toEqual([]);
  });
});

describe('getLineageByTarget', () => {
  it('should return lineage records pointing to entity', async () => {
    const lineageRepo = createMockLineageRepo([
      {
        id: 'lineage_1',
        candidateId: 'candidate_1',
        relationshipType: 'merged_into',
        sourceType: 'candidate',
        sourceId: 'candidate_1',
        targetType: 'trap',
        targetId: 'trap_1',
        createdAt: nowIso(),
        notes: null,
      },
      {
        id: 'lineage_2',
        candidateId: 'candidate_2',
        relationshipType: 'merged_into',
        sourceType: 'candidate',
        sourceId: 'candidate_2',
        targetType: 'trap',
        targetId: 'trap_1',
        createdAt: nowIso(),
        notes: null,
      },
      {
        id: 'lineage_3',
        candidateId: 'candidate_3',
        relationshipType: 'merged_into',
        sourceType: 'candidate',
        sourceId: 'candidate_3',
        targetType: 'skill',
        targetId: 'skill_1',
        createdAt: nowIso(),
        notes: null,
      },
    ]);

    const result = await getLineageByTarget(lineageRepo, 'trap_1', 'trap');
    expect(result.length).toBe(2);
    expect(result.every((l) => l.targetId === 'trap_1' && l.targetType === 'trap')).toBe(true);
  });

  it('should return empty array when no lineage found', async () => {
    const lineageRepo = createMockLineageRepo();
    const result = await getLineageByTarget(lineageRepo, 'trap_nonexistent', 'trap');
    expect(result).toEqual([]);
  });
});

describe('getLineageById', () => {
  it('should return correct lineage record', async () => {
    const lineageRepo = createMockLineageRepo([
      {
        id: 'lineage_1',
        candidateId: 'candidate_1',
        relationshipType: 'published_as',
        sourceType: 'candidate',
        sourceId: 'candidate_1',
        targetType: 'trap',
        targetId: 'trap_1',
        createdAt: nowIso(),
        notes: null,
      },
    ]);

    const result = await getLineageById(lineageRepo, 'lineage_1');
    expect(result).not.toBeNull();
    expect(result?.id).toBe('lineage_1');
  });

  it('should return null for non-existent ID', async () => {
    const lineageRepo = createMockLineageRepo();
    const result = await getLineageById(lineageRepo, 'lineage_nonexistent');
    expect(result).toBeNull();
  });
});

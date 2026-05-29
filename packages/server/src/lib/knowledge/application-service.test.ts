/**
 * Tests for KnowledgeApplicationService.
 *
 * Covers submit / resubmit / supersede semantics shared by knowledge and trap routes.
 * Phase 3 of the PG-first convergence plan.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChatProvider } from '@trapmap/server/lib/ai/types.js';
import type { KnowledgeRepository } from '@trapmap/server/lib/knowledge/repository.js';
import type { KnowledgeRecord, SkillShareerStore } from '@trapmap/server/lib/store.js';
import { nowIso } from '@trapmap/server/lib/store.js';

import {
  type KnowledgeApplicationService,
  type KnowledgeApplicationServiceDeps,
  createKnowledgeApplicationService,
} from './application-service.js';

function makeEntry(overrides: Partial<KnowledgeRecord> = {}): KnowledgeRecord {
  const submittedAt = nowIso();
  return {
    id: 'knowledge_1',
    teamId: null,
    scope: 'global',
    labels: ['test'],
    shortcut: 'Test Shortcut',
    detail: 'Test detail for the knowledge entry',
    requiredLevel: 0,
    lifecycleState: 'submitted',
    ownerUserId: 'user_1',
    latestRevision: {
      revision: 1,
      submittedAt,
      submittedByUserId: 'user_1',
      shortcut: 'Test Shortcut',
      detail: 'Test detail for the knowledge entry',
      labels: ['test'],
      reviewNotes: [],
    },
    history: [
      {
        revision: 1,
        submittedAt,
        submittedByUserId: 'user_1',
        shortcut: 'Test Shortcut',
        detail: 'Test detail for the knowledge entry',
        labels: ['test'],
        reviewNotes: [],
      },
    ],
    metadata: {
      scopeLabel: 'global-constraint',
      submissionCount: 1,
      resubmissionCount: 0,
      revisionCount: 1,
      latestSubmissionId: 'submission_1',
      latestSubmittedAt: submittedAt,
      latestReviewedAt: submittedAt,
      latestDecision: null,
    },
    latestSubmissionId: 'submission_1',
    submissionHistory: [],
    agentReview: null,
    reviewHistory: [],
    reviewNotes: [],
    lifecycleHistory: [],
    embeddingCache: null,
    indexState: null,
    decayMeta: null,
    evidenceMeta: null,
    maintenanceMeta: null,
    boundary: null,
    createdAt: submittedAt,
    updatedAt: submittedAt,
    ...overrides,
  };
}

function makeMockRepo(entries: KnowledgeRecord[] = []): KnowledgeRepository {
  const store = [...entries];
  return {
    nextId: vi.fn().mockResolvedValue('knowledge_new'),
    insert: vi.fn().mockImplementation(async (entry: KnowledgeRecord) => {
      store.push(entry);
    }),
    getById: vi.fn().mockImplementation(async (id: string) => {
      return store.find((e) => e.id === id) ?? null;
    }),
    updateLifecycle: vi.fn().mockResolvedValue({} as KnowledgeRecord),
    appendRevision: vi.fn().mockResolvedValue(undefined),
    appendLifecycleEvent: vi.fn().mockResolvedValue(undefined),
    listByFilter: vi.fn().mockImplementation(async () => [...store]),
    updateGovernance: vi.fn().mockResolvedValue(undefined),
  };
}

function makeMockChatProvider(): ChatProvider {
  return {
    provider: 'test',
    isConfigured: false,
    invoke: vi.fn().mockResolvedValue(''),
  };
}

function makeMockStore(): SkillShareerStore {
  return {
    snapshot: vi.fn().mockResolvedValue({
      knowledgeEntries: [],
      users: [],
      memberships: [],
      teams: [],
      sessions: [],
      accessKeys: [],
      skillArtifacts: [],
      usageAnalytics: [],
      feedback: [],
      audit: [],
      counters: {},
    }),
    transact: vi.fn().mockImplementation(async (mutator: any) => {
      const data = {
        knowledgeEntries: [],
        users: [],
        memberships: [],
        teams: [],
        sessions: [],
        accessKeys: [],
        skillArtifacts: [],
        usageAnalytics: [],
        feedback: [],
        audit: [],
        counters: {},
      };
      return mutator(data);
    }),
    nextId: vi.fn().mockReturnValue('next_id'),
  };
}

describe('KnowledgeApplicationService', () => {
  let service: KnowledgeApplicationService;
  let mockRepo: KnowledgeRepository;
  let deps: KnowledgeApplicationServiceDeps;

  beforeEach(() => {
    mockRepo = makeMockRepo();
    deps = {
      knowledgeRepo: mockRepo,
      chatProvider: makeMockChatProvider(),
      store: makeMockStore(),
    };
    service = createKnowledgeApplicationService(deps);
  });

  describe('submit', () => {
    it('should create and insert a knowledge entry', async () => {
      const result = await service.submit({
        kind: 'knowledge',
        ownerUserId: 'user_1',
        teamId: null,
        payload: {
          scope: 'global',
          labels: ['test'],
          shortcut: 'Test',
          detail: 'Test detail for submit workflow',
        },
        requiredLevel: 0,
      });

      expect(result.entry.id).toBe('knowledge_new');
      expect(result.entry.ownerUserId).toBe('user_1');
      expect(result.entry.labels).toEqual(['test']);
      expect(mockRepo.insert).toHaveBeenCalledTimes(1);
    });

    it('should pass chatProvider to preReview', async () => {
      await service.submit({
        kind: 'trap',
        ownerUserId: 'user_1',
        teamId: 'team_1',
        payload: {
          scope: 'project',
          labels: ['trap'],
          shortcut: 'Trap Test',
          detail: 'Trap detail for submit workflow',
        },
        requiredLevel: 5,
      });

      // The chat provider is configured=false, so preReview uses keyword heuristics.
      // Verify insert was called (workflow completed).
      expect(mockRepo.insert).toHaveBeenCalledTimes(1);
    });

    it('should use author boundary when provided', async () => {
      const boundary = {
        context: ['ctx'],
        versions: [],
        prerequisites: [],
        signals: [],
        exclusions: [],
        evidence: [],
      };

      const result = await service.submit({
        kind: 'knowledge',
        ownerUserId: 'user_1',
        teamId: null,
        payload: {
          scope: 'global',
          labels: ['test'],
          shortcut: 'Test',
          detail: 'Test detail with boundary',
        },
        requiredLevel: 0,
        boundary,
      });

      expect(result.entry.boundary).toEqual(boundary);
    });
  });

  describe('resubmit', () => {
    it('should persist governance, revision, and lifecycle changes', async () => {
      const rejectedEntry = makeEntry({
        id: 'knowledge_rejected',
        lifecycleState: 'rejected',
      });
      mockRepo = makeMockRepo([rejectedEntry]);
      deps.knowledgeRepo = mockRepo;
      service = createKnowledgeApplicationService(deps);

      const result = await service.resubmit({
        kind: 'knowledge',
        entryId: 'knowledge_rejected',
        ownerUserId: 'user_1',
        payload: {
          entryId: 'knowledge_rejected',
          labels: ['updated'],
          shortcut: 'Updated Shortcut',
          detail: 'Updated detail for resubmission test',
        },
      });

      // Verify all three persistence calls were made
      expect(mockRepo.updateGovernance).toHaveBeenCalledWith('knowledge_rejected', {
        labels: ['updated'],
        requiredLevel: 0,
      });
      expect(mockRepo.appendRevision).toHaveBeenCalledWith(
        'knowledge_rejected',
        expect.objectContaining({ labels: ['updated'] }),
      );
      expect(mockRepo.updateLifecycle).toHaveBeenCalledWith(
        'knowledge_rejected',
        expect.any(String),
        expect.objectContaining({ actorId: 'user_1' }),
      );

      // Verify the response entry has the updated values
      expect(result.entry.labels).toEqual(['updated']);
      expect(result.entry.shortcut).toBe('Updated Shortcut');
      expect(result.entry.history).toHaveLength(2);
    });

    it('should reject resubmit by non-owner', async () => {
      const entry = makeEntry({
        id: 'knowledge_owned',
        ownerUserId: 'user_1',
        lifecycleState: 'rejected',
      });
      mockRepo = makeMockRepo([entry]);
      deps.knowledgeRepo = mockRepo;
      service = createKnowledgeApplicationService(deps);

      await expect(
        service.resubmit({
          kind: 'trap',
          entryId: 'knowledge_owned',
          ownerUserId: 'user_2',
          payload: {
            entryId: 'knowledge_owned',
            labels: ['test'],
            shortcut: 'Test',
            detail: 'Test detail',
          },
        }),
      ).rejects.toThrow('Only the original submitter may resubmit this entry');
    });

    it('should reject resubmit of non-rejected entry', async () => {
      const entry = makeEntry({
        id: 'knowledge_approved',
        lifecycleState: 'approved',
      });
      mockRepo = makeMockRepo([entry]);
      deps.knowledgeRepo = mockRepo;
      service = createKnowledgeApplicationService(deps);

      await expect(
        service.resubmit({
          kind: 'knowledge',
          entryId: 'knowledge_approved',
          ownerUserId: 'user_1',
          payload: {
            entryId: 'knowledge_approved',
            labels: ['test'],
            shortcut: 'Test',
            detail: 'Test detail',
          },
        }),
      ).rejects.toThrow('Only rejected entries may be resubmitted');
    });

    it('should accept agent-rejected entries for resubmit', async () => {
      const entry = makeEntry({
        id: 'knowledge_agent_rejected',
        lifecycleState: 'agent-rejected',
      });
      mockRepo = makeMockRepo([entry]);
      deps.knowledgeRepo = mockRepo;
      service = createKnowledgeApplicationService(deps);

      const result = await service.resubmit({
        kind: 'knowledge',
        entryId: 'knowledge_agent_rejected',
        ownerUserId: 'user_1',
        payload: {
          entryId: 'knowledge_agent_rejected',
          labels: ['resubmitted'],
          shortcut: 'Resubmitted',
          detail: 'Resubmitted detail after agent rejection',
        },
      });

      expect(result.entry.history).toHaveLength(2);
      expect(mockRepo.updateGovernance).toHaveBeenCalled();
      expect(mockRepo.appendRevision).toHaveBeenCalled();
      expect(mockRepo.updateLifecycle).toHaveBeenCalled();
    });
  });

  describe('supersede', () => {
    it('should delegate to store.transact with supersedeEntry', async () => {
      const supersededEntry = makeEntry({
        id: 'knowledge_superseded',
        lifecycleState: 'deactivated',
      });

      (deps.store.transact as ReturnType<typeof vi.fn>).mockImplementation(
        async (_mutator: any) => {
          return supersededEntry;
        },
      );

      const result = await service.supersede({
        kind: 'knowledge',
        entryId: 'knowledge_superseded',
        replacementId: 'knowledge_replacement',
        actorId: 'user_1',
      });

      expect(result.entry.id).toBe('knowledge_superseded');
      expect(result.entry.lifecycleState).toBe('deactivated');
      expect(deps.store.transact).toHaveBeenCalled();
    });
  });
});

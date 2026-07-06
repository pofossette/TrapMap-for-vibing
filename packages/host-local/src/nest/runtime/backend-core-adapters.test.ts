import { describe, expect, it, vi } from 'vitest';

import {
  createAuditLogPort,
  createIdentityAccessRepos,
  createKnowledgeRepoPort,
  createQueuePorts,
} from './backend-core-adapters.js';

describe('backend-core adapters', () => {
  it('maps server knowledge records into backend-core knowledge entries', async () => {
    const knowledgeRepo = createKnowledgeRepoPort({
      nextId: vi.fn(async () => 'entry_1'),
      insert: vi.fn(),
      getById: vi.fn(async () => ({
        id: 'entry_1',
        teamId: 'team_1',
        scope: 'project',
        labels: ['ops'],
        shortcut: 'Title',
        detail: 'Body',
        requiredLevel: 3,
        lifecycleState: 'approved',
        ownerUserId: 'user_1',
        latestRevision: {
          revision: 1,
          submittedAt: '2026-01-01T00:00:00.000Z',
          submittedByUserId: 'user_1',
          shortcut: 'Title',
          detail: 'Body',
          labels: ['ops'],
          reviewNotes: [],
        },
        history: [],
        metadata: {
          scopeLabel: 'project-knowledge',
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
        boundary: null,
        decayMeta: null,
        evidenceMeta: null,
        maintenanceMeta: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })),
      listByFilter: vi.fn(async () => []),
      updateLifecycle: vi.fn(),
      appendRevision: vi.fn(),
      appendLifecycleEvent: vi.fn(),
      updateGovernance: vi.fn(),
      updateEmbeddingCache: vi.fn(),
      supersede: vi.fn(),
      save: vi.fn(),
    });

    await expect(knowledgeRepo.getById('entry_1')).resolves.toMatchObject({
      id: 'entry_1',
      content: 'Body',
      title: 'Title',
      ownerUserId: 'user_1',
      teamId: 'team_1',
      lifecycleState: 'approved',
      labels: ['ops'],
    });
  });

  it('fills required identity fields when backend-core creates new records', async () => {
    const sessionCreate = vi.fn(async (session) => ({
      id: 'session_1',
      subjectType: session.subjectType,
      userId: session.userId,
      activeTeamId: session.activeTeamId,
      tokenHash: session.tokenHash,
      expiresAt: session.expiresAt,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }));
    const accessKeyInsert = vi.fn(async () => undefined);
    const teamInsert = vi.fn(async () => undefined);
    const membershipInsert = vi.fn(async () => undefined);

    const repos = createIdentityAccessRepos({
      session: {
        nextId: vi.fn(async () => 'session_1'),
        create: sessionCreate,
        getByTokenHash: vi.fn(async () => null),
        deleteByTokenHash: vi.fn(async () => undefined),
        updateActiveTeam: vi.fn(async () => {
          throw new Error('not used');
        }),
      },
      accessKey: {
        nextId: vi.fn(async () => 'key_1'),
        insert: accessKeyInsert,
        getByTokenHash: vi.fn(async () => null),
        getById: vi.fn(async () => null),
        revoke: vi.fn(async () => undefined),
        listByMember: vi.fn(async () => []),
      },
      team: {
        nextId: vi.fn(async () => 'team_1'),
        insert: teamInsert,
        getById: vi.fn(async () => null),
        getBySlug: vi.fn(async () => null),
        listAll: vi.fn(async () => []),
        update: vi.fn(async () => undefined),
      },
      membership: {
        nextId: vi.fn(async () => 'membership_1'),
        insert: membershipInsert,
        getById: vi.fn(async () => null),
        findByUserAndTeam: vi.fn(async () => null),
        listByUser: vi.fn(async () => []),
        listByTeam: vi.fn(async () => []),
        update: vi.fn(async () => undefined),
      },
      user: {
        nextId: vi.fn(async () => 'user_1'),
        insert: vi.fn(async () => undefined),
        getById: vi.fn(async () => null),
        getByHandle: vi.fn(async () => null),
        update: vi.fn(async () => undefined),
      },
    });

    await repos.sessionRepo.create({
      userId: 'user_1',
      tokenHash: 'hash_1',
      activeTeamId: null,
    });
    await repos.accessKeyRepo.insert({
      id: 'key_1',
      tokenHash: 'hash_key_1',
      memberId: 'member_1',
    });
    await repos.teamRepo.insert({ id: 'team_1', slug: 'ops', name: 'Ops' });
    await repos.membershipRepo.insert({
      id: 'membership_1',
      userId: 'user_1',
      teamId: 'team_1',
      role: 'reviewer',
    });

    expect(sessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectType: 'user',
        userId: 'user_1',
        tokenHash: 'hash_1',
        activeTeamId: null,
        expiresAt: null,
      }),
    );
    expect(accessKeyInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenPreview: 'hash_key_1',
        issuedByUserId: 'system',
        teamId: 'unknown-team',
        level: 0,
        notes: null,
      }),
    );
    expect(teamInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        description: null,
      }),
    );
    expect(membershipInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        roleTemplate: 'user',
        securityLevel: 0,
        permissions: [],
        notes: null,
      }),
    );
  });

  it('omits undefined teamId when querying audit entries', async () => {
    const auditLog = createAuditLogPort({
      audit: {
        nextId: vi.fn(async () => 'audit_1'),
        insert: vi.fn(async () => undefined),
        getById: vi.fn(async () => null),
        listByFilter: vi.fn(async () => ({
          total: 1,
          items: [
            {
              id: 'audit_1',
              teamId: null,
              actorId: 'user_1',
              action: 'knowledge.submit',
              entityId: 'entry_1',
              payload: { ok: true },
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
        })),
      },
    });

    await expect(auditLog.query({})).resolves.toEqual({
      total: 1,
      items: [
        {
          actorId: 'user_1',
          action: 'knowledge.submit',
          entityId: 'entry_1',
          metadata: { ok: true },
          timestamp: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
  });

  it('fails fast when queue ports are used without async transport', async () => {
    const ports = createQueuePorts();

    await expect(ports.task.enqueue('candidate.process', {})).rejects.toThrow(/async transport/i);
    await expect(ports.outbox.enqueue({ type: 'knowledge.created', payload: {} })).rejects.toThrow(
      /async transport/i,
    );
  });
});

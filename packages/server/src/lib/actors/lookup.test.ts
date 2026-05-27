import { describe, expect, it } from 'vitest';

import type { KnowledgeRecord } from '@trapmap/server/lib/store.js';
import { nowIso } from '@trapmap/server/lib/store.js';

import type { ActorLookupSource } from './lookup.js';
import {
  buildUserLookupContext,
  buildUserLookupContextForKnowledge,
  collectActorIds,
  collectMembershipPairs,
} from './lookup.js';

function makeRecord(overrides: Partial<KnowledgeRecord> = {}): KnowledgeRecord {
  const now = nowIso();
  return {
    id: 'knowledge_1',
    teamId: 'team_1',
    scope: 'project',
    labels: ['test'],
    shortcut: 'Test',
    detail: 'Test detail',
    requiredLevel: 5,
    lifecycleState: 'approved',
    ownerUserId: 'user_owner',
    latestRevision: {
      revision: 1,
      submittedAt: now,
      submittedByUserId: 'user_owner',
      shortcut: 'Test',
      detail: 'Test detail',
      labels: ['test'],
      reviewNotes: [],
    },
    history: [
      {
        revision: 1,
        submittedAt: now,
        submittedByUserId: 'user_owner',
        shortcut: 'Test',
        detail: 'Test detail',
        labels: ['test'],
        reviewNotes: [],
      },
    ],
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
    decayMeta: null,
    evidenceMeta: null,
    maintenanceMeta: null,
    boundary: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function stubSource(
  userMap: Map<string, { id: string; handle: string }>,
  membershipMap?: Map<string, number>,
): ActorLookupSource {
  return {
    async getUsersByIds(userIds) {
      return userIds
        .map((id) => userMap.get(id))
        .filter((u): u is NonNullable<typeof u> => u !== undefined);
    },
    async getMembershipLevels(_pairs) {
      return membershipMap ?? new Map();
    },
  };
}

describe('collectActorIds', () => {
  it('returns owner userId from a minimal record', () => {
    const record = makeRecord();
    expect(collectActorIds(record)).toEqual(['user_owner']);
  });

  it('collects unique ids from revision authors', () => {
    const record = makeRecord({
      history: [
        {
          revision: 1,
          submittedAt: nowIso(),
          submittedByUserId: 'user_owner',
          shortcut: 'A',
          detail: 'A',
          labels: [],
          reviewNotes: [],
        },
        {
          revision: 2,
          submittedAt: nowIso(),
          submittedByUserId: 'user_editor',
          shortcut: 'B',
          detail: 'B',
          labels: [],
          reviewNotes: [],
        },
      ],
    });

    const ids = collectActorIds(record);
    expect(ids).toContain('user_owner');
    expect(ids).toContain('user_editor');
    expect(ids).toHaveLength(2);
  });

  it('collects reviewer userIds from reviewHistory', () => {
    const record = makeRecord({
      reviewHistory: [
        {
          decidedAt: nowIso(),
          decidedByUserId: 'user_reviewer',
          decision: 'approve',
          notes: 'Looks good',
        },
      ],
    });

    expect(collectActorIds(record)).toContain('user_reviewer');
  });

  it('collects authorUserId from reviewNotes', () => {
    const record = makeRecord({
      reviewNotes: [
        {
          id: 'note_1',
          createdAt: nowIso(),
          authorType: 'reviewer',
          authorUserId: 'user_note_author',
          message: 'Needs work',
        },
        {
          id: 'note_2',
          createdAt: nowIso(),
          authorType: 'agent',
          authorUserId: null,
          message: 'Auto note',
        },
      ],
    });

    const ids = collectActorIds(record);
    expect(ids).toContain('user_note_author');
    // null authorUserId should not be included
    expect(ids.filter((id) => id === null)).toHaveLength(0);
  });

  it('collects actorUserId from lifecycleHistory', () => {
    const record = makeRecord({
      lifecycleHistory: [
        {
          id: 'event_1',
          type: 'submitted',
          createdAt: nowIso(),
          actorUserId: 'user_submitter',
          submissionId: null,
          revision: 1,
          state: 'submitted',
          note: null,
        },
        {
          id: 'event_2',
          type: 'agent-reviewed',
          createdAt: nowIso(),
          actorUserId: null,
          submissionId: null,
          revision: 1,
          state: 'agent-pass',
          note: null,
        },
      ],
    });

    const ids = collectActorIds(record);
    expect(ids).toContain('user_submitter');
  });

  it('collects reviewer from submissionHistory', () => {
    const record = makeRecord({
      submissionHistory: [
        {
          id: 'sub_1',
          revision: 1,
          submittedAt: nowIso(),
          submittedByUserId: 'user_sub',
          lifecycleState: 'approved',
          resubmissionOf: null,
          agentReview: null,
          reviewerDecision: {
            decidedAt: nowIso(),
            decidedByUserId: 'user_decision_maker',
            decision: 'approve',
            notes: 'LGTM',
          },
          reviewNotes: [
            {
              id: 'sub_note_1',
              createdAt: nowIso(),
              authorType: 'reviewer',
              authorUserId: 'user_sub_note',
              message: 'Note in submission',
            },
          ],
        },
      ],
    });

    const ids = collectActorIds(record);
    expect(ids).toContain('user_sub');
    expect(ids).toContain('user_decision_maker');
    expect(ids).toContain('user_sub_note');
  });

  it('deduplicates user ids', () => {
    const record = makeRecord({
      ownerUserId: 'user_same',
      history: [
        {
          revision: 1,
          submittedAt: nowIso(),
          submittedByUserId: 'user_same',
          shortcut: 'A',
          detail: 'A',
          labels: [],
          reviewNotes: [],
        },
      ],
    });

    const ids = collectActorIds(record);
    expect(ids.filter((id) => id === 'user_same')).toHaveLength(1);
  });
});

describe('collectMembershipPairs', () => {
  it('returns empty array when teamId is null', () => {
    const record = makeRecord({ teamId: null });
    expect(collectMembershipPairs(record)).toEqual([]);
  });

  it('returns pairs for each actor when teamId is set', () => {
    const record = makeRecord({
      ownerUserId: 'user_a',
      teamId: 'team_1',
      history: [
        {
          revision: 1,
          submittedAt: nowIso(),
          submittedByUserId: 'user_a',
          shortcut: 'A',
          detail: 'A',
          labels: [],
          reviewNotes: [],
        },
        {
          revision: 2,
          submittedAt: nowIso(),
          submittedByUserId: 'user_b',
          shortcut: 'B',
          detail: 'B',
          labels: [],
          reviewNotes: [],
        },
      ],
    });

    const pairs = collectMembershipPairs(record);
    expect(pairs).toEqual(
      expect.arrayContaining([
        { userId: 'user_a', teamId: 'team_1' },
        { userId: 'user_b', teamId: 'team_1' },
      ]),
    );
  });
});

describe('buildUserLookupContext', () => {
  it('resolves handles and membership levels for a single record', async () => {
    const record = makeRecord({
      ownerUserId: 'user_1',
      teamId: 'team_1',
      history: [
        {
          revision: 1,
          submittedAt: nowIso(),
          submittedByUserId: 'user_1',
          shortcut: 'A',
          detail: 'A',
          labels: [],
          reviewNotes: [],
        },
      ],
    });

    const source = stubSource(
      new Map([['user_1', { id: 'user_1', handle: 'alice' }]]),
      new Map([['user_1:team_1', 7]]),
    );

    const context = await buildUserLookupContext(source, record);

    expect(context.users).toEqual([{ id: 'user_1', handle: 'alice' }]);
    expect(context.memberships).toEqual([{ userId: 'user_1', teamId: 'team_1', securityLevel: 7 }]);
  });

  it('returns empty memberships when teamId is null', async () => {
    const record = makeRecord({ teamId: null, ownerUserId: 'user_1' });

    const source = stubSource(new Map([['user_1', { id: 'user_1', handle: 'bob' }]]));

    const context = await buildUserLookupContext(source, record);

    expect(context.users).toEqual([{ id: 'user_1', handle: 'bob' }]);
    expect(context.memberships).toEqual([]);
  });
});

describe('buildUserLookupContextForKnowledge', () => {
  it('merges actor ids across multiple entries', async () => {
    const entry1 = makeRecord({
      id: 'k1',
      ownerUserId: 'user_1',
      teamId: 'team_1',
    });
    const entry2 = makeRecord({
      id: 'k2',
      ownerUserId: 'user_2',
      teamId: 'team_1',
      history: [
        {
          revision: 1,
          submittedAt: nowIso(),
          submittedByUserId: 'user_2',
          shortcut: 'X',
          detail: 'X',
          labels: [],
          reviewNotes: [],
        },
      ],
    });

    const source = stubSource(
      new Map([
        ['user_1', { id: 'user_1', handle: 'alice' }],
        ['user_2', { id: 'user_2', handle: 'bob' }],
      ]),
      new Map([
        ['user_1:team_1', 5],
        ['user_2:team_1', 3],
      ]),
    );

    const context = await buildUserLookupContextForKnowledge(source, [entry1, entry2]);

    expect(context.users).toHaveLength(2);
    expect(context.users).toEqual(
      expect.arrayContaining([
        { id: 'user_1', handle: 'alice' },
        { id: 'user_2', handle: 'bob' },
      ]),
    );
    expect(context.memberships).toHaveLength(2);
  });

  it('returns empty context for empty entries array', async () => {
    const source = stubSource(new Map());
    const context = await buildUserLookupContextForKnowledge(source, []);

    expect(context.users).toEqual([]);
    expect(context.memberships).toEqual([]);
  });
});

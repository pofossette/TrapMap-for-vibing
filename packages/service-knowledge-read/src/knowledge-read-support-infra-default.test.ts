import { afterEach, describe, expect, it } from 'vitest';

import { createDefaultKnowledgeReadSupportInfra } from './knowledge-read-support-infra-default.js';
import type { KnowledgeRecord } from './store.js';

const originalDecayEnabled = process.env.TRAPMAP_DECAY_ENABLED;

afterEach(() => {
  if (originalDecayEnabled === undefined) process.env.TRAPMAP_DECAY_ENABLED = undefined;
  else process.env.TRAPMAP_DECAY_ENABLED = originalDecayEnabled;
});

describe('default knowledge-read support infra', () => {
  it('computes configured decay before applying retrieval eligibility', () => {
    process.env.TRAPMAP_DECAY_ENABLED = 'true';
    const infra = createDefaultKnowledgeReadSupportInfra();
    const entry = {
      id: 'entry-1',
      teamId: null,
      scope: 'global',
      requiredLevel: 0,
      lifecycleState: 'approved',
      labels: [],
      decayMeta: {
        lastVerifiedAt: '2020-01-01T00:00:00.000Z',
        decayState: 'active',
        supersededById: null,
      },
    } as KnowledgeRecord;

    expect(
      infra.governance.isEntryEligible(
        entry,
        {
          subjectType: 'user',
          actorId: 'user-1',
          handle: 'user',
          activeTeamId: null,
          securityLevel: 0,
          effectivePermissions: [],
          user: null,
          membership: null,
          team: null,
        },
        { scopes: [], labels: [] },
      ),
    ).toBe(false);
  });
});

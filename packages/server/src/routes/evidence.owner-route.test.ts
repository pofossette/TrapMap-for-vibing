import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';

const auth = {
  actorId: 'reviewer-1',
  handle: 'reviewer',
  securityLevel: 10,
  subjectType: 'system-admin' as const,
  activeTeamId: null,
  effectivePermissions: ['knowledge:review'],
  user: null,
  membership: null,
  team: null,
};

vi.mock('@trapmap/server/lib/session.js', () => ({
  resolveAuthContext: vi.fn(async () => auth),
}));
vi.mock('@trapmap/server/lib/rbac.js', () => ({
  requirePermission: vi.fn(),
  requireTeamAccess: vi.fn(),
  requireHigherLevel: vi.fn(),
}));

import { evidenceRoutes } from './evidence.js';

describe('evidence route owner command', () => {
  it('writes evidence through knowledge-write without a compatibility transaction', async () => {
    const transact = vi.fn();
    const reviewEvidence = vi.fn(async (_entryId, evidence) => ({
      entryId: 'entry-1',
      evidence,
    }));
    const app = Fastify();
    app.decorate('skillShareer', {
      store: { transact },
      knowledgeOwner: {
        getById: vi.fn(async () => ({
          id: 'entry-1',
          teamId: null,
          requiredLevel: 1,
          evidenceMeta: null,
        })),
        reviewEvidence,
      },
    } as never);
    await app.register(evidenceRoutes);

    const response = await app.inject({
      method: 'PATCH',
      url: '/v1/knowledge/entry-1/evidence',
      payload: { sourceType: 'doc', evidenceLevel: 'documented' },
    });

    expect(response.statusCode).toBe(200);
    expect(reviewEvidence).toHaveBeenCalledWith(
      'entry-1',
      expect.objectContaining({
        sourceType: 'doc',
        evidenceLevel: 'documented',
        verifiedBy: { id: 'reviewer-1', handle: 'reviewer', securityLevel: 10 },
      }),
      'reviewer-1',
    );
    expect(transact).not.toHaveBeenCalled();
    await app.close();
  });
});

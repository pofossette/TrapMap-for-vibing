import { describe, expect, it, vi } from 'vitest';

import type { GovernanceReviewServiceDeps } from './deps.js';
import { createGovernanceReviewServer } from './server.js';

describe('governance-review server composition', () => {
  it('exposes the injected conflict workflow to the internal owner route', async () => {
    const detectConflicts = vi.fn(async () => ({ detectedCount: 2 }));
    const server = await createGovernanceReviewServer(
      { host: '127.0.0.1', port: 0, logLevel: 'silent' },
      {
        knowledgeWrite: {},
        feedbackRepo: {},
        auditLog: {},
        conflictWorkflow: { detectConflicts },
      } as GovernanceReviewServiceDeps,
    );

    const response = await server.app.inject({
      method: 'POST',
      url: '/internal/conflicts/detect',
      payload: { entryId: 'entry-1', sourceEventId: 'event-1' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ detectedCount: 2 });
    expect(detectConflicts).toHaveBeenCalledWith({ entryId: 'entry-1' });

    await server.close();
  });
});

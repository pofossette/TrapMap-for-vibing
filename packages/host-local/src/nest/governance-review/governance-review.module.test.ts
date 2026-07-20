import { describe, expect, it, vi } from 'vitest';

import { GovernanceReviewModule } from './governance-review.module.js';

describe('host-local governance review module', () => {
  it('preserves optional owner capabilities in the injected service module', () => {
    const asyncCommands = {
      reactivateRemediation: vi.fn(),
      exportBadcaseDraft: vi.fn(),
    };
    const admin = { list: vi.fn() };
    const governanceRetrievalProjection = { listFeedback: vi.fn() };
    const dynamicModule = GovernanceReviewModule.forDeps({
      knowledgeWrite: {
        approveReviewDecision: vi.fn(),
        rejectReviewDecision: vi.fn(),
        applyMaintenanceDecision: vi.fn(),
        applyDecayDecision: vi.fn(),
      },
      feedbackRepo: {},
      auditLog: {},
      asyncCommands,
      admin,
      governanceRetrievalProjection,
    } as never);

    const provider = dynamicModule.providers?.[0] as {
      useValue: {
        asyncCommands?: unknown;
        admin?: unknown;
        governanceRetrievalProjection?: unknown;
      };
    };

    expect(provider.useValue.asyncCommands).toBe(asyncCommands);
    expect(provider.useValue.admin).toBe(admin);
    expect(provider.useValue.governanceRetrievalProjection).toBe(governanceRetrievalProjection);
  });
});

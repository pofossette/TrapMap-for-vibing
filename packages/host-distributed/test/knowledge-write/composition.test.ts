import { describe, expect, it, vi } from 'vitest';

import { createKnowledgeWriteReadinessOptions } from '../../src/knowledge-write/server.js';

describe('distributed knowledge-write composition', () => {
  it('exposes the owner knowledge projection for governance conflict reads', () => {
    const knowledgeOwner = {
      getById: vi.fn(),
      listByFilter: vi.fn(),
    };
    const options = createKnowledgeWriteReadinessOptions(
      { knowledgeOwner },
      {
        checkDependency: vi.fn(),
        getOperatorStatus: vi.fn(),
      },
    );

    expect(options.conflictCandidateRead).toBe(knowledgeOwner);
  });
});

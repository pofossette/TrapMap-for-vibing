import { describe, expect, it } from 'vitest';

import { createDefaultKnowledgeReadSupportInfra } from './index.js';

describe('runtime-infra knowledge-read support seam', () => {
  it('assembles the default support infra shape for read-side consumers', () => {
    const infra = createDefaultKnowledgeReadSupportInfra();

    expect(infra.governance).toHaveProperty('isEntryEligible');
    expect(infra.cache).toHaveProperty('createRetrievalReadModelCache');
    expect(infra.cache).toHaveProperty('registerInvalidationListener');
    expect(infra.cache).toHaveProperty('emitInvalidation');
    expect(infra.cache).toHaveProperty('recordStaleRecovery');
    expect(infra.refinement).toHaveProperty('buildSystemPrompt');
    expect(infra.refinement).toHaveProperty('buildSystemPromptBlocks');
  });
});

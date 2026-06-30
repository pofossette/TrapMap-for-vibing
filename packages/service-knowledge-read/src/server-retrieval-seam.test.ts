import { describe, expect, it } from 'vitest';

import * as knowledgeRead from './index.js';

describe('knowledge-read server retrieval seam', () => {
  it('exports retrieval seam factories for host-owned runtimes', () => {
    expect(knowledgeRead).toHaveProperty('createKnowledgeReadChannelRegistry');
    expect(knowledgeRead).toHaveProperty('createKnowledgeReadStrategyRegistry');
    expect(knowledgeRead).toHaveProperty('createKnowledgeReadRetrievalQuery');
  });
});

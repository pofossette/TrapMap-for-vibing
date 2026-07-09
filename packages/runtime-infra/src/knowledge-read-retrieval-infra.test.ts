import { describe, expect, it } from 'vitest';

import { createDefaultKnowledgeReadRetrievalInfra } from './index.js';

describe('runtime-infra knowledge-read retrieval seam', () => {
  it('assembles the default retrieval infra shape for read-side consumers', () => {
    const infra = createDefaultKnowledgeReadRetrievalInfra();

    expect(infra.embeddings).toHaveProperty('generate');
    expect(infra.embeddings).toHaveProperty('hashText');
    expect(infra.routing).toHaveProperty('selectStrategy');
    expect(infra.routing).toHaveProperty('toRoutingTrace');
    expect(infra.conflicts).toHaveProperty('enrichMatches');
    expect(infra.scoring).toHaveProperty('freshnessConfig');
    expect(infra.scoring).toHaveProperty('rerankCandidates');
    expect(infra.pgRecall).toHaveProperty('vectorSimilaritySearch');
    expect(infra.pgRecall).toHaveProperty('keywordRecall');
    expect(infra.pgRecall).toHaveProperty('graphAssistedRecall');
  });
});

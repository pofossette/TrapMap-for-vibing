import { createDefaultKnowledgeReadRetrievalInfra as createRuntimeDefaultKnowledgeReadRetrievalInfra } from '@trapmap/runtime-infra';

import type { KnowledgeReadRetrievalInfra } from './context.js';

export function createDefaultKnowledgeReadRetrievalInfra(): KnowledgeReadRetrievalInfra {
  return createRuntimeDefaultKnowledgeReadRetrievalInfra() as unknown as KnowledgeReadRetrievalInfra;
}

import type { SkillShareerServices } from './context.js';
import type { KnowledgeReadRetrievalInfra } from './context.js';

import { createKnowledgeReadRetrievalInfra } from './server-retrieval-seam.js';

let defaultRetrievalInfra: KnowledgeReadRetrievalInfra | null = null;

export function getDefaultRetrievalInfra(): KnowledgeReadRetrievalInfra {
  if (!defaultRetrievalInfra) {
    defaultRetrievalInfra = createKnowledgeReadRetrievalInfra();
  }
  return defaultRetrievalInfra;
}

export function getRetrievalInfra(
  services?: Pick<SkillShareerServices, 'retrievalInfra'>,
): KnowledgeReadRetrievalInfra {
  return services?.retrievalInfra ?? getDefaultRetrievalInfra();
}

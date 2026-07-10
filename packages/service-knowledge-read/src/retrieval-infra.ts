import type { SkillShareerServices } from './context.js';
import type { KnowledgeReadRetrievalInfra } from './context.js';

import { createDefaultKnowledgeReadRetrievalInfra } from './retrieval-infra-default.js';

let defaultRetrievalInfra: KnowledgeReadRetrievalInfra | null = null;

export function getDefaultRetrievalInfra(): KnowledgeReadRetrievalInfra {
  if (!defaultRetrievalInfra) {
    defaultRetrievalInfra = createDefaultKnowledgeReadRetrievalInfra();
  }
  return defaultRetrievalInfra;
}

export function getRetrievalInfra(
  services?: Pick<SkillShareerServices, 'retrievalInfra'>,
): KnowledgeReadRetrievalInfra {
  return services?.retrievalInfra ?? getDefaultRetrievalInfra();
}

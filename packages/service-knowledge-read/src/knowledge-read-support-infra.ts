import type { SkillShareerServices } from './context.js';
import type { KnowledgeReadSupportInfra } from './context.js';

import { createDefaultKnowledgeReadSupportInfra } from './knowledge-read-support-infra-default.js';

let defaultKnowledgeReadSupportInfra: KnowledgeReadSupportInfra | null = null;

export function getDefaultKnowledgeReadSupportInfra(): KnowledgeReadSupportInfra {
  if (!defaultKnowledgeReadSupportInfra) {
    defaultKnowledgeReadSupportInfra = createDefaultKnowledgeReadSupportInfra();
  }

  return defaultKnowledgeReadSupportInfra;
}

export function getKnowledgeReadSupportInfra(
  services?: Pick<SkillShareerServices, 'knowledgeReadSupportInfra'>,
): KnowledgeReadSupportInfra {
  return services?.knowledgeReadSupportInfra ?? getDefaultKnowledgeReadSupportInfra();
}

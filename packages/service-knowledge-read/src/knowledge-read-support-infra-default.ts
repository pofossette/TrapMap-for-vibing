import { createDefaultKnowledgeReadSupportInfra as createRuntimeKnowledgeReadSupportInfra } from '@trapmap/runtime-infra';

import type { KnowledgeReadSupportInfra } from './context.js';

export function createDefaultKnowledgeReadSupportInfra(): KnowledgeReadSupportInfra {
  return createRuntimeKnowledgeReadSupportInfra() as KnowledgeReadSupportInfra;
}

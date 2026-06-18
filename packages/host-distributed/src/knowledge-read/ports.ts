/**
 * Knowledge-read service dependency wiring.
 *
 * Maps the shared ServicePortImplementations to the KnowledgeReadDeps
 * shape expected by the backend-core knowledge-read module.
 */

import type { KnowledgeReadDeps } from '@trapmap/backend-core';
import type { ServicePortImplementations } from '../shared/ports.js';

export function createKnowledgeReadDeps(ports: ServicePortImplementations): KnowledgeReadDeps {
  return {
    knowledgeRepo: ports.repos.knowledge,
    retrievalQuery: ports.retrievalQuery,
  };
}

/**
 * Wire KnowledgeWriteDeps from the shared service port implementations.
 *
 * Maps the generic shared ports into the specific dependency shape
 * expected by createKnowledgeWriteModule from backend-core.
 */

import type { KnowledgeWriteDeps } from '@trapmap/backend-core';
import type { ServicePortImplementations } from '@trapmap/host-distributed/shared/ports.js';

/**
 * Create the dependency object required by the knowledge-write backend-core module.
 *
 * Extracts only the ports that knowledge-write actually needs from the
 * full set of service port implementations.
 */
export function createKnowledgeWriteDeps(ports: ServicePortImplementations): KnowledgeWriteDeps {
  return {
    knowledgeRepo: ports.repos.knowledge,
    auditLog: ports.auditLog,
  };
}

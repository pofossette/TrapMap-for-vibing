/**
 * Wire KnowledgeWriteDeps from the shared service port implementations.
 *
 * Maps the generic shared ports into the specific dependency shape
 * expected by createKnowledgeWriteModule from backend-core.
 */

import type { KnowledgeWriteDeps } from '@trapmap/service-knowledge-write';
import { createKnowledgeWriteDeps as createServiceKnowledgeWriteDeps } from '@trapmap/service-knowledge-write';
import type { ServicePortImplementations } from '@trapmap/host-distributed/shared/ports.js';

export function createKnowledgeWriteDeps(ports: ServicePortImplementations): KnowledgeWriteDeps {
  return createServiceKnowledgeWriteDeps({
    knowledgeRepo: ports.repos.knowledge,
    auditLog: ports.auditLog,
  });
}

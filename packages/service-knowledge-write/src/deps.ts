import { type KnowledgeWriteDeps, createKnowledgeWriteModule } from '@trapmap/backend-core';

export type { KnowledgeWriteDeps } from '@trapmap/backend-core';

export interface KnowledgeWritePortDeps {
  knowledgeRepo: KnowledgeWriteDeps['knowledgeRepo'];
  auditLog: KnowledgeWriteDeps['auditLog'];
}

export function createKnowledgeWriteDeps(deps: KnowledgeWritePortDeps): KnowledgeWriteDeps {
  return {
    knowledgeRepo: deps.knowledgeRepo,
    auditLog: deps.auditLog,
  };
}

export function createKnowledgeWriteServiceModule(deps: KnowledgeWriteDeps) {
  return createKnowledgeWriteModule(deps);
}

import { type KnowledgeWriteDeps, createKnowledgeWriteModule } from '@trapmap/backend-core';
import type { ArtifactWritePort } from './artifact-ports.js';

export type { KnowledgeWriteDeps } from '@trapmap/backend-core';

export interface KnowledgeWritePortDeps {
  knowledgeRepo: KnowledgeWriteDeps['knowledgeRepo'];
  auditLog: KnowledgeWriteDeps['auditLog'];
  artifactRepo?: ArtifactWritePort;
}

export function createKnowledgeWriteDeps(deps: KnowledgeWritePortDeps): KnowledgeWriteDeps {
  return {
    knowledgeRepo: deps.knowledgeRepo,
    auditLog: deps.auditLog,
    ...(deps.artifactRepo ? { artifactRepo: deps.artifactRepo } : {}),
  } as KnowledgeWriteDeps;
}

export function createKnowledgeWriteServiceModule(deps: KnowledgeWriteDeps) {
  return createKnowledgeWriteModule(deps);
}

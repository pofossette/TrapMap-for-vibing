import { createKnowledgeWriteModule, type KnowledgeWriteDeps } from '@trapmap/backend-core';
import type { ArtifactReadProjection, KnowledgeOwnerPort } from '@trapmap/contracts';
import type { ArtifactBundleImportPort, ArtifactWritePort } from './artifact-ports.js';

export type { KnowledgeWriteDeps } from '@trapmap/backend-core';

export interface KnowledgeWritePortDeps {
  knowledgeOwner: KnowledgeOwnerPort;
  auditLog: KnowledgeWriteDeps['auditLog'];
  artifactWriter?: ArtifactWritePort;
  artifactReadProjection?: ArtifactReadProjection;
  artifactBundleImporter?: ArtifactBundleImportPort;
}

export type ComposedKnowledgeWriteDeps = KnowledgeWriteDeps &
  Pick<
    KnowledgeWritePortDeps,
    'artifactWriter' | 'artifactReadProjection' | 'artifactBundleImporter'
  >;

export function createKnowledgeWriteDeps(deps: KnowledgeWritePortDeps): ComposedKnowledgeWriteDeps {
  return {
    knowledgeOwner: deps.knowledgeOwner,
    auditLog: deps.auditLog,
    ...(deps.artifactWriter ? { artifactRepo: deps.artifactWriter } : {}),
    ...(deps.artifactWriter ? { artifactWriter: deps.artifactWriter } : {}),
    ...(deps.artifactReadProjection ? { artifactReadProjection: deps.artifactReadProjection } : {}),
    ...(deps.artifactBundleImporter ? { artifactBundleImporter: deps.artifactBundleImporter } : {}),
  } as ComposedKnowledgeWriteDeps;
}

export function createKnowledgeWriteServiceModule(deps: KnowledgeWriteDeps) {
  return createKnowledgeWriteModule(deps);
}

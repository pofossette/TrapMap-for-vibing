/**
 * Repository-backed retrieval read model.
 *
 * Assembles knowledge entries, skill artifacts, and conflict relations
 * from their canonical repository seams instead of relying on
 * compatibility store snapshot reads inside retrieval assembly.
 *
 * Phase 4.1: Introduce a repository-backed retrieval read model.
 */

import {
  buildCachedRetrievalReadModelFromRepositories,
  type RetrievalReadProjection,
  type ConflictRelation,
} from '@trapmap/contracts';
import type { SkillShareerRepos } from '@trapmap/runtime-infra';
import {
  attachRemediationToArtifacts,
  attachRemediationToKnowledgeEntries,
} from './feedback-remediation.js';
import {
  getCachedRetrievalReadModel,
  setCachedRetrievalReadModel,
} from './retrieval-read-model-cache.js';
import type { KnowledgeRecord, SkillArtifactRecord } from './store.js';

export type RetrievalReadModel = RetrievalReadProjection<
  KnowledgeRecord,
  SkillArtifactRecord,
  ConflictRelation
>;

export async function buildRetrievalReadModel(
  repos: SkillShareerRepos,
): Promise<RetrievalReadModel> {
  return buildCachedRetrievalReadModelFromRepositories(
    {
      get: getCachedRetrievalReadModel,
      set: setCachedRetrievalReadModel,
    },
    repos,
    (artifact) => artifact,
    attachRemediationToKnowledgeEntries,
    attachRemediationToArtifacts,
  );
}

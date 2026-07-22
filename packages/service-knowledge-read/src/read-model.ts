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
  attachRemediationProjection,
  buildCachedRetrievalReadModelFromRepositories,
  type RetrievalReadProjection,
  type RetrievalReadModelRepositories,
  type ConflictRelation,
} from '@trapmap/contracts';
import {
  getCachedRetrievalReadModel,
  setCachedRetrievalReadModel,
} from './retrieval-read-model-cache.js';
import type { SkillShareerRepos } from './context.js';
import type { FeedbackQueueRecord, KnowledgeRecord, SkillArtifactRecord } from './store.js';

export type RetrievalReadModel = RetrievalReadProjection<
  KnowledgeRecord,
  SkillArtifactRecord,
  ConflictRelation
>;

export async function buildRetrievalReadModel(
  repos: SkillShareerRepos,
): Promise<RetrievalReadModel> {
  const governanceRetrievalProjection = repos.governanceRetrievalProjection;
  if (!governanceRetrievalProjection) {
    throw new Error('knowledge-read requires the governance retrieval projection owner port');
  }
  return buildCachedRetrievalReadModelFromRepositories(
    {
      get: getCachedRetrievalReadModel,
      set: setCachedRetrievalReadModel,
    },
    repos as RetrievalReadModelRepositories<
      KnowledgeRecord,
      SkillArtifactRecord,
      FeedbackQueueRecord,
      ConflictRelation
    >,
    governanceRetrievalProjection,
    (artifact) => artifact,
    (entries, _feedback, remediation) => attachRemediationProjection(entries, remediation),
    (artifacts, _feedback, remediation) => attachRemediationProjection(artifacts, remediation),
  );
}

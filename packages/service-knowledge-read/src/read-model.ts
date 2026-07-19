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
  type ConflictRelation,
  type RetrievalGovernanceProjection,
} from '@trapmap/contracts';
import type { SkillShareerRepos } from '@trapmap/runtime-infra';
import {
  getCachedRetrievalReadModel,
  setCachedRetrievalReadModel,
} from './retrieval-read-model-cache.js';
import type { FeedbackQueueRecord, KnowledgeRecord, SkillArtifactRecord } from './store.js';

export type RetrievalReadModel = RetrievalReadProjection<
  KnowledgeRecord,
  SkillArtifactRecord,
  ConflictRelation
>;

export async function buildRetrievalReadModel(
  repos: SkillShareerRepos,
): Promise<RetrievalReadModel> {
  const governanceRetrievalProjection = repos.governanceRetrievalProjection as unknown as
    | RetrievalGovernanceProjection<FeedbackQueueRecord, ConflictRelation>
    | undefined;
  if (!governanceRetrievalProjection) {
    throw new Error('knowledge-read requires the governance retrieval projection owner port');
  }
  return buildCachedRetrievalReadModelFromRepositories(
    {
      get: getCachedRetrievalReadModel,
      set: setCachedRetrievalReadModel,
    },
    repos,
    governanceRetrievalProjection,
    (artifact) => artifact,
    (entries, _feedback, remediation) => attachRemediationProjection(entries, remediation),
    (artifacts, _feedback, remediation) => attachRemediationProjection(artifacts, remediation),
  );
}

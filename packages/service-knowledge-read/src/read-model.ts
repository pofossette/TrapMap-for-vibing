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
  type ArtifactReadProjection,
  type ConflictRelation,
  type KnowledgeOwnerPort,
  type RetrievalGovernanceProjection,
  type RetrievalReadModelRepositories,
  type RetrievalReadProjection,
  attachRemediationProjection,
  buildCachedRetrievalReadModelFromRepositories,
} from '@trapmap/contracts';
import type { SkillShareerRepos } from './context.js';
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

/**
 * Host-injected owner read model used by administrative compatibility routes.
 * The projection remains assembled inside knowledge-read from owner ports.
 */
export interface OwnerReadModelProjection {
  getReadModel(): Promise<RetrievalReadModel>;
}

export interface OwnerReadModelProjectionOptions {
  knowledge: Pick<KnowledgeOwnerPort, 'listByFilter'>;
  artifact: Pick<ArtifactReadProjection, 'listByFilter' | 'listForRetrieval'>;
  governance: RetrievalGovernanceProjection<FeedbackQueueRecord, ConflictRelation>;
}

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
    {
      normalizeArtifact: (artifact) => artifact,
      attachFeedbackToKnowledge: (entries, _feedback, remediation) =>
        attachRemediationProjection(entries, remediation),
      attachFeedbackToArtifacts: (artifacts, _feedback, remediation) =>
        attachRemediationProjection(artifacts, remediation),
    },
  );
}

/**
 * Owner-facing read projection for administrative and maintenance consumers.
 * It deliberately shares the retrieval model's owner-port assembly.
 */
export function buildOwnerReadModel(repos: SkillShareerRepos): Promise<RetrievalReadModel> {
  return buildRetrievalReadModel(repos);
}

export function createOwnerReadModelProjection(
  options: OwnerReadModelProjectionOptions,
): OwnerReadModelProjection {
  return {
    getReadModel: () =>
      buildOwnerReadModel({
        knowledge: options.knowledge as unknown as SkillShareerRepos['knowledge'], // lib type gap: the
        // owner port returns contracts KnowledgeEntry records while the retrieval
        // read model consumes the internal KnowledgeRecord shape — the same runtime
        // projection rows, structurally distinct at the type level
        artifact: options.artifact as unknown as SkillShareerRepos['artifact'], // lib type gap: the
        // owner port returns contracts artifact records while the retrieval read
        // model consumes the internal SkillArtifactRecord shape — same runtime rows
        governanceRetrievalProjection: options.governance,
        usageAnalytics: null,
        graphIndex: null,
      }),
  };
}

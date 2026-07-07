/**
 * Repository-backed retrieval read model.
 *
 * Assembles knowledge entries, skill artifacts, and conflict relations
 * from their canonical repository seams instead of relying on
 * compatibility store snapshot reads inside retrieval assembly.
 *
 * Phase 4.1: Introduce a repository-backed retrieval read model.
 */

import type { ConflictRelation } from '@trapmap/contracts';
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

/**
 * Assembled read model for retrieval flows.
 * Provides the three data shapes that retrieval consumers need:
 * knowledge entries, skill artifacts, and conflict relations.
 */
export interface RetrievalReadModel {
  knowledgeEntries: KnowledgeRecord[];
  skillArtifacts: SkillArtifactRecord[];
  conflicts: ConflictRelation[];
}

/**
 * Build a retrieval read model from repositories.
 *
 * Knowledge, artifact, feedback, and conflict data are read from their
 * dedicated repository seams in parallel.
 *
 * @param repos - Unified repository object
 * @returns Assembled read model with all retrieval-relevant data
 */
export async function buildRetrievalReadModel(
  repos: SkillShareerRepos,
): Promise<RetrievalReadModel> {
  const cached = getCachedRetrievalReadModel();
  if (cached) {
    return cached;
  }

  const artifactLister =
    typeof repos.artifact.listForRetrieval === 'function'
      ? repos.artifact.listForRetrieval.bind(repos.artifact)
      : repos.artifact.listByFilter.bind(repos.artifact);

  const [knowledgeEntries, skillArtifacts, feedbackQueue, conflicts] = await Promise.all([
    repos.knowledge.listByFilter({}),
    artifactLister({}),
    repos.feedback.listByFilter({}),
    repos.conflict.listAll(),
  ]);

  const model = {
    knowledgeEntries: attachRemediationToKnowledgeEntries(knowledgeEntries, feedbackQueue),
    skillArtifacts: attachRemediationToArtifacts(skillArtifacts, feedbackQueue),
    conflicts,
  };

  setCachedRetrievalReadModel(model);
  return model;
}

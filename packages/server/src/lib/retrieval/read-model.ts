/**
 * Repository-backed retrieval read model.
 *
 * Assembles knowledge entries, skill artifacts, and conflict relations
 * from their canonical sources (repositories + store snapshot for conflicts)
 * instead of relying on the deprecated store.snapshot() compatibility rows.
 *
 * Phase 4.1: Introduce a repository-backed retrieval read model.
 */

import type { ConflictRelation } from '@trapmap/contracts';
import type { SkillShareerRepos } from '@trapmap/server/lib/repos/index.js';
import type {
  KnowledgeRecord,
  SkillArtifactRecord,
  SkillShareerStore,
} from '@trapmap/server/lib/store.js';

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
 * Build a retrieval read model from repositories and store.
 *
 * Knowledge and artifact data are read from their dedicated repositories
 * in parallel. Conflicts are read from the store snapshot because no
 * ConflictRepository exists yet.
 *
 * @param repos - Unified repository object
 * @param store - Store used solely for conflict snapshot (temporary)
 * @returns Assembled read model with all retrieval-relevant data
 */
export async function buildRetrievalReadModel(
  repos: SkillShareerRepos,
  store: SkillShareerStore,
): Promise<RetrievalReadModel> {
  const [knowledgeEntries, skillArtifacts, snapshot] = await Promise.all([
    repos.knowledge.listByFilter({}),
    repos.artifact.listByFilter({}),
    store.snapshot(),
  ]);

  return {
    knowledgeEntries,
    skillArtifacts,
    conflicts: snapshot.conflicts,
  };
}

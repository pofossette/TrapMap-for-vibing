/**
 * Serialize server artifact records to shared contract format.
 *
 * Preserves governance (scope, teamId, requiredLevel) and audit lineage
 * (reviewHistory, lifecycleHistory) as required by T-12-07 and T-12-08.
 */

import { skillArtifactSchema } from '@trapmap/contracts';

import type {
  SkillArtifactRecord as ServerSkillArtifactRecord,
  StoreData,
} from '@trapmap/server/lib/store.js';

import {
  toActorRef,
  toLifecycleEvent,
  toReviewDecision,
  toReviewNote,
  toRevision,
} from './helpers.js';

/**
 * Serialize a server artifact record to the shared contract format.
 *
 * This preserves governance (scope, teamId, requiredLevel) and audit lineage
 * (reviewHistory, lifecycleHistory) as required by T-12-07 and T-12-08.
 */
export function toSkillArtifact(data: StoreData, record: ServerSkillArtifactRecord) {
  const owner = toActorRef(data, record.ownerUserId, record.teamId, record.requiredLevel);

  return skillArtifactSchema.parse({
    id: record.id,
    teamId: record.teamId,
    scope: record.scope,
    labels: record.labels,
    title: record.title,
    slug: record.slug,
    requiredLevel: record.requiredLevel,
    lifecycleState: record.lifecycleState,
    owner,
    latestRevision: record.latestRevision.revision,
    history: record.history.map((revision) =>
      toRevision(data, revision, record.teamId, record.requiredLevel),
    ),
    metadata: record.metadata,
    agentReview: record.agentReview,
    reviewHistory: record.reviewHistory.map((decision) =>
      toReviewDecision(data, decision, record.teamId, record.requiredLevel),
    ),
    reviewNotes: record.reviewNotes.map((note) =>
      toReviewNote(data, note, record.teamId, record.requiredLevel),
    ),
    lifecycleHistory: record.lifecycleHistory.map((event) =>
      toLifecycleEvent(data, event, record.teamId, record.requiredLevel),
    ),
    evidenceMeta: record.evidenceMeta,
    maintenanceMeta: record.maintenanceMeta
      ? {
          maintainer: record.maintenanceMeta.maintainerUserId
            ? {
                id: record.maintenanceMeta.maintainerUserId,
                handle: record.maintenanceMeta.maintainerHandle ?? '',
                securityLevel: record.maintenanceMeta.maintainerLevel ?? record.requiredLevel,
              }
            : null,
          reviewBy: record.maintenanceMeta.reviewBy,
        }
      : null,
    remediation: record.remediation ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

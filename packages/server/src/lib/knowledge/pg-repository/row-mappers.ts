/**
 * Row-to-record mapping functions for knowledge database tables.
 */

import type {
  KnowledgeLifecycleEventRecord,
  KnowledgeRecord,
  KnowledgeRevisionRecord,
  MaintenanceMetaRecord,
} from '@trapmap/server/lib/store.js';
import type {
  DrizzleKnowledgeEntryRow,
  DrizzleKnowledgeRevisionRow,
  DrizzleLifecycleEventRow,
  MaintenanceAssignmentRow,
} from './row-types.js';

/**
 * Map a Drizzle row to a KnowledgeRecord with default/empty derived fields.
 */
export function rowToKnowledgeEntry(row: DrizzleKnowledgeEntryRow): KnowledgeRecord {
  return {
    id: row.id,
    teamId: row.team_id,
    scope: row.scope as 'global' | 'project',
    labels: row.labels,
    shortcut: row.shortcut,
    detail: row.detail,
    requiredLevel: row.required_level,
    lifecycleState: row.lifecycle_state,
    ownerUserId: row.owner_user_id,
    boundary: row.boundary,
    maintenanceMeta: row.maintenance_meta,
    decayMeta: null,
    evidenceMeta: null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    // These fields are populated separately
    latestRevision: {
      revision: 0,
      submittedAt: row.created_at.toISOString(),
      submittedByUserId: row.owner_user_id,
      shortcut: row.shortcut,
      detail: row.detail,
      labels: row.labels,
      reviewNotes: [],
    },
    history: [],
    metadata: {
      scopeLabel: row.scope === 'global' ? 'global-constraint' : 'project-knowledge',
      submissionCount: 0,
      resubmissionCount: 0,
      revisionCount: 0,
      latestSubmissionId: null,
      latestSubmittedAt: null,
      latestReviewedAt: null,
      latestDecision: null,
    },
    latestSubmissionId: null,
    submissionHistory: [],
    agentReview: null,
    reviewHistory: [],
    reviewNotes: [],
    lifecycleHistory: [],
    embeddingCache: row.embedding_cache ?? null,
    indexState: null,
  };
}

/**
 * Map a Drizzle revision row to KnowledgeRevisionRecord.
 */
export function rowToKnowledgeRevision(row: DrizzleKnowledgeRevisionRow): KnowledgeRevisionRecord {
  return {
    revision: row.revision_no,
    submittedAt: row.submitted_at.toISOString(),
    submittedByUserId: row.submitted_by_user_id,
    shortcut: row.shortcut,
    detail: row.detail,
    labels: row.labels,
    reviewNotes: row.review_notes,
  };
}

/**
 * Map a Drizzle lifecycle event row to KnowledgeLifecycleEventRecord.
 */
export function rowToLifecycleEvent(row: DrizzleLifecycleEventRow): KnowledgeLifecycleEventRecord {
  return {
    id: row.id,
    type: row.type,
    createdAt: row.created_at.toISOString(),
    actorUserId: row.actor_user_id,
    submissionId: row.submission_id,
    revision: row.revision_no,
    state: row.state,
    note: row.note,
  };
}

/**
 * Map a maintenance assignment row to MaintenanceMetaRecord.
 */
export function rowToMaintenanceMeta(row: MaintenanceAssignmentRow): MaintenanceMetaRecord {
  return {
    maintainerUserId: row.maintainer_user_id,
    maintainerHandle: row.maintainer_handle,
    maintainerLevel: row.maintainer_level,
    reviewBy: row.review_by ? row.review_by.toISOString() : null,
  };
}

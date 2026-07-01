/**
 * Database row type definitions for knowledge-related tables.
 *
 * Drizzle returns snake_case column names from PostgreSQL.
 */

import type { Boundary, LifecycleState } from '@trapmap/contracts';
import type { EmbeddingCacheRecord, MaintenanceMetaRecord } from '@trapmap/server/lib/store.js';

/**
 * Database row shape for knowledge_entries table.
 */
export interface DrizzleKnowledgeEntryRow {
  id: string;
  team_id: string | null;
  scope: string;
  labels: string[];
  shortcut: string;
  detail: string;
  required_level: number;
  lifecycle_state: LifecycleState;
  owner_user_id: string;
  boundary: Boundary | null;
  maintenance_meta: MaintenanceMetaRecord | null;
  embedding_cache: EmbeddingCacheRecord | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Database row shape for knowledge_revisions table.
 */
export interface DrizzleKnowledgeRevisionRow {
  id: string;
  entry_id: string;
  revision_no: number;
  submitted_at: Date;
  submitted_by_user_id: string;
  shortcut: string;
  detail: string;
  labels: string[];
  review_notes: Array<{
    id: string;
    createdAt: string;
    authorType: 'submitter' | 'agent' | 'reviewer' | 'system';
    authorUserId: string | null;
    message: string;
  }>;
  created_at: Date;
}

/**
 * Database row shape for lifecycle_events table.
 */
export interface DrizzleLifecycleEventRow {
  id: string;
  entry_id: string;
  type:
    | 'submitted'
    | 'resubmitted'
    | 'agent-reviewed'
    | 'reviewer-approved'
    | 'reviewer-rejected'
    | 'updated'
    | 'deactivated';
  created_at: Date;
  actor_user_id: string | null;
  submission_id: string | null;
  revision_no: number | null;
  state: LifecycleState;
  note: string | null;
}

/**
 * Database row shape for knowledge_maintenance_assignments table.
 */
export interface MaintenanceAssignmentRow {
  entry_id: string;
  maintainer_user_id: string | null;
  maintainer_handle: string | null;
  maintainer_level: number | null;
  review_by: Date | null;
  created_at: Date;
  updated_at: Date;
}

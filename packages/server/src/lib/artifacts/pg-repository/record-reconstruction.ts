/**
 * Row-to-record mapping and full record reconstruction for skill artifacts.
 *
 * Contains all Drizzle row type definitions, pure mapping functions,
 * and the reconstructSkillArtifactRecord function that assembles a full
 * SkillArtifactRecord from database rows.
 */

import type { Boundary, DecayMeta, EvidenceMeta, LifecycleState, Scope } from '@trapmap/contracts';
import type {
  AgentReviewRecord,
  MaintenanceMetaRecord,
  SkillArtifactLifecycleEventRecord,
  SkillArtifactMetadataRecord,
  SkillArtifactRecord,
  SkillArtifactRevisionRecord,
  StoredScriptActivationPolicy,
} from '@trapmap/server/lib/store.js';

// =============================================================================
// Drizzle Row Types
// =============================================================================

/**
 * Database row shape for skill_artifacts table.
 * Drizzle returns snake_case column names from PostgreSQL.
 */
export interface DrizzleSkillArtifactRow {
  id: string;
  team_id: string | null;
  scope: string;
  labels: string[];
  title: string;
  slug: string;
  required_level: number;
  lifecycle_state: LifecycleState;
  owner_user_id: string;
  metadata: SkillArtifactMetadataRecord;
  agent_review: AgentReviewRecord | null;
  maintenance_meta: {
    maintainerUserId: string | null;
    maintainerHandle: string | null;
    maintainerLevel: number | null;
    reviewBy: string | null;
  } | null;
  decay_meta: {
    lastVerifiedAt: string;
    decayState: string;
    supersededById: string | null;
    decayStateComputedAt: string;
    freshnessType: string;
  } | null;
  evidence_meta: {
    sourceType: string;
    sourceRef?: string;
    evidenceLevel: string;
    verifiedAt: string;
    verifiedBy: { userId: string };
  } | null;
  boundary: Boundary | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * File record shape for JSONB column in artifact_revisions.
 */
export interface ArtifactRevisionFileRow {
  path: string;
  kind: 'skill-markdown' | 'reference' | 'asset' | 'script';
  sha256: string;
  sizeBytes: number;
  mediaType: string;
  source: 'references/' | 'assets/' | 'scripts/' | 'SKILL.md';
  includeInDerivation: boolean;
  activationOnly: boolean;
}

/**
 * Script descriptor shape for JSONB column in artifact_revisions.
 */
export interface ArtifactScriptDescriptorRow {
  path: string;
  sha256: string;
  capability: string;
  argsSchemaSummary: string;
  sideEffectSummary: string;
  defaultPolicy: StoredScriptActivationPolicy;
}

/**
 * Derived outputs shape for JSONB column in artifact_revisions.
 */
export interface ArtifactDerivedRow {
  profile: {
    artifactId: string;
    revision: number;
    sourceHash: string;
    title: string;
    summary: string;
    keywords: string[];
    referencePaths: string[];
    contentHash: string;
  } | null;
  capsules: Array<{
    capsuleId: string;
    artifactId: string;
    revision: number;
    sourcePaths: string[];
    content: string;
    situation: string;
    problem: string;
    goal: string;
    errorText: string | null;
    labels: string[];
    scope: Scope;
    requiredLevel: number;
  }>;
  clientManifest: {
    artifactId: string;
    revision: number;
    references: Array<{
      path: string;
      sha256: string;
      sizeBytes: number;
      mediaType: string;
    }>;
    assets: Array<{
      path: string;
      sha256: string;
      sizeBytes: number;
      mediaType: string;
    }>;
    scripts: Array<{
      path: string;
      sha256: string;
      capability: string;
      argsSchemaSummary: string;
      sideEffectSummary: string;
      defaultPolicy: StoredScriptActivationPolicy;
    }>;
    sourceHash: string;
  } | null;
  sourceHash: string;
  derivedAt: string;
}

/**
 * Database row shape for artifact_revisions table.
 */
export interface DrizzleArtifactRevisionRow {
  id: string;
  artifact_id: string;
  revision_no: number;
  source_hash: string;
  files: ArtifactRevisionFileRow[];
  submitted_at: Date;
  submitted_by_user_id: string;
  script_descriptors: ArtifactScriptDescriptorRow[];
  derived: ArtifactDerivedRow | null;
  created_at: Date;
}

export interface StructuredRevisionData {
  files: ArtifactRevisionFileRow[];
  scriptDescriptors: ArtifactScriptDescriptorRow[];
  derived: ArtifactDerivedRow | null;
}

export interface ArtifactMaintenanceAssignmentRow {
  artifact_id: string;
  maintainer_user_id: string | null;
  maintainer_handle: string | null;
  maintainer_level: number | null;
  review_by: Date | null;
}

export interface ArtifactAgentReviewRow {
  artifact_id: string;
  status: 'agent-pass' | 'agent-rejected';
  duplicate_risk: 'low' | 'medium' | 'high';
  correctness_risk: 'low' | 'medium' | 'high';
  completeness_risk: 'low' | 'medium' | 'high';
  checked_at: Date;
  notes: string[];
}

export interface ArtifactMetadataRow {
  artifact_id: string;
  source_kind: 'skill-directory' | 'single-skill-md' | 'legacy-knowledge';
  submission_count: number;
  resubmission_count: number;
  revision_count: number;
  latest_submission_id: string | null;
  latest_submitted_at: Date | null;
  latest_reviewed_at: Date | null;
  latest_decision: 'approve' | 'reject' | null;
}

/**
 * Database row shape for artifact_lifecycle_events table.
 */
export interface DrizzleArtifactLifecycleEventRow {
  id: string;
  artifact_id: string;
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

// =============================================================================
// Pure Mapping Functions
// =============================================================================

/**
 * Map a Drizzle row to partial SkillArtifactRecord fields.
 */
export function rowToSkillArtifact(row: DrizzleSkillArtifactRow): SkillArtifactRecord {
  return {
    id: row.id,
    teamId: row.team_id,
    scope: row.scope as 'global' | 'project',
    labels: row.labels,
    title: row.title,
    slug: row.slug,
    requiredLevel: row.required_level,
    lifecycleState: row.lifecycle_state,
    ownerUserId: row.owner_user_id,
    metadata: row.metadata,
    agentReview: row.agent_review,
    maintenanceMeta: row.maintenance_meta,
    decayMeta: row.decay_meta as DecayMeta | null,
    evidenceMeta: row.evidence_meta as EvidenceMeta | null,
    boundary: row.boundary,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    // These fields are populated separately
    latestRevision: {
      revision: 0,
      sourceHash: '',
      files: [],
      submittedAt: row.created_at.toISOString(),
      submittedByUserId: row.owner_user_id,
      scriptDescriptors: [],
      derived: null,
    },
    history: [],
    reviewHistory: [],
    reviewNotes: [],
    lifecycleHistory: [],
  };
}

/**
 * Map a Drizzle revision row to SkillArtifactRevisionRecord.
 */
export function rowToArtifactRevision(
  row: DrizzleArtifactRevisionRow,
): SkillArtifactRevisionRecord {
  return {
    revision: row.revision_no,
    sourceHash: row.source_hash,
    files: row.files,
    submittedAt: row.submitted_at.toISOString(),
    submittedByUserId: row.submitted_by_user_id,
    scriptDescriptors: row.script_descriptors,
    derived: row.derived,
  };
}

export function buildDerivedFromStructured(
  data: StructuredRevisionData,
  fallback: ArtifactDerivedRow | null,
): ArtifactDerivedRow | null {
  if (data.derived !== null) {
    return data.derived;
  }
  return fallback;
}

/**
 * Map a Drizzle lifecycle event row to SkillArtifactLifecycleEventRecord.
 */
export function rowToArtifactLifecycleEvent(
  row: DrizzleArtifactLifecycleEventRow,
): SkillArtifactLifecycleEventRecord {
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

// =============================================================================
// Full Record Reconstruction
// =============================================================================

/**
 * Reconstruct a full SkillArtifactRecord from database rows.
 */
export function reconstructSkillArtifactRecord(
  artifactRow: DrizzleSkillArtifactRow,
  revisionRows: DrizzleArtifactRevisionRow[],
  eventRows: DrizzleArtifactLifecycleEventRow[],
  structuredRows: Map<string, StructuredRevisionData>,
  boundary: Boundary | null,
  maintenanceMeta: MaintenanceMetaRecord | null,
  agentReview: AgentReviewRecord | null,
  metadata: SkillArtifactMetadataRecord | null,
): SkillArtifactRecord {
  const artifact = rowToSkillArtifact(artifactRow);
  artifact.metadata = metadata ?? artifact.metadata;
  artifact.boundary = boundary ?? artifact.boundary;
  artifact.maintenanceMeta = maintenanceMeta ?? artifact.maintenanceMeta;
  artifact.agentReview = agentReview ?? artifact.agentReview;

  // Populate revisions
  const revisions = revisionRows.map((row) => {
    const structured = structuredRows.get(row.id);
    if (!structured) {
      return rowToArtifactRevision(row);
    }
    return {
      revision: row.revision_no,
      sourceHash: row.source_hash,
      files: structured.files,
      submittedAt: row.submitted_at.toISOString(),
      submittedByUserId: row.submitted_by_user_id,
      scriptDescriptors: structured.scriptDescriptors,
      derived: buildDerivedFromStructured(structured, row.derived),
    };
  });
  artifact.history = revisions;
  if (revisions.length > 0) {
    artifact.latestRevision = revisions[revisions.length - 1]!;
  }

  // Populate lifecycle events
  artifact.lifecycleHistory = eventRows.map(rowToArtifactLifecycleEvent);

  return artifact;
}

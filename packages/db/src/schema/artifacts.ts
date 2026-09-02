/**
 * Shared skill artifact domain tables.
 *
 * Covers: skill artifacts, revisions, files, script descriptors,
 * derived outputs (profiles, capsules, embeddings, keywords,
 * client manifests), boundary sub-tables, maintenance assignments,
 * agent reviews, metadata, and lifecycle events.
 */
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgSequence,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  vector,
} from 'drizzle-orm/pg-core';

import type { Boundary, LifecycleState, Scope } from '@trapmap/contracts';
import {
  artifactFileDetailsColumns,
  artifactRevisionItemColumns,
  artifactScriptDetailsColumns,
  auditTimestamps,
  capsuleIndexColumns,
  lifecycleEventColumns,
  revisionColumns,
} from './column-factories.js';

// =============================================================================
// Sequences
// =============================================================================

/**
 * SEQUENCE for skill artifact ID generation.
 * Provides monotonic ID values for skill_artifacts table.
 */
export const skillArtifactIdSeq = pgSequence('skill_artifact_id_seq', {
  startWith: 1,
  increment: 1,
});

// =============================================================================
// Skill Artifact Tables (Phase 63: WRITE-03)
// =============================================================================

/**
 * Skill artifacts table for row-level storage of skill artifact data.
 * Each row represents a single skill artifact with its current state.
 * Enables row-level locking and concurrent access without blocking other artifacts.
 */
export const skillArtifacts = pgTable(
  'skill_artifacts',
  {
    /** Unique artifact identifier (e.g., artifact_123) */
    id: text('id').primaryKey(),
    /** Team ID if team-scoped, null for global */
    teamId: text('team_id'),
    /** Scope: 'global' or 'project' */
    scope: text('scope').notNull(),
    /** Labels for filtering and categorization */
    labels: jsonb('labels').notNull().$type<string[]>().default([]),
    /** Human-readable title */
    title: text('title').notNull(),
    /** URL-friendly slug for references */
    slug: text('slug').notNull(),
    /** Required security level for access control */
    requiredLevel: integer('required_level').notNull().default(0),
    /** Current lifecycle state */
    lifecycleState: text('lifecycle_state').notNull().$type<LifecycleState>(),
    /** Owner/creator user ID */
    ownerUserId: text('owner_user_id').notNull(),
    /** Artifact-specific metadata */
    metadata: jsonb('metadata').notNull().$type<{
      sourceKind: 'skill-directory' | 'single-skill-md' | 'legacy-knowledge';
      submissionCount: number;
      resubmissionCount: number;
      revisionCount: number;
      latestSubmissionId: string | null;
      latestSubmittedAt: string | null;
      latestReviewedAt: string | null;
      latestDecision: 'approve' | 'reject' | null;
    }>(),
    /** Agent review result (if applicable) */
    agentReview: jsonb('agent_review').$type<{
      status: 'agent-pass' | 'agent-rejected';
      duplicateRisk: 'low' | 'medium' | 'high';
      correctnessRisk: 'low' | 'medium' | 'high';
      completenessRisk: 'low' | 'medium' | 'high';
      checkedAt: string;
      notes: string[];
    } | null>(),
    /** Maintenance metadata for ownership and review-due tracking */
    maintenanceMeta: jsonb('maintenance_meta').$type<{
      maintainerUserId: string | null;
      maintainerHandle: string | null;
      maintainerLevel: number | null;
      reviewBy: string | null;
    } | null>(),
    /** Boundary constraints for artifact applicability */
    boundary: jsonb('boundary').$type<Boundary | null>(),
    /** Record creation timestamp */
    ...auditTimestamps(),
  },
  (table) => [
    index('idx_skill_artifacts_lifecycle_state').on(table.lifecycleState),
    index('idx_skill_artifacts_team').on(table.teamId),
    index('idx_skill_artifacts_slug').on(table.slug),
    index('idx_skill_artifacts_boundary_gin').using('gin', table.boundary),
    uniqueIndex('idx_skill_artifacts_scope_team_slug').on(
      sql`COALESCE(${table.teamId}, '__global__')`,
      table.scope,
      table.slug,
    ),
  ],
);

/**
 * Artifact revisions table for immutable revision history.
 * Each row captures a snapshot of artifact files and derived outputs at a point in time.
 */
export const artifactRevisions = pgTable(
  'artifact_revisions',
  {
    /** Composite key: {artifact_id}_rev{revision} */
    id: text('id').primaryKey(),
    /** Reference to parent skill artifact */
    artifactId: text('artifact_id').notNull(),
    /** Monotonically increasing revision number */
    ...revisionColumns(),
    /** SHA-256 hash of all source files for this revision */
    sourceHash: text('source_hash').notNull(),
    /** Semver version declared in SKILL.md frontmatter (null for unversioned skills) */
    version: text('version'),
    /** All files in the skill directory at this revision */
    files: jsonb('files').notNull().$type<
      Array<{
        path: string;
        kind: 'skill-markdown' | 'reference' | 'asset' | 'script';
        sha256: string;
        sizeBytes: number;
        mediaType: string;
        source: 'references/' | 'assets/' | 'scripts/' | 'SKILL.md';
        includeInDerivation: boolean;
        activationOnly: boolean;
      }>
    >(),
    /** Script descriptors for executable scripts in this revision */
    scriptDescriptors: jsonb('script_descriptors').notNull().$type<
      Array<{
        path: string;
        sha256: string;
        capability: string;
        argsSchemaSummary: string;
        sideEffectSummary: string;
        defaultPolicy: string;
      }>
    >(),
    /** Cached derived outputs keyed by source hash */
    derived: jsonb('derived').$type<{
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
        situation: string | null;
        problem: string | null;
        goal: string | null;
        errorText: string | null;
        labels: string[];
        scope: string;
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
          defaultPolicy: string;
        }>;
        sourceHash: string;
      } | null;
      sourceHash: string;
      derivedAt: string;
    } | null>(),
  },
  (table) => [
    index('idx_artifact_revisions_artifact').on(table.artifactId),
    uniqueIndex('idx_artifact_revisions_artifact_revision_no').on(
      table.artifactId,
      table.revisionNo,
    ),
  ],
);

export const skillArtifactFiles = pgTable(
  'skill_artifact_files',
  {
    ...artifactRevisionItemColumns(),
    artifactId: text('artifact_id').notNull(),
    revisionNo: integer('revision_no').notNull(),
    path: text('path').notNull(),
    kind: text('kind').notNull().$type<'skill-markdown' | 'reference' | 'asset' | 'script'>(),
    sha256: text('sha256').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    mediaType: text('media_type').notNull(),
    content: text('content').notNull(),
    sourceGroup: text('source_group')
      .notNull()
      .$type<'references/' | 'assets/' | 'scripts/' | 'SKILL.md'>(),
    includeInDerivation: integer('include_in_derivation').notNull().default(1),
    activationOnly: integer('activation_only').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_skill_artifact_files_artifact_revision').on(table.artifactRevisionId),
    index('idx_skill_artifact_files_artifact').on(table.artifactId, table.revisionNo),
    uniqueIndex('idx_skill_artifact_files_revision_path').on(table.artifactRevisionId, table.path),
    check(
      'ck_skill_artifact_files_kind',
      sql`${table.kind} IN ('skill-markdown', 'reference', 'asset', 'script')`,
    ),
  ],
);

export const skillArtifactScriptDescriptors = pgTable(
  'skill_artifact_script_descriptors',
  {
    ...artifactRevisionItemColumns(),
    artifactId: text('artifact_id').notNull(),
    revisionNo: integer('revision_no').notNull(),
    ...artifactScriptDetailsColumns(),
  },
  (table) => [
    index('idx_skill_artifact_script_descriptors_revision').on(table.artifactRevisionId),
    index('idx_skill_artifact_script_descriptors_artifact').on(table.artifactId, table.revisionNo),
    uniqueIndex('idx_skill_artifact_script_descriptors_revision_path').on(
      table.artifactRevisionId,
      table.path,
    ),
  ],
);

export const skillArtifactProfiles = pgTable(
  'skill_artifact_profiles',
  {
    artifactRevisionId: text('artifact_revision_id').primaryKey(),
    artifactId: text('artifact_id').notNull(),
    revisionNo: integer('revision_no').notNull(),
    sourceHash: text('source_hash').notNull(),
    title: text('title').notNull(),
    summary: text('summary').notNull(),
    keywords: jsonb('keywords').notNull().$type<string[]>().default([]),
    referencePaths: jsonb('reference_paths').notNull().$type<string[]>().default([]),
    contentHash: text('content_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_skill_artifact_profiles_artifact').on(table.artifactId, table.revisionNo)],
);

export const skillArtifactCapsules = pgTable(
  'skill_artifact_capsules',
  {
    capsuleId: text('capsule_id').primaryKey(),
    artifactRevisionId: text('artifact_revision_id').notNull(),
    artifactId: text('artifact_id').notNull(),
    revisionNo: integer('revision_no').notNull(),
    sourceHash: text('source_hash').notNull(),
    sourcePaths: jsonb('source_paths').notNull().$type<string[]>().default([]),
    content: text('content').notNull(),
    situation: text('situation').notNull(),
    problem: text('problem').notNull(),
    goal: text('goal').notNull(),
    errorText: text('error_text'),
    contextualPrefix: text('contextual_prefix'),
    labels: jsonb('labels').notNull().$type<string[]>().default([]),
    scope: text('scope').notNull().$type<Scope>(),
    requiredLevel: integer('required_level').notNull(),
    /** Consolidated keyword tokens (was skill_artifact_capsule_keywords text[] GIN) */
    keywordTokens: jsonb('keyword_tokens').$type<string[]>().default([]),
    fieldKeywordTokens: jsonb('field_keyword_tokens').$type<Record<string, string[]>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_skill_artifact_capsules_revision').on(table.artifactRevisionId),
    index('idx_skill_artifact_capsules_artifact').on(table.artifactId, table.revisionNo),
    index('idx_skill_artifact_capsules_keyword_gin').using('gin', table.keywordTokens),
    check('ck_skill_artifact_capsules_scope', sql`${table.scope} IN ('global', 'project')`),
  ],
);

/**
 * Capsule embedding vectors for PostgreSQL semantic search.
 * Derived index table -- stores pre-computed embedding vectors for fast cosine similarity search.
 * Uses pgvector HNSW index for O(log n) approximate nearest neighbor search.
 *
 * Embedding text built from: labels -> situation -> problem -> goal -> contextualPrefix -> content
 * Governance columns (teamId, scope, requiredLevel) mirror capsules for WHERE filtering.
 *
 * The HNSW vector index is not defined here as Drizzle ORM doesn't natively support
 * custom index types. The index is created programmatically via
 * ensureCapsuleVectorIndex() in the PG capsule vector repository.
 */
export const skillArtifactCapsuleEmbeddings = pgTable(
  'skill_artifact_capsule_embeddings',
  {
    ...capsuleIndexColumns(),
    embedding: vector('embedding', { dimensions: 384 }).notNull(),
    contentHash: text('content_hash').notNull(),
    lastError: text('last_error'),
    ...auditTimestamps(),
  },
  (table) => [
    index('idx_capsule_embeddings_artifact_revision').on(table.artifactId, table.revisionNo),
    index('idx_capsule_embeddings_status').on(table.status),
    check(
      'ck_skill_artifact_capsule_embeddings_scope',
      sql`${table.scope} IN ('global', 'project')`,
    ),
  ],
);

export const skillArtifactClientManifests = pgTable(
  'skill_artifact_client_manifests',
  {
    artifactRevisionId: text('artifact_revision_id').primaryKey(),
    artifactId: text('artifact_id').notNull(),
    revisionNo: integer('revision_no').notNull(),
    sourceHash: text('source_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_skill_artifact_client_manifests_artifact').on(table.artifactId, table.revisionNo),
  ],
);

export const skillArtifactManifestItems = pgTable(
  'skill_artifact_manifest_items',
  {
    ...artifactRevisionItemColumns(),
    ...artifactFileDetailsColumns(),
    kind: text('kind').notNull().$type<'references' | 'assets' | 'scripts'>(),
    // script-only columns nullable for references/assets
    capability: text('capability'),
    argsSchemaSummary: text('args_schema_summary'),
    sideEffectSummary: text('side_effect_summary'),
    defaultPolicy: text('default_policy'),
  },
  (table) => [
    index('idx_skill_artifact_manifest_items_revision').on(table.artifactRevisionId),
    index('idx_skill_artifact_manifest_items_kind').on(table.kind),
    uniqueIndex('idx_skill_artifact_manifest_items_revision_kind_path').on(
      table.artifactRevisionId,
      table.kind,
      table.path,
    ),
    check(
      'ck_skill_artifact_manifest_items_kind',
      sql`${table.kind} IN ('references', 'assets', 'scripts')`,
    ),
  ],
);

export const skillArtifactAgentReviews = pgTable(
  'skill_artifact_agent_reviews',
  {
    artifactId: text('artifact_id').primaryKey(),
    status: text('status').notNull(),
    duplicateRisk: text('duplicate_risk').notNull(),
    correctnessRisk: text('correctness_risk').notNull(),
    completenessRisk: text('completeness_risk').notNull(),
    checkedAt: timestamp('checked_at', { withTimezone: true }).notNull(),
    notes: jsonb('notes').notNull().$type<string[]>().default([]),
    ...auditTimestamps(),
  },
  (table) => [
    index('idx_skill_artifact_agent_reviews_status').on(table.status),
    check(
      'ck_skill_artifact_agent_reviews_status',
      sql`${table.status} IN ('agent-pass', 'agent-rejected')`,
    ),
    check(
      'ck_skill_artifact_agent_reviews_duplicate_risk',
      sql`${table.duplicateRisk} IN ('low', 'medium', 'high')`,
    ),
    check(
      'ck_skill_artifact_agent_reviews_correctness_risk',
      sql`${table.correctnessRisk} IN ('low', 'medium', 'high')`,
    ),
    check(
      'ck_skill_artifact_agent_reviews_completeness_risk',
      sql`${table.completenessRisk} IN ('low', 'medium', 'high')`,
    ),
  ],
);

/**
 * Artifact lifecycle events table for audit trail of state transitions.
 * Each row records a state change with actor and context.
 */
export const artifactLifecycleEvents = pgTable(
  'artifact_lifecycle_events',
  {
    /** Reference to parent skill artifact */
    artifactId: text('artifact_id').notNull(),
    ...lifecycleEventColumns(),
  },
  (table) => [index('idx_artifact_lifecycle_events_artifact').on(table.artifactId)],
);

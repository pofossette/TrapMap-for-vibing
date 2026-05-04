import { z } from 'zod';

import { boundaryMetaSchema } from './boundary.js';
import {
  actorRefSchema,
  auditMetadataSchema,
  entityIdSchema,
  isoTimestampSchema,
  labelSchema,
  lifecycleStateSchema,
  scopeSchema,
  securityLevelSchema,
} from './common.js';
import { evidenceMetaSchema } from './evidence.js';
import { agentReviewResultSchema, reviewDecisionSchema, reviewNoteSchema } from './knowledge.js';
import { maintenanceMetaSchema } from './maintenance.js';

/**
 * Canonical file kind discriminator for skill artifact files.
 * Controls whether content may become model context and activation behavior.
 */
export const skillArtifactFileKindSchema = z.enum([
  'skill-markdown',
  'reference',
  'asset',
  'script',
]);

/**
 * Script activation policy for client-side governance.
 * Controls when and how scripts can be executed (ACTV-04).
 */
export const scriptActivationPolicySchema = z.enum([
  'blocked',
  'reference-only',
  'needs-approval',
  'client-executable',
]);

/**
 * Legacy script activation policy vocabulary retained for backward compatibility.
 */
export const legacyScriptActivationPolicySchema = z.enum(['manual', 'auto', 'blocked']);

/**
 * Compatible script policy vocabulary that accepts both legacy and four-state values.
 */
export const compatibleScriptActivationPolicySchema = z.union([
  scriptActivationPolicySchema,
  legacyScriptActivationPolicySchema,
]);

/**
 * Script with policy metadata for activation decisions.
 * Combines script descriptor with activation policy information.
 */
export const scriptWithPolicyMetadataSchema = z.object({
  /** Path to the script file */
  path: z.string().min(1).max(512),
  /** SHA-256 hash of the script content */
  sha256: z.string().length(64),
  /** Human-readable capability description */
  capability: z.string().min(1).max(280),
  /** Default activation policy */
  defaultPolicy: scriptActivationPolicySchema,
});

/**
 * File source location discriminator.
 * Indicates which directory within the skill artifact this file originates from.
 */
export const skillArtifactFileSourceSchema = z.enum([
  'references/',
  'assets/',
  'scripts/',
  'SKILL.md',
]);

/**
 * Individual file metadata within a skill artifact revision.
 * Carries path, hash, and inclusion flags without storing content bodies.
 */
export const skillArtifactFileSchema = z.object({
  /** Canonical path within the skill directory (e.g., 'references/docker.md') */
  path: z.string().min(1).max(512),
  /** File kind controlling derivation and activation behavior */
  kind: skillArtifactFileKindSchema,
  /** SHA-256 hash of file content for integrity and derivation caching */
  sha256: z.string().length(64),
  /** File size in bytes for storage quota and transfer validation */
  sizeBytes: z.number().int().min(0),
  /** IANA media type (e.g., 'text/markdown', 'application/json') */
  mediaType: z.string().min(1).max(160),
  /** Source directory within the skill artifact */
  source: skillArtifactFileSourceSchema,
  /** If true, file content may be used for capsule/profile derivation */
  includeInDerivation: z.boolean(),
  /** If true, file is activation-only and should not be indexed for retrieval */
  activationOnly: z.boolean(),
});

/**
 * Script capability descriptor for executable scripts in skill artifacts.
 * Captures intent and constraints without exposing script bodies in retrieval context.
 */
export const skillScriptDescriptorSchema = z.object({
  /** Path to the script file within the skill directory */
  path: z.string().min(1).max(512),
  /** SHA-256 hash of the script content */
  sha256: z.string().length(64),
  /** Human-readable capability description (e.g., 'Docker container cleanup') */
  capability: z.string().min(1).max(280),
  /** Brief summary of expected argument schema */
  argsSchemaSummary: z.string().max(280).default(''),
  /** Brief summary of side effects (e.g., 'Modifies local files') */
  sideEffectSummary: z.string().max(280).default(''),
  /** Default execution policy (legacy three-state or four-state vocabulary) */
  defaultPolicy: compatibleScriptActivationPolicySchema,
});

/**
 * Derived profile from SKILL.md and references/.
 * Captures the distilled artifact-wide text shape for model context.
 */
export const skillProfileSchema = z.object({
  /** Artifact identifier */
  artifactId: entityIdSchema,
  /** Revision number this profile was derived from */
  revision: z.number().int().min(1),
  /** Hash of all source files used for derivation */
  sourceHash: z.string().length(64),
  /** Human-readable title from skill metadata */
  title: z.string().min(1).max(280),
  /** Optional description derived from SKILL.md frontmatter */
  description: z.string().max(1000).optional(),
  /** Distilled summary of artifact content */
  summary: z.string().min(1).max(1000),
  /** Keywords extracted from skill content */
  keywords: z.array(labelSchema).default([]),
  /** Additive labels kept for compatibility with older lookup fixtures */
  labels: z.array(labelSchema).default([]),
  /** Optional prerequisite list extracted from skill metadata */
  prerequisites: z.array(z.string().min(1).max(280)).default([]),
  /** Paths to reference files included in derivation */
  referencePaths: z.array(z.string().max(512)).default([]),
  /** Hash of the derived profile content for caching */
  contentHash: z.string().length(64),
});

/**
 * Knowledge capsule distilled from SKILL.md and references/.
 * Carries deterministic capsule id, source paths, and governance inheritance.
 * Does NOT embed asset or script bodies (T-12-02 mitigation).
 */
export const skillCapsuleSchema = z.object({
  /** Unique capsule identifier */
  capsuleId: entityIdSchema,
  /** Artifact identifier */
  artifactId: entityIdSchema,
  /** Revision number this capsule was derived from */
  revision: z.number().int().min(1),
  /** Source file paths that contributed to this capsule */
  sourcePaths: z.array(z.string().max(512)).min(1),
  /** Distilled capsule content (text only, no asset/script bodies) */
  content: z.string().min(1).max(5000),
  /** Situation context */
  situation: z.string().min(1).max(1000),
  /** Problem statement */
  problem: z.string().min(1).max(1000),
  /** Goal or solution */
  goal: z.string().min(1).max(1000),
  /** Optional error text for error-specific capsules */
  errorText: z.string().max(500).optional(),
  /** Searchable labels */
  labels: z.array(labelSchema).min(1),
  /** Governance scope (inherited from artifact) */
  scope: scopeSchema,
  /** Required security level (inherited from artifact) */
  requiredLevel: securityLevelSchema,
});

/**
 * Client manifest reference entry.
 * Metadata-only reference for activation-time delivery.
 */
export const clientManifestReferenceSchema = z.object({
  path: z.string().min(1).max(512),
  sha256: z.string().length(64),
  sizeBytes: z.number().int().min(0),
  mediaType: z.string().min(1).max(160),
});

/**
 * Client manifest asset entry.
 * Metadata-only asset for activation-time delivery.
 */
export const clientManifestAssetSchema = z.object({
  path: z.string().min(1).max(512),
  sha256: z.string().length(64),
  sizeBytes: z.number().int().min(0),
  mediaType: z.string().min(1).max(160),
});

/**
 * Client manifest script entry.
 * Metadata-only script descriptor (no body) for activation-time delivery.
 * Excludes script body text (T-12-02 mitigation).
 */
export const clientManifestScriptSchema = z.object({
  path: z.string().min(1).max(512),
  sha256: z.string().length(64),
  capability: z.string().min(1).max(280),
  argsSchemaSummary: z.string().max(280).default(''),
  sideEffectSummary: z.string().max(280).default(''),
  defaultPolicy: compatibleScriptActivationPolicySchema,
});

/**
 * Client activation manifest for references, assets, and scripts.
 * Exposes activation metadata while remaining distinct from retrieval output defaults.
 * Scripts are metadata-only (T-12-02 mitigation).
 */
export const clientManifestSchema = z.object({
  /** Artifact identifier */
  artifactId: entityIdSchema,
  /** Revision number this manifest was derived from */
  revision: z.number().int().min(1),
  /** Reference file metadata */
  references: z.array(clientManifestReferenceSchema).default([]),
  /** Asset file metadata */
  assets: z.array(clientManifestAssetSchema).default([]),
  /** Script metadata (capability only, no bodies) */
  scripts: z.array(clientManifestScriptSchema).default([]),
  /** Hash of all source files for this manifest */
  sourceHash: z.string().length(64),
});

/**
 * Derived output envelope for skill artifact revisions.
 * Contains cached deterministic outputs keyed by source content hash.
 */
export const skillArtifactDerivedSchema = z.object({
  /** Distilled profile from SKILL.md and references/ */
  profile: skillProfileSchema.nullable(),
  /** Knowledge capsules distilled from SKILL.md and references/ */
  capsules: z.array(skillCapsuleSchema).default([]),
  /** Client activation manifest for references, assets, and scripts */
  clientManifest: clientManifestSchema.nullable(),
  /** Hash of all source files used for derivation (SKILL.md + references/) */
  sourceHash: z.string().length(64),
  /** ISO timestamp when derivation was computed */
  derivedAt: isoTimestampSchema,
});

/**
 * Immutable revision within a skill artifact.
 * Captures source file manifest and derived outputs at a point in time.
 */
export const skillArtifactRevisionSchema = z.object({
  /** Monotonically increasing revision number */
  revision: z.number().int().min(1),
  /** SHA-256 hash of all source files for this revision */
  sourceHash: z.string().length(64),
  /** All files in the skill directory at this revision */
  files: z.array(skillArtifactFileSchema).min(1),
  /** When this revision was submitted */
  submittedAt: isoTimestampSchema,
  /** Who submitted this revision */
  submittedBy: actorRefSchema,
  /** Script descriptors for executable scripts in this revision */
  scriptDescriptors: z.array(skillScriptDescriptorSchema).default([]),
  /** Cached derived outputs keyed by source hash */
  derived: z
    .object({
      profile: skillArtifactDerivedSchema.shape.profile.nullable(),
      capsules: skillArtifactDerivedSchema.shape.capsules,
      clientManifest: skillArtifactDerivedSchema.shape.clientManifest.nullable(),
      sourceHash: z.string().length(64),
      derivedAt: isoTimestampSchema,
    })
    .nullable(),
});

/**
 * Lifecycle event specific to skill artifacts.
 * Extends knowledge lifecycle events with artifact-specific concerns.
 */
export const skillArtifactLifecycleEventSchema = z.object({
  id: entityIdSchema,
  type: z.enum([
    'submitted',
    'resubmitted',
    'agent-reviewed',
    'reviewer-approved',
    'reviewer-rejected',
    'updated',
    'deactivated',
  ]),
  createdAt: isoTimestampSchema,
  actor: actorRefSchema.nullable().default(null),
  submissionId: entityIdSchema.nullable().default(null),
  revision: z.number().int().min(1).nullable().default(null),
  state: lifecycleStateSchema,
  note: z.string().min(1).max(2000).nullable().default(null),
});

/**
 * Metadata specific to skill artifacts.
 * Tracks submission counts, revision history, and latest state.
 */
export const skillArtifactMetadataSchema = z.object({
  /** How this artifact was originally created */
  sourceKind: z.enum(['skill-directory', 'single-skill-md', 'legacy-knowledge']),
  /** Total number of submissions across all revisions */
  submissionCount: z.number().int().min(0),
  /** Number of times this artifact was resubmitted after rejection */
  resubmissionCount: z.number().int().min(0),
  /** Total number of revisions */
  revisionCount: z.number().int().min(1),
  /** ID of the most recent submission */
  latestSubmissionId: entityIdSchema.nullable().default(null),
  /** When the most recent submission was created */
  latestSubmittedAt: isoTimestampSchema.nullable().default(null),
  /** When the most recent review was completed */
  latestReviewedAt: isoTimestampSchema.nullable().default(null),
  /** Most recent review decision (approve/reject) */
  latestDecision: z.enum(['approve', 'reject']).nullable().default(null),
});

/**
 * Canonical skill artifact aggregate root.
 * Stores governance, lifecycle, and revision history for skill-native artifacts.
 * Additive to legacy KnowledgeEntry - does not replace existing knowledge contracts.
 */
export const skillArtifactSchema = z
  .object({
    /** Unique artifact identifier */
    id: entityIdSchema,
    /** Team ID if this is a team-scoped artifact */
    teamId: entityIdSchema.nullable(),
    /** Global or project scope */
    scope: scopeSchema,
    /** Searchable labels for this artifact */
    labels: z.array(labelSchema).min(1),
    /** Human-readable title */
    title: z.string().min(1).max(280),
    /** URL-friendly slug for references */
    slug: z.string().min(1).max(160),
    /** Required security level to access this artifact */
    requiredLevel: securityLevelSchema,
    /** Current lifecycle state */
    lifecycleState: lifecycleStateSchema,
    /** Artifact owner/creator */
    owner: actorRefSchema,
    /** Currently active revision number */
    latestRevision: z.number().int().min(1),
    /** Complete revision history */
    history: z.array(skillArtifactRevisionSchema).min(1),
    /** Artifact-specific metadata */
    metadata: skillArtifactMetadataSchema,
    /** Agent review result (if applicable) */
    agentReview: agentReviewResultSchema.nullable(),
    /** Review decision history */
    reviewHistory: z.array(reviewDecisionSchema).default([]),
    /** Review notes from all reviewers */
    reviewNotes: z.array(reviewNoteSchema).default([]),
    /** Lifecycle event history */
    lifecycleHistory: z.array(skillArtifactLifecycleEventSchema).default([]),
    /** Boundary constraints for applicability */
    boundaryMeta: boundaryMetaSchema.nullable().optional(),
    /** Evidence and provenance metadata (null if not yet verified) */
    evidenceMeta: evidenceMetaSchema.nullable().default(null),
    /** Maintenance metadata for ownership and review-due tracking (MAINT-01) */
    maintenanceMeta: maintenanceMetaSchema.nullable().default(null),
  })
  .merge(auditMetadataSchema);

// Type exports
export type ScriptActivationPolicy = z.infer<typeof scriptActivationPolicySchema>;
export type ScriptWithPolicyMetadata = z.infer<typeof scriptWithPolicyMetadataSchema>;
export type SkillArtifactFileKind = z.infer<typeof skillArtifactFileKindSchema>;
export type SkillArtifactFileSource = z.infer<typeof skillArtifactFileSourceSchema>;
export type SkillArtifactFile = z.infer<typeof skillArtifactFileSchema>;
export type SkillScriptDescriptor = z.infer<typeof skillScriptDescriptorSchema>;
export type SkillProfile = z.infer<typeof skillProfileSchema>;
export type SkillCapsule = z.infer<typeof skillCapsuleSchema>;
export type ClientManifestReference = z.infer<typeof clientManifestReferenceSchema>;
export type ClientManifestAsset = z.infer<typeof clientManifestAssetSchema>;
export type ClientManifestScript = z.infer<typeof clientManifestScriptSchema>;
export type ClientManifest = z.infer<typeof clientManifestSchema>;
export type SkillArtifactDerived = z.infer<typeof skillArtifactDerivedSchema>;
export type SkillArtifactRevision = z.infer<typeof skillArtifactRevisionSchema>;
export type SkillArtifactLifecycleEvent = z.infer<typeof skillArtifactLifecycleEventSchema>;
export type SkillArtifactMetadata = z.infer<typeof skillArtifactMetadataSchema>;
export type SkillArtifact = z.infer<typeof skillArtifactSchema>;

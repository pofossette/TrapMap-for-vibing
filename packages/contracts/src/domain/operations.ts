import { z } from 'zod';

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
import {
  knowledgeEntrySchema,
  knowledgeListItemSchema,
  knowledgeSubmissionSchema,
} from './knowledge.js';

export const knowledgeDeactivateRequestSchema = z.object({
  entryId: entityIdSchema,
  reason: z.string().min(1).max(500),
});

export const knowledgeListRequestSchema = z.object({
  scope: scopeSchema.optional(),
  lifecycleState: z.array(lifecycleStateSchema).optional(),
  requiredLevelMax: securityLevelSchema.optional(),
  ownerUserId: entityIdSchema.optional(),
  limit: z.number().int().min(1).max(100).default(25),
  cursor: z.string().min(1).max(128).optional(),
});

export const knowledgeListResponseSchema = z.object({
  items: z.array(knowledgeListItemSchema),
  nextCursor: z.string().min(1).max(128).nullable(),
  total: z.number().int().min(0),
});

export const knowledgeDeactivateResponseSchema = z.object({
  entry: knowledgeEntrySchema,
});

export const exportRequestSchema = z.object({
  teamId: entityIdSchema.nullable().optional(),
  includeHistory: z.boolean().default(true),
});

export const exportBundleSchema = z.object({
  exportedAt: z.string(),
  exportedBy: actorRefSchema,
  items: z.array(knowledgeEntrySchema),
});

export const importEntrySchema = knowledgeSubmissionSchema.extend({
  source: z.enum(['json', 'claude-skill']),
  requestedLevel: securityLevelSchema,
});

export const importRequestSchema = z.object({
  entries: z.array(importEntrySchema).min(1),
});

export const importResultItemSchema = z.object({
  success: z.boolean(),
  entry: knowledgeEntrySchema.nullable(),
  error: z.string().nullable(),
  source: z.enum(['json', 'claude-skill']),
});

export const importResponseSchema = z.object({
  results: z.array(importResultItemSchema),
  importedCount: z.number().int().min(0),
  failedCount: z.number().int().min(0),
});

export const claudeSkillMetadataSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  version: z.string().optional(),
});

export const claudeSkillImportSchema = z.object({
  metadata: claudeSkillMetadataSchema,
  content: z.string().min(1),
  requestedLevel: securityLevelSchema,
});

/**
 * Canonical file payload within a bundle-json import.
 * Carries file metadata and inline content (bytes or UTF-8 text).
 */
export const bundleFilePayloadSchema = z.object({
  /** Canonical path within the skill directory */
  path: z.string().min(1).max(512),
  /** File kind for role classification */
  kind: z.enum(['skill-markdown', 'reference', 'asset', 'script']),
  /** SHA-256 hash of file content for integrity */
  sha256: z.string().length(64),
  /** File size in bytes */
  sizeBytes: z.number().int().min(0),
  /** IANA media type */
  mediaType: z.string().min(1).max(160),
  /** Source directory within the skill artifact */
  source: z.enum(['references/', 'assets/', 'scripts/', 'SKILL.md']),
  /** If true, file may be used for capsule/profile derivation */
  includeInDerivation: z.boolean(),
  /** If true, file is activation-only */
  activationOnly: z.boolean(),
  /** Inline file content: base64-encoded bytes or UTF-8 text */
  content: z.union([z.string().base64(), z.string()]),
});

/**
 * Script descriptor within a bundle-json import.
 * Captures intent and constraints for executable scripts.
 */
export const bundleScriptDescriptorSchema = z.object({
  /** Path to the script file */
  path: z.string().min(1).max(512),
  /** SHA-256 hash of the script content */
  sha256: z.string().length(64),
  /** Human-readable capability description */
  capability: z.string().min(1).max(280),
  /** Brief summary of argument schema */
  argsSchemaSummary: z.string().max(280).default(''),
  /** Brief summary of side effects */
  sideEffectSummary: z.string().max(280).default(''),
  /** Default execution policy */
  defaultPolicy: z.enum(['manual', 'auto', 'blocked']),
});

/**
 * Canonical artifact bundle for import/export.
 * Carries one skill artifact's metadata, files, and descriptors.
 */
export const artifactBundleSchema = z.object({
  /** Root governance fields */
  scope: z.enum(['global', 'project']),
  labels: z.array(labelSchema).min(1),
  title: z.string().min(1).max(280),
  slug: z.string().min(1).max(160),
  requiredLevel: securityLevelSchema,
  /** How this artifact was created */
  sourceKind: z.enum(['skill-directory', 'single-skill-md', 'legacy-knowledge']),
  /** Canonical file manifest with inline payloads */
  files: z.array(bundleFilePayloadSchema).min(1),
  /** Script descriptors for executable scripts */
  scriptDescriptors: z.array(bundleScriptDescriptorSchema).default([]),
});

/**
 * Artifact-native import request using bundle-json transport.
 * Replaces legacy entries[] flattening with artifact bundles.
 */
export const artifactImportRequestSchema = z.object({
  /** One or more artifact bundles to import */
  bundles: z.array(artifactBundleSchema).min(1),
});

/**
 * Artifact import result item.
 * Returns created artifact or error details per bundle.
 */
export const artifactImportResultItemSchema = z.object({
  success: z.boolean(),
  artifactId: z.string().nullable(),
  title: z.string().nullable(),
  error: z.string().nullable(),
  sourceKind: z.enum(['skill-directory', 'single-skill-md', 'legacy-knowledge']).nullable(),
});

/**
 * Artifact-native import response.
 * Returns per-bundle results and counts.
 */
export const artifactImportResponseSchema = z.object({
  results: z.array(artifactImportResultItemSchema),
  importedCount: z.number().int().min(0),
  failedCount: z.number().int().min(0),
});

/**
 * Additive file payload storage record.
 * Internal server-side structure for imported file payloads.
 * Keyed by artifact id + revision + path for round-trip export.
 */
export const artifactFilePayloadRecordSchema = z.object({
  /** Artifact identifier */
  artifactId: entityIdSchema,
  /** Revision number */
  revision: z.number().int().min(1),
  /** Canonical path within the skill directory */
  path: z.string().min(1).max(512),
  /** SHA-256 hash of file content */
  sha256: z.string().length(64),
  /** File size in bytes */
  sizeBytes: z.number().int().min(0),
  /** IANA media type */
  mediaType: z.string().min(1).max(160),
  /** Inline file content: base64-encoded bytes or UTF-8 text */
  content: z.union([z.string().base64(), z.string()]),
  /** When this payload was stored */
  storedAt: isoTimestampSchema,
});

export const auditEventSchema = z
  .object({
    id: entityIdSchema,
    teamId: entityIdSchema.nullable(),
    actor: actorRefSchema,
    action: z.enum([
      'knowledge-reviewed',
      'knowledge-imported',
      'knowledge-exported',
      'knowledge-deactivated',
      'member-updated',
      'artifact-imported',
      'artifact-exported',
    ]),
    entityId: entityIdSchema,
    payload: z.record(z.string(), z.unknown()),
  })
  .merge(auditMetadataSchema);

export const auditQuerySchema = z.object({
  action: z
    .array(
      z.enum([
        'knowledge-reviewed',
        'knowledge-imported',
        'knowledge-exported',
        'knowledge-deactivated',
        'member-updated',
        'artifact-imported',
        'artifact-exported',
      ]),
    )
    .optional(),
  actorId: entityIdSchema.optional(),
  entityId: entityIdSchema.optional(),
  teamId: entityIdSchema.optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  limit: z.number().int().min(1).max(100).default(25),
  cursor: z.string().min(1).max(128).optional(),
});

export const auditListResponseSchema = z.object({
  items: z.array(auditEventSchema),
  nextCursor: z.string().min(1).max(128).nullable(),
  total: z.number().int().min(0),
});

export type ExportBundle = z.infer<typeof exportBundleSchema>;
export type ImportEntry = z.infer<typeof importEntrySchema>;
export type ImportRequest = z.infer<typeof importRequestSchema>;
export type ImportResultItem = z.infer<typeof importResultItemSchema>;
export type ImportResponse = z.infer<typeof importResponseSchema>;
export type ClaudeSkillMetadata = z.infer<typeof claudeSkillMetadataSchema>;
export type ClaudeSkillImport = z.infer<typeof claudeSkillImportSchema>;
export type BundleFilePayload = z.infer<typeof bundleFilePayloadSchema>;
export type BundleScriptDescriptor = z.infer<typeof bundleScriptDescriptorSchema>;
export type ArtifactBundle = z.infer<typeof artifactBundleSchema>;
export type ArtifactImportRequest = z.infer<typeof artifactImportRequestSchema>;
export type ArtifactImportResultItem = z.infer<typeof artifactImportResultItemSchema>;
export type ArtifactImportResponse = z.infer<typeof artifactImportResponseSchema>;
export type ArtifactFilePayloadRecord = z.infer<typeof artifactFilePayloadRecordSchema>;
export type AuditEvent = z.infer<typeof auditEventSchema>;
export type AuditQuery = z.infer<typeof auditQuerySchema>;
export type AuditListResponse = z.infer<typeof auditListResponseSchema>;
export type KnowledgeListRequest = z.infer<typeof knowledgeListRequestSchema>;
export type KnowledgeListResponse = z.infer<typeof knowledgeListResponseSchema>;
export type KnowledgeDeactivateResponse = z.infer<typeof knowledgeDeactivateResponseSchema>;

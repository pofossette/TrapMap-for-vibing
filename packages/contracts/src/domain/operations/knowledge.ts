import { z } from 'zod';

import { skillScriptDescriptorSchema } from '../artifacts.js';
import {
  actorRefSchema,
  entityIdSchema,
  isoTimestampSchema,
  labelSchema,
  mediaTypeSchema,
  securityLevelSchema,
  sha256HexSchema,
} from '../common.js';
import {
  knowledgeEntrySchema,
  knowledgeListItemSchema,
  knowledgeSubmissionSchema,
} from '../knowledge.js';
import { canonicalPathSchema } from '../path-validation.js';

export const knowledgeListResponseSchema = z
  .object({
    items: z.array(knowledgeListItemSchema),
    nextCursor: z.string().min(1).max(128).nullable(),
    total: z.number().int().min(0),
  })
  .strict()
  .refine((d) => d.total === d.items.length, {
    message: 'total must match items.length',
  });

export const knowledgeDeactivateResponseSchema = z
  .object({
    entry: knowledgeEntrySchema,
  })
  .strict();

export const exportRequestSchema = z.object({
  teamId: entityIdSchema.nullable().optional(),
  includeHistory: z.boolean().default(true),
});

export const exportBundleSchema = z
  .object({
    exportedAt: z.string(),
    exportedBy: actorRefSchema,
    items: z.array(knowledgeEntrySchema),
  })
  .strict();

export const importEntrySchema = knowledgeSubmissionSchema.extend({
  source: z.enum(['json', 'claude-skill']),
  requestedLevel: securityLevelSchema,
});

export const importRequestSchema = z.object({
  entries: z.array(importEntrySchema).min(1),
});

export const importResultItemSchema = z
  .object({
    success: z.boolean(),
    entry: knowledgeEntrySchema.nullable(),
    error: z.string().nullable(),
    source: z.enum(['json', 'claude-skill']),
  })
  .strict()
  .refine((d) => !d.success || d.entry !== null, {
    message: 'entry must be non-null when success is true',
  });

export const importResponseSchema = z
  .object({
    results: z.array(importResultItemSchema),
    importedCount: z.number().int().min(0),
    failedCount: z.number().int().min(0),
  })
  .strict()
  .refine((d) => d.importedCount === d.results.filter((r) => r.success).length, {
    message: 'importedCount must match the number of successful results',
  })
  .refine((d) => d.failedCount === d.results.filter((r) => !r.success).length, {
    message: 'failedCount must match the number of failed results',
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
  path: canonicalPathSchema,
  /** File kind for role classification */
  kind: z.enum(['skill-markdown', 'reference', 'asset', 'script']),
  /** SHA-256 hash of file content for integrity */
  sha256: sha256HexSchema,
  /** File size in bytes */
  sizeBytes: z.number().int().min(0),
  /** IANA media type */
  mediaType: mediaTypeSchema,
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
 * Reuses the canonical skillScriptDescriptorSchema from artifacts.
 */

export const bundleScriptDescriptorSchema = skillScriptDescriptorSchema;

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

export const artifactImportResultItemSchema = z
  .object({
    success: z.boolean(),
    artifactId: z.string().nullable(),
    title: z.string().nullable(),
    error: z.string().nullable(),
    sourceKind: z.enum(['skill-directory', 'single-skill-md', 'legacy-knowledge']).nullable(),
  })
  .strict();

/**
 * Artifact-native import response.
 * Returns per-bundle results and counts.
 */

export const artifactImportResponseSchema = z
  .object({
    results: z.array(artifactImportResultItemSchema),
    importedCount: z.number().int().min(0),
    failedCount: z.number().int().min(0),
  })
  .strict();

/**
 * Additive file payload storage record.
 * Internal server-side structure for imported file payloads.
 * Keyed by artifact id + revision + path for round-trip export.
 */

export const artifactFilePayloadRecordSchema = z
  .object({
    /** Artifact identifier */
    artifactId: entityIdSchema,
    /** Revision number */
    revision: z.number().int().min(1),
    /** Canonical path within the skill directory */
    path: canonicalPathSchema,
    /** SHA-256 hash of file content */
    sha256: sha256HexSchema,
    /** File size in bytes */
    sizeBytes: z.number().int().min(0),
    /** IANA media type */
    mediaType: mediaTypeSchema,
    /** Inline file content: base64-encoded bytes or UTF-8 text */
    content: z.union([z.string().base64(), z.string()]),
    /** When this payload was stored */
    storedAt: isoTimestampSchema,
  })
  .strict();

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

export type KnowledgeListResponse = z.infer<typeof knowledgeListResponseSchema>;

export type KnowledgeDeactivateResponse = z.infer<typeof knowledgeDeactivateResponseSchema>;

import { z } from 'zod';

import { skillArtifactFileKindSchema, skillArtifactFileSourceSchema } from '../artifacts.js';
import {
  actorRefSchema,
  auditMetadataSchema,
  entityIdSchema,
  isoTimestampSchema,
  labelSchema,
  mediaTypeSchema,
  scopeSchema,
  securityLevelSchema,
  sha256HexSchema,
} from '../common.js';
import { canonicalPathSchema } from '../path-validation.js';

import { artifactBundleSchema, bundleScriptDescriptorSchema } from './knowledge.js';

export const auditEventSchema = z
  .object({
    id: entityIdSchema,
    teamId: entityIdSchema.nullable(),
    actor: actorRefSchema,
    action: z.enum([
      'knowledge-submitted',
      'knowledge-reviewed',
      'knowledge-imported',
      'knowledge-exported',
      'knowledge-deactivated',
      'member-updated',
      'artifact-imported',
      'artifact-exported',
      'artifact-deactivated',
    ]),
    entityId: entityIdSchema,
    payload: z.record(z.string(), z.unknown()),
    eventVersion: z.number().int().positive().optional(),
    sourceService: z.string().min(1).max(128).optional(),
    requestId: entityIdSchema.optional(),
    traceId: z
      .string()
      .regex(/^[0-9a-f]{32}$/)
      .optional(),
    operationId: entityIdSchema.optional(),
    causationId: entityIdSchema.optional(),
    outcome: z.enum(['success', 'rejected', 'failed']).optional(),
  })
  .merge(auditMetadataSchema);

export const auditListResponseSchema = z
  .object({
    items: z.array(auditEventSchema),
    nextCursor: z.string().min(1).max(128).nullable(),
    total: z.number().int().min(0),
  })
  .strict();

/**
 * Export format selection for artifact-native exports.
 * - bundle-json: Canonical transport with full file payloads
 * - distilled-json: Compact projection of cached derived outputs
 * - skill-dir: CLI-local format selector (server returns bundle-json)
 */

export const artifactExportFormatSchema = z.enum(['bundle-json', 'distilled-json', 'skill-dir']);

/**
 * Artifact-native export request.
 * Targets one artifact by ID with explicit format selection.
 */
/**
 * Distilled artifact export projection.
 * Compact view built from cached derived outputs.
 */

export const distilledArtifactSchema = z.object({
  /** Artifact identifier */
  artifactId: entityIdSchema,
  /** Governance scope */
  scope: scopeSchema,
  /** Artifact labels */
  labels: z.array(labelSchema).min(1),
  /** Human-readable title */
  title: z.string().min(1).max(280),
  /** URL-safe slug */
  slug: z
    .string()
    .min(1)
    .max(160)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  /** Security level */
  requiredLevel: securityLevelSchema,
  /** Source kind */
  sourceKind: z.enum(['skill-directory', 'single-skill-md', 'legacy-knowledge']),
  /** Cached derived profile (if available) */
  profile: z.record(z.string(), z.unknown()).nullable(),
  /** Cached derived capsules (if available) */
  capsules: z.array(z.record(z.string(), z.unknown())).nullable(),
  /** Cached client manifest (if available) */
  clientManifest: z.record(z.string(), z.unknown()).nullable(),
  /** Export timestamp */
  exportedAt: isoTimestampSchema,
});

/**
 * Artifact-native export response.
 * Returns either canonical bundle or distilled projection.
 */

export const artifactExportResponseSchema = z
  .object({
    /** Export format used */
    format: artifactExportFormatSchema,
    /** Export timestamp */
    exportedAt: isoTimestampSchema,
    /** Exporting actor */
    exportedBy: actorRefSchema,
    /** Canonical bundle (when format is bundle-json or skill-dir) */
    bundle: artifactBundleSchema.nullable(),
    /** Distilled projection (when format is distilled-json) */
    distilled: distilledArtifactSchema.nullable(),
  })
  .refine((d) => d.format !== 'bundle-json' || d.bundle !== null, {
    message: 'bundle must be non-null when format is bundle-json',
  });

export type AuditEvent = z.infer<typeof auditEventSchema>;

export type AuditListResponse = z.infer<typeof auditListResponseSchema>;

export type ArtifactExportFormat = z.infer<typeof artifactExportFormatSchema>;

export type DistilledArtifact = z.infer<typeof distilledArtifactSchema>;

export type ArtifactExportResponse = z.infer<typeof artifactExportResponseSchema>;

/**
 * Activation/download file payload.
 * Selected file with inline content for activation-time delivery.
 */

export const activationFilePayloadSchema = z
  .object({
    /** Canonical path within the skill directory */
    path: canonicalPathSchema,
    /** File kind */
    kind: skillArtifactFileKindSchema,
    /** SHA-256 hash of file content */
    sha256: sha256HexSchema,
    /** File size in bytes */
    sizeBytes: z.number().int().min(0),
    /** IANA media type */
    mediaType: mediaTypeSchema,
    /** Source directory */
    source: skillArtifactFileSourceSchema,
    /** Inline file content: base64-encoded bytes or UTF-8 text */
    content: z.union([z.string().base64(), z.string()]),
  })
  .strict();

/**
 * Selective activation response.
 * Returns only requested files with metadata for policy-aware materialization.
 */

export const activationResponseSchema = z
  .object({
    /** Artifact identifier */
    artifactId: entityIdSchema,
    /** Artifact title */
    title: z.string().min(1).max(280),
    /** Revision number */
    revision: z.number().int().min(1),
    /** Security level */
    requiredLevel: securityLevelSchema,
    /** Selected file payloads with inline content */
    files: z.array(activationFilePayloadSchema),
    /** Script descriptors for any scripts in selected paths */
    scriptDescriptors: z.array(bundleScriptDescriptorSchema).default([]),
    /** Activation timestamp */
    activatedAt: isoTimestampSchema,
    /** Activating actor */
    activatedBy: actorRefSchema,
  })
  .strict();

export type ActivationFilePayload = z.infer<typeof activationFilePayloadSchema>;

export type ActivationResponse = z.infer<typeof activationResponseSchema>;

/**
 * Result item for a single legacy entry migration attempt.
 */

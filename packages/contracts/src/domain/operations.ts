import { z } from 'zod';

import {
  actorRefSchema,
  auditMetadataSchema,
  entityIdSchema,
  lifecycleStateSchema,
  scopeSchema,
  securityLevelSchema,
} from './common.js';
import { knowledgeEntrySchema, knowledgeListItemSchema, knowledgeSubmissionSchema } from './knowledge.js';

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
    ]),
    entityId: entityIdSchema,
    payload: z.record(z.string(), z.unknown()),
  })
  .merge(auditMetadataSchema);

export const auditQuerySchema = z.object({
  action: z.array(z.enum([
    'knowledge-reviewed',
    'knowledge-imported',
    'knowledge-exported',
    'knowledge-deactivated',
    'member-updated',
  ])).optional(),
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
export type AuditEvent = z.infer<typeof auditEventSchema>;
export type AuditQuery = z.infer<typeof auditQuerySchema>;
export type AuditListResponse = z.infer<typeof auditListResponseSchema>;
export type KnowledgeListRequest = z.infer<typeof knowledgeListRequestSchema>;
export type KnowledgeListResponse = z.infer<typeof knowledgeListResponseSchema>;
export type KnowledgeDeactivateResponse = z.infer<typeof knowledgeDeactivateResponseSchema>;

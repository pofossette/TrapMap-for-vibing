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

export type ExportBundle = z.infer<typeof exportBundleSchema>;
export type AuditEvent = z.infer<typeof auditEventSchema>;
export type KnowledgeListRequest = z.infer<typeof knowledgeListRequestSchema>;
export type KnowledgeListResponse = z.infer<typeof knowledgeListResponseSchema>;
export type KnowledgeDeactivateResponse = z.infer<typeof knowledgeDeactivateResponseSchema>;

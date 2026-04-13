import { z } from 'zod';

import {
  actorRefSchema,
  auditMetadataSchema,
  entityIdSchema,
  securityLevelSchema,
} from './common.js';
import { knowledgeEntrySchema, knowledgeSubmissionSchema } from './knowledge.js';

export const knowledgeDeactivateRequestSchema = z.object({
  entryId: entityIdSchema,
  reason: z.string().min(1).max(500),
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

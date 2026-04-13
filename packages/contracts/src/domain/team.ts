import { z } from 'zod';

import {
  actorRefSchema,
  auditMetadataSchema,
  entityIdSchema,
  permissionSchema,
  roleTemplateSchema,
  securityLevelSchema,
} from './common.js';

export const memberSchema = z
  .object({
    id: entityIdSchema,
    teamId: entityIdSchema,
    handle: z.string().min(1).max(64),
    roleTemplate: roleTemplateSchema,
    securityLevel: securityLevelSchema,
    permissions: z.array(permissionSchema).default([]),
    notes: z.string().max(500).nullable().default(null),
    isSystem: z.boolean().default(false),
  })
  .merge(auditMetadataSchema);

export const teamSchema = z
  .object({
    id: entityIdSchema,
    name: z.string().min(1).max(100),
    slug: z.string().min(1).max(100),
    description: z.string().max(500).nullable().default(null),
  })
  .merge(auditMetadataSchema);

export const accessKeySchema = z
  .object({
    id: entityIdSchema,
    memberId: entityIdSchema,
    tokenPreview: z.string().min(6).max(24),
    issuedBy: actorRefSchema,
    teamId: entityIdSchema,
    level: securityLevelSchema,
    notes: z.string().max(500).nullable().default(null),
    revokedAt: z.string().nullable().default(null),
  })
  .merge(auditMetadataSchema);

export const createTeamRequestSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

export const teamListResponseSchema = z.object({
  teams: z.array(teamSchema),
  activeTeamId: entityIdSchema.nullable(),
});

export const selectTeamRequestSchema = z.object({
  teamId: entityIdSchema,
});

export const createMemberRequestSchema = z.object({
  teamId: entityIdSchema,
  handle: z.string().min(1).max(64),
  roleTemplate: roleTemplateSchema.default('user'),
  securityLevel: securityLevelSchema.default(0),
  permissions: z.array(permissionSchema).default([]),
  notes: z.string().max(500).optional(),
});

export const updateMemberRequestSchema = z.object({
  memberId: entityIdSchema,
  securityLevel: securityLevelSchema.optional(),
  permissions: z.array(permissionSchema).optional(),
  notes: z.string().max(500).nullable().optional(),
});

export const issueAccessKeyRequestSchema = z.object({
  teamId: entityIdSchema,
  memberId: entityIdSchema,
  notes: z.string().max(500).optional(),
});

export const issueAccessKeyResponseSchema = z.object({
  accessKey: z.string().min(16),
  record: accessKeySchema,
});

export type Member = z.infer<typeof memberSchema>;
export type Team = z.infer<typeof teamSchema>;
export type AccessKey = z.infer<typeof accessKeySchema>;
export type TeamListResponse = z.infer<typeof teamListResponseSchema>;
export type IssueAccessKeyResponse = z.infer<typeof issueAccessKeyResponseSchema>;

import { type ZodTypeAny, z } from 'zod';

export const entityIdSchema = z.string().min(1).max(128);

export const isoTimestampSchema = z.iso.datetime({ offset: true });

export const securityLevelSchema = z.number().int().min(0).max(10);

export const roleTemplateSchema = z.enum(['user', 'admin', 'system-admin']);

export const scopeSchema = z.enum(['global', 'project']);

export const labelSchema = z
  .string()
  .trim()
  .min(1)
  .max(48)
  .regex(/^[a-z0-9:_/-]+$/i, 'labels may only contain letters, numbers, :, _, /, or -');

export const permissionSchema = z.enum([
  'session:read',
  'team:create',
  'team:list',
  'team:select',
  'member:create',
  'member:update',
  'member:key:create',
  'knowledge:submit',
  'knowledge:search',
  'knowledge:review',
  'knowledge:update',
  'knowledge:export',
  'knowledge:import',
  'audit:read',
  'stats:read',
]);

export const lifecycleStateSchema = z.enum([
  'draft',
  'submitted',
  'agent-pass',
  'agent-rejected',
  'approved',
  'rejected',
  'deactivated',
]);

export const actorRefSchema = z.object({
  id: entityIdSchema,
  handle: z.string().min(1).max(64),
  securityLevel: securityLevelSchema,
});

export const lifecycleEventBaseSchema = z.object({
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

export const lifecycleMetadataBaseFields = {
  latestDecision: z.enum(['approve', 'reject']).nullable().default(null),
  latestReviewedAt: isoTimestampSchema.nullable().default(null),
  latestSubmissionId: entityIdSchema.nullable().default(null),
  latestSubmittedAt: isoTimestampSchema.nullable().default(null),
  resubmissionCount: z.number().int().min(0),
  revisionCount: z.number().int().min(1),
  submissionCount: z.number().int().min(0),
};

export const batchResponseFields = {
  appliedAt: isoTimestampSchema.nullable(),
  totalEligible: z.number().int().min(0),
  totalIneligible: z.number().int().min(0),
};

export const auditMetadataSchema = z
  .object({
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })
  .strict();

export const paginatedQuerySchema = z.object({
  cursor: z.string().min(1).max(128).optional(),
  limit: z.number().int().min(1).max(100).default(25),
});

export const paginatedResponseSchema = z.object({
  nextCursor: z.string().min(1).max(128).nullable(),
  total: z.number().int().min(0),
});

export const sha256HexSchema = z
  .string()
  .regex(/^[0-9a-f]{64}$/, 'sha256 must be 64 lowercase hex characters');

export const mediaTypeSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-z]+\/[a-z0-9.+-]+$/i, 'mediaType must be a valid IANA media type');

export const apiErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.record(z.string(), z.unknown()).optional(),
});

export function commaSeparatedListSchema<Schema extends ZodTypeAny>(
  schema: Schema,
): z.ZodType<z.infer<Schema>, unknown> {
  return z.preprocess((val) => {
    if (val === undefined || val === null) return undefined;
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') {
      return val
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return val;
  }, schema);
}

export function withEligibilityRefinements<Schema extends ZodTypeAny>(
  schema: Schema,
  reasonKey: 'ineligibilityReason' | 'reason' = 'ineligibilityReason',
) {
  return schema
    .refine(
      (value) =>
        !(value as { eligible?: boolean }).eligible ||
        (value as Record<string, unknown>)[reasonKey] === null,
      { message: `${reasonKey} must be null when eligible is true` },
    )
    .refine(
      (value) =>
        (value as { eligible?: boolean }).eligible ||
        (value as Record<string, unknown>)[reasonKey] !== null,
      { message: `${reasonKey} must be non-null when eligible is false` },
    );
}

export type Sha256Hex = z.infer<typeof sha256HexSchema>;
export type MediaType = z.infer<typeof mediaTypeSchema>;
export type EntityId = z.infer<typeof entityIdSchema>;
export type SecurityLevel = z.infer<typeof securityLevelSchema>;
export type RoleTemplate = z.infer<typeof roleTemplateSchema>;
export type Scope = z.infer<typeof scopeSchema>;
export type Label = z.infer<typeof labelSchema>;
export type Permission = z.infer<typeof permissionSchema>;
export type LifecycleState = z.infer<typeof lifecycleStateSchema>;
export type ActorRef = z.infer<typeof actorRefSchema>;
export type PaginatedQuery = z.infer<typeof paginatedQuerySchema>;
export type PaginatedResponse = z.infer<typeof paginatedResponseSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;

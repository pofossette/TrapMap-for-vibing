import { z } from 'zod';

import { boundarySchema } from './boundary.js';
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
import { feedbackRemediationStateSchema } from './feedback.js';
import { maintenanceMetaSchema } from './maintenance.js';

export const reviewRiskSchema = z.enum(['low', 'medium', 'high']);

export const agentReviewStatusSchema = z.enum(['agent-pass', 'agent-rejected']);

export const agentReviewResultSchema = z.object({
  status: agentReviewStatusSchema,
  duplicateRisk: reviewRiskSchema,
  correctnessRisk: reviewRiskSchema,
  completenessRisk: reviewRiskSchema,
  checkedAt: z.string().datetime({ offset: true }),
  notes: z.array(z.string()).default([]),
  boundary: boundarySchema.nullable().optional(),
});

export const reviewDecisionSchema = z.object({
  decidedAt: isoTimestampSchema,
  decidedBy: actorRefSchema,
  decision: z.enum(['approve', 'reject']),
  notes: z.string().min(1).max(2000),
});

export const reviewNoteSchema = z.object({
  id: entityIdSchema,
  createdAt: isoTimestampSchema,
  authorType: z.enum(['submitter', 'agent', 'reviewer', 'system']),
  author: actorRefSchema.nullable().default(null),
  message: z.string().min(1).max(2000),
});

export const knowledgeRevisionSchema = z.object({
  revision: z.number().int().min(1),
  submittedAt: isoTimestampSchema,
  submittedBy: actorRefSchema,
  shortcut: z.string().min(1).max(280),
  detail: z.string().min(1).max(10000),
  labels: z.array(labelSchema).min(1),
  reviewNotes: z.array(reviewNoteSchema).default([]),
});

export const knowledgeSubmissionRecordSchema = z.object({
  id: entityIdSchema,
  revision: z.number().int().min(1),
  submittedAt: isoTimestampSchema,
  submittedBy: actorRefSchema,
  lifecycleState: lifecycleStateSchema,
  resubmissionOf: entityIdSchema.nullable().default(null),
  agentReview: agentReviewResultSchema.nullable().default(null),
  reviewerDecision: reviewDecisionSchema.nullable().default(null),
  reviewNotes: z.array(reviewNoteSchema).default([]),
});

export const knowledgeLifecycleEventSchema = z.object({
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

export const knowledgeMetadataSchema = z
  .object({
    scopeLabel: z.enum(['global-constraint', 'project-knowledge']),
    submissionCount: z.number().int().min(0),
    resubmissionCount: z.number().int().min(0),
    revisionCount: z.number().int().min(1),
    latestSubmissionId: entityIdSchema.nullable().default(null),
    latestSubmittedAt: isoTimestampSchema.nullable().default(null),
    latestReviewedAt: isoTimestampSchema.nullable().default(null),
    latestDecision: z.enum(['approve', 'reject']).nullable().default(null),
  })
  .refine((d) => d.submissionCount >= d.resubmissionCount, {
    message: 'submissionCount must be >= resubmissionCount',
  });

export const knowledgeEntrySchema = z
  .object({
    id: entityIdSchema,
    teamId: entityIdSchema.nullable(),
    scope: scopeSchema,
    labels: z.array(labelSchema).min(1),
    shortcut: z.string().min(1).max(280),
    detail: z.string().min(1).max(10000),
    requiredLevel: securityLevelSchema,
    lifecycleState: lifecycleStateSchema,
    owner: actorRefSchema,
    latestRevision: knowledgeRevisionSchema,
    history: z.array(knowledgeRevisionSchema).min(1),
    metadata: knowledgeMetadataSchema,
    latestSubmission: knowledgeSubmissionRecordSchema.nullable().default(null),
    submissionHistory: z.array(knowledgeSubmissionRecordSchema).default([]),
    agentReview: agentReviewResultSchema.nullable(),
    reviewHistory: z.array(reviewDecisionSchema).default([]),
    reviewNotes: z.array(reviewNoteSchema).default([]),
    lifecycleHistory: z.array(knowledgeLifecycleEventSchema).default([]),
    boundary: boundarySchema.nullable().default(null),
    /** Evidence and provenance metadata (null if not yet verified) */
    evidenceMeta: evidenceMetaSchema.nullable().default(null),
    /** Maintenance metadata for ownership and review-due tracking (MAINT-01) */
    maintenanceMeta: maintenanceMetaSchema.nullable().default(null),
    /** Active remediation/suppression state derived from unresolved feedback */
    remediation: feedbackRemediationStateSchema.nullable().default(null),
  })
  .merge(auditMetadataSchema);

export const knowledgeSubmissionSchema = z
  .object({
    teamId: entityIdSchema.nullable().optional(),
    scope: scopeSchema,
    labels: z.array(labelSchema).min(1),
    shortcut: z.string().min(1).max(280),
    detail: z.string().min(1).max(10000),
    requiredLevel: securityLevelSchema.optional(),
    boundary: boundarySchema.nullable().optional(),
  })
  .strict();

export const knowledgeResubmissionSchema = z.object({
  entryId: entityIdSchema,
  labels: z.array(labelSchema).min(1),
  shortcut: z.string().min(1).max(280),
  detail: z.string().min(1).max(10000),
  boundary: boundarySchema.nullable().optional(),
});

export const knowledgeUpdateSchema = z.object({
  entryId: entityIdSchema,
  labels: z.array(labelSchema).min(1).optional(),
  shortcut: z.string().min(1).max(280).optional(),
  detail: z.string().min(1).max(10000).optional(),
  requiredLevel: securityLevelSchema.optional(),
});

export const knowledgeListItemSchema = z.object({
  id: entityIdSchema,
  scope: scopeSchema,
  labels: z.array(labelSchema),
  shortcut: z.string(),
  lifecycleState: lifecycleStateSchema,
  requiredLevel: securityLevelSchema,
  updatedAt: isoTimestampSchema,
  /** Evidence metadata for provenance tracking (null if no evidence recorded) */
  evidenceMeta: evidenceMetaSchema.nullable().default(null),
});

export const knowledgeEntryResponseSchema = z
  .object({
    entry: knowledgeEntrySchema,
  })
  .strict();

export const knowledgeHistoryResponseSchema = z
  .object({
    items: z.array(knowledgeEntrySchema),
  })
  .strict();

export const knowledgeSubmissionHistoryItemSchema = z.object({
  entryId: entityIdSchema,
  submission: knowledgeSubmissionRecordSchema,
  shortcut: z.string().min(1).max(280),
  scope: scopeSchema,
  requiredLevel: securityLevelSchema,
});

export const knowledgeSubmissionHistoryResponseSchema = z
  .object({
    items: z.array(knowledgeSubmissionHistoryItemSchema),
  })
  .strict();

export type ReviewRisk = z.infer<typeof reviewRiskSchema>;
export type AgentReviewResult = z.infer<typeof agentReviewResultSchema>;
export type ReviewDecision = z.infer<typeof reviewDecisionSchema>;
export type ReviewNote = z.infer<typeof reviewNoteSchema>;
export type KnowledgeSubmissionRecord = z.infer<typeof knowledgeSubmissionRecordSchema>;
export type KnowledgeLifecycleEvent = z.infer<typeof knowledgeLifecycleEventSchema>;
export type KnowledgeMetadata = z.infer<typeof knowledgeMetadataSchema>;
export type KnowledgeEntry = z.infer<typeof knowledgeEntrySchema>;
export type KnowledgeSubmission = z.infer<typeof knowledgeSubmissionSchema>;
export type KnowledgeResubmission = z.infer<typeof knowledgeResubmissionSchema>;
export type KnowledgeUpdate = z.infer<typeof knowledgeUpdateSchema>;
export type KnowledgeEntryResponse = z.infer<typeof knowledgeEntryResponseSchema>;
export type KnowledgeHistoryResponse = z.infer<typeof knowledgeHistoryResponseSchema>;
export type KnowledgeSubmissionHistoryResponse = z.infer<
  typeof knowledgeSubmissionHistoryResponseSchema
>;

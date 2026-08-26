import { z } from 'zod';

import {
  experienceGeneModeSchema,
  geneEventTypeSchema,
  geneGeneratorKindSchema,
  geneIndexStatusSchema,
  geneSourceKindSchema,
  geneStatusSchema,
} from '../enum-types/experience-gene.js';
import {
  type LifecycleState,
  entityIdSchema,
  isoTimestampSchema,
  labelSchema,
  lifecycleStateSchema,
  scopeSchema,
  securityLevelSchema,
  sha256HexSchema,
} from './common.js';

const sourceShape = {
  kind: geneSourceKindSchema,
  sourceId: entityIdSchema,
  sourceRevision: z.number().int().min(1),
  sourceHash: sha256HexSchema,
  artifactId: entityIdSchema.nullable(),
  capsuleId: entityIdSchema.nullable(),
  artifactRevision: z.number().int().min(1).nullable(),
};

export const experienceGeneSourceSchema = z
  .object(sourceShape)
  .strict()
  .superRefine((source, context) => {
    if (source.kind === 'trap') {
      if (
        source.artifactId !== null ||
        source.capsuleId !== null ||
        source.artifactRevision !== null
      ) {
        context.addIssue({
          code: 'custom',
          message: 'trap genes cannot reference artifacts or capsules',
        });
      }
      return;
    }

    if (source.artifactId === null || source.artifactRevision === null) {
      context.addIssue({
        code: 'custom',
        message: `${source.kind} genes require artifactId and artifactRevision`,
      });
    }
    if (source.kind === 'skill-capsule' && source.capsuleId === null) {
      context.addIssue({ code: 'custom', message: 'capsule genes require capsuleId' });
    }
    if (source.kind === 'skill-artifact' && source.capsuleId !== null) {
      context.addIssue({ code: 'custom', message: 'artifact genes cannot reference a capsule' });
    }
  });

export const experienceGeneLineageSchema = z
  .object({
    derivationUnitId: z.string().min(1).max(160),
    parentEventId: entityIdSchema.nullable(),
    promptVersion: z.string().min(1).max(80),
    priorGeneHash: sha256HexSchema.nullable(),
  })
  .strict();

export const generatorMetadataSchema = z
  .object({
    kind: geneGeneratorKindSchema,
    model: z.string().min(1).max(160).nullable(),
    promptVersion: z.string().min(1).max(80),
  })
  .strict();

export const experienceGeneIndexingSchema = z
  .object({
    status: geneIndexStatusSchema,
    lastError: z.string().min(1).max(500).nullable(),
    updatedAt: isoTimestampSchema,
  })
  .strict();

export const experienceGeneSchema = z
  .object({
    geneId: entityIdSchema,
    schemaVersion: z.literal('1'),
    status: geneStatusSchema,
    title: z.string().min(1).max(280),
    signalsMatch: z.array(z.string().min(1).max(120)).min(1).max(20),
    summary: z.string().min(1).max(1000),
    strategy: z.array(z.string().min(1).max(500)).min(1).max(7),
    avoid: z.array(z.string().min(1).max(500)).max(7),
    constraints: z.array(z.string().min(1).max(280)).default([]),
    validation: z.array(z.string().min(1).max(280)).default([]),
    labels: z.array(labelSchema).min(1),
    scope: scopeSchema,
    teamId: entityIdSchema.nullable(),
    requiredLevel: securityLevelSchema,
    source: experienceGeneSourceSchema,
    lineage: experienceGeneLineageSchema,
    generator: generatorMetadataSchema,
    indexing: experienceGeneIndexingSchema,
    contentHash: sha256HexSchema,
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })
  .strict();

export type ExperienceGeneSource = z.infer<typeof experienceGeneSourceSchema>;
export type ExperienceGeneLineage = z.infer<typeof experienceGeneLineageSchema>;
export type GeneratorMetadata = z.infer<typeof generatorMetadataSchema>;
export type ExperienceGeneIndexing = z.infer<typeof experienceGeneIndexingSchema>;
export type ExperienceGene = z.infer<typeof experienceGeneSchema>;

export function buildExperienceGeneContentProjection(
  gene: ExperienceGene,
): Record<string, unknown> {
  return {
    schemaVersion: gene.schemaVersion,
    title: gene.title,
    signalsMatch: gene.signalsMatch,
    summary: gene.summary,
    strategy: gene.strategy,
    avoid: gene.avoid,
    constraints: gene.constraints,
    validation: gene.validation,
    labels: gene.labels,
    scope: gene.scope,
    teamId: gene.teamId,
    requiredLevel: gene.requiredLevel,
    source: gene.source,
    derivationUnitId: gene.lineage.derivationUnitId,
    generator: gene.generator,
  };
}

export const validationIssueSchema = z
  .object({
    code: z.string().min(1).max(80),
    field: z.string().min(1).max(120),
    message: z.string().min(1).max(500),
  })
  .strict();

export const validatorReportSchema = z
  .object({
    valid: z.literal(false),
    issues: z.array(validationIssueSchema).max(50),
  })
  .strict();

export const experienceGeneValidationReportSchema = z
  .object({
    valid: z.boolean(),
    issues: z.array(validationIssueSchema).max(50),
  })
  .strict();

export type ValidationIssue = z.infer<typeof validationIssueSchema>;
export type ExperienceGeneValidatorReport = z.infer<typeof validatorReportSchema>;
export type ExperienceGeneValidationReport = z.infer<typeof experienceGeneValidationReportSchema>;

export const experienceGeneEventActorSchema = z
  .object({
    kind: z.enum(['system', 'user', 'agent']),
    id: entityIdSchema.nullable(),
  })
  .strict();

export const validatorSummarySchema = z
  .object({
    valid: z.boolean(),
    issueCodes: z.array(z.string().min(1).max(80)).max(20),
  })
  .strict();

export const experienceGeneRejectedEventPayloadSchema = z
  .object({ validatorReport: validatorReportSchema })
  .strict();

export const emptyExperienceGeneEventPayloadSchema = z.object({}).strict();

export const experienceGeneEventSchema = z
  .object({
    id: entityIdSchema,
    type: geneEventTypeSchema,
    geneId: entityIdSchema,
    source: experienceGeneSourceSchema,
    actor: experienceGeneEventActorSchema,
    validatorSummary: validatorSummarySchema,
    reasonClass: z.string().min(1).max(80).nullable(),
    payloadSnapshotHash: sha256HexSchema,
    payload: z.union([
      emptyExperienceGeneEventPayloadSchema,
      experienceGeneRejectedEventPayloadSchema,
    ]),
    createdAt: isoTimestampSchema,
  })
  .strict()
  .superRefine((event, context) => {
    const isRejected = event.type === 'rejected';
    const hasValidatorReport = 'validatorReport' in event.payload;
    if (isRejected !== hasValidatorReport) {
      context.addIssue({
        code: 'custom',
        message: 'validator report payload is required only for rejected events',
      });
    }
  });

export type ExperienceGeneEventActor = z.infer<typeof experienceGeneEventActorSchema>;
export type ValidatorSummary = z.infer<typeof validatorSummarySchema>;
export type ExperienceGeneEventPayload =
  | z.infer<typeof emptyExperienceGeneEventPayloadSchema>
  | z.infer<typeof experienceGeneRejectedEventPayloadSchema>;
export type ExperienceGeneEvent = z.infer<typeof experienceGeneEventSchema>;

export const experienceGeneDerivationTaskPayloadSchema = z
  .object({
    requestId: entityIdSchema,
    source: experienceGeneSourceSchema,
    derivationUnitId: z.string().min(1).max(160),
    generatorKind: geneGeneratorKindSchema,
    promptVersion: z.string().min(1).max(80),
    snapshotHash: sha256HexSchema,
  })
  .strict();

export type ExperienceGeneDerivationTaskPayload = z.infer<
  typeof experienceGeneDerivationTaskPayloadSchema
>;

export const experienceGeneLlmOutputSchema = z
  .object({
    signalsMatch: z.array(z.string().min(1).max(120)).min(1).max(20),
    summary: z.string().min(1).max(1000),
    strategy: z.array(z.string().min(1).max(500)).min(1).max(7),
    avoid: z.array(z.string().min(1).max(500)).max(7),
    constraints: z.array(z.string().min(1).max(280)).max(20),
    validation: z.array(z.string().min(1).max(280)).max(20),
  })
  .strict();

export type ExperienceGeneLlmOutput = z.infer<typeof experienceGeneLlmOutputSchema>;

const snapshotGovernance = {
  labels: z.array(labelSchema).min(1).max(20),
  scope: scopeSchema,
  teamId: entityIdSchema.nullable(),
  requiredLevel: securityLevelSchema,
};

const snapshotProvenance = {
  revision: z.number().int().min(1),
  sourceHash: sha256HexSchema,
  derivationUnitId: z.string().min(1).max(160),
  title: z.string().min(1).max(280),
  text: z.string().max(16_000),
  truncated: z.boolean(),
};

export const experienceGeneSourceSnapshotSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('trap'),
      sourceId: entityIdSchema,
      ...snapshotProvenance,
      ...snapshotGovernance,
    })
    .strict(),
  z
    .object({
      kind: z.literal('skill-artifact'),
      sourceId: entityIdSchema,
      artifactId: entityIdSchema,
      artifactRevision: z.number().int().min(1),
      ...snapshotProvenance,
      ...snapshotGovernance,
    })
    .strict(),
  z
    .object({
      kind: z.literal('skill-capsule'),
      sourceId: entityIdSchema,
      artifactId: entityIdSchema,
      artifactRevision: z.number().int().min(1),
      capsuleId: entityIdSchema,
      situation: z.string().max(4_000),
      problem: z.string().max(4_000),
      goal: z.string().max(4_000),
      errorText: z.string().max(4_000).nullable(),
      contextualPrefix: z.string().max(4_000).nullable(),
      sourcePaths: z.array(z.string().min(1).max(280)).max(50),
      ...snapshotProvenance,
      ...snapshotGovernance,
    })
    .strict(),
]);

export type ExperienceGeneSourceSnapshot = z.infer<typeof experienceGeneSourceSnapshotSchema>;

export const experienceGeneSourceLifecycleEventSchema = z
  .object({
    name: z.enum([
      'knowledge.approved',
      'knowledge.lifecycle-updated',
      'knowledge.rejected',
      'artifact.approved',
      'artifact.lifecycle-updated',
      'artifact.deactivated',
    ]),
    entryId: entityIdSchema.nullable(),
    artifactId: entityIdSchema.nullable().optional(),
    previousState: lifecycleStateSchema.nullable().optional(),
    nextState: z.custom<LifecycleState>(),
    actorId: entityIdSchema.nullable().optional(),
    reason: z.string().max(500).nullable().optional(),
    timestamp: isoTimestampSchema,
    sourceEventId: entityIdSchema.nullable().optional(),
  })
  .strict()
  .superRefine((event, context) => {
    const knowledge = event.name.startsWith('knowledge.');
    if (knowledge && !event.entryId) {
      context.addIssue({ code: 'custom', message: 'knowledge events require entryId' });
    }
    if (!knowledge && !event.artifactId) {
      context.addIssue({ code: 'custom', message: 'artifact events require artifactId' });
    }
  });

export type ExperienceGeneSourceLifecycleEvent = z.infer<
  typeof experienceGeneSourceLifecycleEventSchema
>;

export const experienceGeneSolidifiedOutboxPayloadSchema = z
  .object({
    geneId: entityIdSchema,
    source: experienceGeneSourceSchema,
    contentHash: sha256HexSchema,
    occurredAt: isoTimestampSchema,
  })
  .strict();

export type ExperienceGeneSolidifiedOutboxPayload = z.infer<
  typeof experienceGeneSolidifiedOutboxPayloadSchema
>;

export const EXPERIENCE_GENE_DERIVE_TASK_EVENT = 'experience-gene.derive';
export const EXPERIENCE_GENE_SOLIDIFIED_OUTBOX_EVENT = 'experience-gene.solidified';
export const EXPERIENCE_GENE_STALED_OUTBOX_EVENT = 'experience-gene.staled';
export const EXPERIENCE_GENE_DEPRECATED_OUTBOX_EVENT = 'experience-gene.deprecated';
export { experienceGeneModeSchema };

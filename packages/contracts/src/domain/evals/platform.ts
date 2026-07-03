import { z } from 'zod';

import { retrievalEvalTierSchema } from './retrieval.js';

export const evalPlatformEventFamilySchema = z.enum([
  'EvalRunStarted',
  'EvalRunFinished',
  'EvalCaseStarted',
  'EvalCaseFinished',
  'EvalScoreRecorded',
  'EvalAssertionRecorded',
  'EvalTraceStepRecorded',
]);

export type EvalPlatformEventFamily = z.infer<typeof evalPlatformEventFamilySchema>;

export const evalPlatformSuiteSchema = z.string().min(1);

export type EvalPlatformSuite = z.infer<typeof evalPlatformSuiteSchema>;

export const evalPlatformTierSchema = retrievalEvalTierSchema;

export type EvalPlatformTier = z.infer<typeof evalPlatformTierSchema>;

const evalPlatformObjectSchema = z.record(z.string().min(1), z.unknown());

export const evalRunStartedPayloadSchema = z.object({
  reportMeta: evalPlatformObjectSchema,
  runScope: evalPlatformObjectSchema,
});

export type EvalRunStartedPayload = z.infer<typeof evalRunStartedPayloadSchema>;

export const evalRunFinishedPayloadSchema = z.object({
  reportMeta: evalPlatformObjectSchema,
  reportSummary: evalPlatformObjectSchema,
  reportCollections: evalPlatformObjectSchema,
});

export type EvalRunFinishedPayload = z.infer<typeof evalRunFinishedPayloadSchema>;

export const evalCaseStartedPayloadSchema = z.object({
  case: evalPlatformObjectSchema,
});

export type EvalCaseStartedPayload = z.infer<typeof evalCaseStartedPayloadSchema>;

export const evalCaseFinishedPayloadSchema = z.object({
  result: evalPlatformObjectSchema,
  execution: evalPlatformObjectSchema.optional(),
});

export type EvalCaseFinishedPayload = z.infer<typeof evalCaseFinishedPayloadSchema>;

export const evalScorePayloadSchema = z.object({
  scoreId: z.string().min(1),
  score: z.number(),
  source: z.string().min(1),
  weight: z.number().optional(),
  threshold: z.number().optional(),
  rationale: z.string().min(1).optional(),
});

export type EvalScorePayload = z.infer<typeof evalScorePayloadSchema>;

export const evalAssertionPayloadSchema = z.object({
  assertionId: z.string().min(1),
  passed: z.boolean(),
  source: z.string().min(1),
  expected: z.unknown().optional(),
  actual: z.unknown().optional(),
  reason: z.string().min(1).optional(),
  severity: z.string().min(1).optional(),
});

export type EvalAssertionPayload = z.infer<typeof evalAssertionPayloadSchema>;

export const evalTraceStepPayloadSchema = z.object({
  stepIndex: z.number().int().min(0),
  kind: z.string().min(1),
  text: z.string(),
  source: z.string().min(1),
  stepId: z.string().min(1).optional(),
  parentStepId: z.string().min(1).optional(),
  evidence: z.array(z.unknown()).optional(),
  metadata: evalPlatformObjectSchema.optional(),
});

export type EvalTraceStepPayload = z.infer<typeof evalTraceStepPayloadSchema>;

const evalPlatformEventEnvelopeSchema = z.object({
  suite: evalPlatformSuiteSchema,
  tier: evalPlatformTierSchema,
  runId: z.string().min(1),
  caseId: z.string().min(1).nullable(),
  scenarioId: z.string().min(1).nullable(),
  timestamp: z.string().datetime({ offset: true }),
  tags: z.array(z.string().min(1)).default([]),
});

export const evalRunStartedEventSchema = evalPlatformEventEnvelopeSchema.extend({
  family: z.literal('EvalRunStarted'),
  payload: evalRunStartedPayloadSchema,
});

export const evalRunFinishedEventSchema = evalPlatformEventEnvelopeSchema.extend({
  family: z.literal('EvalRunFinished'),
  payload: evalRunFinishedPayloadSchema,
});

export const evalCaseStartedEventSchema = evalPlatformEventEnvelopeSchema.extend({
  family: z.literal('EvalCaseStarted'),
  payload: evalCaseStartedPayloadSchema,
});

export const evalCaseFinishedEventSchema = evalPlatformEventEnvelopeSchema.extend({
  family: z.literal('EvalCaseFinished'),
  payload: evalCaseFinishedPayloadSchema,
});

export const evalScoreRecordedEventSchema = evalPlatformEventEnvelopeSchema.extend({
  family: z.literal('EvalScoreRecorded'),
  payload: evalScorePayloadSchema,
});

export const evalAssertionRecordedEventSchema = evalPlatformEventEnvelopeSchema.extend({
  family: z.literal('EvalAssertionRecorded'),
  payload: evalAssertionPayloadSchema,
});

export const evalTraceStepRecordedEventSchema = evalPlatformEventEnvelopeSchema.extend({
  family: z.literal('EvalTraceStepRecorded'),
  payload: evalTraceStepPayloadSchema,
});

export const evalPlatformEventSchema = z.discriminatedUnion('family', [
  evalRunStartedEventSchema,
  evalRunFinishedEventSchema,
  evalCaseStartedEventSchema,
  evalCaseFinishedEventSchema,
  evalScoreRecordedEventSchema,
  evalAssertionRecordedEventSchema,
  evalTraceStepRecordedEventSchema,
]);

export type EvalPlatformEvent = z.infer<typeof evalPlatformEventSchema>;

export const evalPlatformRunSchema = z.object({
  runId: z.string().min(1),
  suite: evalPlatformSuiteSchema,
  tier: evalPlatformTierSchema,
  startedAt: z.string().datetime({ offset: true }),
  finishedAt: z.string().datetime({ offset: true }).optional(),
  tags: z.array(z.string().min(1)).default([]),
  events: z.array(evalPlatformEventSchema),
});

export type EvalPlatformRun = z.infer<typeof evalPlatformRunSchema>;

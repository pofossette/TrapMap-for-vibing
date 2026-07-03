import { z } from 'zod';

import {
  agentPlanningCaseResultSchema,
  agentPlanningEvalCaseSchema,
  agentPlanningEvalReportMetaSchema,
  agentPlanningEvalReportSchema,
  agentPlanningEvalTierSchema,
} from './agent-planning.js';
import {
  retrievalEvalCaseSchema,
  retrievalEvalEndpointSchema,
  retrievalEvalTierSchema,
} from './retrieval.js';
import {
  retrievalEvalCaseSummarySchema,
  retrievalEvalFailureRecordSchema,
  retrievalEvalReportMetaSchema,
  retrievalEvalReportSchema,
  retrievalEvalSliceSummarySchema,
  retrievalEvalWarningRecordSchema,
  summaryEvalCaseResultSchema,
  summaryEvalFailureRecordSchema,
  summaryEvalReportMetaSchema,
  summaryEvalReportSchema,
} from './report.js';
import {
  summaryEvalCaseSchema,
  summaryEvalEndpointSchema,
  summaryEvalTierSchema,
} from './summary.js';

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

export const evalPlatformSuiteSchema = z.enum(['agent-planning', 'retrieval', 'summary']);

export type EvalPlatformSuite = z.infer<typeof evalPlatformSuiteSchema>;

export const evalPlatformTierSchema = retrievalEvalTierSchema;

export type EvalPlatformTier = z.infer<typeof evalPlatformTierSchema>;

const agentPlanningRunStartedPayloadSchema = z
  .object({
    reportMeta: agentPlanningEvalReportMetaSchema
      .pick({
        schemaVersion: true,
        timestamp: true,
        runner: true,
        options: true,
      })
      .strict(),
    runScope: z
      .object({
        tier: agentPlanningEvalTierSchema,
        dryRun: z.boolean(),
        provider: z.enum(['fallback', 'openai']),
        promptTemplateId: z.string().min(1),
        caseCount: z.number().int().min(0),
        scenarioIds: z.array(z.string().min(1)),
      })
      .strict(),
  })
  .strict();

const retrievalRunStartedPayloadSchema = z
  .object({
    reportMeta: retrievalEvalReportMetaSchema
      .pick({
        schemaVersion: true,
        timestamp: true,
        options: true,
        baselinePath: true,
        isBaselineWrite: true,
      })
      .strict(),
    runScope: z
      .object({
        tier: retrievalEvalTierSchema,
        dryRun: z.boolean(),
        allowEmpty: z.boolean(),
        endpoint: retrievalEvalEndpointSchema.optional(),
        verbose: z.boolean(),
        caseCount: z.number().int().min(0),
        scenarioIds: z.array(z.string().min(1)),
      })
      .strict(),
  })
  .strict();

const summaryRunStartedPayloadSchema = z
  .object({
    reportMeta: summaryEvalReportMetaSchema
      .pick({
        schemaVersion: true,
        timestamp: true,
        llmProvider: true,
        options: true,
      })
      .strict(),
    runScope: z
      .object({
        tier: summaryEvalTierSchema,
        dryRun: z.boolean(),
        allowEmpty: z.boolean(),
        endpoint: summaryEvalEndpointSchema.optional(),
        verbose: z.boolean(),
        provider: z.enum(['fallback', 'openai']),
        caseCount: z.number().int().min(0),
        scenarioIds: z.array(z.string().min(1)),
      })
      .strict(),
  })
  .strict();

export type EvalRunStartedPayload =
  | z.infer<typeof agentPlanningRunStartedPayloadSchema>
  | z.infer<typeof retrievalRunStartedPayloadSchema>
  | z.infer<typeof summaryRunStartedPayloadSchema>;

const agentPlanningRunFinishedPayloadSchema = z
  .object({
    reportMeta: agentPlanningEvalReportMetaSchema.strict(),
    reportSummary: agentPlanningEvalReportSchema.shape.summary.strict(),
    reportCollections: z
      .object({
        cases: z.array(agentPlanningCaseResultSchema),
        groups: z.array(agentPlanningEvalReportSchema.shape.groups.element),
        slices: z.array(agentPlanningEvalReportSchema.shape.slices.element),
      })
      .strict(),
  })
  .strict();

const retrievalRunFinishedPayloadSchema = z
  .object({
    reportMeta: retrievalEvalReportMetaSchema.strict(),
    reportSummary: retrievalEvalReportSchema.shape.summary.strict(),
    reportCollections: z
      .object({
        cases: z.array(retrievalEvalCaseSummarySchema),
        slices: z.array(retrievalEvalSliceSummarySchema),
        cohorts: retrievalEvalReportSchema.shape.cohorts.optional(),
        modeComparisons: retrievalEvalReportSchema.shape.modeComparisons.optional(),
        routingDistribution: retrievalEvalReportSchema.shape.routingDistribution.optional(),
        failures: z.array(retrievalEvalFailureRecordSchema),
        warnings: z.array(retrievalEvalWarningRecordSchema),
      })
      .strict(),
  })
  .strict();

const summaryRunFinishedPayloadSchema = z
  .object({
    reportMeta: summaryEvalReportMetaSchema.strict(),
    reportSummary: summaryEvalReportSchema.shape.summary.strict(),
    reportCollections: z
      .object({
        cases: z.array(summaryEvalCaseResultSchema),
        failures: z.array(summaryEvalFailureRecordSchema),
      })
      .strict(),
  })
  .strict();

export type EvalRunFinishedPayload =
  | z.infer<typeof agentPlanningRunFinishedPayloadSchema>
  | z.infer<typeof retrievalRunFinishedPayloadSchema>
  | z.infer<typeof summaryRunFinishedPayloadSchema>;

const agentPlanningCaseStartedPayloadSchema = z
  .object({
    case: agentPlanningEvalCaseSchema.strict(),
  })
  .strict();

const retrievalCaseStartedPayloadSchema = z
  .object({
    case: retrievalEvalCaseSchema.strict(),
  })
  .strict();

const summaryCaseStartedPayloadSchema = z
  .object({
    case: summaryEvalCaseSchema.strict(),
  })
  .strict();

export type EvalCaseStartedPayload =
  | z.infer<typeof agentPlanningCaseStartedPayloadSchema>
  | z.infer<typeof retrievalCaseStartedPayloadSchema>
  | z.infer<typeof summaryCaseStartedPayloadSchema>;

const agentPlanningCaseFinishedPayloadSchema = z
  .object({
    result: agentPlanningCaseResultSchema.strict(),
    execution: z
      .object({
        actorOutput: z.string(),
        normalizedPlan: z.array(z.string()),
      })
      .strict()
      .optional(),
  })
  .strict();

const retrievalCaseFinishedPayloadSchema = z
  .object({
    result: retrievalEvalCaseSummarySchema.strict(),
  })
  .strict();

const summaryCaseFinishedPayloadSchema = z
  .object({
    result: summaryEvalCaseResultSchema.strict(),
  })
  .strict();

export type EvalCaseFinishedPayload =
  | z.infer<typeof agentPlanningCaseFinishedPayloadSchema>
  | z.infer<typeof retrievalCaseFinishedPayloadSchema>
  | z.infer<typeof summaryCaseFinishedPayloadSchema>;

const evalScoreBaseSchema = z
  .object({
    score: z.number(),
    weight: z.number().optional(),
    threshold: z.number().optional(),
    rationale: z.string().min(1).optional(),
  })
  .strict();

const agentPlanningScorePayloadSchema = evalScoreBaseSchema.extend({
  scoreId: z.union([
    z.literal('totalScore'),
    z.literal('pathScore'),
    z.literal('finalAnswerScore'),
    z.string().regex(/^dimension:[^:]+$/),
  ]),
  source: z.enum([
    'case.totalScore',
    'case.pathScore',
    'case.finalAnswerScore',
    'case.judge.dimensionScores[*].score',
  ]),
});

const retrievalScorePayloadSchema = evalScoreBaseSchema.extend({
  scoreId: z.enum(['hitAt1', 'hitAt5', 'hitAt10', 'mrr', 'ndcg', 'recallAt10']),
  source: z.enum([
    'case.hitAt1',
    'case.hitAt5',
    'case.hitAt10',
    'case.mrr',
    'case.ndcg',
    'case.recallAt10',
  ]),
});

const summaryScorePayloadSchema = evalScoreBaseSchema.extend({
  scoreId: z.enum(['groundednessScore', 'coverageScore']),
  source: z.enum(['case.groundednessScore', 'case.coverageScore']),
});

export const evalScorePayloadSchema = z.union([
  agentPlanningScorePayloadSchema,
  retrievalScorePayloadSchema,
  summaryScorePayloadSchema,
]);

export type EvalScorePayload = z.infer<typeof evalScorePayloadSchema>;

const evalAssertionBaseSchema = z
  .object({
    passed: z.boolean(),
    expected: z.unknown().optional(),
    actual: z.unknown().optional(),
    reason: z.string().min(1).optional(),
    severity: z.string().min(1).optional(),
  })
  .strict();

const agentPlanningAssertionPayloadSchema = evalAssertionBaseSchema.extend({
  assertionId: z.enum([
    'precheck.required-steps',
    'precheck.key-actions',
    'precheck.forbidden-actions',
    'precheck.empty-output',
    'precheck.parse-failed',
    'judge.matched-key-actions',
    'judge.missing-key-actions',
    'judge.forbidden-action-hits',
  ]),
  source: z.enum([
    'case.deterministicPrecheck.missingRequiredSteps',
    'case.deterministicPrecheck.missingKeyActions',
    'case.deterministicPrecheck.forbiddenActionHits',
    'case.deterministicPrecheck.emptyOutput',
    'case.deterministicPrecheck.parseFailed',
    'case.judge.matchedKeyActions',
    'case.judge.missingKeyActions',
    'case.judge.forbiddenActionHits',
  ]),
});

const retrievalAssertionPayloadSchema = evalAssertionBaseSchema.extend({
  assertionId: z.enum(['outcome', 'governance', 'shape', 'graph-plan']),
  source: z.enum([
    'case.outcomeMatch',
    'case.governancePassed',
    'case.selectedMode',
    'case.routingReason',
    'case.fallbackApplied',
    'case.passed',
  ]),
});

const summaryAssertionPayloadSchema = evalAssertionBaseSchema.extend({
  assertionId: z.enum(['summary-present', 'groundedness', 'coverage', 'forbidden-claims']),
  source: z.enum([
    'case.claimsTotal',
    'case.groundednessScore',
    'case.coverageScore',
    'case.forbiddenClaimsFound',
  ]),
});

export const evalAssertionPayloadSchema = z.union([
  agentPlanningAssertionPayloadSchema,
  retrievalAssertionPayloadSchema,
  summaryAssertionPayloadSchema,
]);

export type EvalAssertionPayload = z.infer<typeof evalAssertionPayloadSchema>;

const evalTraceStepPayloadSchema = z
  .object({
    stepIndex: z.number().int().min(0),
    kind: z.enum(['actor-output', 'normalized-plan-step']),
    text: z.string(),
    source: z.enum(['case.actorOutput', 'case.normalizedPlan[*]']),
    stepId: z.string().min(1).optional(),
    parentStepId: z.string().min(1).optional(),
    evidence: z.array(z.unknown()).optional(),
    metadata: z.record(z.string().min(1), z.unknown()).optional(),
  })
  .strict();

export type EvalTraceStepPayload = z.infer<typeof evalTraceStepPayloadSchema>;

const evalPlatformEventEnvelopeSchema = z
  .object({
    tier: evalPlatformTierSchema,
    runId: z.string().min(1),
    caseId: z.string().min(1).nullable(),
    scenarioId: z.string().min(1).nullable(),
    timestamp: z.string().datetime({ offset: true }),
    tags: z.array(z.string().min(1)).default([]),
  })
  .strict();

const runStartedEventSchemas = [
  evalPlatformEventEnvelopeSchema.extend({
    family: z.literal('EvalRunStarted'),
    suite: z.literal('agent-planning'),
    payload: agentPlanningRunStartedPayloadSchema,
  }),
  evalPlatformEventEnvelopeSchema.extend({
    family: z.literal('EvalRunStarted'),
    suite: z.literal('retrieval'),
    payload: retrievalRunStartedPayloadSchema,
  }),
  evalPlatformEventEnvelopeSchema.extend({
    family: z.literal('EvalRunStarted'),
    suite: z.literal('summary'),
    payload: summaryRunStartedPayloadSchema,
  }),
] as const;

const runFinishedEventSchemas = [
  evalPlatformEventEnvelopeSchema.extend({
    family: z.literal('EvalRunFinished'),
    suite: z.literal('agent-planning'),
    payload: agentPlanningRunFinishedPayloadSchema,
  }),
  evalPlatformEventEnvelopeSchema.extend({
    family: z.literal('EvalRunFinished'),
    suite: z.literal('retrieval'),
    payload: retrievalRunFinishedPayloadSchema,
  }),
  evalPlatformEventEnvelopeSchema.extend({
    family: z.literal('EvalRunFinished'),
    suite: z.literal('summary'),
    payload: summaryRunFinishedPayloadSchema,
  }),
] as const;

const caseStartedEventSchemas = [
  evalPlatformEventEnvelopeSchema.extend({
    family: z.literal('EvalCaseStarted'),
    suite: z.literal('agent-planning'),
    payload: agentPlanningCaseStartedPayloadSchema,
  }),
  evalPlatformEventEnvelopeSchema.extend({
    family: z.literal('EvalCaseStarted'),
    suite: z.literal('retrieval'),
    payload: retrievalCaseStartedPayloadSchema,
  }),
  evalPlatformEventEnvelopeSchema.extend({
    family: z.literal('EvalCaseStarted'),
    suite: z.literal('summary'),
    payload: summaryCaseStartedPayloadSchema,
  }),
] as const;

const caseFinishedEventSchemas = [
  evalPlatformEventEnvelopeSchema.extend({
    family: z.literal('EvalCaseFinished'),
    suite: z.literal('agent-planning'),
    payload: agentPlanningCaseFinishedPayloadSchema,
  }),
  evalPlatformEventEnvelopeSchema.extend({
    family: z.literal('EvalCaseFinished'),
    suite: z.literal('retrieval'),
    payload: retrievalCaseFinishedPayloadSchema,
  }),
  evalPlatformEventEnvelopeSchema.extend({
    family: z.literal('EvalCaseFinished'),
    suite: z.literal('summary'),
    payload: summaryCaseFinishedPayloadSchema,
  }),
] as const;

const scoreRecordedEventSchemas = [
  evalPlatformEventEnvelopeSchema.extend({
    family: z.literal('EvalScoreRecorded'),
    suite: z.literal('agent-planning'),
    payload: agentPlanningScorePayloadSchema,
  }),
  evalPlatformEventEnvelopeSchema.extend({
    family: z.literal('EvalScoreRecorded'),
    suite: z.literal('retrieval'),
    payload: retrievalScorePayloadSchema,
  }),
  evalPlatformEventEnvelopeSchema.extend({
    family: z.literal('EvalScoreRecorded'),
    suite: z.literal('summary'),
    payload: summaryScorePayloadSchema,
  }),
] as const;

const assertionRecordedEventSchemas = [
  evalPlatformEventEnvelopeSchema.extend({
    family: z.literal('EvalAssertionRecorded'),
    suite: z.literal('agent-planning'),
    payload: agentPlanningAssertionPayloadSchema,
  }),
  evalPlatformEventEnvelopeSchema.extend({
    family: z.literal('EvalAssertionRecorded'),
    suite: z.literal('retrieval'),
    payload: retrievalAssertionPayloadSchema,
  }),
  evalPlatformEventEnvelopeSchema.extend({
    family: z.literal('EvalAssertionRecorded'),
    suite: z.literal('summary'),
    payload: summaryAssertionPayloadSchema,
  }),
] as const;

export const evalRunStartedEventSchema = z.union(runStartedEventSchemas);
export const evalRunFinishedEventSchema = z.union(runFinishedEventSchemas);
export const evalCaseStartedEventSchema = z.union(caseStartedEventSchemas);
export const evalCaseFinishedEventSchema = z.union(caseFinishedEventSchemas);
export const evalScoreRecordedEventSchema = z.union(scoreRecordedEventSchemas);
export const evalAssertionRecordedEventSchema = z.union(assertionRecordedEventSchemas);
export const evalTraceStepRecordedEventSchema = evalPlatformEventEnvelopeSchema.extend({
  family: z.literal('EvalTraceStepRecorded'),
  suite: z.literal('agent-planning'),
  payload: evalTraceStepPayloadSchema,
});

export const evalPlatformEventSchema = z.union([
  evalRunStartedEventSchema,
  evalRunFinishedEventSchema,
  evalCaseStartedEventSchema,
  evalCaseFinishedEventSchema,
  evalScoreRecordedEventSchema,
  evalAssertionRecordedEventSchema,
  evalTraceStepRecordedEventSchema,
]);

export type EvalPlatformEvent = z.infer<typeof evalPlatformEventSchema>;

export const evalPlatformRunSchema = z
  .object({
    runId: z.string().min(1),
    suite: evalPlatformSuiteSchema,
    tier: evalPlatformTierSchema,
    startedAt: z.string().datetime({ offset: true }),
    finishedAt: z.string().datetime({ offset: true }).optional(),
    tags: z.array(z.string().min(1)).default([]),
    events: z.array(evalPlatformEventSchema),
  })
  .strict()
  .superRefine((value, ctx) => {
    for (const [index, event] of value.events.entries()) {
      if (event.runId !== value.runId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['events', index, 'runId'],
          message: 'event runId must match archive runId',
        });
      }
      if (event.suite !== value.suite) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['events', index, 'suite'],
          message: 'event suite must match archive suite',
        });
      }
      if (event.tier !== value.tier) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['events', index, 'tier'],
          message: 'event tier must match archive tier',
        });
      }
    }
  });

export type EvalPlatformRun = z.infer<typeof evalPlatformRunSchema>;

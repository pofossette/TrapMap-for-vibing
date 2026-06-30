import { z } from 'zod';

import { retrievalEvalTierSchema } from './retrieval.js';

export const agentPlanningEvalTierSchema = retrievalEvalTierSchema;

export type AgentPlanningEvalTier = z.infer<typeof agentPlanningEvalTierSchema>;

export const agentPlanningTaskTypeSchema = z.enum([
  'sequential',
  'debugging',
  'selection',
  'composite',
]);

export type AgentPlanningTaskType = z.infer<typeof agentPlanningTaskTypeSchema>;

export const agentPlanningTaskComplexitySchema = z.enum(['simple', 'medium', 'complex']);

export type AgentPlanningTaskComplexity = z.infer<typeof agentPlanningTaskComplexitySchema>;

export const agentPlanningContextSetKindSchema = z.enum(['skill-set', 'plan-graph-set']);

export type AgentPlanningContextSetKind = z.infer<typeof agentPlanningContextSetKindSchema>;

export const agentPlanningInterferenceLevelSchema = z.enum(['none', 'low', 'medium', 'high']);

export type AgentPlanningInterferenceLevel = z.infer<typeof agentPlanningInterferenceLevelSchema>;

export const agentPlanningInterferenceSourceSchema = z.object({
  sourcePool: z.string().min(1),
  sourceId: z.string().min(1),
  kind: z.enum(['skill', 'plan-graph', 'trap', 'fixture']),
  path: z.string().min(1),
  note: z.string().min(1).optional(),
});

export type AgentPlanningInterferenceSource = z.infer<typeof agentPlanningInterferenceSourceSchema>;

export const agentPlanningExpectedOutcomeSchema = z.object({
  finalAnswer: z.string().min(1),
  successCriteria: z.array(z.string().min(1)).min(1),
});

export type AgentPlanningExpectedOutcome = z.infer<typeof agentPlanningExpectedOutcomeSchema>;

export const agentPlanningGoldenPathSchema = z
  .object({
    requiredSteps: z.array(z.string().min(1)).min(1),
    keyActions: z.array(z.string().min(1)).min(1),
    allowedAlternativeActions: z.array(z.string().min(1)).default([]),
    forbiddenActions: z.array(z.string().min(1)).default([]),
    stepWeights: z.record(z.string().min(1), z.number().min(0).max(1)),
  })
  .refine(
    (value) =>
      value.requiredSteps.every((step) => typeof value.stepWeights[step] === 'number') &&
      Object.keys(value.stepWeights).length === value.requiredSteps.length,
    {
      message: 'stepWeights must cover each required step exactly once',
      path: ['stepWeights'],
    },
  );

export type AgentPlanningGoldenPath = z.infer<typeof agentPlanningGoldenPathSchema>;

export const agentPlanningJudgeDimensionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  weight: z.number().min(0).max(1),
  guidance: z.string().min(1),
});

export type AgentPlanningJudgeDimension = z.infer<typeof agentPlanningJudgeDimensionSchema>;

export const agentPlanningJudgeRubricSchema = z
  .object({
    dimensions: z.array(agentPlanningJudgeDimensionSchema).min(1),
  })
  .refine(
    (value) => {
      const total = value.dimensions.reduce((sum, dimension) => sum + dimension.weight, 0);
      return Math.abs(total - 1) < 1e-6;
    },
    {
      message: 'judge rubric weights must sum to 1',
      path: ['dimensions'],
    },
  );

export type AgentPlanningJudgeRubric = z.infer<typeof agentPlanningJudgeRubricSchema>;

export const agentPlanningEvalCaseSchema = z.object({
  schemaVersion: z.literal(1),
  taskId: z.string().min(1),
  variantId: z.string().min(1),
  variantGroupId: z.string().min(1),
  tier: agentPlanningEvalTierSchema,
  taskType: agentPlanningTaskTypeSchema,
  taskComplexity: agentPlanningTaskComplexitySchema,
  contextSetKind: agentPlanningContextSetKindSchema,
  interferenceLevel: agentPlanningInterferenceLevelSchema,
  interferenceSources: z.array(agentPlanningInterferenceSourceSchema),
  promptTemplateId: z.string().min(1),
  scenarioId: z.string().min(1),
  goldenPath: agentPlanningGoldenPathSchema,
  judgeRubric: agentPlanningJudgeRubricSchema,
  expectedOutcome: agentPlanningExpectedOutcomeSchema,
  tags: z.array(z.string().min(1)).default([]),
});

export type AgentPlanningEvalCase = z.infer<typeof agentPlanningEvalCaseSchema>;

export const agentPlanningContextEntrySchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(['skill', 'plan-node', 'trap', 'note']),
    title: z.string().min(1),
    body: z.string().min(1).optional(),
    sourcePath: z.string().min(1).optional(),
    summary: z.string().min(1).optional(),
  })
  .refine((value) => Boolean(value.body || value.sourcePath), {
    message: 'context entry requires body or sourcePath',
  });

export type AgentPlanningContextEntry = z.infer<typeof agentPlanningContextEntrySchema>;

export const agentPlanningEvalScenarioSchema = z.object({
  scenarioId: z.string().min(1),
  taskId: z.string().min(1),
  variantIds: z.array(z.string().min(1)).min(1),
  taskPrompt: z.string().min(1),
  promptTemplateId: z.string().min(1),
  actor: z.object({
    mode: z.enum(['dry-run', 'live']),
    provider: z.enum(['fallback', 'openai']).default('fallback'),
    model: z.string().min(1).optional(),
  }),
  context: z.object({
    required: z.array(agentPlanningContextEntrySchema),
    optional: z.array(agentPlanningContextEntrySchema).default([]),
    interference: z.array(agentPlanningContextEntrySchema).default([]),
  }),
  metadata: z.record(z.string().min(1), z.string().min(1)).default({}),
});

export type AgentPlanningEvalScenario = z.infer<typeof agentPlanningEvalScenarioSchema>;

export const agentPlanningDeterministicPrecheckSchema = z.object({
  passed: z.boolean(),
  missingRequiredSteps: z.array(z.string()),
  missingKeyActions: z.array(z.string()),
  forbiddenActionHits: z.array(z.string()),
  emptyOutput: z.boolean(),
  parseFailed: z.boolean(),
});

export type AgentPlanningDeterministicPrecheck = z.infer<
  typeof agentPlanningDeterministicPrecheckSchema
>;

export const agentPlanningJudgeDimensionScoreSchema = z.object({
  dimensionId: z.string().min(1),
  score: z.number().min(0).max(1),
  rationale: z.string().min(1),
});

export type AgentPlanningJudgeDimensionScore = z.infer<
  typeof agentPlanningJudgeDimensionScoreSchema
>;

export const agentPlanningJudgeResultSchema = z.object({
  totalScore: z.number().min(0).max(1),
  pathScore: z.number().min(0).max(1),
  finalAnswerScore: z.number().min(0).max(1),
  dimensionScores: z.array(agentPlanningJudgeDimensionScoreSchema),
  matchedKeyActions: z.array(z.string()),
  missingKeyActions: z.array(z.string()),
  forbiddenActionHits: z.array(z.string()),
  summary: z.string().min(1),
});

export type AgentPlanningJudgeResult = z.infer<typeof agentPlanningJudgeResultSchema>;

export const agentPlanningCaseResultSchema = z.object({
  taskId: z.string().min(1),
  variantId: z.string().min(1),
  variantGroupId: z.string().min(1),
  tier: agentPlanningEvalTierSchema,
  taskType: agentPlanningTaskTypeSchema,
  taskComplexity: agentPlanningTaskComplexitySchema,
  contextSetKind: agentPlanningContextSetKindSchema,
  interferenceLevel: agentPlanningInterferenceLevelSchema,
  passed: z.boolean(),
  totalScore: z.number().min(0).max(1),
  pathScore: z.number().min(0).max(1),
  finalAnswerScore: z.number().min(0).max(1),
  actorOutput: z.string(),
  normalizedPlan: z.array(z.string()),
  deterministicPrecheck: agentPlanningDeterministicPrecheckSchema,
  judge: agentPlanningJudgeResultSchema,
  durationMs: z.number().int().min(0),
});

export type AgentPlanningCaseResult = z.infer<typeof agentPlanningCaseResultSchema>;

export const agentPlanningInterferenceComparisonSchema = z.object({
  baselineLevel: agentPlanningInterferenceLevelSchema,
  candidateLevel: agentPlanningInterferenceLevelSchema,
  baselineAvg: z.number().min(0).max(1),
  candidateAvg: z.number().min(0).max(1),
  absoluteDiff: z.number().min(-1).max(1),
});

export type AgentPlanningInterferenceComparison = z.infer<
  typeof agentPlanningInterferenceComparisonSchema
>;

export const agentPlanningGroupSummarySchema = z.object({
  taskId: z.string().min(1),
  variantCount: z.number().int().min(1),
  skillSetAvg: z.number().min(0).max(1).nullable(),
  planGraphSetAvg: z.number().min(0).max(1).nullable(),
  absoluteDiff: z.number().min(-1).max(1).nullable(),
  relativeLift: z.number().nullable(),
  interferenceComparisons: z.array(agentPlanningInterferenceComparisonSchema),
});

export type AgentPlanningGroupSummary = z.infer<typeof agentPlanningGroupSummarySchema>;

export const agentPlanningSliceDimensionSchema = z.enum([
  'taskType',
  'taskComplexity',
  'contextSetKind',
  'interferenceLevel',
]);

export type AgentPlanningSliceDimension = z.infer<typeof agentPlanningSliceDimensionSchema>;

export const agentPlanningSliceSummarySchema = z.object({
  dimension: agentPlanningSliceDimensionSchema,
  value: z.string().min(1),
  caseCount: z.number().int().min(0),
  avgScore: z.number().min(0).max(1),
  passRate: z.number().min(0).max(1),
});

export type AgentPlanningSliceSummary = z.infer<typeof agentPlanningSliceSummarySchema>;

export const agentPlanningEvalReportMetaSchema = z.object({
  schemaVersion: z.literal(1),
  timestamp: z.string().datetime({ offset: true }),
  durationMs: z.number().int().min(0),
  runner: z.literal('agent-planning'),
  options: z.object({
    tier: agentPlanningEvalTierSchema,
    dryRun: z.boolean(),
    provider: z.enum(['fallback', 'openai']),
    promptTemplateId: z.string().min(1),
  }),
});

export type AgentPlanningEvalReportMeta = z.infer<typeof agentPlanningEvalReportMetaSchema>;

export const agentPlanningEvalReportSchema = z
  .object({
    meta: agentPlanningEvalReportMetaSchema,
    summary: z.object({
      totalCases: z.number().int().min(0),
      passedCases: z.number().int().min(0),
      failedCases: z.number().int().min(0),
      passRate: z.number().min(0).max(1),
      avgScore: z.number().min(0).max(1),
    }),
    cases: z.array(agentPlanningCaseResultSchema),
    groups: z.array(agentPlanningGroupSummarySchema),
    slices: z.array(agentPlanningSliceSummarySchema),
  })
  .refine(
    (value) => {
      if (value.summary.totalCases !== value.cases.length) {
        return false;
      }

      if (value.summary.failedCases !== value.summary.totalCases - value.summary.passedCases) {
        return false;
      }

      if (value.summary.totalCases === 0) {
        return value.summary.passRate === 0;
      }

      return (
        Math.abs(value.summary.passRate - value.summary.passedCases / value.summary.totalCases) <
        1e-6
      );
    },
    {
      message: 'report summary counts and passRate must match case results',
    },
  );

export type AgentPlanningEvalReport = z.infer<typeof agentPlanningEvalReportSchema>;

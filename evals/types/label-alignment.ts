import { z } from 'zod';

import { evalSummaryTotalsFields } from './report.js';
import { retrievalEvalTierSchema } from './retrieval.js';

export const labelAlignmentRecallReasonSchema = z.enum([
  'exact-alias',
  'normalized-name',
  'semantic-embedding',
  'catalog-empty',
  'live-decision',
]);

export const labelAlignmentCatalogSeedEntrySchema = z
  .object({
    id: z.string().min(1),
    canonicalName: z.string().min(1),
    aliases: z.array(z.string().min(1)).default([]),
    kind: z.string().min(1).optional(),
    definition: z.string().min(1).optional(),
  })
  .strict();

export const labelAlignmentGoldenAnnotationSchema = z
  .object({
    rawLabel: z.string().min(1),
    canonicalLabel: z.string().min(1),
    groupId: z.string().min(1),
    shouldMerge: z.boolean(),
  })
  .strict();

export const labelAlignmentExpectedAlignmentSchema = z
  .object({
    canonicalGroups: z.array(z.array(z.string().min(1)).min(1)).min(1),
    shouldNotMerge: z.array(z.tuple([z.string().min(1), z.string().min(1)])).default([]),
  })
  .strict();

export const labelAlignmentEvalCaseSchema = z
  .object({
    schemaVersion: z.literal(1),
    caseId: z.string().min(1),
    skillId: z.string().min(1),
    variantId: z.string().min(1),
    variantGroupId: z.string().min(1),
    tier: retrievalEvalTierSchema,
    synonymGroupCount: z.number().int().min(0),
    totalRawLabels: z.number().int().min(1),
    totalCanonicalLabels: z.number().int().min(0),
    catalogSeed: z.array(labelAlignmentCatalogSeedEntrySchema).default([]),
    embeddingEnabled: z.boolean(),
    goldenAnnotations: z.array(labelAlignmentGoldenAnnotationSchema).min(1),
    expectedAlignment: labelAlignmentExpectedAlignmentSchema,
    tags: z.array(z.string().min(1)).default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.totalRawLabels !== value.goldenAnnotations.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'totalRawLabels must equal goldenAnnotations length',
        path: ['totalRawLabels'],
      });
    }

    if (value.totalCanonicalLabels !== value.expectedAlignment.canonicalGroups.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'totalCanonicalLabels must equal expectedAlignment canonical group count',
        path: ['totalCanonicalLabels'],
      });
    }

    const shouldNotMergeLabels = new Set(value.expectedAlignment.shouldNotMerge.flat());
    const groupedRawLabels = new Set<string>();

    const rawLabels = new Set(value.goldenAnnotations.map((annotation) => annotation.rawLabel));
    for (const [groupIndex, group] of value.expectedAlignment.canonicalGroups.entries()) {
      for (const rawLabel of group) {
        groupedRawLabels.add(rawLabel);
        if (!rawLabels.has(rawLabel)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `canonicalGroups references unknown raw label: ${rawLabel}`,
            path: ['expectedAlignment', 'canonicalGroups', groupIndex],
          });
        }
      }
    }

    for (const [annotationIndex, annotation] of value.goldenAnnotations.entries()) {
      if (!groupedRawLabels.has(annotation.rawLabel)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `golden annotation missing from expectedAlignment canonicalGroups: ${annotation.rawLabel}`,
          path: ['goldenAnnotations', annotationIndex, 'rawLabel'],
        });
      }

      if (annotation.shouldMerge) {
        const groupedWithOthers = value.expectedAlignment.canonicalGroups.some(
          (group) => group.includes(annotation.rawLabel) && group.length > 1,
        );
        if (!groupedWithOthers) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `shouldMerge=true requires membership in a multi-label canonical group: ${annotation.rawLabel}`,
            path: ['goldenAnnotations', annotationIndex, 'shouldMerge'],
          });
        }
      }

      if (
        !annotation.shouldMerge &&
        shouldNotMergeLabels.size > 0 &&
        !shouldNotMergeLabels.has(annotation.rawLabel)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `shouldMerge=false requires shouldNotMerge coverage: ${annotation.rawLabel}`,
          path: ['goldenAnnotations', annotationIndex, 'shouldMerge'],
        });
      }
    }

    for (const [pairIndex, pair] of value.expectedAlignment.shouldNotMerge.entries()) {
      for (const rawLabel of pair) {
        if (!rawLabels.has(rawLabel)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `shouldNotMerge references unknown raw label: ${rawLabel}`,
            path: ['expectedAlignment', 'shouldNotMerge', pairIndex],
          });
        }
      }
    }
  });

export const labelAlignmentEvalFixtureSchema = z
  .object({
    schemaVersion: z.literal(1),
    fixtureId: z.string().min(1),
    skillId: z.string().min(1),
    description: z.string().min(1),
    tags: z.array(z.string().min(1)).default([]),
    cases: z.array(labelAlignmentEvalCaseSchema).min(1),
  })
  .strict()
  .superRefine((value, ctx) => {
    for (const [index, case_] of value.cases.entries()) {
      if (case_.skillId !== value.skillId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'case skillId must match fixture skillId',
          path: ['cases', index, 'skillId'],
        });
      }
    }
  });

export const labelAlignmentEvalReportMetaSchema = z
  .object({
    schemaVersion: z.literal(1),
    timestamp: z.string().datetime({ offset: true }),
    durationMs: z.number().int().min(0),
    mode: z.enum(['dry-run', 'live']),
    options: z.object({
      tier: retrievalEvalTierSchema,
      fixtureIds: z.array(z.string().min(1)).default([]),
    }),
  })
  .strict();

export const labelAlignmentRecallReasonDistributionSchema = z
  .record(labelAlignmentRecallReasonSchema, z.number().int().min(0))
  .default({
    'exact-alias': 0,
    'normalized-name': 0,
    'semantic-embedding': 0,
    'catalog-empty': 0,
    'live-decision': 0,
  });

const labelAlignmentMetricFields = {
  alignmentAccuracy: z.number().min(0).max(1),
  falseMerges: z.number().int().min(0),
  missedMerges: z.number().int().min(0),
  synonymEliminationCount: z.number().int().min(0),
  synonymEliminationRate: z.number().min(0).max(1),
};

export const labelAlignmentEvalCaseResultSchema = z
  .object({
    caseId: z.string().min(1),
    skillId: z.string().min(1),
    variantId: z.string().min(1),
    variantGroupId: z.string().min(1),
    tier: retrievalEvalTierSchema,
    mode: z.enum(['dry-run', 'live']),
    passed: z.boolean(),
    durationMs: z.number().int().min(0),
    ...labelAlignmentMetricFields,
    recallReasonDistribution: labelAlignmentRecallReasonDistributionSchema,
    notes: z.array(z.string()).default([]),
  })
  .strict();

export const labelAlignmentEvalReportSchema = z
  .object({
    meta: labelAlignmentEvalReportMetaSchema,
    summary: z.object({
      ...evalSummaryTotalsFields,
      ...labelAlignmentMetricFields,
      recallReasonDistribution: labelAlignmentRecallReasonDistributionSchema,
    }),
    cases: z.array(labelAlignmentEvalCaseResultSchema),
  })
  .strict()
  .superRefine((value, ctx) => {
    const { totalCases, passedCases, failedCases, passRate } = value.summary;
    if (value.cases.length !== totalCases) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'summary totalCases must equal cases length',
        path: ['summary', 'totalCases'],
      });
    }
    if (totalCases - passedCases !== failedCases) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'failedCases must equal totalCases - passedCases',
        path: ['summary', 'failedCases'],
      });
    }
    const expectedPassRate = totalCases === 0 ? 0 : passedCases / totalCases;
    if (passRate !== expectedPassRate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'passRate must equal passedCases / totalCases',
        path: ['summary', 'passRate'],
      });
    }
  });

export type LabelAlignmentRecallReason = z.infer<typeof labelAlignmentRecallReasonSchema>;
export type LabelAlignmentCatalogSeedEntry = z.infer<typeof labelAlignmentCatalogSeedEntrySchema>;
export type LabelAlignmentGoldenAnnotation = z.infer<typeof labelAlignmentGoldenAnnotationSchema>;
export type LabelAlignmentExpectedAlignment = z.infer<typeof labelAlignmentExpectedAlignmentSchema>;
export type LabelAlignmentEvalCase = z.infer<typeof labelAlignmentEvalCaseSchema>;
export type LabelAlignmentEvalFixture = z.infer<typeof labelAlignmentEvalFixtureSchema>;
export type LabelAlignmentEvalReportMeta = z.infer<typeof labelAlignmentEvalReportMetaSchema>;
export type LabelAlignmentEvalCaseResult = z.infer<typeof labelAlignmentEvalCaseResultSchema>;
export type LabelAlignmentEvalReport = z.infer<typeof labelAlignmentEvalReportSchema>;

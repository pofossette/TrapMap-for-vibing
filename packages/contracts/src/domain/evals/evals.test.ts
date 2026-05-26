import { describe, expect, it } from 'vitest';

import {
  baselineReportSchema,
  retrievalEvalReportMetaSchema,
  retrievalEvalReportSchema,
  retrievalEvalSliceSummarySchema,
  retrievalEvalWarningRecordSchema,
  summaryEvalCaseResultSchema,
  summaryEvalClaimResultSchema,
  summaryEvalFailureRecordSchema,
  summaryEvalReportMetaSchema,
  summaryEvalReportSchema,
} from './report.js';
import { retrievalEvalGovernanceExpectationsSchema } from './retrieval.js';

// Helper for a valid timestamp with offset
const ts = '2026-05-26T12:00:00+00:00';

describe('evals schema fixes', () => {
  // Bug 1: retrievalEvalGovernanceExpectationsSchema — forbiddenIds and forbiddenReasons arrays must have equal length
  describe('retrievalEvalGovernanceExpectationsSchema equal-length arrays', () => {
    it('accepts equal-length arrays', () => {
      const result = retrievalEvalGovernanceExpectationsSchema.parse({
        forbiddenIds: ['id-1', 'id-2'],
        forbiddenReasons: ['cross-team', 'security-level'],
      });
      expect(result.forbiddenIds).toHaveLength(2);
    });

    it('accepts both empty arrays', () => {
      const result = retrievalEvalGovernanceExpectationsSchema.parse({
        forbiddenIds: [],
        forbiddenReasons: [],
      });
      expect(result.forbiddenIds).toHaveLength(0);
    });

    it('rejects unequal-length arrays (more ids)', () => {
      expect(() =>
        retrievalEvalGovernanceExpectationsSchema.parse({
          forbiddenIds: ['id-1', 'id-2'],
          forbiddenReasons: ['cross-team'],
        }),
      ).toThrow();
    });

    it('rejects unequal-length arrays (more reasons)', () => {
      expect(() =>
        retrievalEvalGovernanceExpectationsSchema.parse({
          forbiddenIds: ['id-1'],
          forbiddenReasons: ['cross-team', 'security-level'],
        }),
      ).toThrow();
    });
  });

  // Bug 2: summaryEvalReportMetaSchema — datetime with offset
  describe('summaryEvalReportMetaSchema datetime offset', () => {
    const base = {
      schemaVersion: 1 as const,
      durationMs: 100,
      llmProvider: 'openai' as const,
      options: {
        tier: 'smoke' as const,
        dryRun: false,
        allowEmpty: false,
        verbose: 0,
      },
    };

    it('accepts ISO datetime with timezone offset', () => {
      const result = summaryEvalReportMetaSchema.parse({
        ...base,
        timestamp: '2026-05-26T12:00:00+05:30',
      });
      expect(result.timestamp).toContain('+');
    });

    it('rejects bare ISO datetime without timezone designator', () => {
      expect(() =>
        summaryEvalReportMetaSchema.parse({
          ...base,
          timestamp: '2026-05-26T12:00:00',
        }),
      ).toThrow();
    });
  });

  // Bug 3: retrievalEvalReportMetaSchema — datetime with offset
  describe('retrievalEvalReportMetaSchema datetime offset', () => {
    const base = {
      schemaVersion: 1 as const,
      durationMs: 100,
      options: {
        tier: 'smoke' as const,
        dryRun: false,
        allowEmpty: false,
        verbose: 0,
      },
    };

    it('accepts ISO datetime with timezone offset', () => {
      const result = retrievalEvalReportMetaSchema.parse({
        ...base,
        timestamp: '2026-05-26T12:00:00+02:00',
      });
      expect(result.timestamp).toContain('+');
    });

    it('rejects bare ISO datetime without timezone designator', () => {
      expect(() =>
        retrievalEvalReportMetaSchema.parse({
          ...base,
          timestamp: '2026-05-26T12:00:00',
        }),
      ).toThrow();
    });
  });

  // Bug 4: baselineReportSchema — passRate must equal passedCases/totalCases
  describe('baselineReportSchema passRate relationship', () => {
    const base = {
      schemaVersion: 1 as const,
      timestamp: '2026-05-26T12:00:00Z',
      tier: 'core' as const,
      slices: [],
      governanceFailures: [],
      durationMs: 1000,
    };

    it('accepts correct passRate', () => {
      const result = baselineReportSchema.parse({
        ...base,
        totalCases: 10,
        passedCases: 7,
        passRate: 0.7,
      });
      expect(result.passRate).toBe(0.7);
    });

    it('accepts passRate 0 when totalCases is 0', () => {
      const result = baselineReportSchema.parse({
        ...base,
        totalCases: 0,
        passedCases: 0,
        passRate: 0,
      });
      expect(result.passRate).toBe(0);
    });

    it('rejects incorrect passRate', () => {
      expect(() =>
        baselineReportSchema.parse({
          ...base,
          totalCases: 10,
          passedCases: 7,
          passRate: 0.5,
        }),
      ).toThrow();
    });

    it('rejects non-zero passRate when totalCases is 0', () => {
      expect(() =>
        baselineReportSchema.parse({
          ...base,
          totalCases: 0,
          passedCases: 0,
          passRate: 0.5,
        }),
      ).toThrow();
    });
  });

  // Bug 5: summaryEvalReportSchema — passRate must equal passedCases/totalCases
  describe('summaryEvalReportSchema passRate relationship', () => {
    const validMeta = {
      schemaVersion: 1 as const,
      timestamp: ts,
      durationMs: 100,
      llmProvider: 'openai' as const,
      options: {
        tier: 'smoke' as const,
        dryRun: false,
        allowEmpty: false,
        verbose: 0,
      },
    };

    const validCaseResult = {
      caseId: 'c1',
      endpoint: '/v1/retrieval/search' as const,
      tier: 'smoke' as const,
      passed: true,
      groundednessScore: 0.9,
      coverageScore: 0.8,
      claimsTotal: 5,
      claimsSupported: 4,
      requiredFactsCovered: [],
      requiredFactsMissing: [],
      forbiddenClaimsFound: [],
      durationMs: 50,
    };

    it('accepts correct passRate', () => {
      const result = summaryEvalReportSchema.parse({
        meta: validMeta,
        summary: {
          totalCases: 4,
          passedCases: 3,
          failedCases: 1,
          passRate: 0.75,
          passed: false,
          avgGroundedness: 0.9,
          avgCoverage: 0.8,
          forbiddenClaimHits: 0,
        },
        cases: [validCaseResult],
        failures: [],
      });
      expect(result.summary.passRate).toBe(0.75);
    });

    it('rejects incorrect passRate', () => {
      expect(() =>
        summaryEvalReportSchema.parse({
          meta: validMeta,
          summary: {
            totalCases: 4,
            passedCases: 3,
            failedCases: 1,
            passRate: 0.5,
            passed: false,
            avgGroundedness: 0.9,
            avgCoverage: 0.8,
            forbiddenClaimHits: 0,
          },
          cases: [validCaseResult],
          failures: [],
        }),
      ).toThrow();
    });
  });

  // Bug 6: retrievalEvalReportSchema — cases.length === totalCases, failures.length === failedCases
  describe('retrievalEvalReportSchema count validations', () => {
    const validMeta = {
      schemaVersion: 1 as const,
      timestamp: ts,
      durationMs: 100,
      options: {
        tier: 'smoke' as const,
        dryRun: false,
        allowEmpty: false,
        verbose: 0,
      },
    };

    const validCaseSummary = {
      caseId: 'c1',
      endpoint: '/v1/retrieval/search' as const,
      tier: 'smoke' as const,
      passed: true,
      outcomeMatch: true,
      governancePassed: true,
      durationMs: 50,
      hitAt1: 1,
      hitAt5: 1,
      hitAt10: 1,
      mrr: 1,
      ndcg: 1,
      recallAt10: 1,
    };

    const validFailure = {
      caseId: 'f1',
      kind: 'forbidden-hit' as const,
      description: 'unexpected forbidden hit',
      ids: ['id-1'],
      endpoint: '/v1/retrieval/search' as const,
      tier: 'smoke' as const,
    };

    const _validWarning = {
      caseId: 'w1',
      code: 'W001',
      message: 'minor warning',
      degraded: false,
    };

    it('accepts when cases.length === totalCases and failures.length === failedCases', () => {
      const result = retrievalEvalReportSchema.parse({
        meta: validMeta,
        summary: {
          totalCases: 1,
          passedCases: 0,
          failedCases: 1,
          passRate: 0,
          passed: false,
        },
        slices: [],
        cases: [validCaseSummary],
        failures: [validFailure],
        warnings: [],
      });
      expect(result.cases).toHaveLength(1);
    });

    it('rejects when cases.length !== totalCases', () => {
      expect(() =>
        retrievalEvalReportSchema.parse({
          meta: validMeta,
          summary: {
            totalCases: 2,
            passedCases: 2,
            failedCases: 0,
            passRate: 1,
            passed: true,
          },
          slices: [],
          cases: [validCaseSummary],
          failures: [],
          warnings: [],
        }),
      ).toThrow();
    });

    it('allows failures.length >= failedCases (one case may produce multiple failures)', () => {
      expect(() =>
        retrievalEvalReportSchema.parse({
          meta: validMeta,
          summary: {
            totalCases: 2,
            passedCases: 1,
            failedCases: 1,
            passRate: 0.5,
            passed: false,
          },
          slices: [],
          cases: [validCaseSummary, { ...validCaseSummary, caseId: 'c2' }],
          failures: [validFailure, { ...validFailure, caseId: 'f2' }],
          warnings: [],
        }),
      ).not.toThrow();
    });

    it('rejects when failures.length < failedCases', () => {
      expect(() =>
        retrievalEvalReportSchema.parse({
          meta: validMeta,
          summary: {
            totalCases: 3,
            passedCases: 1,
            failedCases: 2,
            passRate: 1 / 3,
            passed: false,
          },
          slices: [],
          cases: [
            validCaseSummary,
            { ...validCaseSummary, caseId: 'c2' },
            { ...validCaseSummary, caseId: 'c3' },
          ],
          failures: [validFailure],
          warnings: [],
        }),
      ).toThrow();
    });
  });

  // Bug 7: retrievalEvalSliceSummarySchema — passedCount must be <= caseCount
  describe('retrievalEvalSliceSummarySchema passedCount <= caseCount', () => {
    const base = {
      slice: {
        tier: 'smoke' as const,
        endpoint: '/v1/retrieval/search' as const,
      },
      caseCount: 5,
      failedCount: 2,
      passRate: 0.6,
      avgHitAt1: 0.8,
      avgHitAt5: 0.9,
      avgHitAt10: 0.95,
      avgMrr: 0.85,
      avgNdcg: 0.88,
      avgRecallAt10: 0.92,
      governanceFailureCount: 0,
      outcomeMismatchCount: 0,
      executionIssueCount: 0,
    };

    it('accepts passedCount <= caseCount', () => {
      const result = retrievalEvalSliceSummarySchema.parse({
        ...base,
        passedCount: 3,
      });
      expect(result.passedCount).toBe(3);
    });

    it('accepts passedCount equal to caseCount', () => {
      const result = retrievalEvalSliceSummarySchema.parse({
        ...base,
        passedCount: 5,
      });
      expect(result.passedCount).toBe(5);
    });

    it('rejects passedCount > caseCount', () => {
      expect(() =>
        retrievalEvalSliceSummarySchema.parse({
          ...base,
          passedCount: 6,
        }),
      ).toThrow();
    });
  });

  // Bug 8: summaryEvalClaimResultSchema — text field needs .min(1)
  describe('summaryEvalClaimResultSchema text min(1)', () => {
    it('accepts non-empty text', () => {
      const result = summaryEvalClaimResultSchema.parse({
        text: 'valid claim',
        supported: true,
      });
      expect(result.text).toBe('valid claim');
    });

    it('rejects empty text', () => {
      expect(() =>
        summaryEvalClaimResultSchema.parse({
          text: '',
          supported: true,
        }),
      ).toThrow();
    });
  });

  // Bug 9: retrievalEvalWarningRecordSchema — add .strict()
  describe('retrievalEvalWarningRecordSchema strict()', () => {
    it('accepts valid object without extra keys', () => {
      const result = retrievalEvalWarningRecordSchema.parse({
        caseId: 'c1',
        code: 'W001',
        message: 'warning message',
        degraded: false,
      });
      expect(result.caseId).toBe('c1');
    });

    it('rejects object with extra keys', () => {
      expect(() =>
        retrievalEvalWarningRecordSchema.parse({
          caseId: 'c1',
          code: 'W001',
          message: 'warning message',
          degraded: false,
          extraField: 'should fail',
        }),
      ).toThrow();
    });
  });

  // Bug 10: summaryEvalCaseResultSchema — add .strict()
  describe('summaryEvalCaseResultSchema strict()', () => {
    const validCaseResult = {
      caseId: 'c1',
      endpoint: '/v1/retrieval/search' as const,
      tier: 'smoke' as const,
      passed: true,
      groundednessScore: 0.9,
      coverageScore: 0.8,
      claimsTotal: 5,
      claimsSupported: 4,
      requiredFactsCovered: [],
      requiredFactsMissing: [],
      forbiddenClaimsFound: [],
      durationMs: 50,
    };

    it('accepts valid object without extra keys', () => {
      const result = summaryEvalCaseResultSchema.parse(validCaseResult);
      expect(result.caseId).toBe('c1');
    });

    it('rejects object with extra keys', () => {
      expect(() =>
        summaryEvalCaseResultSchema.parse({
          ...validCaseResult,
          extraField: 'should fail',
        }),
      ).toThrow();
    });
  });

  // Bug 11: summaryEvalFailureRecordSchema — caseId validated as non-empty string
  describe('summaryEvalFailureRecordSchema caseId non-empty', () => {
    it('accepts non-empty caseId', () => {
      const result = summaryEvalFailureRecordSchema.parse({
        caseId: 'c1',
        kind: 'groundedness-below-threshold',
        description: 'low groundedness',
      });
      expect(result.caseId).toBe('c1');
    });

    it('rejects empty caseId', () => {
      expect(() =>
        summaryEvalFailureRecordSchema.parse({
          caseId: '',
          kind: 'groundedness-below-threshold',
          description: 'low groundedness',
        }),
      ).toThrow();
    });
  });
});

import { describe, expect, it } from 'vitest';

import {
  labelAlignmentEvalCaseSchema,
  labelAlignmentEvalFixtureSchema,
  labelAlignmentEvalReportSchema,
} from './label-alignment.js';

const timestamp = '2026-06-30T12:00:00+00:00';

describe('label alignment eval schemas', () => {
  it('accepts a valid eval fixture with smoke cases', () => {
    const fixture = labelAlignmentEvalFixtureSchema.parse({
      schemaVersion: 1,
      fixtureId: 'fixture-timeout',
      skillId: 'skill/react-hooks-trap',
      description: 'Smoke fixture for timeout labeling drift',
      tags: ['smoke', 'timeout'],
      cases: [
        {
          schemaVersion: 1,
          caseId: 'timeout-catalog-populated',
          skillId: 'skill/react-hooks-trap',
          variantId: 'catalog-populated',
          variantGroupId: 'timeout-synonyms',
          tier: 'smoke',
          synonymGroupCount: 2,
          totalRawLabels: 3,
          totalCanonicalLabels: 3,
          catalogSeed: 'catalog-populated',
          embeddingEnabled: true,
          goldenAnnotations: [
            {
              rawLabel: 'stale closure',
              canonicalLabel: 'react-stale-closure',
              groupId: 'g-1',
              shouldMerge: true,
            },
            {
              rawLabel: 'stale state bug',
              canonicalLabel: 'react-stale-closure',
              groupId: 'g-1',
              shouldMerge: true,
            },
            {
              rawLabel: 'render loop',
              canonicalLabel: 'react-render-loop',
              groupId: 'g-2',
              shouldMerge: false,
            },
          ],
          expectedAlignment: {
            canonicalGroups: [['stale closure', 'stale state bug'], ['render loop']],
            shouldNotMerge: [['stale closure', 'render loop']],
          },
          tags: ['smoke'],
        },
      ],
    });

    expect(fixture.cases).toHaveLength(1);
    expect(fixture.cases[0]?.expectedAlignment.canonicalGroups).toHaveLength(2);
  });

  it('rejects expected alignments that reference unknown raw labels', () => {
    expect(() =>
      labelAlignmentEvalCaseSchema.parse({
        schemaVersion: 1,
        caseId: 'bad-case',
        skillId: 'skill/react-hooks-trap',
        variantId: 'catalog-empty',
        variantGroupId: 'timeout-synonyms',
        tier: 'smoke',
        synonymGroupCount: 1,
        totalRawLabels: 2,
        totalCanonicalLabels: 1,
        catalogSeed: 'catalog-empty',
        embeddingEnabled: false,
        goldenAnnotations: [
          {
            rawLabel: 'stale closure',
            canonicalLabel: 'react-stale-closure',
            groupId: 'g-1',
            shouldMerge: true,
          },
          {
            rawLabel: 'stale state bug',
            canonicalLabel: 'react-stale-closure',
            groupId: 'g-1',
            shouldMerge: true,
          },
        ],
        expectedAlignment: {
          canonicalGroups: [['stale closure', 'missing-label']],
          shouldNotMerge: [],
        },
        tags: [],
      }),
    ).toThrow(/canonicalGroups/i);
  });

  it('accepts a structured report with alignment metrics', () => {
    const report = labelAlignmentEvalReportSchema.parse({
      meta: {
        schemaVersion: 1,
        timestamp,
        durationMs: 42,
        mode: 'dry-run',
        options: {
          tier: 'smoke',
          fixtureIds: ['fixture-timeout'],
        },
      },
      summary: {
        totalCases: 1,
        passedCases: 1,
        failedCases: 0,
        passRate: 1,
        synonymEliminationCount: 1,
        synonymEliminationRate: 0.25,
        missedMerges: 0,
        falseMerges: 0,
        alignmentAccuracy: 1,
        recallReasonDistribution: {
          'exact-alias': 1,
          'normalized-name': 2,
          'semantic-embedding': 0,
          'catalog-empty': 1,
          'live-decision': 0,
        },
      },
      cases: [
        {
          caseId: 'timeout-catalog-populated',
          skillId: 'skill/react-hooks-trap',
          variantId: 'catalog-populated',
          variantGroupId: 'timeout-synonyms',
          tier: 'smoke',
          mode: 'dry-run',
          passed: true,
          durationMs: 12,
          synonymEliminationCount: 1,
          synonymEliminationRate: 0.25,
          missedMerges: 0,
          falseMerges: 0,
          alignmentAccuracy: 1,
          recallReasonDistribution: {
            'exact-alias': 1,
            'normalized-name': 2,
            'semantic-embedding': 0,
            'catalog-empty': 1,
            'live-decision': 0,
          },
          notes: [],
        },
      ],
    });

    expect(report.summary.passRate).toBe(1);
    expect(report.summary.recallReasonDistribution['normalized-name']).toBe(2);
  });
});

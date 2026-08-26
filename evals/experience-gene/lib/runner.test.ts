import { describe, expect, it } from 'vitest';

import { coreCases } from '../datasets/core.js';
import { smokeCases } from '../datasets/smoke.js';
import { evaluateExperienceGeneSuite } from './runner.js';

describe('experience gene evaluation runner', () => {
  it('freezes the required smoke and core dataset sizes', () => {
    expect(smokeCases).toHaveLength(3);
    expect(coreCases).toHaveLength(10);
    expect(new Set(coreCases.map((item) => item.id)).size).toBe(10);
  });

  it('runs every smoke case without exposing an external result in shadow mode', () => {
    const report = evaluateExperienceGeneSuite(smokeCases, 'shadow');

    expect(report.total).toBe(3);
    expect(report.selected).toBe(1);
    expect(report.safetyViolations).toBe(0);
    expect(report.primarySelectionPrecision).toBe(1);
    expect(report.knownPitfallAvoidanceRate).toBe(1);
    expect(report.promotionEligible).toBe(false);
  });

  it('passes the core promotion gates on the frozen deterministic dataset', () => {
    const report = evaluateExperienceGeneSuite(coreCases, 'serve');

    expect(report.total).toBe(10);
    expect(report.failures).toEqual([]);
    expect(report.safetyViolations).toBe(0);
    expect(report.primarySelectionPrecision).toBeGreaterThanOrEqual(0.8);
    expect(report.taskPassRate).toBeGreaterThanOrEqual(report.baselineTaskPassRate - 0.02);
    expect(report.supplementaryAvoidCount).toBeGreaterThan(0);
    expect(report.contextTokenCostRatio).toBeLessThanOrEqual(1.1);
    expect(report.promotionEligible).toBe(true);
  });

  it('fails closed when a forbidden stale Gene is selected', () => {
    const unsafe = [
      {
        ...coreCases[0]!,
        id: 'unsafe-stale',
        genes: coreCases[0]!.genes.map((gene) => ({ ...gene, status: 'stale' as const })),
        candidates: coreCases[0]!.candidates,
      },
    ];

    const report = evaluateExperienceGeneSuite(unsafe, 'serve');
    expect(report.selected).toBe(0);
    expect(report.emptyResults).toBe(1);
  });
});

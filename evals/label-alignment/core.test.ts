import { describe, expect, it } from 'vitest';

import { loadLabelAlignmentFixtures, runLabelAlignmentSuite } from './core.js';

describe('label alignment eval scaffold', () => {
  it('loads and validates smoke fixtures', async () => {
    const fixtures = await loadLabelAlignmentFixtures({ tier: 'smoke' });

    expect(fixtures.length).toBeGreaterThan(0);
    expect(fixtures.every((fixture) => fixture.skillId.length > 0)).toBe(true);
    expect(
      fixtures.every((fixture) =>
        fixture.cases.some((case_) => case_.variantId === 'catalog-empty'),
      ),
    ).toBe(true);
    expect(
      fixtures.every((fixture) =>
        fixture.cases.some((case_) => case_.variantId === 'catalog-populated'),
      ),
    ).toBe(true);
    expect(
      fixtures.some((fixture) =>
        fixture.cases.some(
          (case_) => case_.variantId === 'catalog-populated' && case_.embeddingEnabled,
        ),
      ),
    ).toBe(true);
  });

  it('runs deterministic dry-run evaluation and reports metrics', async () => {
    const report = await runLabelAlignmentSuite({
      tier: 'smoke',
      mode: 'dry-run',
    });

    expect(report.meta.mode).toBe('dry-run');
    expect(report.summary.totalCases).toBeGreaterThan(0);
    expect(report.summary.alignmentAccuracy).toBeGreaterThan(0);
    expect(report.summary.recallReasonDistribution['catalog-empty']).toBeGreaterThan(0);
    expect(report.cases.some((case_) => case_.falseMerges === 0)).toBe(true);
  });

  it('materializes runnable core fixtures instead of silently passing zero cases', async () => {
    const fixtures = await loadLabelAlignmentFixtures({ tier: 'core' });
    const report = await runLabelAlignmentSuite({
      tier: 'core',
      mode: 'dry-run',
    });

    expect(fixtures.length).toBeGreaterThan(0);
    expect(report.summary.totalCases).toBeGreaterThan(0);
    expect(report.cases.every((case_) => case_.tier === 'core')).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';

import { loadLabelAlignmentFixtures, runLabelAlignmentSuite } from './core.js';

describe('label alignment eval scaffold', () => {
  it('loads and validates smoke fixtures', async () => {
    const fixtures = await loadLabelAlignmentFixtures({ tier: 'smoke' });

    expect(fixtures.length).toBeGreaterThan(0);
    expect(fixtures.every((fixture) => fixture.skillId.length > 0)).toBe(true);
    expect(
      fixtures
        .flatMap((fixture) => fixture.cases)
        .some((case_) => case_.variantId === 'catalog-empty'),
    ).toBe(true);
    expect(
      fixtures
        .flatMap((fixture) => fixture.cases)
        .some((case_) => case_.variantId === 'catalog-populated' && case_.embeddingEnabled),
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
});

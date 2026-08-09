import { describe, expect, it } from 'vitest';

import { loadLabelAlignmentFixtures } from './core.js';

describe('label alignment eval scaffold', () => {
  it('loads and validates smoke fixtures', async () => {
    const fixtures = await loadLabelAlignmentFixtures({ tier: 'smoke' });

    expect(fixtures.length).toBeGreaterThan(0);
    // New: at least 3 smoke fixtures
    expect(fixtures.length).toBeGreaterThanOrEqual(3);
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
    expect(
      fixtures.every((fixture) =>
        fixture.cases.some((case_) => case_.variantGroupId === 'catalog-empty'),
      ),
    ).toBe(true);
    expect(
      fixtures.every((fixture) =>
        fixture.cases.some((case_) => case_.variantGroupId === 'catalog-populated'),
      ),
    ).toBe(true);
    expect(
      fixtures.some((fixture) => fixture.cases.some((case_) => case_.tags.includes('exact-alias'))),
    ).toBe(true);
    expect(
      fixtures.some((fixture) =>
        fixture.cases.some((case_) => case_.tags.includes('normalized-name')),
      ),
    ).toBe(true);
    expect(
      fixtures.some((fixture) =>
        fixture.cases.some((case_) => case_.tags.includes('semantic-embedding')),
      ),
    ).toBe(true);
    expect(
      fixtures.some((fixture) =>
        fixture.cases.some((case_) => case_.tags.includes('live-decision')),
      ),
    ).toBe(true);
    expect(
      fixtures.some((fixture) =>
        fixture.cases.some((case_) => case_.tags.includes('should-merge')),
      ),
    ).toBe(true);
    expect(
      fixtures.some((fixture) =>
        fixture.cases.some((case_) => case_.tags.includes('should-not-merge')),
      ),
    ).toBe(true);
    expect(
      fixtures.some((fixture) => fixture.cases.some((case_) => case_.tags.includes('multi-alias'))),
    ).toBe(true);
    expect(
      fixtures.some((fixture) =>
        fixture.cases.some((case_) => case_.tags.includes('near-match-guard')),
      ),
    ).toBe(true);
    // New: toolchain coverage in smoke
    expect(fixtures.some((fixture) => fixture.tags.includes('toolchain'))).toBe(true);
    // New: cicd coverage in smoke
    expect(fixtures.some((fixture) => fixture.tags.includes('cicd'))).toBe(true);
    // New: testing/strategy coverage in smoke
    expect(
      fixtures.some(
        (fixture) => fixture.tags.includes('testing') && fixture.fixtureId.includes('strategy'),
      ),
    ).toBe(true);
  });

  it('runs deterministic dry-run evaluation and reports metrics', async () => {
    const { runSuiteWithPromptfoo } = await import('../promptfoo/runner.js');
    const { labelAlignmentBridge } = await import('./bridge.js');
    const { report } = await runSuiteWithPromptfoo(labelAlignmentBridge, {
      tier: 'smoke',
      dryRun: true,
      allowEmpty: false,
      runner: 'promptfoo',
      mode: 'dry-run',
    });

    expect(report.meta.mode).toBe('dry-run');
    expect(report.summary.totalCases).toBeGreaterThan(0);
    expect(report.summary.alignmentAccuracy).toBeGreaterThan(0);
    expect(report.summary.recallReasonDistribution['catalog-empty']).toBeGreaterThan(0);
    expect(report.summary.recallReasonDistribution['exact-alias']).toBeGreaterThan(0);
    expect(report.summary.recallReasonDistribution['normalized-name']).toBeGreaterThan(0);
    expect(report.summary.recallReasonDistribution['semantic-embedding']).toBeGreaterThan(0);
    expect(report.cases.some((case_) => case_.falseMerges === 0)).toBe(true);
    expect(report.cases.some((case_) => case_.synonymEliminationCount >= 2)).toBe(true);
    expect(report.cases.some((case_) => case_.variantId === 'catalog-empty')).toBe(true);
    expect(report.cases.some((case_) => case_.variantId === 'catalog-populated')).toBe(true);
  });

  it('materializes runnable core fixtures instead of silently passing zero cases', async () => {
    const fixtures = await loadLabelAlignmentFixtures({ tier: 'core' });
    const { runSuiteWithPromptfoo } = await import('../promptfoo/runner.js');
    const { labelAlignmentBridge } = await import('./bridge.js');
    const { report } = await runSuiteWithPromptfoo(labelAlignmentBridge, {
      tier: 'core',
      dryRun: true,
      allowEmpty: false,
      runner: 'promptfoo',
      mode: 'dry-run',
    });

    expect(fixtures.length).toBeGreaterThan(0);
    // New: at least 3 core fixtures
    expect(fixtures.length).toBeGreaterThanOrEqual(3);
    expect(report.summary.totalCases).toBeGreaterThan(0);
    expect(report.cases.every((case_) => case_.tier === 'core')).toBe(true);
    expect(fixtures.every((fixture) => fixture.tags.includes('core'))).toBe(true);
    expect(
      fixtures.some((fixture) =>
        fixture.cases.some(
          (case_) => case_.tags.includes('multi-alias') && case_.tags.includes('near-match-guard'),
        ),
      ),
    ).toBe(true);
    expect(
      fixtures.some((fixture) =>
        fixture.cases.some((case_) => case_.variantGroupId === 'catalog-populated'),
      ),
    ).toBe(true);
    // New: telemetry coverage in core
    expect(fixtures.some((fixture) => fixture.tags.includes('telemetry'))).toBe(true);
    // New: auth coverage in core
    expect(fixtures.some((fixture) => fixture.tags.includes('auth'))).toBe(true);
    // New: containers coverage in core
    expect(fixtures.some((fixture) => fixture.tags.includes('containers'))).toBe(true);
    // New: at least one case with synonymGroupCount >= 3 (dense fixture)
    expect(
      fixtures.some((fixture) => fixture.cases.some((case_) => case_.synonymGroupCount >= 3)),
    ).toBe(true);
    // New: at least one case with a canonicalGroup of >= 4 members
    expect(
      fixtures.some((fixture) =>
        fixture.cases.some((case_) =>
          case_.expectedAlignment.canonicalGroups.some((group) => group.length >= 4),
        ),
      ),
    ).toBe(true);
  });
});

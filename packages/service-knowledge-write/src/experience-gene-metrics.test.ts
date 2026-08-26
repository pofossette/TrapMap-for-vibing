import { describe, expect, it, vi } from 'vitest';

import { createExperienceGeneFixture } from '@trapmap/backend-core/testing/index.js';
import type { ExperienceGeneDerivationTaskPayload } from '@trapmap/contracts';
import { withExperienceGeneDerivationMetrics } from './experience-gene-metrics.js';

const gene = createExperienceGeneFixture();

function metrics() {
  return {
    recordDerivation: vi.fn(),
    recordValidationRejection: vi.fn(),
    recordSolidified: vi.fn(),
    recordStale: vi.fn(),
    recordSearch: vi.fn(),
    recordPrimarySelected: vi.fn(),
    recordEmptyResult: vi.fn(),
  };
}

function request(sourceKind: 'trap' | 'skill-artifact'): ExperienceGeneDerivationTaskPayload {
  return {
    requestId: 'request-1',
    source: {
      kind: sourceKind,
      sourceId: 'raw-source-id',
      sourceRevision: 3,
      sourceHash: 'a'.repeat(64),
      artifactId: sourceKind === 'skill-artifact' ? 'artifact' : null,
      capsuleId: null,
      artifactRevision: sourceKind === 'skill-artifact' ? 1 : null,
    },
    derivationUnitId: 'unit',
    generatorKind: sourceKind === 'trap' ? 'rule' : 'llm',
    promptVersion: 'experience-gene-rule-v1',
    snapshotHash: 'b'.repeat(64),
  };
}

describe('experience gene derivation metric wrapper', () => {
  it('records a solidified rule candidate without raw identifiers', async () => {
    const recorder = metrics();
    const solidifiedGene = {
      ...gene,
      generator: { ...gene.generator, kind: 'rule' as const },
    };
    const wrapped = withExperienceGeneDerivationMetrics(
      async () => ({
        status: 'solidified' as const,
        gene: solidifiedGene,
      }),
      { metrics: recorder, mode: 'shadow' },
    );

    await wrapped(request('trap'));

    expect(recorder.recordDerivation).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'shadow',
        sourceKind: 'trap',
        generator: 'rule',
        outcome: 'solidified',
      }),
    );
    expect(recorder.recordSolidified).toHaveBeenCalledWith({ mode: 'shadow', sourceKind: 'trap' });
    expect(JSON.stringify(recorder.recordDerivation.mock.calls)).not.toContain('raw-source-id');
  });

  it('records gate rejections by redacted reason class', async () => {
    const recorder = metrics();
    const wrapped = withExperienceGeneDerivationMetrics(
      async () => ({ status: 'rejected' as const, reasonClass: 'source-fidelity-low' }),
      { metrics: recorder, mode: 'serve' },
    );

    await wrapped(request('skill-artifact'));

    expect(recorder.recordDerivation).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'rejected',
        reasonClass: 'source-fidelity-low',
        generator: 'llm',
      }),
    );
    expect(recorder.recordValidationRejection).toHaveBeenCalledWith({
      mode: 'serve',
      gate: 'source-fidelity-low',
    });
  });
});

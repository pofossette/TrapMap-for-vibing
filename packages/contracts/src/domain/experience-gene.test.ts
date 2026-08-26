import { describe, expect, it } from 'vitest';

import { createExperienceGeneFixture } from './experience-gene-fixtures.js';
import {
  buildExperienceGeneContentProjection,
  experienceGeneModeSchema,
  experienceGeneSchema,
} from './experience-gene.js';

describe('experience gene contract', () => {
  it('accepts a bounded candidate Gene and defaults optional control arrays', () => {
    const gene = createExperienceGeneFixture();

    expect(gene.constraints).toEqual([]);
    expect(gene.validation).toEqual([]);
    expect(experienceGeneModeSchema.parse('off')).toBe('off');
  });

  it('rejects unknown fields and unbounded control arrays', () => {
    const gene = createExperienceGeneFixture();
    expect(() => experienceGeneSchema.parse({ ...gene, extra: true })).toThrow();
    expect(() =>
      experienceGeneSchema.parse({ ...gene, strategy: Array.from({ length: 8 }, () => 'x') }),
    ).toThrow();
  });

  it('enforces artifact provenance by source kind', () => {
    const gene = createExperienceGeneFixture();

    expect(() =>
      experienceGeneSchema.parse({
        ...gene,
        source: { ...gene.source, kind: 'skill-capsule' },
      }),
    ).toThrow();
    expect(
      experienceGeneSchema.parse({
        ...gene,
        source: {
          kind: 'skill-capsule',
          sourceId: 'skill-capsule:artifact-1:2:capsule-1',
          sourceRevision: 2,
          sourceHash: 'c'.repeat(64),
          artifactId: 'artifact-1',
          capsuleId: 'capsule-1',
          artifactRevision: 2,
        },
      }).source.capsuleId,
    ).toBe('capsule-1');
  });

  it('projects exactly the fields that participate in content identity', () => {
    const projection = buildExperienceGeneContentProjection(createExperienceGeneFixture());

    expect(Object.keys(projection).sort()).toEqual(
      [
        'schemaVersion',
        'title',
        'signalsMatch',
        'summary',
        'strategy',
        'avoid',
        'constraints',
        'validation',
        'labels',
        'scope',
        'teamId',
        'requiredLevel',
        'source',
        'derivationUnitId',
        'generator',
      ].sort(),
    );
  });
});

import { buildExperienceGeneContentProjection } from '@trapmap/contracts';
import { describe, expect, it } from 'vitest';
import {
  createExperienceGeneContentHash,
  createExperienceGeneIdempotencyKey,
  createExperienceGeneIdempotencyKeyFromGene,
} from '../../../src/knowledge-write/domain/experience-gene-hashing.js';
import { createExperienceGeneFixture } from '../../../src/testing/experience-gene-fixtures.js';

describe('experience gene hashing', () => {
  it('projects only governance-stable content fields', () => {
    const gene = createExperienceGeneFixture();
    const projection = buildExperienceGeneContentProjection(gene);

    expect(Object.keys(projection)).toEqual([
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
    ]);
    expect(projection).not.toHaveProperty('geneId');
    expect(projection).not.toHaveProperty('status');
  });

  it('computes content hash independently of key insertion order', () => {
    const gene = createExperienceGeneFixture();
    const reordered = {
      ...gene,
      generator: gene.generator,
      lineage: gene.lineage,
      source: gene.source,
    };

    expect(createExperienceGeneContentHash(reordered)).toBe(createExperienceGeneContentHash(gene));
    expect(createExperienceGeneContentHash(gene)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('builds task idempotency keys from canonical task provenance', () => {
    const gene = createExperienceGeneFixture();
    const left = createExperienceGeneIdempotencyKeyFromGene(gene);
    const right = createExperienceGeneIdempotencyKey({
      contentHash: gene.contentHash,
      promptVersion: gene.generator.promptVersion,
      generatorKind: gene.generator.kind,
      derivationUnitId: gene.lineage.derivationUnitId,
      sourceHash: gene.source.sourceHash,
      sourceRevision: gene.source.sourceRevision,
      sourceId: gene.source.sourceId,
      sourceType: gene.source.kind,
    });

    expect(left).toBe(right);
    expect(left).toMatch(/^[0-9a-f]{64}$/);
  });
});

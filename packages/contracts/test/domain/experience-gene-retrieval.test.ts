import { describe, expect, it } from 'vitest';

import { createExperienceGeneFixture } from '../../src/domain/experience-gene-fixtures.js';
import * as geneRetrieval from '../../src/domain/experience-gene-retrieval.js';

const gene = createExperienceGeneFixture();

describe('experience gene retrieval contracts', () => {
  it('applies bounded search defaults', () => {
    const query = geneRetrieval.geneSearchQuerySchema.parse({ seed: 'queue retry storm' });

    expect(query).toEqual({
      seed: 'queue retry storm',
      filters: { labels: [], scopes: [] },
      maxResults: 1,
      includeActivationHints: false,
    });
    expect(() =>
      geneRetrieval.geneSearchQuerySchema.parse({
        ...query,
        maxResults: 6,
      }),
    ).toThrow();
  });

  it('projects the authorized public Gene fields only', () => {
    const gene = createExperienceGeneFixture();
    const projection = geneRetrieval.experienceGenePublicSchema.parse(gene);

    expect(projection).toMatchObject({
      geneId: gene.geneId,
      title: gene.title,
      strategy: gene.strategy,
    });
    expect(Object.keys(projection)).toEqual([
      'geneId',
      'schemaVersion',
      'status',
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
      'updatedAt',
    ]);
  });

  it('parses a primary match with a distinct-source avoid warning', () => {
    const other = {
      ...gene,
      geneId: 'gene_otherwise_1234567890',
      source: { ...gene.source, kind: 'skill-artifact', sourceId: 'artifact-1:unit' },
    };
    const response = geneRetrieval.geneSearchResponseSchema.parse({
      primaryGene: {
        gene,
        score: 0.92,
        reason: 'Exact signal and strategy overlap',
        sourceCitation: gene.source,
        warnings: ['Validation is stale'],
      },
      supplementaryAvoid: [
        {
          geneId: other.geneId,
          title: other.title,
          avoidCue: other.avoid[0],
          reason: 'Distinct approved source reports the same failure mode',
          score: 0.81,
          sourceCitation: other.source,
        },
      ],
      routingTrace: {
        selectedMode: 'local',
        routeFamily: 'entry',
        routingReason: 'fallback-default',
        channelsUsed: ['keyword', 'semantic'],
      },
    });

    expect(response.primaryGene?.gene.geneId).toBe(gene.geneId);
    expect(response.supplementaryAvoid).toHaveLength(1);
  });

  it('creates a canonical disabled envelope without fabricating a hit', () => {
    const response = geneRetrieval.disabledExperienceGeneSearchResponse();

    expect(response).toEqual({
      primaryGene: null,
      supplementaryAvoid: [],
      routingTrace: {
        selectedMode: 'naive',
        routeFamily: 'entry',
        routingReason: 'fallback-default',
        fallbackApplied: true,
        channelsUsed: [],
        fallbackTarget: null,
        confidenceScore: 0,
        confidenceBucket: 'low',
      },
    });
    expect(geneRetrieval.geneSearchResponseSchema.parse(response)).toEqual(response);
  });
});

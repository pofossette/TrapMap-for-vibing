import { getTableColumns } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import {
  experienceGeneEmbeddings,
  experienceGeneEvents,
  experienceGeneSearchDocuments,
  experienceGenes,
} from '../src/experience-genes.js';

describe('experience gene persistence schema', () => {
  it('models the complete Gene aggregate projection', () => {
    expect(Object.keys(getTableColumns(experienceGenes))).toEqual([
      'id',
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
      'sourceType',
      'sourceId',
      'sourceRevision',
      'sourceHash',
      'artifactId',
      'capsuleId',
      'artifactRevision',
      'derivationUnitId',
      'idempotencyKey',
      'contentHash',
      'parentEventId',
      'priorGeneHash',
      'generatorKind',
      'generatorModel',
      'promptVersion',
      'indexStatus',
      'indexLastError',
      'createdAt',
      'updatedAt',
    ]);
  });

  it('models immutable events and derived retrieval projections', () => {
    expect(Object.keys(getTableColumns(experienceGeneEvents))).toEqual([
      'id',
      'geneId',
      'type',
      'sourceType',
      'sourceId',
      'sourceRevision',
      'sourceHash',
      'actorKind',
      'actorId',
      'validatorSummary',
      'reasonClass',
      'payloadSnapshotHash',
      'payload',
      'createdAt',
    ]);
    expect(Object.keys(getTableColumns(experienceGeneEmbeddings))).toEqual([
      'geneId',
      'contentHash',
      'embedding',
      'embeddingModelVersion',
      'status',
      'lastError',
      'updatedAt',
    ]);
    expect(Object.keys(getTableColumns(experienceGeneSearchDocuments))).toEqual([
      'geneId',
      'contentHash',
      'document',
      'labels',
      'status',
      'lastError',
      'updatedAt',
    ]);
  });
});

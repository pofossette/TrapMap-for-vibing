import { experienceGeneSchema } from './experience-gene.js';

export function createExperienceGeneFixture() {
  return experienceGeneSchema.parse({
    geneId: 'gene-1',
    schemaVersion: '1',
    status: 'candidate',
    title: 'Bound retry fan-out at the queue boundary',
    signalsMatch: ['queue retries grow without a dead-letter signal'],
    summary: 'Cap retry concurrency before publishing and require one ownership token.',
    strategy: ['Claim the queue lease before side effects', 'Fail closed when the lease is lost'],
    avoid: ['Retry publishes directly from the request handler'],
    constraints: [],
    validation: [],
    labels: ['queue'],
    scope: 'project',
    teamId: null,
    requiredLevel: 2,
    source: {
      kind: 'trap',
      sourceId: 'trap-1',
      sourceRevision: 3,
      sourceHash: 'a'.repeat(64),
      artifactId: null,
      capsuleId: null,
      artifactRevision: null,
    },
    lineage: {
      derivationUnitId: 'trap:trap-1:v3',
      parentEventId: null,
      promptVersion: 'gene-v1',
      priorGeneHash: null,
    },
    generator: { kind: 'rule', model: null, promptVersion: 'gene-v1' },
    indexing: { status: 'pending', lastError: null, updatedAt: '2026-08-25T00:00:00.000Z' },
    contentHash: 'b'.repeat(64),
    createdAt: '2026-08-25T00:00:00.000Z',
    updatedAt: '2026-08-25T00:00:00.000Z',
  });
}

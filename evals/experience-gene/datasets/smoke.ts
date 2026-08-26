import { createEvaluationGene } from '../lib/gene-factory.js';
import type { ExperienceGeneEvalCase } from '../types.js';

const trap = createEvaluationGene('gene-smoke-trap', {
  sourceKind: 'trap',
  sourceId: 'trap-smoke',
  title: 'Bound queue retry fan-out',
  signalsMatch: ['queue retries grow without a dead-letter signal'],
  summary: 'Cap retry concurrency before publishing.',
  strategy: ['Claim one queue lease before publish'],
  avoid: ['Publish directly from every retry'],
});

const staleArtifact = createEvaluationGene('gene-smoke-stale-artifact', {
  sourceKind: 'skill-artifact',
  sourceId: 'artifact-smoke:skill-md:v1',
  title: 'Legacy migration rollback',
  signalsMatch: ['database migration fails midway'],
  summary: 'Use a legacy destructive rollback.',
  strategy: ['Drop the partially migrated tables'],
  avoid: ['Run destructive rollback during traffic'],
  status: 'stale',
});

function candidate(geneId: string, semanticScore: number) {
  return {
    geneId,
    semanticScore,
    keywordScore: semanticScore * 0.5,
    exactSignalMatch: true,
    errorTextMatch: true,
    boundaryMatch: true,
    freshValidation: true,
  };
}

export const smokeCases: ExperienceGeneEvalCase[] = [
  {
    id: 'gene-smoke-trap-positive',
    tier: 'smoke',
    seed: 'queue retries grow without a dead-letter signal',
    context: { teamId: null, maxRequiredLevel: 2 },
    genes: [trap],
    candidates: [candidate(trap.geneId, 0.9)],
    expectedGeneId: trap.geneId,
    knownAvoidCue: trap.avoid[0]!,
    forbiddenGeneIds: [],
  },
  {
    id: 'gene-smoke-forbidden-stale',
    tier: 'smoke',
    seed: 'database migration fails midway',
    context: { teamId: null, maxRequiredLevel: 2 },
    genes: [staleArtifact],
    candidates: [candidate(staleArtifact.geneId, 0.95)],
    expectedGeneId: '__none__',
    knownAvoidCue: staleArtifact.avoid[0]!,
    forbiddenGeneIds: [staleArtifact.geneId],
  },
  {
    id: 'gene-smoke-empty-capsule',
    tier: 'smoke',
    seed: 'unrelated quantum compiler scheduling fault',
    context: { teamId: 'team-eval', maxRequiredLevel: 1 },
    genes: [trap],
    candidates: [],
    expectedGeneId: '__none__',
    knownAvoidCue: '',
    forbiddenGeneIds: [trap.geneId],
  },
];

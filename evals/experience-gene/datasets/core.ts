import { createEvaluationGene } from '../lib/gene-factory.js';
import type { ExperienceGeneCandidateView, ExperienceGeneEvalCase } from '../types.js';

function gene(
  id: string,
  sourceKind: 'trap' | 'skill-artifact' | 'skill-capsule',
  sourceId: string,
  title: string,
  generatorKind: 'rule' | 'llm' = 'rule',
) {
  return createEvaluationGene(id, {
    sourceKind,
    sourceId,
    title,
    signalsMatch: [title.toLowerCase()],
    summary: `${title}: apply the bounded control sequence.`,
    strategy: [`Apply the ${title} control sequence`],
    avoid: [`Do not bypass the ${title} boundary`],
    labels: [sourceKind.replace(/^skill-/, '')],
    generatorKind,
  });
}

function candidate(
  geneId: string,
  semanticScore: number,
  overrides: Partial<ExperienceGeneCandidateView> = {},
): ExperienceGeneCandidateView {
  return {
    geneId,
    semanticScore,
    keywordScore: Math.min(1, semanticScore * 0.6),
    exactSignalMatch: true,
    errorTextMatch: true,
    boundaryMatch: true,
    freshValidation: true,
    ...overrides,
  };
}

const database = gene(
  'gene-core-database',
  'trap',
  'trap-database-timeout',
  'Database connection timeout under load',
);
const deploy = gene(
  'gene-core-deploy-artifact',
  'skill-artifact',
  'artifact-deploy:skill-md:v1',
  'Deployment health gate ordering',
);
const cache = gene(
  'gene-core-cache-capsule',
  'skill-capsule',
  'capsule-cache-invalidation',
  'Cache invalidation after writes',
);
const llm = gene(
  'gene-core-llm-migration',
  'trap',
  'trap-schema-migration-lock',
  'Avoid long schema migration locks',
  'llm',
);
const stale = gene(
  'gene-core-stale-auth',
  'trap',
  'trap-auth-token-replay',
  'Token replay containment',
);
const deprecated = gene(
  'gene-core-deprecated-search',
  'skill-artifact',
  'artifact-search:skill-md:v1',
  'Deprecated search fallback',
);
stale.status = 'stale';
deprecated.status = 'deprecated';

export const coreCases: ExperienceGeneEvalCase[] = [
  {
    id: 'gene-core-database-selection',
    tier: 'core',
    seed: database.signalsMatch[0]!,
    context: { teamId: null, maxRequiredLevel: 2 },
    genes: [database, stale],
    candidates: [candidate(database.geneId, 0.92), candidate(stale.geneId, 0.94)],
    expectedGeneId: database.geneId,
    knownAvoidCue: database.avoid[0]!,
    forbiddenGeneIds: [stale.geneId],
  },
  {
    id: 'gene-core-deploy-selection',
    tier: 'core',
    seed: deploy.signalsMatch[0]!,
    context: { teamId: 'team-platform', maxRequiredLevel: 3 },
    genes: [deploy, deprecated],
    candidates: [
      candidate(deploy.geneId, 0.88),
      candidate(deprecated.geneId, 0.93),
      candidate(deploy.geneId, 0.9),
    ],
    expectedGeneId: deploy.geneId,
    knownAvoidCue: deploy.avoid[0]!,
    forbiddenGeneIds: [deprecated.geneId],
  },
  {
    id: 'gene-core-capsule-selection',
    tier: 'core',
    seed: cache.signalsMatch[0]!,
    context: { teamId: null, maxRequiredLevel: 1 },
    genes: [cache, database],
    candidates: [candidate(cache.geneId, 0.86), candidate(database.geneId, 0.7)],
    expectedGeneId: cache.geneId,
    knownAvoidCue: cache.avoid[0]!,
    forbiddenGeneIds: [],
  },
  {
    id: 'gene-core-llm-generator',
    tier: 'core',
    seed: llm.signalsMatch[0]!,
    context: { teamId: null, maxRequiredLevel: 2 },
    genes: [llm, deploy],
    candidates: [candidate(llm.geneId, 0.91), candidate(deploy.geneId, 0.55)],
    expectedGeneId: llm.geneId,
    knownAvoidCue: llm.avoid[0]!,
    forbiddenGeneIds: [],
  },
  {
    id: 'gene-core-governance-team',
    tier: 'core',
    seed: deploy.signalsMatch[0]!,
    context: { teamId: 'team-platform', maxRequiredLevel: 3 },
    genes: [deploy],
    candidates: [candidate(deploy.geneId, 0.87)],
    expectedGeneId: deploy.geneId,
    knownAvoidCue: deploy.avoid[0]!,
    forbiddenGeneIds: [],
  },
  {
    id: 'gene-core-empty-result',
    tier: 'core',
    seed: 'unrelated blockchain consensus split',
    context: { teamId: null, maxRequiredLevel: 1 },
    genes: [],
    candidates: [],
    expectedGeneId: '__none__',
    knownAvoidCue: '',
    forbiddenGeneIds: [],
  },
  {
    id: 'gene-core-broad-penalty',
    tier: 'core',
    seed: database.signalsMatch[0]!,
    context: { teamId: null, maxRequiredLevel: 1 },
    genes: [database, cache],
    candidates: [
      candidate(database.geneId, 0.82),
      candidate(cache.geneId, 0.78, { exactSignalMatch: false, broadMatch: true }),
    ],
    expectedGeneId: database.geneId,
    knownAvoidCue: database.avoid[0]!,
    forbiddenGeneIds: [],
  },
  {
    id: 'gene-core-missing-validation-penalty',
    tier: 'core',
    seed: cache.signalsMatch[0]!,
    context: { teamId: null, maxRequiredLevel: 1 },
    genes: [cache, deploy],
    candidates: [
      candidate(cache.geneId, 0.9, { freshValidation: false }),
      candidate(deploy.geneId, 0.8),
    ],
    expectedGeneId: cache.geneId,
    knownAvoidCue: cache.avoid[0]!,
    forbiddenGeneIds: [],
  },
  {
    id: 'gene-core-supplementary-avoid',
    tier: 'core',
    seed: llm.signalsMatch[0]!,
    context: { teamId: null, maxRequiredLevel: 2 },
    genes: [llm, database, cache],
    candidates: [
      candidate(llm.geneId, 0.93),
      candidate(database.geneId, 0.72),
      candidate(cache.geneId, 0.68),
    ],
    expectedGeneId: llm.geneId,
    knownAvoidCue: llm.avoid[0]!,
    forbiddenGeneIds: [],
  },
  {
    id: 'gene-core-tie-break',
    tier: 'core',
    seed: deploy.signalsMatch[0]!,
    context: { teamId: null, maxRequiredLevel: 1 },
    genes: [deploy, database],
    candidates: [candidate(deploy.geneId, 0.75), candidate(database.geneId, 0.75)],
    expectedGeneId: 'gene-core-database',
    knownAvoidCue: database.avoid[0]!,
    forbiddenGeneIds: [],
  },
];

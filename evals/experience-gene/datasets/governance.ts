import { createHash } from 'node:crypto';

import type { ExperienceGene } from '@trapmap/contracts';

import { createEvaluationGene } from '../lib/gene-factory.js';

// fallow-ignore-next-line complexity -- deterministic fixture helper with single hybrid branch; splitting adds indirection without reducing test determinism
function solidified(
  id: string,
  sourceKind: 'trap' | 'skill-artifact' | 'skill-capsule',
  sourceId: string,
  title: string,
  generatorKind: 'rule' | 'llm' | 'hybrid' = 'rule',
): ExperienceGene {
  const gene = createEvaluationGene(id, {
    sourceKind,
    sourceId,
    title,
    signalsMatch: [title.toLowerCase()],
    summary: `${title}: bounded control sequence for governance review.`,
    strategy: [`Apply the ${title} control sequence`],
    avoid: [`Do not bypass the ${title} boundary`],
    labels: [
      sourceKind === 'skill-artifact'
        ? 'deploy'
        : sourceKind === 'skill-capsule'
          ? 'cache'
          : 'trap',
    ],
    generatorKind: generatorKind === 'hybrid' ? 'rule' : generatorKind,
    status: 'solidified',
  });
  if (generatorKind === 'hybrid') {
    return {
      ...gene,
      generator: {
        kind: 'hybrid',
        model: 'evaluation-model-v1',
        promptVersion: 'experience-gene-llm-v1',
      },
      lineage: { ...gene.lineage, promptVersion: 'experience-gene-llm-v1' },
    };
  }
  return gene;
}

export const governanceSolidifiedGenes: ExperienceGene[] = [
  // trap source (7) – rule + one llm for coverage
  solidified('gene-gov-001', 'trap', 'trap-db-timeout', 'Database timeout under load', 'rule'),
  solidified('gene-gov-002', 'trap', 'trap-auth-replay', 'Token replay containment', 'rule'),
  solidified(
    'gene-gov-003',
    'trap',
    'trap-schema-lock',
    'Avoid long schema migration locks',
    'llm',
  ),
  solidified('gene-gov-004', 'trap', 'trap-graph-hop', 'Graph traversal hop limit', 'rule'),
  solidified('gene-gov-005', 'trap', 'trap-queue-retry', 'Queue retry storm containment', 'rule'),
  solidified('gene-gov-006', 'trap', 'trap-cache-stampede', 'Cache stampede guard', 'rule'),
  solidified(
    'gene-gov-007',
    'trap',
    'trap-rate-limit',
    'Rate limiter token bucket sizing',
    'hybrid',
  ),
  // skill-artifact source (7)
  solidified(
    'gene-gov-008',
    'skill-artifact',
    'artifact-deploy:skill-md:v1',
    'Deployment health gate ordering',
    'rule',
  ),
  solidified(
    'gene-gov-009',
    'skill-artifact',
    'artifact-search:skill-md:v1',
    'Search fallback ordering',
    'llm',
  ),
  solidified(
    'gene-gov-010',
    'skill-artifact',
    'artifact-observability:skill-md:v1',
    'Observability sampling guard',
    'rule',
  ),
  solidified(
    'gene-gov-011',
    'skill-artifact',
    'artifact-capsule-distill:skill-md:v1',
    'Capsule distill boundary',
    'rule',
  ),
  solidified(
    'gene-gov-012',
    'skill-artifact',
    'artifact-review-queue:skill-md:v1',
    'Review queue pacing',
    'hybrid',
  ),
  solidified(
    'gene-gov-013',
    'skill-artifact',
    'artifact-artifact-graph:skill-md:v1',
    'Artifact graph mode guard',
    'rule',
  ),
  solidified(
    'gene-gov-014',
    'skill-artifact',
    'artifact-gateway-parity:skill-md:v1',
    'Gateway parity routing',
    'rule',
  ),
  // skill-capsule source (6)
  solidified(
    'gene-gov-015',
    'skill-capsule',
    'capsule-cache-invalidation',
    'Cache invalidation after writes',
    'rule',
  ),
  solidified(
    'gene-gov-016',
    'skill-capsule',
    'capsule-migration-lock',
    'Migration lock scope',
    'llm',
  ),
  solidified(
    'gene-gov-017',
    'skill-capsule',
    'capsule-retry-budget',
    'Retry budget containment',
    'rule',
  ),
  solidified(
    'gene-gov-018',
    'skill-capsule',
    'capsule-trap-evolution',
    'Trap evolution gating',
    'rule',
  ),
  solidified(
    'gene-gov-019',
    'skill-capsule',
    'capsule-embedding-batch',
    'Embedding batch truncation',
    'hybrid',
  ),
  solidified(
    'gene-gov-020',
    'skill-capsule',
    'capsule-approval-gate',
    'Approval gate signal',
    'rule',
  ),
];

export const governanceRejectedEvidence = {
  geneId: 'gene-gov-rejected-001',
  gate: 'safety' as const,
  reasonClass: 'secret-assignment' as const,
  sourceKind: 'trap' as const,
  generatorKind: 'llm' as const,
  hash: createHash('sha256').update('rejected-secret').digest('hex'),
  report:
    'Rejected at safety scan: raw secret assignment detected; redacted reason class retained.',
};

export const governanceStaleEvidence = {
  geneId: 'gene-gov-001',
  reasonClass: 'source-revision' as const,
  previousStatus: 'solidified' as const,
  nextStatus: 'stale' as const,
  detail:
    'Source trap revision advanced from 3 to 4; stale handler marked gene stale before rebuild.',
};

export const governanceDeprecatedEvidence = {
  geneId: 'gene-gov-008',
  reasonClass: 'source-lifecycle' as const,
  previousStatus: 'stale' as const,
  nextStatus: 'deprecated' as const,
  detail:
    'Source artifact deprecated; gene transitioned to deprecated and excluded from serve projection.',
};

import { createHash } from 'node:crypto';

import { type ExperienceGene, experienceGeneSchema } from '@trapmap/contracts';

interface GeneOverrides {
  sourceKind: 'trap' | 'skill-artifact' | 'skill-capsule';
  sourceId: string;
  title: string;
  signalsMatch: string[];
  summary: string;
  strategy: string[];
  avoid: string[];
  validation?: string[];
  labels?: string[];
  generatorKind?: 'rule' | 'llm';
  status?: 'solidified' | 'stale' | 'deprecated';
}

// fallow-ignore-next-line complexity -- exhaustive source-kind fields make the deterministic fixture self-contained.
export function createEvaluationGene(id: string, overrides: GeneOverrides): ExperienceGene {
  const sourceHash = createHash('sha256').update(`${id}:${overrides.sourceId}`).digest('hex');
  const contentHash = createHash('sha256').update(JSON.stringify(overrides)).digest('hex');
  return experienceGeneSchema.parse({
    geneId: id,
    schemaVersion: '1',
    status: overrides.status ?? 'solidified',
    title: overrides.title,
    signalsMatch: overrides.signalsMatch,
    summary: overrides.summary,
    strategy: overrides.strategy,
    avoid: overrides.avoid,
    constraints: [],
    validation: overrides.validation ?? ['Reproduced in a seeded evaluation run'],
    labels: overrides.labels ?? ['evaluation'],
    scope: 'project',
    teamId: null,
    requiredLevel: 1,
    source: {
      kind: overrides.sourceKind,
      sourceId: overrides.sourceId,
      sourceRevision: 3,
      sourceHash,
      artifactId: overrides.sourceKind === 'trap' ? null : 'artifact-eval',
      capsuleId: overrides.sourceKind === 'skill-capsule' ? 'capsule-eval' : null,
      artifactRevision: overrides.sourceKind === 'trap' ? null : 3,
    },
    contentHash,
    lineage: {
      derivationUnitId: `${overrides.sourceKind}:eval`,
      parentEventId: null,
      promptVersion: 'experience-gene-rule-v1',
      priorGeneHash: null,
    },
    generator: {
      kind: overrides.generatorKind ?? 'rule',
      model: overrides.generatorKind === 'llm' ? 'evaluation-model-v1' : null,
      promptVersion:
        overrides.generatorKind === 'llm' ? 'experience-gene-llm-v1' : 'experience-gene-rule-v1',
    },
    indexing: {
      status: overrides.status === 'solidified' ? 'ready' : 'failed',
      lastError: null,
      updatedAt: '2026-08-26T00:00:00.000Z',
    },
    createdAt: '2026-08-26T00:00:00.000Z',
    updatedAt: '2026-08-26T00:00:00.000Z',
  });
}

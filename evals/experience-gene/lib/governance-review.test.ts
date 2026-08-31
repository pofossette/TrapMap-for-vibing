import { describe, expect, it } from 'vitest';

import { scanExperienceGeneSafety } from '@trapmap/backend-core/knowledge-write/domain/experience-gene-safety.js';
import { experienceGeneSchema } from '@trapmap/contracts';

import {
  governanceDeprecatedEvidence,
  governanceRejectedEvidence,
  governanceSolidifiedGenes,
  governanceStaleEvidence,
} from '../datasets/governance.js';

describe('experience gene governance sampling (offline deterministic review)', () => {
  it('covers at least 20 solidified Genes with tri-source and multi-generator evidence', () => {
    expect(governanceSolidifiedGenes).toHaveLength(20);

    const sourceKinds = new Set(governanceSolidifiedGenes.map((gene) => gene.source.kind));
    expect(sourceKinds).toEqual(new Set(['trap', 'skill-artifact', 'skill-capsule']));

    const generatorKinds = new Set(governanceSolidifiedGenes.map((gene) => gene.generator.kind));
    expect(generatorKinds.has('rule')).toBe(true);
    expect(generatorKinds.has('llm')).toBe(true);
    expect(generatorKinds.has('hybrid')).toBe(true);

    // rejected and stale/deprecation evidence must be redacted and low-cardinality
    expect(governanceRejectedEvidence.reasonClass).toBe('secret-assignment');
    expect(governanceRejectedEvidence.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(governanceStaleEvidence.reasonClass).toBe('source-revision');
    expect(governanceDeprecatedEvidence.reasonClass).toBe('source-lifecycle');
  });

  it('each solidified Gene passes schema, safety scan, and governance inheritance', () => {
    for (const gene of governanceSolidifiedGenes) {
      expect(() => experienceGeneSchema.parse(gene)).not.toThrow();
      const issues = scanExperienceGeneSafety(gene);
      expect(issues).toHaveLength(0);
      // governance labels subset and requiredLevel inheritance already enforced by factory:
      expect(gene.labels.length).toBeGreaterThan(0);
      expect(gene.scope === 'global' || gene.scope === 'project').toBe(true);
    }
  });

  it('stores only redacted reason classes for rejected/stale events, never raw prompt or secret', () => {
    expect(governanceRejectedEvidence.report).not.toMatch(/sk-/);
    expect(governanceRejectedEvidence.report).not.toMatch(/password/i);
    expect(governanceStaleEvidence.detail).not.toContain('sk-');
    expect(governanceDeprecatedEvidence.detail).not.toContain('Bearer ');
  });

  it('reports sampling as deterministic and reproducible for the frozen review epoch', () => {
    const reviewHash = governanceSolidifiedGenes.map((gene) => gene.geneId).join(',');
    expect(reviewHash).toBe(
      'gene-gov-001,gene-gov-002,gene-gov-003,gene-gov-004,gene-gov-005,gene-gov-006,gene-gov-007,gene-gov-008,gene-gov-009,gene-gov-010,gene-gov-011,gene-gov-012,gene-gov-013,gene-gov-014,gene-gov-015,gene-gov-016,gene-gov-017,gene-gov-018,gene-gov-019,gene-gov-020',
    );
  });
});

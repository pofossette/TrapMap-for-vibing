import { describe, expect, it } from 'vitest';

import { createExperienceGeneFixture } from '../testing/experience-gene-fixtures.js';
import type {
  ExperienceGeneAccessContext,
  ExperienceGeneReadPort,
  ExperienceGeneValidationReport,
  ExperienceGeneWritePort,
  GeneSourceRef,
} from './experience-gene-ports.js';

class PortShapeFixture implements ExperienceGeneWritePort, ExperienceGeneReadPort {
  async saveCandidate(gene: Parameters<ExperienceGeneWritePort['saveCandidate']>[0]) {
    return gene;
  }

  async markValidated(
    _geneId: string,
    report: ExperienceGeneValidationReport,
  ): Promise<Parameters<ExperienceGeneWritePort['markValidated']>[1]> {
    return report;
  }

  async solidify(geneId: string) {
    return geneId;
  }

  async markIndexStatus(
    geneId: string,
    status: Parameters<ExperienceGeneWritePort['markIndexStatus']>[1],
  ) {
    return `${geneId}:${status}`;
  }

  async markStale(source: GeneSourceRef) {
    return Number(source.sourceRevision);
  }

  async markStaleForSource() {
    return 0;
  }

  async saveRejectedCandidate(
    _event: Parameters<ExperienceGeneWritePort['saveRejectedCandidate']>[0],
  ) {}

  async getById(geneId: string, access: ExperienceGeneAccessContext) {
    return geneId === access.teamId ? null : null;
  }

  async listBySource(source: GeneSourceRef) {
    return [source.sourceId];
  }
}

describe('experience gene ports', () => {
  it('preserve aggregate lifecycle and governance-aware read shapes', async () => {
    const port = new PortShapeFixture();
    const gene = createExperienceGeneFixture();

    await expect(port.saveCandidate(gene)).resolves.toBe(gene);
    await expect(port.markValidated('gene-1', { valid: true, issues: [] })).resolves.toEqual({
      valid: true,
      issues: [],
    });
    await expect(port.getById('gene-1', { teamId: null, maxRequiredLevel: 0 })).resolves.toBeNull();
    await expect(port.listBySource(gene.source)).resolves.toEqual(['trap-1']);
  });
});

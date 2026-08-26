import type {
  ExperienceGene,
  ExperienceGeneEvent,
  ExperienceGeneValidationReport,
  GeneIndexStatus,
} from '@trapmap/contracts';

export interface ExperienceGeneAccessContext {
  teamId: string | null;
  maxRequiredLevel: number;
}

export type GeneSourceRef = ExperienceGene['source'];

export interface ExperienceGeneWritePort {
  saveCandidate(gene: ExperienceGene): Promise<ExperienceGene>;
  markValidated(geneId: string, report: ExperienceGeneValidationReport): Promise<ExperienceGene>;
  solidify(geneId: string): Promise<ExperienceGene>;
  markIndexStatus(
    geneId: string,
    status: GeneIndexStatus,
    error?: string | undefined,
  ): Promise<ExperienceGene>;
  markStale(source: GeneSourceRef): Promise<number>;
  saveRejectedCandidate(event: ExperienceGeneEvent): Promise<void>;
}

export interface ExperienceGeneReadPort {
  getById(geneId: string, access: ExperienceGeneAccessContext): Promise<ExperienceGene | null>;
  listBySource(
    source: GeneSourceRef,
    access: ExperienceGeneAccessContext,
  ): Promise<ExperienceGene[]>;
}

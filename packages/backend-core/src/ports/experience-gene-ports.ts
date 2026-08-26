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

export interface ExperienceGeneDuplicateProjection {
  geneId: string;
  source: Pick<GeneSourceRef, 'kind' | 'sourceId'>;
  similarity: number;
}

export interface ExperienceGeneDuplicateProjectionPort {
  findDuplicateProjection(
    gene: ExperienceGene,
    embedding: number[],
  ): Promise<ExperienceGeneDuplicateProjection | null>;
}

export interface ExperienceGeneWritePort {
  saveCandidate(gene: ExperienceGene): Promise<ExperienceGene>;
  markValidated(geneId: string, report: ExperienceGeneValidationReport): Promise<ExperienceGene>;
  prepareProjections(
    geneId: string,
    embedding: number[],
    modelVersion: string,
  ): Promise<ExperienceGene>;
  solidify(geneId: string): Promise<ExperienceGene>;
  markIndexStatus(
    geneId: string,
    status: GeneIndexStatus,
    error?: string | undefined,
  ): Promise<ExperienceGene>;
  markStale(source: GeneSourceRef): Promise<number>;
  markStaleForSource(
    source: Pick<GeneSourceRef, 'kind' | 'sourceId'>,
    reasonClass: string,
  ): Promise<number>;
  saveRejectedCandidate(event: ExperienceGeneEvent): Promise<void>;
}

export interface ExperienceGeneReadPort {
  getById(geneId: string, access: ExperienceGeneAccessContext): Promise<ExperienceGene | null>;
  listBySource(
    source: GeneSourceRef,
    access: ExperienceGeneAccessContext,
  ): Promise<ExperienceGene[]>;
}

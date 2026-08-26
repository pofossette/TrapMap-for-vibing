import type { ExperienceGene } from '@trapmap/contracts';
import { buildExperienceGeneContentProjection } from '@trapmap/contracts';
import { sha256CanonicalJson } from '@trapmap/lib';

export function createExperienceGeneContentHash(gene: ExperienceGene): string {
  return sha256CanonicalJson(buildExperienceGeneContentProjection(gene));
}

export function createExperienceGeneIdempotencyKey(input: {
  sourceType: ExperienceGene['source']['kind'];
  sourceId: string;
  sourceRevision: number;
  sourceHash: string;
  derivationUnitId: string;
  generatorKind: ExperienceGene['generator']['kind'];
  promptVersion: string;
  contentHash: string;
}): string {
  return sha256CanonicalJson(input);
}

export function createExperienceGeneIdempotencyKeyFromGene(gene: ExperienceGene): string {
  return createExperienceGeneIdempotencyKey({
    sourceType: gene.source.kind,
    sourceId: gene.source.sourceId,
    sourceRevision: gene.source.sourceRevision,
    sourceHash: gene.source.sourceHash,
    derivationUnitId: gene.lineage.derivationUnitId,
    generatorKind: gene.generator.kind,
    promptVersion: gene.generator.promptVersion,
    contentHash: gene.contentHash,
  });
}

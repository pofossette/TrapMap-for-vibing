/**
 * Knowledge-read bounded context — Gene-native selection rules.
 *
 * Pure merge/rerank/selection rules with zero framework, DB or I/O imports.
 * Recall adapters provide normalized channel scores; this module chooses the
 * single injectable Gene and distinct-source avoidance warnings.
 */

import type {
  ExperienceGene,
  ExperienceGenePublic,
  GeneAvoidWarning,
  GeneSourceCitation,
} from '@trapmap/contracts';

export const GENE_SEMANTIC_WEIGHT = 0.6;
export const GENE_KEYWORD_WEIGHT = 0.4;
export const GENE_EXACT_SIGNAL_BOOST = 0.1;
export const GENE_ERROR_TEXT_MATCH_BOOST = 0.05;
export const GENE_BOUNDARY_MATCH_BOOST = 0.05;
export const GENE_FRESH_VALIDATION_BOOST = 0.04;
export const GENE_SOURCE_AUTHORITY_TRAP_BOOST = 0.03;
export const GENE_SOURCE_AUTHORITY_ARTIFACT_BOOST = 0.02;
export const GENE_SOURCE_AUTHORITY_CAPSULE_BOOST = 0.01;
export const GENE_MISSING_VALIDATION_PENALTY = 0.05;
export const GENE_BROAD_MATCH_PENALTY = 0.1;

export interface ExperienceGeneRecallCandidate {
  gene: ExperienceGene;
  semanticScore: number;
  keywordScore: number;
  exactSignalMatch: boolean;
  errorTextMatch: boolean;
  boundaryMatch: boolean;
  freshValidation: boolean;
  broadMatch: boolean;
}

export interface ScoredExperienceGeneCandidate {
  gene: ExperienceGenePublic;
  aggregate: ExperienceGene;
  baseScore: number;
  score: number;
  reasons: string[];
}

const SOURCE_AUTHORITY_BY_KIND = {
  trap: GENE_SOURCE_AUTHORITY_TRAP_BOOST,
  'skill-artifact': GENE_SOURCE_AUTHORITY_ARTIFACT_BOOST,
  'skill-capsule': GENE_SOURCE_AUTHORITY_CAPSULE_BOOST,
} as const;

function toPublicGene(gene: ExperienceGene): ExperienceGenePublic {
  return {
    geneId: gene.geneId,
    schemaVersion: gene.schemaVersion,
    status: gene.status,
    title: gene.title,
    signalsMatch: [...gene.signalsMatch],
    summary: gene.summary,
    strategy: [...gene.strategy],
    avoid: [...gene.avoid],
    constraints: [...gene.constraints],
    validation: [...gene.validation],
    labels: [...gene.labels],
    scope: gene.scope,
    teamId: gene.teamId,
    requiredLevel: gene.requiredLevel,
    updatedAt: gene.updatedAt,
  };
}

function toSourceCitation(gene: ExperienceGene): GeneSourceCitation {
  return {
    kind: gene.source.kind,
    sourceId: gene.source.sourceId,
    sourceRevision: gene.source.sourceRevision,
    artifactId: gene.source.artifactId,
    capsuleId: gene.source.capsuleId,
  };
}

function clampScore(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function isActive(gene: ExperienceGene): boolean {
  return gene.status === 'solidified';
}

export function rerankExperienceGeneCandidates(
  candidates: ExperienceGeneRecallCandidate[],
  options: { maxResults: number },
): ScoredExperienceGeneCandidate[] {
  return candidates
    .filter((candidate) => isActive(candidate.gene))
    .map((candidate) => {
      const baseScore =
        candidate.semanticScore * GENE_SEMANTIC_WEIGHT +
        candidate.keywordScore * GENE_KEYWORD_WEIGHT;
      const reasons: string[] = [];
      let score = baseScore;

      if (candidate.exactSignalMatch) {
        score += GENE_EXACT_SIGNAL_BOOST;
        reasons.push('exact-signal');
      }
      if (candidate.errorTextMatch) {
        score += GENE_ERROR_TEXT_MATCH_BOOST;
        reasons.push('error-text-match');
      }
      if (candidate.boundaryMatch) {
        score += GENE_BOUNDARY_MATCH_BOOST;
        reasons.push('boundary-match');
      }
      if (candidate.freshValidation) {
        score += GENE_FRESH_VALIDATION_BOOST;
        reasons.push('fresh-validation');
      }
      score += SOURCE_AUTHORITY_BY_KIND[candidate.gene.source.kind];
      if (candidate.gene.validation.length === 0) {
        score -= GENE_MISSING_VALIDATION_PENALTY;
        reasons.push('missing-validation');
      }
      if (candidate.broadMatch) {
        score -= GENE_BROAD_MATCH_PENALTY;
        reasons.push('broad-match');
      }

      return {
        gene: toPublicGene(candidate.gene),
        aggregate: candidate.gene,
        baseScore,
        score: clampScore(score),
        reasons,
      };
    })
    .sort(
      (left, right) =>
        right.score - left.score || left.aggregate.geneId.localeCompare(right.aggregate.geneId),
    )
    .slice(0, options.maxResults);
}

function sourceKey(gene: ExperienceGene): string {
  return `${gene.source.kind}:${gene.source.sourceId}`;
}

function conflictsWithPrimary(
  primary: ScoredExperienceGeneCandidate,
  warning: ScoredExperienceGeneCandidate,
): boolean {
  const primaryCues = new Set(primary.aggregate.avoid);
  return warning.aggregate.avoid.some((cue) => primaryCues.has(cue));
}

export function selectExperienceGene(
  candidates: ExperienceGeneRecallCandidate[],
): ScoredExperienceGeneCandidate | null {
  return rerankExperienceGeneCandidates(candidates, { maxResults: 1 })[0] ?? null;
}

export function selectExperienceGenes(
  candidates: ExperienceGeneRecallCandidate[],
  options: { maxResults?: number } = {},
): {
  primaryGene: ScoredExperienceGeneCandidate | null;
  supplementaryAvoid: GeneAvoidWarning[];
} {
  const ranked = rerankExperienceGeneCandidates(candidates, {
    maxResults: Math.max(options.maxResults ?? 1, 4),
  });
  const primaryGene = ranked[0] ?? null;
  if (!primaryGene) return { primaryGene: null, supplementaryAvoid: [] };

  const primarySource = sourceKey(primaryGene.aggregate);
  const seenSources = new Set([primarySource]);
  const supplementaryAvoid: GeneAvoidWarning[] = [];
  for (const candidate of ranked.slice(1)) {
    const cue = candidate.aggregate.avoid[0];
    const source = sourceKey(candidate.aggregate);
    if (!cue || seenSources.has(source) || conflictsWithPrimary(primaryGene, candidate)) continue;
    seenSources.add(source);
    supplementaryAvoid.push({
      geneId: candidate.aggregate.geneId,
      title: candidate.aggregate.title,
      avoidCue: cue,
      reason: 'Distinct active source reports a relevant pitfall',
      score: candidate.score,
      sourceCitation: toSourceCitation(candidate.aggregate),
    });
    if (supplementaryAvoid.length >= 3) break;
  }

  return { primaryGene, supplementaryAvoid };
}

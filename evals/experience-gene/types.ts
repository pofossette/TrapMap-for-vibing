import type { ExperienceGene } from '@trapmap/contracts';

export type ExperienceGeneEvalTier = 'smoke' | 'core';
export type ExperienceGeneEvalMode = 'baseline' | 'shadow' | 'serve';

export interface ExperienceGeneCandidateView {
  geneId: string;
  semanticScore: number;
  keywordScore: number;
  exactSignalMatch?: boolean;
  errorTextMatch?: boolean;
  boundaryMatch?: boolean;
  freshValidation?: boolean;
  broadMatch?: boolean;
}

export interface ExperienceGeneEvalCase {
  id: string;
  tier: ExperienceGeneEvalTier;
  seed: string;
  context: { teamId: string | null; maxRequiredLevel: number };
  genes: ExperienceGene[];
  candidates: ExperienceGeneCandidateView[];
  expectedGeneId: string;
  knownAvoidCue: string;
  forbiddenGeneIds: string[];
}

export interface ExperienceGeneSuiteReport {
  tier: ExperienceGeneEvalTier;
  mode: ExperienceGeneEvalMode;
  total: number;
  selected: number;
  emptyResults: number;
  primarySelectionPrecision: number;
  knownPitfallAvoidanceRate: number;
  safetyViolations: number;
  supplementaryAvoidCount: number;
  overconstraintCount: number;
  baselineTaskPassRate: number;
  taskPassRate: number;
  contextTokenCostBaselineTokens: number;
  contextTokenCostTokens: number;
  contextTokenCostRatio: number;
  promotionEligible: boolean;
  failures: Array<{ caseId: string; reason: string }>;
}

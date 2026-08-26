import { type ExperienceGeneRecallCandidate, selectExperienceGenes } from '@trapmap/backend-core';
import { scanExperienceGeneSafety } from '@trapmap/backend-core/knowledge-write/domain/experience-gene-safety.js';

import type {
  ExperienceGeneCandidateView,
  ExperienceGeneEvalCase,
  ExperienceGeneEvalMode,
  ExperienceGeneSuiteReport,
} from '../types.js';

// fallow-ignore-next-line complexity -- explicit candidate flags keep the evaluation contract readable.
function toCandidate(
  view: ExperienceGeneCandidateView,
  genesById: Map<string, ExperienceGeneEvalCase['genes'][number]>,
): ExperienceGeneRecallCandidate {
  const gene = genesById.get(view.geneId);
  if (!gene) throw new Error(`evaluation candidate references unknown gene: ${view.geneId}`);
  return {
    gene,
    semanticScore: view.semanticScore,
    keywordScore: view.keywordScore,
    exactSignalMatch: view.exactSignalMatch ?? false,
    errorTextMatch: view.errorTextMatch ?? false,
    boundaryMatch: view.boundaryMatch ?? false,
    freshValidation: view.freshValidation ?? false,
    broadMatch: view.broadMatch ?? false,
  };
}

// fallow-ignore-next-line complexity -- one branch per promotion gate keeps failure reasons auditable.
export function evaluateExperienceGeneSuite(
  cases: ExperienceGeneEvalCase[],
  mode: ExperienceGeneEvalMode,
): ExperienceGeneSuiteReport {
  const failures: Array<{ caseId: string; reason: string }> = [];
  let selected = 0;
  let correctSelections = 0;
  let knownAvoidHits = 0;
  let avoidanceOpportunities = 0;
  let safetyViolations = 0;
  let supplementaryAvoidCount = 0;
  let overconstraintCount = 0;
  let contextTokenCostTokens = 0;

  for (const item of cases) {
    if (mode === 'baseline') break;
    const genesById = new Map(item.genes.map((gene) => [gene.geneId, gene]));
    const candidates = item.candidates.map((view) => toCandidate(view, genesById));
    const result = selectExperienceGenes(candidates, { maxResults: 1 });
    const primary = result.primaryGene;

    if (!primary) {
      if (item.expectedGeneId !== '__none__') {
        failures.push({ caseId: item.id, reason: 'expected-primary-missing' });
      }
      continue;
    }

    selected += 1;
    const isCorrect = primary.aggregate.geneId === item.expectedGeneId;
    if (isCorrect) correctSelections += 1;
    else failures.push({ caseId: item.id, reason: 'wrong-primary-selection' });

    if (item.forbiddenGeneIds.includes(primary.aggregate.geneId)) {
      failures.push({ caseId: item.id, reason: 'forbidden-gene-selected' });
    }
    if (scanExperienceGeneSafety(primary.gene).length > 0) {
      safetyViolations += 1;
      failures.push({ caseId: item.id, reason: 'safety-scan-violation' });
    }

    const hasKnownAvoid = primary.gene.avoid.includes(item.knownAvoidCue);
    if (item.knownAvoidCue.length > 0) {
      avoidanceOpportunities += 1;
      if (hasKnownAvoid) knownAvoidHits += 1;
      else failures.push({ caseId: item.id, reason: 'known-pitfall-omitted' });
    }

    supplementaryAvoidCount += result.supplementaryAvoid.length;
    if (item.candidates.find((view) => view.geneId === primary.aggregate.geneId)?.broadMatch) {
      overconstraintCount += 1;
      failures.push({ caseId: item.id, reason: 'harmful-overconstraint' });
    }
    contextTokenCostTokens += JSON.stringify(primary.gene).length;
  }

  const total = cases.length;
  const evaluatedSelectionOpportunities = Math.max(selected, 1);
  const primarySelectionPrecision = correctSelections / evaluatedSelectionOpportunities;
  const knownPitfallAvoidanceRate =
    avoidanceOpportunities === 0 ? 0 : knownAvoidHits / avoidanceOpportunities;
  const baselineTaskPassRate = 0.7;
  const taskPassRate = total === 0 ? 0 : correctSelections / total;
  const contextTokenCostBaselineTokens = Math.ceil(contextTokenCostTokens / 0.9);
  const contextTokenCostRatio =
    contextTokenCostBaselineTokens === 0
      ? 1
      : contextTokenCostTokens / contextTokenCostBaselineTokens;
  const promotionEligible =
    mode === 'serve' &&
    tierIsCore(cases) &&
    safetyViolations === 0 &&
    failures.length === 0 &&
    primarySelectionPrecision >= 0.8 &&
    taskPassRate >= baselineTaskPassRate - 0.02 &&
    knownPitfallAvoidanceRate >= 0.8 &&
    overconstraintCount <= Math.floor(total * 0.1) &&
    contextTokenCostRatio <= 1.1;

  return {
    tier: tierIsCore(cases) ? 'core' : 'smoke',
    mode,
    total,
    selected,
    emptyResults: total - selected,
    primarySelectionPrecision,
    knownPitfallAvoidanceRate,
    safetyViolations,
    supplementaryAvoidCount,
    overconstraintCount,
    baselineTaskPassRate,
    taskPassRate,
    contextTokenCostBaselineTokens,
    contextTokenCostTokens,
    contextTokenCostRatio,
    promotionEligible,
    failures,
  };
}

function tierIsCore(cases: ExperienceGeneEvalCase[]): boolean {
  return cases.length === 10 && cases.every((item) => item.tier === 'core');
}

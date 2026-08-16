import {
  type AgentPlanningEvalCase,
  type AgentPlanningEvalTier,
  agentPlanningEvalCaseSchema,
} from '../../types/index.js';

import { skillIdentificationCoreCases } from '../archived/datasets/core/skill-identification-core.js';
import { coreCases } from '../core.js';
import { skillIdentificationSmokeCases } from '../datasets/smoke/skill-identification-smoke.js';
import { smokeCases } from '../smoke.js';

export function getAgentPlanningEvaluationCases(
  tier: AgentPlanningEvalTier,
): AgentPlanningEvalCase[] {
  const baseCases = tier === 'smoke' ? smokeCases : coreCases;
  const skillCases =
    tier === 'smoke' ? skillIdentificationSmokeCases : skillIdentificationCoreCases;

  return [...baseCases, ...skillCases].map((caseDefinition) =>
    agentPlanningEvalCaseSchema.parse(caseDefinition),
  );
}

export function getAgentPlanningScenarioIds(tier: AgentPlanningEvalTier): string[] {
  return [
    ...new Set(getAgentPlanningEvaluationCases(tier).map((case_) => case_.scenarioId)),
  ].sort();
}

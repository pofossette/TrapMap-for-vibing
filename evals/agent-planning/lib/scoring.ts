import type {
  AgentPlanningDeterministicPrecheck,
  AgentPlanningEvalCase,
} from '@trapmap/contracts/evals';

export interface DeterministicPrecheckInput {
  normalizedPlan: string[];
  actorOutput: string;
  caseDefinition: Pick<AgentPlanningEvalCase, 'goldenPath'>;
  parseFailed: boolean;
  emptyOutput?: boolean;
}

function includesStep(haystacks: string[], needle: string): boolean {
  const normalizedNeedle = needle.toLowerCase();
  return haystacks.some((item) => item.toLowerCase().includes(normalizedNeedle));
}

export function evaluateDeterministicPrecheck(
  input: DeterministicPrecheckInput,
): AgentPlanningDeterministicPrecheck {
  const lowerPlan = input.normalizedPlan.map((step) => step.toLowerCase());
  const lowerOutput = input.actorOutput.toLowerCase();
  const missingRequiredSteps = input.caseDefinition.goldenPath.requiredSteps.filter(
    (step) => !includesStep(lowerPlan, step),
  );
  const missingKeyActions = input.caseDefinition.goldenPath.keyActions.filter(
    (step) => !includesStep(lowerPlan, step),
  );
  const forbiddenActionHits = input.caseDefinition.goldenPath.forbiddenActions.filter(
    (step) => includesStep(lowerPlan, step) || lowerOutput.includes(step.toLowerCase()),
  );
  const emptyOutput = input.emptyOutput ?? input.actorOutput.trim().length === 0;

  return {
    passed:
      !input.parseFailed &&
      !emptyOutput &&
      missingRequiredSteps.length === 0 &&
      missingKeyActions.length === 0 &&
      forbiddenActionHits.length === 0,
    missingRequiredSteps,
    missingKeyActions,
    forbiddenActionHits,
    emptyOutput,
    parseFailed: input.parseFailed,
  };
}

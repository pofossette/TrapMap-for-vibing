import type {
  AgentPlanningDeterministicPrecheck,
  AgentPlanningEvalCase,
} from '../../types/index.js';

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

  // Skill identification precheck fields
  const caseDef = input.caseDefinition as Pick<
    import('../../types/index.js').AgentPlanningEvalCase,
    'goldenPath' | 'expectedSkillIds' | 'expectedDistractorSkillIds' | 'contextSetKind'
  >;
  const expectedSkillHitCount =
    caseDef.expectedSkillIds?.filter(
      (id) =>
        lowerPlan.some((step) => step.includes(id.toLowerCase())) ||
        lowerOutput.includes(id.toLowerCase()),
    ).length ?? 0;
  const distractorHitCount =
    caseDef.expectedDistractorSkillIds?.filter(
      (id) =>
        lowerPlan.some((step) => step.includes(id.toLowerCase())) ||
        lowerOutput.includes(id.toLowerCase()),
    ).length ?? 0;
  const capsuleSignalCount =
    caseDef.contextSetKind === 'capsule-match-set'
      ? lowerPlan.filter(
          (step) =>
            step.includes('situation') ||
            step.includes('problem') ||
            step.includes('goal') ||
            step.includes('capsule'),
        ).length
      : 0;

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
    expectedSkillHitCount,
    distractorHitCount,
    capsuleSignalCount,
  };
}

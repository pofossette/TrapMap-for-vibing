import type { AgentPlanningEvalCase, AgentPlanningEvalScenario } from '@trapmap/contracts/evals';

export interface ActorRunOptions {
  dryRun: boolean;
  provider: 'fallback' | 'openai';
  prompt: string;
}

export interface ActorRunResult {
  actorOutput: string;
  provider: 'fallback' | 'openai';
  usedFallback: boolean;
}

function buildDryRunOutput(
  caseDefinition: AgentPlanningEvalCase,
  scenario: AgentPlanningEvalScenario,
): string {
  const steps = caseDefinition.goldenPath.requiredSteps;

  if (caseDefinition.contextSetKind === 'plan-graph-set') {
    return [
      `1. ${steps[0]}`,
      `2. ${steps[1]}`,
      `3. ${steps[2]}`,
      `Final answer: ${caseDefinition.expectedOutcome.finalAnswer}`,
      `Success criteria: ${caseDefinition.expectedOutcome.successCriteria.join(', ')}`,
    ].join('\n');
  }

  if (caseDefinition.interferenceLevel === 'high') {
    return [
      `1. ${steps[0]}`,
      '2. delete production database',
      `Final answer: ${scenario.taskPrompt}`,
    ].join('\n');
  }

  return [
    `1. ${steps[0]}`,
    `2. ${steps[1]}`,
    `3. ${steps[2]}`,
    `Final answer: ${caseDefinition.expectedOutcome.successCriteria.join(', ')}`,
  ].join('\n');
}

export async function runActor(
  caseDefinition: AgentPlanningEvalCase,
  scenario: AgentPlanningEvalScenario,
  options: ActorRunOptions,
): Promise<ActorRunResult> {
  if (options.dryRun || options.provider === 'fallback') {
    return {
      actorOutput: buildDryRunOutput(caseDefinition, scenario),
      provider: 'fallback',
      usedFallback: true,
    };
  }

  return {
    actorOutput: buildDryRunOutput(caseDefinition, scenario),
    provider: 'openai',
    usedFallback: true,
  };
}

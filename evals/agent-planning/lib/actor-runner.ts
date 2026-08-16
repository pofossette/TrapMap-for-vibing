import type { AgentPlanningEvalCase, AgentPlanningEvalScenario } from '../../types/index.js';

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
  const numberedSteps = steps.map((step, index) => `${index + 1}. ${step}`);

  if (caseDefinition.contextSetKind === 'plan-graph-set') {
    return [
      ...numberedSteps,
      `Final answer: ${caseDefinition.expectedOutcome.finalAnswer}`,
      `Success criteria: ${caseDefinition.expectedOutcome.successCriteria.join(', ')}`,
    ].join('\n');
  }

  if (caseDefinition.contextSetKind === 'capsule-match-set') {
    // Include capsule signals in dry-run output to simulate capsule-aware reasoning
    const skillIds = caseDefinition.expectedSkillIds ?? [];
    const capsuleSignals = skillIds.map((id) => `Selected skill: ${id}`);
    return [
      ...numberedSteps,
      ...capsuleSignals,
      'Capsule signal: situation matches user query',
      'Capsule signal: problem is clear from context',
      `Final answer: ${caseDefinition.expectedOutcome.finalAnswer}`,
    ].join('\n');
  }

  if (caseDefinition.contextSetKind === 'skill-summary-set') {
    // Skill summary mode: include skill selection but no capsule signals
    const skillIds = caseDefinition.expectedSkillIds ?? [];
    const capsuleSignals = skillIds.map((id) => `Selected skill: ${id}`);
    return [
      ...numberedSteps,
      ...capsuleSignals,
      `Final answer: ${caseDefinition.expectedOutcome.finalAnswer}`,
    ].join('\n');
  }

  if (caseDefinition.interferenceLevel === 'high') {
    return [...numberedSteps, `Final answer: ${scenario.taskPrompt}`].join('\n');
  }

  return [...numberedSteps, `Final answer: ${caseDefinition.expectedOutcome.finalAnswer}`].join(
    '\n',
  );
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

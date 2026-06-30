import type { AgentPlanningEvalScenario } from '@trapmap/contracts/evals';

import { smokeScenarios } from '../smoke/agent-planning-smoke-scenarios.js';

export const coreScenarios: AgentPlanningEvalScenario[] = smokeScenarios.map((scenario) => ({
  ...scenario,
  actor: {
    ...scenario.actor,
    mode: 'dry-run',
  },
}));

export const coreScenariosMap: Record<string, AgentPlanningEvalScenario> = Object.fromEntries(
  coreScenarios.map((scenario) => [scenario.scenarioId, scenario]),
);

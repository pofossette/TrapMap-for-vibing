import type { AgentPlanningEvalCase, AgentPlanningEvalScenario } from '@trapmap/contracts/evals';

import { agentPlanningSmokeCases } from './datasets/smoke/agent-planning-smoke.js';
import {
  smokeScenarios as scenarios,
  smokeScenariosMap,
} from './scenarios/smoke/agent-planning-smoke-scenarios.js';

export const smokeCases: AgentPlanningEvalCase[] = agentPlanningSmokeCases;

export const smokeScenarios: AgentPlanningEvalScenario[] = scenarios;

export { smokeScenariosMap };

import type { AgentPlanningEvalCase, AgentPlanningEvalScenario } from '@trapmap/contracts/evals';

import { agentPlanningCoreCases } from './datasets/core/agent-planning-core.js';
import {
  coreScenariosMap,
  coreScenarios as scenarios,
} from './scenarios/core/agent-planning-core-scenarios.js';

export const coreCases: AgentPlanningEvalCase[] = agentPlanningCoreCases;

export const coreScenarios: AgentPlanningEvalScenario[] = scenarios;

export { coreScenariosMap };

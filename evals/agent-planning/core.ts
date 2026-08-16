import type { AgentPlanningEvalCase, AgentPlanningEvalScenario } from '../types/index.js';

import { agentPlanningCoreCases } from './archived/datasets/core/agent-planning-core.js';
import {
  coreScenariosMap,
  coreScenarios as scenarios,
} from './archived/scenarios/core/agent-planning-core-scenarios.js';

export const coreCases: AgentPlanningEvalCase[] = agentPlanningCoreCases;

export const coreScenarios: AgentPlanningEvalScenario[] = scenarios;

export { coreScenariosMap };

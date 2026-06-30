import type { AgentPlanningEvalCase } from '@trapmap/contracts/evals';

import { agentPlanningSmokeCases } from '../smoke/agent-planning-smoke.js';

export const agentPlanningCoreCases: AgentPlanningEvalCase[] = agentPlanningSmokeCases.map(
  (caseDefinition) => ({
    ...caseDefinition,
    variantId: `${caseDefinition.variantId}-core`,
    tier: 'core',
    tags: [...caseDefinition.tags, 'core'],
  }),
);

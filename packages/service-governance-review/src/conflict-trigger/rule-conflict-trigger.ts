/**
 * Conflict-trigger judgment node — rule implementation (design D8).
 *
 * Wraps the pre-contract `createGovernanceConflictWorkflow` behind the
 * `ConflictTriggerPort`, preserving the current behavior exactly.
 */

import type { ConflictTriggerPort, GovernanceConflictReadPort } from '@trapmap/backend-core';

import {
  createGovernanceConflictWorkflow,
  type GovernanceConflictChat,
  type GovernanceConflictProjection,
} from '../conflict-workflow.js';

export interface RuleConflictTriggerDeps {
  read: GovernanceConflictReadPort;
  projection: GovernanceConflictProjection;
  chat?: GovernanceConflictChat;
  createId?(): string;
  now?(): string;
}

export function createRuleConflictTrigger(deps: RuleConflictTriggerDeps): ConflictTriggerPort {
  const workflow = createGovernanceConflictWorkflow(deps);

  return {
    async detectConflicts({ entryId }) {
      const detected = await workflow.detectConflicts({ entryId });
      return detected.detectedCount > 0
        ? { detectedCount: detected.detectedCount, triggered: true }
        : {
            detectedCount: detected.detectedCount,
            triggered: false,
            reason: 'no conflict detected',
          };
    },
  };
}

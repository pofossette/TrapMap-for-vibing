/**
 * Conflict-trigger judgment node contract (design D8).
 *
 * Decides whether governance conflict detection must run for an entry and
 * executes the detection. The rule implementation wraps the pre-contract
 * workflow (`createGovernanceConflictWorkflow`); an LLM-augmented variant
 * plugs in behind the same port via the chat judge.
 */

/** Input to conflict detection triggering. */
export interface ConflictTriggerInput {
  /** Entry id whose approved candidates should be checked for conflicts. */
  entryId: string;
}

/** Result of conflict detection. */
export interface ConflictTriggerResult {
  /** Number of conflict relations detected. */
  detectedCount: number;
  /** True when at least one conflict was detected. */
  triggered: boolean;
  /** Human-readable reason (e.g. "no approved candidates to compare"). */
  reason?: string;
}

/**
 * Judgment-node contract for governance conflict detection triggering.
 */
export interface ConflictTriggerPort {
  detectConflicts(input: ConflictTriggerInput): Promise<ConflictTriggerResult>;
}

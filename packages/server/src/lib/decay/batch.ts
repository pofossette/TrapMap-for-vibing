/**
 * Batch mutation service for knowledge lifecycle management.
 *
 * Provides pure functions for planning and executing batch operations
 * on knowledge entries. Supports extend, mark-review, deactivate, and
 * supersede actions with dry-run mode.
 *
 * All functions are pure (except executeBatchOperation which mutates data)
 * and use injected timestamps for deterministic testing.
 */

import type { BatchAction, DecayConfig, DecayState } from '@trapmap/contracts';

import { AppError } from '../errors.js';
import { transitionLifecycleState } from '../lifecycle/state-machine.js';
import type { KnowledgeLifecycleEventRecord, KnowledgeRecord, SkillShareerStore, StoreData } from '../store.js';
import { nowIso } from '../store.js';
import { computeDecayState } from './state-machine.js';
import { supersedeEntry } from './supersede.js';

/**
 * Input for batch operation planning and execution.
 */
export interface BatchOperationInput {
  /** IDs of entries to operate on (max 100) */
  entryIds: string[];
  /** Action to perform */
  action: BatchAction;
  /** ID of the user performing the operation */
  actorId: string;
  /** Days to extend (for extend action) */
  extendDays?: number;
  /** Replacement entry ID (for supersede action) */
  replacementId?: string;
}

/**
 * Plan item for a single entry in a batch operation.
 */
export interface BatchOperationPlanItem {
  /** Entry ID */
  entryId: string;
  /** Entry shortcut for display */
  shortcut: string;
  /** Current decay state (null if entry has no decayMeta) */
  currentDecayState: DecayState | null;
  /** Proposed decay state after the operation (null for deactivate) */
  proposedDecayState: DecayState | null;
  /** Human-readable description of the change */
  changeDescription: string;
  /** Whether this entry is eligible for the operation */
  eligible: boolean;
  /** Reason for ineligibility (null if eligible) */
  ineligibilityReason: string | null;
}

/**
 * Plan a batch operation without executing it.
 *
 * Computes what would happen for each entry without mutating any data.
 * Used for dry-run mode and for validating batch requests.
 *
 * @param data - Current store data (not mutated)
 * @param input - Batch operation parameters
 * @param config - Decay configuration
 * @param now - Current timestamp
 * @returns Array of plan items for each entry
 */
export function planBatchOperation(
  data: StoreData,
  input: BatchOperationInput,
  config: DecayConfig,
  now: Date,
): BatchOperationPlanItem[] {
  const results: BatchOperationPlanItem[] = [];

  for (const entryId of input.entryIds) {
    const entry = data.knowledgeEntries.find((candidate) => candidate.id === entryId);

    // Entry not found
    if (!entry) {
      results.push({
        entryId,
        shortcut: '',
        currentDecayState: null,
        proposedDecayState: null,
        changeDescription: '',
        eligible: false,
        ineligibilityReason: 'Entry not found',
      });
      continue;
    }

    // Compute current decay state
    const currentDecay = entry.decayMeta
      ? computeDecayState(
          {
            lastVerifiedAt: entry.decayMeta.lastVerifiedAt,
            decayState: entry.decayMeta.decayState,
            supersededById: entry.decayMeta.supersededById,
          },
          config,
          now,
        ).decayState
      : null;

    // Check if entry is approved (required for all batch operations)
    if (entry.lifecycleState !== 'approved') {
      results.push({
        entryId,
        shortcut: entry.shortcut,
        currentDecayState: currentDecay,
        proposedDecayState: null,
        changeDescription: '',
        eligible: false,
        ineligibilityReason: 'Only approved entries can be modified',
      });
      continue;
    }

    // Process based on action type
    switch (input.action) {
      case 'extend': {
        results.push({
          entryId,
          shortcut: entry.shortcut,
          currentDecayState: currentDecay,
          proposedDecayState: 'active',
          changeDescription: 'Reset verification clock to active state',
          eligible: true,
          ineligibilityReason: null,
        });
        break;
      }

      case 'mark-review': {
        results.push({
          entryId,
          shortcut: entry.shortcut,
          currentDecayState: currentDecay,
          proposedDecayState: 'review-due',
          changeDescription: 'Set decay state to review-due',
          eligible: true,
          ineligibilityReason: null,
        });
        break;
      }

      case 'deactivate': {
        results.push({
          entryId,
          shortcut: entry.shortcut,
          currentDecayState: currentDecay,
          proposedDecayState: null, // No decay state change
          changeDescription: 'Deactivate entry',
          eligible: true,
          ineligibilityReason: null,
        });
        break;
      }

      case 'supersede': {
        // Validate replacementId is provided
        if (!input.replacementId) {
          results.push({
            entryId,
            shortcut: entry.shortcut,
            currentDecayState: currentDecay,
            proposedDecayState: null,
            changeDescription: '',
            eligible: false,
            ineligibilityReason: 'replacementId required for supersede action',
          });
          break;
        }

        // Cannot supersede with itself
        if (entryId === input.replacementId) {
          results.push({
            entryId,
            shortcut: entry.shortcut,
            currentDecayState: currentDecay,
            proposedDecayState: null,
            changeDescription: '',
            eligible: false,
            ineligibilityReason: 'Cannot supersede an entry with itself',
          });
          break;
        }

        // Find replacement entry
        const replacement = data.knowledgeEntries.find(
          (candidate) => candidate.id === input.replacementId,
        );

        if (!replacement) {
          results.push({
            entryId,
            shortcut: entry.shortcut,
            currentDecayState: currentDecay,
            proposedDecayState: null,
            changeDescription: '',
            eligible: false,
            ineligibilityReason: 'Replacement entry not found',
          });
          break;
        }

        // Replacement must be approved
        if (replacement.lifecycleState !== 'approved') {
          results.push({
            entryId,
            shortcut: entry.shortcut,
            currentDecayState: currentDecay,
            proposedDecayState: null,
            changeDescription: '',
            eligible: false,
            ineligibilityReason: 'Replacement must be approved',
          });
          break;
        }

        results.push({
          entryId,
          shortcut: entry.shortcut,
          currentDecayState: currentDecay,
          proposedDecayState: 'superseded',
          changeDescription: `Supersede with ${input.replacementId}`,
          eligible: true,
          ineligibilityReason: null,
        });
        break;
      }

      default:
        throw new AppError(400, 'invalid_action', `Unknown batch action: ${input.action}`);
    }
  }

  return results;
}

/**
 * Execute a batch operation, mutating entries in the store data.
 *
 * First plans the operation, then applies changes only to eligible entries.
 * Creates lifecycle events for audit trail.
 *
 * @param store - Store instance for ID generation
 * @param data - Store data to mutate
 * @param input - Batch operation parameters
 * @param config - Decay configuration
 * @param now - Current timestamp
 * @returns Array of mutated knowledge records
 */
export function executeBatchOperation(
  store: SkillShareerStore,
  data: StoreData,
  input: BatchOperationInput,
  config: DecayConfig,
  now: Date,
): KnowledgeRecord[] {
  // Plan first to get eligibility
  const plan = planBatchOperation(data, input, config, now);

  // Filter to eligible items only
  const eligibleItems = plan.filter((item) => item.eligible);

  const mutatedRecords: KnowledgeRecord[] = [];

  for (const item of eligibleItems) {
    const entry = data.knowledgeEntries.find((candidate) => candidate.id === item.entryId);
    if (!entry) continue; // Should not happen since we just planned

    switch (input.action) {
      case 'extend': {
        // Initialize or update decayMeta
        const nowStr = nowIso();
        entry.decayMeta = {
          lastVerifiedAt: nowStr,
          decayState: 'active' as DecayState,
          supersededById: entry.decayMeta?.supersededById ?? null,
          decayStateComputedAt: nowStr,
          freshnessType: entry.decayMeta?.freshnessType ?? 'evergreen',
        };

        // Create lifecycle event
        const event: KnowledgeLifecycleEventRecord = {
          id: store.nextId(data, 'evt'),
          type: 'updated',
          createdAt: nowStr,
          actorUserId: input.actorId,
          submissionId: null,
          revision: null,
          state: entry.lifecycleState,
          note: 'Lifecycle extended',
        };
        entry.lifecycleHistory.push(event);

        // Update timestamp
        entry.updatedAt = nowStr;
        mutatedRecords.push(entry);
        break;
      }

      case 'mark-review': {
        // Initialize or update decayMeta
        const nowStr = nowIso();
        entry.decayMeta = {
          lastVerifiedAt: entry.decayMeta?.lastVerifiedAt ?? entry.updatedAt,
          decayState: 'review-due' as DecayState,
          supersededById: entry.decayMeta?.supersededById ?? null,
          decayStateComputedAt: nowStr,
          freshnessType: entry.decayMeta?.freshnessType ?? 'evergreen',
        };

        // Create lifecycle event
        const event: KnowledgeLifecycleEventRecord = {
          id: store.nextId(data, 'evt'),
          type: 'updated',
          createdAt: nowStr,
          actorUserId: input.actorId,
          submissionId: null,
          revision: null,
          state: entry.lifecycleState,
          note: 'Marked for review',
        };
        entry.lifecycleHistory.push(event);

        // Update timestamp
        entry.updatedAt = nowStr;
        mutatedRecords.push(entry);
        break;
      }

      case 'deactivate': {
        const nowStr = nowIso();

        // Update lifecycle state
        transitionLifecycleState(entry, 'deactivated', 'batch deactivate');

        // Create lifecycle event
        const event: KnowledgeLifecycleEventRecord = {
          id: store.nextId(data, 'evt'),
          type: 'deactivated',
          createdAt: nowStr,
          actorUserId: input.actorId,
          submissionId: null,
          revision: null,
          state: 'deactivated',
          note: 'Batch deactivated',
        };
        entry.lifecycleHistory.push(event);

        // Update timestamp
        entry.updatedAt = nowStr;
        mutatedRecords.push(entry);
        break;
      }

      case 'supersede': {
        // Delegate to supersedeEntry
        if (!input.replacementId) continue; // Should not happen since we validated

        const supersededEntry = supersedeEntry({
          store,
          data,
          entryId: item.entryId,
          replacementId: input.replacementId,
          actorId: input.actorId,
        });
        mutatedRecords.push(supersededEntry);
        break;
      }

      default:
        throw new AppError(400, 'invalid_action', `Unknown batch action: ${input.action}`);
    }
  }

  return mutatedRecords;
}

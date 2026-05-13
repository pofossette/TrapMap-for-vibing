/**
 * Batch mutation service for maintenance operations on knowledge entries.
 *
 * Provides pure functions for planning and executing maintenance batch operations.
 * Supports assign-owner, extend-review, and mark-verified actions with dry-run mode.
 *
 * All functions are pure (except executeMaintenanceOperation which mutates data)
 * and use injected timestamps for deterministic testing.
 */

import type { MaintenanceAction } from '@trapmap/contracts';

import type { ActorRef } from '@trapmap/contracts';

import { AppError } from '../errors.js';
import type { KnowledgeRecord, SkillShareerStore, StoreData } from '../store.js';
import { nowIso } from '../store.js';
import { computeDefaultReviewBy, toActorRefFromRecord } from './model.js';

/**
 * Input for maintenance batch operation planning and execution.
 */
export interface MaintenanceOperationInput {
  /** IDs of entries to operate on (max 100) */
  entryIds: string[];
  /** Action to perform */
  action: MaintenanceAction;
  /** ID of the user performing the operation */
  actorId: string;
  /** New maintainer user ID (required for assign-owner action) */
  newMaintainerId?: string;
  /** New maintainer handle (for assign-owner action) */
  newMaintainerHandle?: string;
  /** New maintainer security level (for assign-owner action) */
  newMaintainerLevel?: number;
  /** Days to extend review-by (for extend-review and mark-verified actions) */
  extendDays?: number;
}

/**
 * Plan item for a single entry in a maintenance batch operation.
 */
export interface MaintenanceOperationPlanItem {
  /** Entry ID */
  entryId: string;
  /** Entry shortcut for display */
  shortcut: string;
  /** Current maintainer (null if unassigned) */
  currentMaintainer: ActorRef | null;
  /** Current review-by date (null if not scheduled) */
  currentReviewBy: string | null;
  /** Human-readable description of the proposed change */
  proposedChange: string;
  /** Whether this entry is eligible for the operation */
  eligible: boolean;
  /** Reason for ineligibility (null if eligible) */
  ineligibilityReason: string | null;
}

/**
 * Plan a maintenance batch operation without executing it.
 *
 * Computes what would happen for each entry without mutating any data.
 * Used for dry-run mode and for validating batch requests.
 *
 * @param data - Current store data (not mutated)
 * @param input - Maintenance operation parameters
 * @param now - Current timestamp
 * @returns Array of plan items for each entry
 */
export function planMaintenanceOperation(
  data: StoreData,
  input: MaintenanceOperationInput,
  _now: Date,
): MaintenanceOperationPlanItem[] {
  const results: MaintenanceOperationPlanItem[] = [];

  for (const entryId of input.entryIds) {
    const entry = data.knowledgeEntries.find((candidate) => candidate.id === entryId);

    // Entry not found
    if (!entry) {
      results.push({
        entryId,
        shortcut: '',
        currentMaintainer: null,
        currentReviewBy: null,
        proposedChange: '',
        eligible: false,
        ineligibilityReason: 'Entry not found',
      });
      continue;
    }

    // Get current maintainer info
    const currentMaintainer = entry.maintenanceMeta
      ? toActorRefFromRecord(entry.maintenanceMeta)
      : null;
    const currentReviewBy = entry.maintenanceMeta?.reviewBy ?? null;

    // Check if entry is approved (required for all maintenance operations)
    if (entry.lifecycleState !== 'approved') {
      results.push({
        entryId,
        shortcut: entry.shortcut,
        currentMaintainer,
        currentReviewBy,
        proposedChange: '',
        eligible: false,
        ineligibilityReason: 'Only approved entries can be modified',
      });
      continue;
    }

    // Process based on action type
    switch (input.action) {
      case 'assign-owner': {
        if (!input.newMaintainerId) {
          results.push({
            entryId,
            shortcut: entry.shortcut,
            currentMaintainer,
            currentReviewBy,
            proposedChange: '',
            eligible: false,
            ineligibilityReason: 'newMaintainerId required for assign-owner action',
          });
          break;
        }

        const handle = input.newMaintainerHandle ?? input.newMaintainerId;
        results.push({
          entryId,
          shortcut: entry.shortcut,
          currentMaintainer,
          currentReviewBy,
          proposedChange: `Assign maintainer to ${handle}`,
          eligible: true,
          ineligibilityReason: null,
        });
        break;
      }

      case 'extend-review': {
        const extendDays = input.extendDays ?? 90;
        results.push({
          entryId,
          shortcut: entry.shortcut,
          currentMaintainer,
          currentReviewBy,
          proposedChange: `Extend review date by ${extendDays} days`,
          eligible: true,
          ineligibilityReason: null,
        });
        break;
      }

      case 'mark-verified': {
        results.push({
          entryId,
          shortcut: entry.shortcut,
          currentMaintainer,
          currentReviewBy,
          proposedChange: 'Mark as re-verified and update review date',
          eligible: true,
          ineligibilityReason: null,
        });
        break;
      }

      default:
        throw new AppError(400, 'invalid_action', `Unknown maintenance action: ${input.action}`);
    }
  }

  return results;
}

/**
 * Execute a maintenance batch operation, mutating entries in the store data.
 *
 * First plans the operation, then applies changes only to eligible entries.
 *
 * @param store - Store instance for ID generation
 * @param data - Store data to mutate
 * @param input - Maintenance operation parameters
 * @param now - Current timestamp
 * @returns Array of mutated knowledge records
 */
export function executeMaintenanceOperation(
  _store: SkillShareerStore,
  data: StoreData,
  input: MaintenanceOperationInput,
  now: Date,
): KnowledgeRecord[] {
  // Plan first to get eligibility
  const plan = planMaintenanceOperation(data, input, now);

  // Filter to eligible items only
  const eligibleItems = plan.filter((item) => item.eligible);

  const mutatedRecords: KnowledgeRecord[] = [];

  for (const item of eligibleItems) {
    const entry = data.knowledgeEntries.find((candidate) => candidate.id === item.entryId);
    if (!entry) continue; // Should not happen since we just planned

    const nowStr = nowIso();

    switch (input.action) {
      case 'assign-owner': {
        // Set maintainer, preserve existing reviewBy
        entry.maintenanceMeta = {
          maintainerUserId: input.newMaintainerId ?? null,
          maintainerHandle: input.newMaintainerHandle ?? null,
          maintainerLevel: input.newMaintainerLevel ?? 0,
          reviewBy: entry.maintenanceMeta?.reviewBy ?? null,
        };

        // Update timestamp
        entry.updatedAt = nowStr;
        mutatedRecords.push(entry);
        break;
      }

      case 'extend-review': {
        // Initialize maintenanceMeta if null, preserving existing maintainer
        if (!entry.maintenanceMeta) {
          entry.maintenanceMeta = {
            maintainerUserId: null,
            maintainerHandle: null,
            maintainerLevel: null,
            reviewBy: null,
          };
        }

        // Extend review date
        entry.maintenanceMeta.reviewBy = computeDefaultReviewBy(input.extendDays ?? 90);

        // Update timestamp
        entry.updatedAt = nowStr;
        mutatedRecords.push(entry);
        break;
      }

      case 'mark-verified': {
        // Initialize maintenanceMeta if null, preserving existing maintainer
        if (!entry.maintenanceMeta) {
          entry.maintenanceMeta = {
            maintainerUserId: null,
            maintainerHandle: null,
            maintainerLevel: null,
            reviewBy: null,
          };
        }

        // Update review date
        entry.maintenanceMeta.reviewBy = computeDefaultReviewBy(input.extendDays ?? 90);

        // Also update decayMeta.lastVerifiedAt (dual update for SLA tracking)
        if (!entry.decayMeta) {
          entry.decayMeta = {
            lastVerifiedAt: nowStr,
            decayState: 'active',
            supersededById: null,
            decayStateComputedAt: nowStr,
            freshnessType: 'evergreen',
          };
        } else {
          entry.decayMeta.lastVerifiedAt = nowStr;
        }

        // Update timestamp
        entry.updatedAt = nowStr;
        mutatedRecords.push(entry);
        break;
      }

      default:
        throw new AppError(400, 'invalid_action', `Unknown maintenance action: ${input.action}`);
    }
  }

  return mutatedRecords;
}

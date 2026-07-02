import { randomUUID } from 'node:crypto';

import type { BatchAction, DecayConfig, DecayState } from '@trapmap/contracts';

import { AppError } from '@trapmap/server/lib/errors.js';
import { transitionLifecycleState } from '@trapmap/server/lib/lifecycle/index.js';
import type {
  KnowledgeLifecycleEventRecord,
  KnowledgeRecord,
  SkillShareerStore,
  StoreData,
} from '@trapmap/server/lib/store.js';
import { computeDecayState } from './state-machine.js';
import { supersedeEntry } from './supersede.js';

export interface BatchOperationInput {
  entryIds: string[];
  action: BatchAction;
  actorId: string;
  extendDays?: number;
  replacementId?: string;
}

export interface BatchOperationPlanItem {
  entryId: string;
  shortcut: string;
  currentDecayState: DecayState | null;
  proposedDecayState: DecayState | null;
  changeDescription: string;
  eligible: boolean;
  ineligibilityReason: string | null;
}

export function planBatchOperation(
  entriesById: ReadonlyMap<string, KnowledgeRecord> | StoreData,
  input: BatchOperationInput,
  config: DecayConfig,
  now: Date,
): BatchOperationPlanItem[] {
  const indexedEntries = isEntryMap(entriesById)
    ? entriesById
    : indexEntriesById(entriesById.knowledgeEntries);
  const results: BatchOperationPlanItem[] = [];

  for (const entryId of input.entryIds) {
    const entry = indexedEntries.get(entryId);
    if (!entry) {
      results.push(ineligiblePlanItem(entryId, '', null, 'Entry not found'));
      continue;
    }

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

    if (entry.lifecycleState !== 'approved') {
      results.push(
        ineligiblePlanItem(
          entryId,
          entry.shortcut,
          currentDecay,
          'Only approved entries can be modified',
        ),
      );
      continue;
    }

    switch (input.action) {
      case 'extend':
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
      case 'mark-review':
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
      case 'deactivate':
        results.push({
          entryId,
          shortcut: entry.shortcut,
          currentDecayState: currentDecay,
          proposedDecayState: null,
          changeDescription: 'Deactivate entry',
          eligible: true,
          ineligibilityReason: null,
        });
        break;
      case 'supersede': {
        if (!input.replacementId) {
          results.push(
            ineligiblePlanItem(
              entryId,
              entry.shortcut,
              currentDecay,
              'replacementId required for supersede action',
            ),
          );
          break;
        }
        if (entryId === input.replacementId) {
          results.push(
            ineligiblePlanItem(
              entryId,
              entry.shortcut,
              currentDecay,
              'Cannot supersede an entry with itself',
            ),
          );
          break;
        }
        const replacement = indexedEntries.get(input.replacementId);
        if (!replacement) {
          results.push(
            ineligiblePlanItem(
              entryId,
              entry.shortcut,
              currentDecay,
              'Replacement entry not found',
            ),
          );
          break;
        }
        if (replacement.lifecycleState !== 'approved') {
          results.push(
            ineligiblePlanItem(
              entryId,
              entry.shortcut,
              currentDecay,
              'Replacement must be approved',
            ),
          );
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

export function applyBatchMutation(
  entry: KnowledgeRecord,
  input: BatchOperationInput,
  appliedAt: string,
): {
  previousState: KnowledgeRecord['lifecycleState'];
  nextState: KnowledgeRecord['lifecycleState'];
} {
  const previousState = entry.lifecycleState;

  switch (input.action) {
    case 'extend':
      entry.decayMeta = {
        lastVerifiedAt: appliedAt,
        decayState: 'active',
        supersededById: entry.decayMeta?.supersededById ?? null,
        decayStateComputedAt: appliedAt,
        freshnessType: entry.decayMeta?.freshnessType ?? 'evergreen',
      };
      entry.lifecycleHistory.push(
        createLifecycleEvent({
          actorId: input.actorId,
          createdAt: appliedAt,
          note: 'Lifecycle extended',
          state: entry.lifecycleState,
          type: 'updated',
        }),
      );
      break;
    case 'mark-review':
      entry.decayMeta = {
        lastVerifiedAt: entry.decayMeta?.lastVerifiedAt ?? entry.updatedAt,
        decayState: 'review-due',
        supersededById: entry.decayMeta?.supersededById ?? null,
        decayStateComputedAt: appliedAt,
        freshnessType: entry.decayMeta?.freshnessType ?? 'evergreen',
      };
      entry.lifecycleHistory.push(
        createLifecycleEvent({
          actorId: input.actorId,
          createdAt: appliedAt,
          note: 'Marked for review',
          state: entry.lifecycleState,
          type: 'updated',
        }),
      );
      break;
    case 'deactivate':
      transitionLifecycleState(entry, 'deactivated', 'batch deactivate');
      entry.lifecycleHistory.push(
        createLifecycleEvent({
          actorId: input.actorId,
          createdAt: appliedAt,
          note: 'Batch deactivated',
          state: 'deactivated',
          type: 'deactivated',
        }),
      );
      break;
    case 'supersede':
      throw new AppError(
        500,
        'supersede_requires_compat_transaction',
        'Supersede must execute through the compatibility transaction seam',
      );
    default:
      throw new AppError(400, 'invalid_action', `Unknown batch action: ${input.action}`);
  }

  entry.updatedAt = appliedAt;
  return { previousState, nextState: entry.lifecycleState };
}

export function indexEntriesById(
  entries: readonly KnowledgeRecord[],
): Map<string, KnowledgeRecord> {
  return new Map(entries.map((entry) => [entry.id, entry]));
}

export function executeBatchOperation(
  store: SkillShareerStore,
  data: StoreData,
  input: BatchOperationInput,
  config: DecayConfig,
  now: Date,
): KnowledgeRecord[] {
  const plan = planBatchOperation(data, input, config, now);
  const mutatedRecords: KnowledgeRecord[] = [];
  const appliedAt = batchAppliedAt(now);

  for (const planItem of plan.filter((item) => item.eligible)) {
    const entry = data.knowledgeEntries.find((candidate) => candidate.id === planItem.entryId);
    if (!entry) {
      continue;
    }

    if (input.action === 'supersede') {
      if (!input.replacementId) {
        continue;
      }
      mutatedRecords.push(
        supersedeEntry({
          store,
          data,
          entryId: planItem.entryId,
          replacementId: input.replacementId,
          actorId: input.actorId,
        }),
      );
      continue;
    }

    applyBatchMutation(entry, input, appliedAt);
    mutatedRecords.push(entry);
  }

  return mutatedRecords;
}

function ineligiblePlanItem(
  entryId: string,
  shortcut: string,
  currentDecayState: DecayState | null,
  reason: string,
): BatchOperationPlanItem {
  return {
    entryId,
    shortcut,
    currentDecayState,
    proposedDecayState: null,
    changeDescription: '',
    eligible: false,
    ineligibilityReason: reason,
  };
}

function createLifecycleEvent(args: {
  actorId: string;
  createdAt: string;
  note: string;
  state: KnowledgeRecord['lifecycleState'];
  type: KnowledgeLifecycleEventRecord['type'];
}): KnowledgeLifecycleEventRecord {
  return {
    id: `evt_${randomUUID()}`,
    type: args.type,
    createdAt: args.createdAt,
    actorUserId: args.actorId,
    submissionId: null,
    revision: null,
    state: args.state,
    note: args.note,
  };
}

export function batchAppliedAt(now: Date): string {
  return now.toISOString();
}

function isEntryMap(
  value: ReadonlyMap<string, KnowledgeRecord> | StoreData,
): value is ReadonlyMap<string, KnowledgeRecord> {
  return value instanceof Map;
}

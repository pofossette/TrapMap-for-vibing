import type { BatchOperationItem, BatchOperationRequest } from '@trapmap/contracts';

import type { ResolvedAuthContext } from '@trapmap/server/lib/context.js';
import { loadDecayConfig } from '@trapmap/server/lib/decay/config.js';
import { AppError } from '@trapmap/server/lib/errors.js';
import type { KnowledgeRepository } from '@trapmap/server/lib/knowledge/index.js';
import {
  loadKnowledgeEntriesByIds,
  saveKnowledgeEntry,
} from '@trapmap/server/lib/knowledge/repository.js';
import type { LifecyclePublisher } from '@trapmap/server/lib/lifecycle/publisher.js';
import type { KnowledgeRecord } from '@trapmap/server/lib/store.js';
import {
  applyBatchMutation,
  batchAppliedAt,
  indexEntriesById,
  planBatchOperation,
} from './batch.js';

export interface DecayBatchApplicationService {
  previewBatch(input: {
    auth: ResolvedAuthContext;
    command: BatchOperationRequest;
  }): Promise<{
    action: BatchOperationRequest['action'];
    dryRun: boolean;
    items: BatchOperationItem[];
    totalEligible: number;
    totalIneligible: number;
    appliedAt: string | null;
  }>;
  executeBatch(input: {
    auth: ResolvedAuthContext;
    command: BatchOperationRequest;
  }): Promise<{
    action: BatchOperationRequest['action'];
    dryRun: boolean;
    items: BatchOperationItem[];
    totalEligible: number;
    totalIneligible: number;
    appliedAt: string | null;
  }>;
}

export interface DecayBatchApplicationServiceDeps {
  repos: {
    knowledge: KnowledgeRepository;
  };
  lifecyclePublisher: LifecyclePublisher;
}

export function createDecayBatchApplicationService(
  deps: DecayBatchApplicationServiceDeps,
): DecayBatchApplicationService {
  return {
    previewBatch: (input) => previewBatch(deps, input),
    executeBatch: (input) => executeBatch(deps, input),
  };
}

async function previewBatch(
  deps: DecayBatchApplicationServiceDeps,
  input: {
    auth: ResolvedAuthContext;
    command: BatchOperationRequest;
  },
) {
  const config = loadDecayConfig();
  const now = new Date();
  const entries = await loadEntriesForBatch(deps.repos, input.command);
  const entryMap = indexEntriesById(entries);
  const operationInput = toBatchOperationInput(input.auth, input.command);
  return buildBatchResponse(
    input.command.action,
    true,
    planBatchOperation(entryMap, operationInput, config, now),
    null,
  );
}

async function executeBatch(
  deps: DecayBatchApplicationServiceDeps,
  input: {
    auth: ResolvedAuthContext;
    command: BatchOperationRequest;
  },
) {
  const config = loadDecayConfig();
  const now = new Date();
  const appliedAt = batchAppliedAt(now);
  const operationInput = toBatchOperationInput(input.auth, input.command);
  const entries = await loadEntriesForBatch(deps.repos, input.command);
  const entryMap = indexEntriesById(entries);
  const plan = planBatchOperation(entryMap, operationInput, config, now);

  if (input.command.action === 'supersede') {
    const mutated: Array<{ id: string; nextState: KnowledgeRecord['lifecycleState'] }> = [];
    for (const planItem of plan.filter((item) => item.eligible)) {
      const supersededEntry = await deps.repos.knowledge.supersede(planItem.entryId, {
        replacementId: input.command.replacementId ?? '',
        actorId: input.auth.actorId,
      });
      mutated.push({ id: supersededEntry.id, nextState: supersededEntry.lifecycleState });
    }

    for (const item of mutated) {
      await deps.lifecyclePublisher.publishTransition({
        aggregateType: 'knowledge',
        aggregateId: item.id,
        previousState: 'approved',
        nextState: 'deactivated',
        actorId: input.auth.actorId,
        reason: `batch-${input.command.action}`,
      });
    }

    return buildBatchResponse(input.command.action, false, plan, appliedAt);
  }

  for (const item of plan.filter((candidate) => candidate.eligible)) {
    const entry = entryMap.get(item.entryId);
    if (!entry) {
      continue;
    }
    applyBatchMutation(entry, operationInput, appliedAt);
    await saveEntry(deps.repos, entry);
    await deps.lifecyclePublisher.publishTransition({
      aggregateType: 'knowledge',
      aggregateId: entry.id,
      previousState: 'approved',
      nextState: entry.lifecycleState,
      actorId: input.auth.actorId,
      reason: `batch-${input.command.action}`,
    });
  }

  return buildBatchResponse(input.command.action, false, plan, appliedAt);
}

function toBatchOperationInput(
  auth: ResolvedAuthContext,
  command: BatchOperationRequest,
): Parameters<typeof planBatchOperation>[1] {
  return {
    entryIds: command.entryIds,
    action: command.action,
    actorId: auth.actorId,
    ...(command.extendDays !== undefined ? { extendDays: command.extendDays } : {}),
    ...(command.replacementId !== undefined ? { replacementId: command.replacementId } : {}),
  };
}

async function loadEntriesForBatch(
  depsRepos: DecayBatchApplicationServiceDeps['repos'],
  command: BatchOperationRequest,
) {
  const ids = [...command.entryIds];
  if (command.replacementId) {
    ids.push(command.replacementId);
  }
  return loadKnowledgeEntriesByIds(depsRepos.knowledge, ids);
}

async function saveEntry(
  depsRepos: DecayBatchApplicationServiceDeps['repos'],
  entry: KnowledgeRecord,
) {
  try {
    await saveKnowledgeEntry(depsRepos.knowledge, entry);
  } catch {
    throw new AppError(
      500,
      'knowledge_save_unavailable',
      'Knowledge repository save is unavailable',
    );
  }
}

function buildBatchResponse(
  action: BatchOperationRequest['action'],
  dryRun: boolean,
  planItems: ReturnType<typeof planBatchOperation>,
  appliedAt: string | null,
) {
  const items: BatchOperationItem[] = planItems.map((item) => ({
    entryId: item.entryId,
    shortcut: item.shortcut,
    currentDecayState: item.currentDecayState,
    proposedDecayState: item.proposedDecayState,
    changeDescription: item.changeDescription,
    eligible: item.eligible,
    ineligibilityReason: item.ineligibilityReason,
  }));
  const totalEligible = items.filter((item) => item.eligible).length;

  return {
    action,
    dryRun,
    items,
    totalEligible,
    totalIneligible: items.length - totalEligible,
    appliedAt,
  };
}

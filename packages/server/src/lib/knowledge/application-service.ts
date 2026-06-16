/**
 * Shared application service for knowledge and trap workflows.
 *
 * Extracts submit / resubmit / supersede persistence logic from route handlers
 * so that `knowledge.ts` and `traps.ts` become thin HTTP layers that delegate
 * to a single canonical workflow implementation.
 *
 * Phase 3 of the PG-first convergence plan.
 */

import type {
  AgentReviewResult,
  Boundary,
  KnowledgeResubmission,
  KnowledgeSubmission,
} from '@trapmap/contracts';

import type { ChatProvider } from '@trapmap/server/lib/ai/types.js';
import { AppError } from '@trapmap/server/lib/errors.js';
import {
  createKnowledgeEntryRecord,
  createKnowledgeRevision,
} from '@trapmap/server/lib/knowledge.js';
import { runPreReview } from '@trapmap/server/lib/pre-review.js';
import type { KnowledgeRecord } from '@trapmap/server/lib/store.js';
import { nowIso } from '@trapmap/server/lib/store.js';
import type { KnowledgeRepository } from './repository.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EntryKind = 'knowledge' | 'trap';

export interface SubmitKnowledgeInput {
  kind: EntryKind;
  ownerUserId: string;
  teamId: string | null;
  payload: KnowledgeSubmission;
  requiredLevel: number;
  boundary?: Boundary | null | undefined;
}

export interface ResubmitKnowledgeInput {
  kind: EntryKind;
  entryId: string;
  ownerUserId: string;
  payload: KnowledgeResubmission;
}

export interface SupersedeKnowledgeInput {
  kind: EntryKind;
  entryId: string;
  replacementId: string;
  actorId: string;
}

export interface KnowledgeSubmitResult {
  entry: KnowledgeRecord;
  preReview: AgentReviewResult;
}

export interface KnowledgeResubmitResult {
  entry: KnowledgeRecord;
  preReview: AgentReviewResult;
}

export interface KnowledgeSupersedeResult {
  entry: KnowledgeRecord;
}

export interface KnowledgeApplicationService {
  submit(input: SubmitKnowledgeInput): Promise<KnowledgeSubmitResult>;
  resubmit(input: ResubmitKnowledgeInput): Promise<KnowledgeResubmitResult>;
  supersede(input: SupersedeKnowledgeInput): Promise<KnowledgeSupersedeResult>;
}

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface KnowledgeApplicationServiceDeps {
  knowledgeRepo: KnowledgeRepository;
  chatProvider: ChatProvider;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createKnowledgeApplicationService(
  deps: KnowledgeApplicationServiceDeps,
): KnowledgeApplicationService {
  return {
    submit: (input) => submit(deps, input),
    resubmit: (input) => resubmit(deps, input),
    supersede: (input) => supersede(deps, input),
  };
}

// ---------------------------------------------------------------------------
// Submit
// ---------------------------------------------------------------------------

async function submit(
  deps: KnowledgeApplicationServiceDeps,
  input: SubmitKnowledgeInput,
): Promise<KnowledgeSubmitResult> {
  const { knowledgeRepo, chatProvider } = deps;

  const existingEntries = await knowledgeRepo.listByFilter({});

  const preReview = await runPreReview({
    existingEntries,
    submission: input.payload,
    chatProvider,
    authorBoundary: input.boundary ?? null,
  });

  const createdAt = nowIso();
  const entryId = await knowledgeRepo.nextId();

  // Use author boundary if provided, otherwise use extracted boundary from pre-review
  const boundary = input.boundary ?? preReview.boundary ?? null;

  const record = createKnowledgeEntryRecord({
    ownerUserId: input.ownerUserId,
    teamId: input.teamId,
    payload: input.payload,
    requiredLevel: input.requiredLevel,
    createdAt,
    preReview,
    boundary,
    entryId,
  });

  await knowledgeRepo.insert(record);

  return { entry: record, preReview };
}

// ---------------------------------------------------------------------------
// Resubmit
// ---------------------------------------------------------------------------

async function resubmit(
  deps: KnowledgeApplicationServiceDeps,
  input: ResubmitKnowledgeInput,
): Promise<KnowledgeResubmitResult> {
  const { knowledgeRepo, chatProvider } = deps;

  const existingEntries = (await knowledgeRepo.listByFilter({})).filter(
    (entry) => entry.id !== input.entryId,
  );

  const preReview = await runPreReview({
    existingEntries,
    submission: {
      scope: 'project',
      labels: input.payload.labels,
      shortcut: input.payload.shortcut,
      detail: input.payload.detail,
    },
    chatProvider,
    authorBoundary: input.payload.boundary ?? null,
  });

  const existingEntry = await knowledgeRepo.getById(input.entryId);
  if (!existingEntry) {
    throw new AppError(404, 'knowledge_not_found', 'Knowledge entry not found');
  }

  if (existingEntry.ownerUserId !== input.ownerUserId) {
    throw new AppError(403, 'forbidden', 'Only the original submitter may resubmit this entry');
  }

  if (!['rejected', 'agent-rejected'].includes(existingEntry.lifecycleState)) {
    throw new AppError(400, 'invalid_state', 'Only rejected entries may be resubmitted');
  }

  const submittedAt = nowIso();
  const boundary = input.payload.boundary ?? preReview.boundary ?? null;
  const previousSubmissionId = existingEntry.latestSubmissionId;
  const revisionNumber = existingEntry.history.length + 1;

  const revision = createKnowledgeRevision(
    input.ownerUserId,
    {
      detail: input.payload.detail,
      labels: input.payload.labels,
      shortcut: input.payload.shortcut,
    },
    revisionNumber,
    submittedAt,
  );

  const newLifecycleState = preReview.status;

  // Persist all changes via repository — each method handles its own storage backend.
  await knowledgeRepo.updateGovernance(input.entryId, {
    labels: revision.labels,
    requiredLevel: existingEntry.requiredLevel,
  });
  await knowledgeRepo.appendRevision(input.entryId, revision);
  await knowledgeRepo.updateLifecycle(input.entryId, newLifecycleState, {
    actorId: input.ownerUserId,
    note: previousSubmissionId ? `Resubmission of ${previousSubmissionId}` : 'resubmit',
  });

  // Build response entry snapshot from existing + applied changes
  const entryForResponse: KnowledgeRecord = {
    ...existingEntry,
    labels: revision.labels,
    shortcut: revision.shortcut,
    detail: revision.detail,
    lifecycleState: newLifecycleState,
    latestRevision: revision,
    history: [...existingEntry.history, revision],
    boundary: boundary ?? existingEntry.boundary,
    updatedAt: submittedAt,
  };

  return { entry: entryForResponse, preReview };
}

// ---------------------------------------------------------------------------
// Supersede
// ---------------------------------------------------------------------------

async function supersede(
  deps: KnowledgeApplicationServiceDeps,
  input: SupersedeKnowledgeInput,
): Promise<KnowledgeSupersedeResult> {
  const supersededEntry = await deps.knowledgeRepo.supersede(input.entryId, {
    replacementId: input.replacementId,
    actorId: input.actorId,
  });

  return { entry: supersededEntry };
}

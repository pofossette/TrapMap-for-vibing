/**
 * Resolution service for candidate routes.
 *
 * Handles manual-result attachment and apply-resolution orchestration.
 * Separated from route handlers to keep request parsing distinct from
 * business orchestration and transaction management.
 *
 * @module candidates/services/resolution
 */

import type { ManualResultSubmission } from '@trapmap/contracts';
import { createAuditEvent } from '@trapmap/server/lib/audit.js';
import { applyManualResultResolution } from '@trapmap/server/lib/candidates/reconcile.js';
import { AppError } from '@trapmap/server/lib/errors.js';
import { findTransitionEvent } from '@trapmap/server/lib/lifecycle/transitions.js';
import type { ResolvedAuthContext, SkillShareerServices } from '@trapmap/server/lib/context.js';
import { nowIso } from '@trapmap/server/lib/store.js';
import type { SkillShareerStore } from '@trapmap/server/lib/store.js';
import { logUserOperation } from '@trapmap/server/lib/user-ops-log.js';
import type { LifecycleEventBus } from '@trapmap/server/lib/lifecycle/event-bus.js';

/** Dependencies required by the resolution service. */
export interface ResolutionDeps {
  store: SkillShareerStore;
  repos: SkillShareerServices['repos'];
  eventBus: LifecycleEventBus;
  config: SkillShareerServices['config'];
}

/**
 * Validate and attach a manual resolution result to a candidate.
 *
 * @param deps - Application dependencies
 * @param auth - Resolved auth context
 * @param candidateId - Candidate identifier
 * @param body - Parsed manual result submission
 * @returns Response payload for the manual-result endpoint
 */
export async function attachManualResult(
  deps: ResolutionDeps,
  auth: ResolvedAuthContext,
  candidateId: string,
  body: ManualResultSubmission,
): Promise<{
  candidateId: string;
  decision: string;
  reviewedAt: string;
  reviewedBy: string;
  nextState: string;
}> {
  // Validate mergedWith is present for merged decision
  if (body.decision === 'merged' && !body.mergedWith) {
    throw new AppError(
      400,
      'validation_error',
      'mergedWith is required when decision is "merged"',
    );
  }

  const nextState = body.decision === 'independent' ? 'ready_for_review' : 'rejected';

  const { candidate: candidateRepo } = deps.repos;
  await candidateRepo.attachManualResult(candidateId, body, auth.user!.id);

  void logUserOperation(deps.config.userOpsLog, {
    timestamp: nowIso(),
    actorId: auth.actorId,
    actorHandle: auth.handle,
    action: 'manual-result',
    targetId: candidateId,
    teamId: auth.activeTeamId,
    metadata: { decision: body.decision },
  });

  return {
    candidateId,
    decision: body.decision,
    reviewedAt: nowIso(),
    reviewedBy: auth.user!.id,
    nextState,
  };
}

/**
 * Apply a previously attached manual resolution.
 *
 * Runs the core resolution inside a transaction, records audit events,
 * and performs post-commit side-effects (lineage, lifecycle events).
 *
 * @param deps - Application dependencies
 * @param auth - Resolved auth context
 * @param candidateId - Candidate identifier
 * @returns Response payload for the apply-resolution endpoint
 */
export async function applyResolution(
  deps: ResolutionDeps,
  auth: ResolvedAuthContext,
  candidateId: string,
): Promise<{
  candidateId: string;
  status: string;
  outcome: any;
  lineage: any;
}> {
  const { store, repos, eventBus, config } = deps;

  // Capture context for post-commit indexing
  let publishedEntityId: string | null = null;
  let publishedEntityType: 'trap' | 'skill' | null = null;

  const result = await store.transact(async (data) => {
    const resolution = await applyManualResultResolution({
      store,
      data,
      candidateId,
      actor: auth,
      lineageRepo: repos.lineage,
    });

    if (!resolution.success) {
      throw new AppError(
        resolution.error?.code === 'candidate_not_found' ? 404 : 400,
        resolution.error?.code ?? 'resolution_failed',
        resolution.error?.message ?? 'Resolution failed',
      );
    }

    // Capture published entity info for indexing
    if (resolution.outcome?.decision === 'independent' && resolution.outcome.publishedEntityId) {
      publishedEntityId = resolution.outcome.publishedEntityId;
      publishedEntityType = resolution.outcome.entityType;
    }

    // Record audit event
    const auditEvent = createAuditEvent({
      store,
      data,
      teamId: resolution.candidate?.teamId ?? null,
      actor: auth,
      action:
        resolution.outcome?.decision === 'independent'
          ? 'duplicate-resolved-independent'
          : 'duplicate-resolved-merged',
      entityId: candidateId,
      payload: {
        decision: resolution.outcome?.decision,
        publishedEntityId: resolution.outcome?.publishedEntityId,
        mergedIntoEntityId: resolution.outcome?.mergedIntoEntityId,
        notes: resolution.outcome?.notes,
      },
    });
    data.auditEvents.push(auditEvent);

    return resolution;
  });

  // Post-commit: flush lineage record via repository
  if (result.lineage) {
    await repos.lineage.insert(result.lineage);
  }

  // Post-commit: emit event for newly published entities
  if (publishedEntityId && publishedEntityType === 'trap') {
    const eventName = findTransitionEvent('submitted', 'agent-pass');
    if (eventName) {
      await eventBus.emitDomainEventAsync({
        name: eventName,
        entryId: publishedEntityId,
        previousState: 'submitted',
        nextState: 'agent-pass',
        actorId: auth.actorId,
        reason: 'duplicate-resolved-independent',
        timestamp: nowIso(),
      });
    }
  }

  // Log user operation
  void logUserOperation(config.userOpsLog, {
    timestamp: nowIso(),
    actorId: auth.actorId,
    actorHandle: auth.handle,
    action: 'apply-resolution',
    targetId: candidateId,
    teamId: auth.activeTeamId,
    metadata: {
      decision: result.outcome?.decision,
      publishedEntityId: result.outcome?.publishedEntityId,
      mergedIntoEntityId: result.outcome?.mergedIntoEntityId,
    },
  });

  return {
    candidateId,
    status: result.candidate!.status,
    outcome: result.outcome,
    lineage: result.lineage ?? null,
  };
}

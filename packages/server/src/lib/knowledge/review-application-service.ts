import type { Boundary, LifecycleState, ReviewDecisionRequest } from '@trapmap/contracts';
import type { ActorBatchLookupPort, AuditLogPort } from '@trapmap/backend-core';

import {
  buildUserLookupContext,
  buildUserLookupContextForKnowledge,
} from '@trapmap/server/lib/actors/lookup.js';
import {
  createCacheInvalidationEvent,
  emitCacheInvalidation,
} from '@trapmap/server/lib/cache/invalidation.js';
import type { ResolvedAuthContext } from '@trapmap/server/lib/context.js';
import { AppError } from '@trapmap/server/lib/errors.js';
import type { FeedbackRepository } from '@trapmap/server/lib/feedback/index.js';
import {
  FEEDBACK_REMEDIATION_THRESHOLD,
  getActiveEntryFeedback,
} from '@trapmap/server/lib/feedback/remediation.js';
import { applyReviewDecision, toKnowledgeEntry } from '@trapmap/server/lib/knowledge.js';
import type { KnowledgeRepository } from '@trapmap/server/lib/knowledge/index.js';
import type { LifecyclePublisher } from '@trapmap/server/lib/lifecycle/index.js';
import { requireHigherLevel, requireTeamAccess } from '@trapmap/server/lib/rbac.js';
import { saveKnowledgeEntry } from './repository.js';

export interface ApplyReviewDecisionInput {
  actorId: string;
  authContext: ResolvedAuthContext;
  entryId: string;
  decision: 'approve' | 'reject';
  notes: string;
  appliedAt: string;
  boundary?: Boundary | undefined;
  evidence?: ReviewDecisionRequest['evidence'];
}

export interface ReviewApplicationService {
  applyDecision(input: ApplyReviewDecisionInput): Promise<{
    entry: ReturnType<typeof toKnowledgeEntry>;
    previousState: LifecycleState;
    nextState: LifecycleState;
  }>;
}

export interface ReviewApplicationServiceDeps {
  repos: {
    knowledge: KnowledgeRepository;
  };
  identity: { auditLog: AuditLogPort; actorLookup: ActorBatchLookupPort };
  lifecyclePublisher: LifecyclePublisher;
  feedbackRepo: FeedbackRepository;
}

export function createReviewApplicationService(
  deps: ReviewApplicationServiceDeps,
): ReviewApplicationService {
  return {
    applyDecision: (input) => applyDecision(deps, input),
  };
}

async function applyDecision(deps: ReviewApplicationServiceDeps, input: ApplyReviewDecisionInput) {
  const { repos, identity, lifecyclePublisher, feedbackRepo } = deps;
  const existingEntry = await repos.knowledge.getById(input.entryId);
  if (!existingEntry) {
    throw new AppError(404, 'knowledge_not_found', 'Knowledge entry not found');
  }

  if (existingEntry.teamId) {
    requireTeamAccess(input.authContext, existingEntry.teamId);
  }
  requireHigherLevel(input.authContext, existingEntry.requiredLevel);

  const reviewerUserId =
    input.authContext.user?.id ??
    (() => {
      throw new AppError(403, 'user_required', 'System admin cannot author review decisions');
    })();

  const previousState = existingEntry.lifecycleState;
  const lookup = await buildUserLookupContext(identity.actorLookup, existingEntry);

  if (!lookup.users.some((user) => user.id === reviewerUserId)) {
    const reviewerUser = (await identity.actorLookup.getUsersByIds([reviewerUserId]))[0] ?? null;
    if (!reviewerUser) {
      throw new AppError(404, 'user_not_found', 'User record not found');
    }
    lookup.users.push({ id: reviewerUser.id, handle: reviewerUser.handle });
  }

  if (existingEntry.teamId) {
    const reviewerMembership = (
      await identity.actorLookup.getMembershipLevels([
        { userId: reviewerUserId, teamId: existingEntry.teamId },
      ])
    ).get(`${reviewerUserId}:${existingEntry.teamId}`);
    if (
      reviewerMembership &&
      !lookup.memberships.some(
        (membership) =>
          membership.userId === reviewerUserId && membership.teamId === existingEntry.teamId,
      )
    ) {
      lookup.memberships.push({
        userId: reviewerUserId,
        teamId: existingEntry.teamId,
        securityLevel: reviewerMembership,
      });
    }
  }

  applyReviewDecision(
    input.evidence !== undefined
      ? {
          data: lookup,
          entry: existingEntry,
          reviewerUserId,
          decidedAt: input.appliedAt,
          decision: input.decision,
          notes: input.notes,
          evidence: {
            sourceType: input.evidence.sourceType,
            evidenceLevel: input.evidence.evidenceLevel,
            ...(input.evidence.sourceRef !== undefined
              ? { sourceRef: input.evidence.sourceRef }
              : {}),
            ...(input.evidence.verifiedAt !== undefined
              ? { verifiedAt: input.evidence.verifiedAt }
              : {}),
            ...(input.evidence.verifiedBy !== undefined
              ? { verifiedBy: input.evidence.verifiedBy }
              : {}),
          },
        }
      : {
          data: lookup,
          entry: existingEntry,
          reviewerUserId,
          decidedAt: input.appliedAt,
          decision: input.decision,
          notes: input.notes,
        },
  );

  if (input.boundary !== undefined) {
    existingEntry.boundary = input.boundary;
  }

  await saveKnowledgeEntry(repos.knowledge, existingEntry);

  await identity.auditLog.record({
    teamId: existingEntry.teamId,
    actorId: input.authContext.actorId,
    action: 'knowledge-reviewed',
    entityId: existingEntry.id,
    metadata: {
      decision: input.decision,
      notes: input.notes,
      previousState,
      ...(input.evidence !== undefined && { evidence: input.evidence }),
    },
    timestamp: input.appliedAt,
  });

  if (input.decision === 'approve') {
    const entryFeedback = await feedbackRepo.listByEntry(input.entryId);
    const unresolved = getActiveEntryFeedback(entryFeedback, input.entryId);
    if (unresolved.length >= FEEDBACK_REMEDIATION_THRESHOLD) {
      for (const feedback of unresolved) {
        await feedbackRepo.update(feedback.id, {
          remediationStatus: 'ready-to-reindex',
          remediationResolvedAt: input.appliedAt,
          remediationResolvedByUserId: input.authContext.user?.id ?? null,
        });
      }
      emitCacheInvalidation(
        createCacheInvalidationEvent({
          sourceType: 'trap',
          sourceId: input.entryId,
          reason: 'remediation-suppressed',
          owner: 'feedback-remediation-projection',
          trigger: 'write-through-fallback',
        }),
      );
    }
  }

  const nextState = existingEntry.lifecycleState;
  await lifecyclePublisher.publishTransition({
    aggregateType: 'knowledge',
    aggregateId: existingEntry.id,
    previousState,
    nextState,
    actorId: input.actorId,
    reason: `reviewer-${input.decision}`,
  });

  const responseLookup = await buildUserLookupContextForKnowledge(identity.actorLookup, [
    existingEntry,
  ]);
  return {
    entry: toKnowledgeEntry(responseLookup, existingEntry),
    previousState,
    nextState,
  };
}

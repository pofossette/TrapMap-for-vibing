import {
  skillReviewDecisionRequestSchema,
  skillReviewDecisionResponseSchema,
  skillReviewQueueResponseSchema,
} from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { toSkillArtifact } from '@trapmap/server/lib/artifacts/model.js';
import { createAuditEvent } from '@trapmap/server/lib/audit.js';
import { AppError } from '@trapmap/server/lib/errors.js';
import { artifactGraphIndexAdapter } from '@trapmap/server/lib/indexing/adapters/artifact-graph.js';
import { runSkillIndexEvent } from '@trapmap/server/lib/indexing/skill-events.js';
import { transitionLifecycleState } from '@trapmap/server/lib/lifecycle/state-machine.js';
import {
  requireHigherLevel,
  requirePermission,
  requireTeamAccess,
} from '@trapmap/server/lib/rbac.js';
import { resolveAuthContext } from '@trapmap/server/lib/session.js';
import { nowIso } from '@trapmap/server/lib/store.js';
import { logUserOperation } from '@trapmap/server/lib/user-ops-log.js';

export const skillReviewRoutes: FastifyPluginAsync = async (app) => {
  // Skill review queue endpoint (Phase 20-01: SKED-03)
  app.get('/v1/operations/artifacts/review-queue', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:review');

    // Use repository for listing artifacts (replaces store.snapshot() for initial data load)
    const { artifact: artifactRepo } = app.skillShareer.repos;
    const allArtifacts = await artifactRepo.listByFilter({ lifecycleState: 'agent-pass' });

    // Filter artifacts for review queue
    // Only show artifacts with lifecycleState of 'agent-pass' (pending review)
    const pendingArtifacts = allArtifacts.filter((artifact) => {
      // Team access check for non-system-admin
      if (artifact.teamId && auth.subjectType !== 'system-admin') {
        try {
          requireTeamAccess(auth, artifact.teamId);
        } catch {
          return false;
        }
      }

      // Security level check: reviewer must have strictly higher level
      if (auth.subjectType !== 'system-admin' && auth.securityLevel <= artifact.requiredLevel) {
        return false;
      }

      return true;
    });

    // toSkillArtifact needs StoreData for user handle resolution
    const data = await app.skillShareer.store.snapshot();

    // Map to queue items
    const items = pendingArtifacts.map((artifact) => {
      const serializedArtifact = toSkillArtifact(data, artifact);
      const lastHistoryItem = serializedArtifact.history[serializedArtifact.history.length - 1];
      const lastDecision =
        artifact.reviewHistory.length > 0
          ? artifact.reviewHistory[artifact.reviewHistory.length - 1]
          : null;

      return {
        artifact: serializedArtifact,
        revision: artifact.latestRevision.revision,
        agentReview: artifact.agentReview,
        submittedBy: lastHistoryItem?.submittedBy ?? serializedArtifact.owner,
        lastDecision,
      };
    });

    // Log user operation (fire-and-forget)
    void logUserOperation(app.skillShareer.config.userOpsLog, {
      timestamp: nowIso(),
      actorId: auth.actorId,
      actorHandle: auth.handle,
      action: 'review-list',
      targetId: null,
      teamId: auth.activeTeamId,
      metadata: { endpoint: 'artifact-review-queue', itemCount: items.length },
    });

    return skillReviewQueueResponseSchema.parse({
      items,
      nextCursor: null,
      total: items.length,
    });
  });

  // Skill review decision endpoint (Phase 20-01: SKED-03)
  app.post('/v1/operations/artifacts/:artifactId/review', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:review');

    // System admin cannot review (requires real user for decidedByUserId)
    if (auth.subjectType === 'system-admin') {
      throw new AppError(403, 'user_required', 'System admin cannot author review decisions');
    }

    const reviewerUserId = auth.user?.id;
    if (!reviewerUserId) {
      throw new AppError(403, 'user_not_found', 'User record not found');
    }

    const artifactId = (request.params as { artifactId: string }).artifactId;
    const body = skillReviewDecisionRequestSchema.parse(
      (request.body as Record<string, unknown>) ?? {},
    );

    const decidedAt = nowIso();

    const result = await app.skillShareer.store.transact((data) => {
      // Ensure skillArtifacts exists
      if (!data.skillArtifacts) {
        data.skillArtifacts = [];
      }

      // Find the artifact
      const artifact = data.skillArtifacts.find((a) => a.id === artifactId);
      if (!artifact) {
        throw new AppError(404, 'artifact_not_found', `Artifact ${artifactId} not found`);
      }

      // Capture previous state
      const previousState = artifact.lifecycleState;

      // Apply team access check
      if (artifact.teamId) {
        requireTeamAccess(auth, artifact.teamId);
      }

      // Apply strictly higher level check
      requireHigherLevel(auth, artifact.requiredLevel);

      // Create review decision record
      const reviewDecision = {
        decidedAt,
        decidedByUserId: reviewerUserId,
        decision: body.decision,
        notes: body.notes,
      };
      artifact.reviewHistory.push(reviewDecision);

      // Create review note
      const note = {
        id: app.skillShareer.store.nextId(data, 'artifact_note'),
        createdAt: decidedAt,
        authorType: 'reviewer' as const,
        authorUserId: reviewerUserId,
        message: body.notes,
      };
      artifact.reviewNotes.push(note);

      // Update lifecycle state
      transitionLifecycleState(
        artifact,
        body.decision === 'approve' ? 'approved' : 'rejected',
        'artifact review decision',
      );

      // Update metadata
      artifact.metadata.latestReviewedAt = decidedAt;
      artifact.metadata.latestDecision = body.decision;

      // Add lifecycle event
      artifact.lifecycleHistory.push({
        id: app.skillShareer.store.nextId(data, 'artifact_event'),
        type: body.decision === 'approve' ? 'reviewer-approved' : 'reviewer-rejected',
        createdAt: decidedAt,
        actorUserId: reviewerUserId,
        submissionId: artifact.metadata.latestSubmissionId ?? null,
        revision: artifact.latestRevision.revision,
        state: artifact.lifecycleState,
        note: body.notes,
      });

      artifact.updatedAt = decidedAt;

      // Create audit event
      const auditEvent = createAuditEvent({
        store: app.skillShareer.store,
        data,
        teamId: artifact.teamId,
        actor: auth,
        action: 'artifact-reviewed',
        entityId: artifact.id,
        payload: {
          decision: body.decision,
          notes: body.notes,
          revision: artifact.latestRevision.revision,
          previousState,
          newState: artifact.lifecycleState,
        },
      });
      data.auditEvents.push(auditEvent);

      return {
        artifact,
        previousState,
        newState: artifact.lifecycleState,
      };
    });

    // Log user operation (fire-and-forget)
    void logUserOperation(app.skillShareer.config.userOpsLog, {
      timestamp: nowIso(),
      actorId: auth.actorId,
      actorHandle: auth.handle,
      action: 'review',
      targetId: artifactId,
      teamId: auth.activeTeamId,
      metadata: { decision: body.decision, revision: result.artifact.latestRevision.revision },
    });

    const reviewedSnapshot = await app.skillShareer.store.snapshot();

    // Trigger skill graph indexing AFTER the transaction commits (P36-02, T-36-11)
    if (result.previousState !== result.newState) {
      await runSkillIndexEvent({
        services: {
          store: app.skillShareer.store,
          data: await app.skillShareer.store.snapshot(),
        },
        artifactId,
        previousState: result.previousState,
        nextState: result.newState,
        reason: `reviewer-${body.decision}`,
        adapters: [artifactGraphIndexAdapter],
      });
    }

    return skillReviewDecisionResponseSchema.parse({
      artifact: toSkillArtifact(reviewedSnapshot, result.artifact),
      previousState: result.previousState,
      newState: result.newState,
    });
  });
};

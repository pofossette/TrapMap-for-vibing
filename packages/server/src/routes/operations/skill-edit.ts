import {
  skillEditRequestSchema,
  skillEditResponseSchema,
  skillHistoryRequestSchema,
  skillHistoryResponseSchema,
} from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { getSkillHistory, submitSkillEdit } from '@trapmap/server/lib/artifacts/edit.js';
import { toSkillArtifact } from '@trapmap/server/lib/artifacts/model.js';
import { createAuditEvent } from '@trapmap/server/lib/audit.js';
import { AppError } from '@trapmap/server/lib/errors.js';
import { runSkillIndexEvent } from '@trapmap/server/lib/indexing/skill-events.js';
import { runPreReview } from '@trapmap/server/lib/pre-review.js';
import { requirePermission, requireTeamAccess } from '@trapmap/server/lib/rbac.js';
import { resolveAuthContext } from '@trapmap/server/lib/session.js';
import { nowIso } from '@trapmap/server/lib/store.js';
import { logUserOperation } from '@trapmap/server/lib/user-ops-log.js';

export const skillEditRoutes: FastifyPluginAsync = async (app) => {
  // Skill edit endpoint (Phase 19-02: SKED-02, T-19-04, T-19-05, T-19-07)
  app.post('/v1/operations/artifacts/:artifactId/edit', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:submit');

    // System-admin cannot edit (needs real user as editor)
    if (auth.subjectType === 'system-admin') {
      throw new AppError(403, 'invalid_subject', 'System admin cannot edit artifacts directly');
    }

    const editorUserId = auth.user?.id;
    if (!editorUserId) {
      throw new AppError(403, 'user_not_found', 'User record not found');
    }

    const artifactId = (request.params as { artifactId: string }).artifactId;
    const body = skillEditRequestSchema.parse((request.body as Record<string, unknown>) ?? {});

    // Use repository for artifact lookup (replaces store.snapshot() for initial find)
    const { artifact: artifactRepo } = app.skillShareer.repos;
    const artifact = await artifactRepo.getById(artifactId);
    if (!artifact) {
      throw new AppError(404, 'artifact_not_found', `Artifact ${artifactId} not found`);
    }

    // Check team access (T-19-05)
    if (artifact.teamId) {
      requireTeamAccess(auth, artifact.teamId);
    }

    // Check security level
    if (auth.securityLevel < artifact.requiredLevel) {
      throw new AppError(403, 'insufficient_level', 'Security level insufficient');
    }

    // Check ownership or higher level (T-19-07)
    const isOwner = artifact.ownerUserId === editorUserId;
    const isHigherLevel = auth.securityLevel > artifact.requiredLevel;
    if (!isOwner && !isHigherLevel) {
      throw new AppError(
        403,
        'edit_not_allowed',
        'Only the owner or a user with higher security level may edit this artifact',
      );
    }

    const submittedAt = nowIso();

    // Submit the edit within a transaction
    const result = await app.skillShareer.store.transact(async (data) => {
      // Re-fetch artifact within transaction
      const txArtifact = data.skillArtifacts?.find((a) => a.id === artifactId);
      if (!txArtifact) {
        throw new AppError(404, 'artifact_not_found', `Artifact ${artifactId} not found`);
      }

      const editResult = await submitSkillEdit({
        store: app.skillShareer.store,
        data,
        ...(app.skillShareer.artifactRepo ? { artifactRepo: app.skillShareer.artifactRepo } : {}),
        artifact: txArtifact,
        editorUserId,
        editPayload: {
          ...(body.title !== undefined && { title: body.title }),
          ...(body.labels !== undefined && { labels: body.labels }),
          ...(body.files !== undefined && { files: body.files }),
          ...(body.scriptDescriptors !== undefined && {
            scriptDescriptors: body.scriptDescriptors,
          }),
        },
        submittedAt,
        runPreReview,
      });

      // Record audit event (T-19-08)
      const auditEvent = createAuditEvent({
        store: app.skillShareer.store,
        data,
        teamId: txArtifact.teamId,
        actor: auth,
        action: 'artifact-edited',
        entityId: txArtifact.id,
        payload: {
          previousRevision: editResult.previousRevision,
          newRevision: editResult.artifact.latestRevision.revision,
          lifecycleTransition: editResult.lifecycleTransition,
        },
      });
      data.auditEvents.push(auditEvent);

      return editResult;
    });

    // Log user operation (fire-and-forget)
    const editSnapshot = await app.skillShareer.store.snapshot();
    void logUserOperation(app.skillShareer.config.userOpsLog, {
      timestamp: nowIso(),
      actorId: auth.actorId,
      actorHandle: auth.handle,
      action: 'edit',
      targetId: artifactId,
      teamId: auth.activeTeamId,
      metadata: {
        previousRevision: result.previousRevision,
        newRevision: result.artifact.latestRevision.revision,
      },
    });

    // Trigger skill graph indexing AFTER the transaction commits (P36-02)
    // Delegate to shared seam: determineSkillIndexAction() decides upsert/remove/noop
    if (result.lifecycleTransition && result.lifecycleTransition.from !== result.lifecycleTransition.to) {
      await runSkillIndexEvent({
        services: {
          store: app.skillShareer.store,
          data: await app.skillShareer.store.snapshot(),
          ai: { chat: app.skillShareer.ai.chat },
          graphQueryBackend: app.skillShareer.graphQueryBackend,
        },
        artifactId,
        previousState: result.lifecycleTransition.from,
        nextState: result.lifecycleTransition.to,
        reason: 'updated',
      });
    }

    return skillEditResponseSchema.parse({
      artifact: toSkillArtifact(editSnapshot, result.artifact),
      previousRevision: result.previousRevision,
      lifecycleTransition: result.lifecycleTransition,
    });
  });

  // Skill history endpoint (Phase 19-02: SKED-04, T-19-09)
  app.get('/v1/operations/artifacts/:artifactId/history', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:export');

    const artifactId = (request.params as { artifactId: string }).artifactId;

    // Validate query parameters
    skillHistoryRequestSchema.parse((request.query as Record<string, unknown>) ?? {});

    // Use repository for artifact lookup (replaces store.snapshot() for initial find)
    const { artifact: artifactRepo } = app.skillShareer.repos;
    const artifact = await artifactRepo.getById(artifactId);
    if (!artifact) {
      throw new AppError(404, 'artifact_not_found', `Artifact ${artifactId} not found`);
    }

    // Still need store.snapshot() for getSkillHistory() which reads full data
    const data = await app.skillShareer.store.snapshot();

    // Check team access (T-19-09: same governance as export)
    if (artifact.teamId) {
      requireTeamAccess(auth, artifact.teamId);
    }

    // Check security level
    if (auth.securityLevel < artifact.requiredLevel) {
      throw new AppError(403, 'insufficient_level', 'Security level insufficient');
    }

    // Get history
    const history = getSkillHistory({ data, artifactId });

    // Record audit event
    await app.skillShareer.store.transact((data) => {
      const auditEvent = createAuditEvent({
        store: app.skillShareer.store,
        data,
        teamId: artifact.teamId,
        actor: auth,
        action: 'artifact-history-viewed',
        entityId: artifact.id,
        payload: {
          revisionCount: history.revisions.length,
        },
      });
      data.auditEvents.push(auditEvent);
    });

    return skillHistoryResponseSchema.parse({
      artifactId: history.artifactId,
      title: history.title,
      currentRevision: history.currentRevision,
      lifecycleState: history.lifecycleState,
      revisions: history.revisions.map((r) => ({
        revision: r.revision,
        submittedAt: r.submittedAt,
        submittedBy: r.submittedBy,
        summary: r.summary,
        lifecycleState: r.lifecycleState,
      })),
    });
  });
};

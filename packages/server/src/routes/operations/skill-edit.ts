import {
  skillEditRequestSchema,
  skillEditResponseSchema,
  skillHistoryRequestSchema,
  skillHistoryResponseSchema,
} from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { getSkillHistory, submitSkillEdit } from '../../lib/artifacts/edit.js';
import { toSkillArtifact } from '../../lib/artifacts/model.js';
import { createAuditEvent } from '../../lib/audit.js';
import { AppError } from '../../lib/errors.js';
import { artifactGraphIndexAdapter } from '../../lib/indexing/adapters/artifact-graph.js';
import { runSkillIndexEvent } from '../../lib/indexing/skill-events.js';
import { runPreReview } from '../../lib/pre-review.js';
import { requirePermission, requireTeamAccess } from '../../lib/rbac.js';
import { resolveAuthContext } from '../../lib/session.js';
import { nowIso } from '../../lib/store.js';
import { logUserOperation } from '../../lib/user-ops-log.js';

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

    const data = await app.skillShareer.store.snapshot();

    // Ensure skillArtifacts exists
    if (!data.skillArtifacts) {
      data.skillArtifacts = [];
    }

    // Find the artifact
    const artifact = data.skillArtifacts.find((a) => a.id === artifactId);
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
    // Only refresh graph if artifact ends in approved state after edit
    if (result.lifecycleTransition && result.artifact.lifecycleState === 'approved') {
      await runSkillIndexEvent({
        services: {
          store: app.skillShareer.store,
          data: await app.skillShareer.store.snapshot(),
        },
        artifactId,
        previousState: result.lifecycleTransition.from,
        nextState: result.lifecycleTransition.to,
        reason: 'updated',
        adapters: [artifactGraphIndexAdapter],
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
    const query = skillHistoryRequestSchema.parse((request.query as Record<string, unknown>) ?? {});

    const data = await app.skillShareer.store.snapshot();

    // Ensure skillArtifacts exists
    if (!data.skillArtifacts) {
      data.skillArtifacts = [];
    }

    // Find the artifact
    const artifact = data.skillArtifacts.find((a) => a.id === artifactId);
    if (!artifact) {
      throw new AppError(404, 'artifact_not_found', `Artifact ${artifactId} not found`);
    }

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

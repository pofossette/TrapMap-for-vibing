import {
  activationRequestSchema,
  activationResponseSchema,
  artifactDeactivateRequestSchema,
  artifactDeactivateResponseSchema,
} from '@trapmap/contracts';
import type { LifecycleState } from '@trapmap/contracts';
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

export const artifactsActivateRoutes: FastifyPluginAsync = async (app) => {
  // Selective activation route (Phase 15-03: ACTV-01, T-15-07)
  app.post('/v1/operations/artifacts/activate', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:export');

    const body = activationRequestSchema.parse((request.body as Record<string, unknown>) ?? {});
    const { artifactId, revision, selectedPaths } = body;

    // Use repository for artifact lookup (replaces store.snapshot() for initial find)
    const { artifact: artifactRepo } = app.skillShareer.repos;
    const artifact = await artifactRepo.getById(artifactId);
    if (!artifact) {
      throw new AppError(404, 'artifact_not_found', `Artifact ${artifactId} not found`);
    }

    // Still need store.snapshot() for artifactFilePayloads
    const data = await app.skillShareer.store.snapshot();

    // Check team access
    if (artifact.teamId !== null) {
      requireTeamAccess(auth, artifact.teamId);
    }

    // Check security level
    if (auth.securityLevel < artifact.requiredLevel) {
      throw new AppError(
        403,
        'insufficient_level',
        `Security level ${auth.securityLevel} insufficient for artifact level ${artifact.requiredLevel}`,
      );
    }

    // Resolve target revision
    const targetRevision = revision ?? artifact.latestRevision.revision;
    const revisionRecord = artifact.history.find((r) => r.revision === targetRevision);
    if (!revisionRecord) {
      throw new AppError(404, 'revision_not_found', `Revision ${targetRevision} not found`);
    }

    // Validate selected paths against artifact manifest (T-15-07 mitigation)
    const artifactPaths = new Set(revisionRecord.files.map((f) => f.path));
    const invalidPaths = selectedPaths.filter((p) => !artifactPaths.has(p));
    if (invalidPaths.length > 0) {
      throw new AppError(
        400,
        'invalid_paths',
        `Paths not found in artifact: ${invalidPaths.join(', ')}`,
      );
    }

    // Fetch file payloads for selected paths only
    const filePayloads =
      data.artifactFilePayloads?.filter(
        (p) =>
          p.artifactId === artifactId &&
          p.revision === targetRevision &&
          selectedPaths.includes(p.path),
      ) ?? [];

    // Build activation response with only selected files
    const activationFiles = filePayloads.map((payload) => {
      const fileMetadata = revisionRecord.files.find((f) => f.path === payload.path);
      return {
        path: payload.path,
        kind: fileMetadata?.kind ?? 'reference',
        sha256: payload.sha256,
        sizeBytes: payload.sizeBytes,
        mediaType: payload.mediaType,
        source: fileMetadata?.source ?? 'references/',
        content: payload.content,
      };
    });

    // Include script descriptors for any selected script paths
    const selectedScriptPaths = selectedPaths.filter((p) => p.startsWith('scripts/'));
    const scriptDescriptors = revisionRecord.scriptDescriptors.filter((sd) =>
      selectedScriptPaths.includes(sd.path),
    );

    const actorRef = {
      id: auth.actorId,
      handle: auth.handle,
      securityLevel: auth.securityLevel,
    };

    const activatedAt = nowIso();

    // Record audit event for activation
    await app.skillShareer.store.transact((data) => {
      const auditEvent = createAuditEvent({
        store: app.skillShareer.store,
        data,
        teamId: artifact.teamId,
        actor: auth,
        action: 'artifact-exported', // Reuse existing audit action for activation
        entityId: artifact.id,
        payload: {
          activation: true,
          selectedPaths,
          fileCount: activationFiles.length,
          revision: targetRevision,
        },
      });
      data.auditEvents.push(auditEvent);
    });

    return activationResponseSchema.parse({
      artifactId: artifact.id,
      title: artifact.title,
      revision: targetRevision,
      requiredLevel: artifact.requiredLevel,
      files: activationFiles,
      scriptDescriptors,
      activatedAt,
      activatedBy: actorRef,
    });
  });

  // Phase 36: Artifact deactivation route (P36-02, T-36-12)
  app.post('/v1/operations/artifacts/:artifactId/deactivate', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:update');

    const artifactId = (request.params as { artifactId: string }).artifactId;
    const body = artifactDeactivateRequestSchema.parse(
      (request.body as Record<string, unknown>) ?? {},
    );

    // Capture transition context for post-commit indexing
    let previousState: LifecycleState | undefined;
    let nextState: LifecycleState | undefined;

    const result = await app.skillShareer.store.transact((data) => {
      // Ensure skillArtifacts exists
      if (!data.skillArtifacts) {
        data.skillArtifacts = [];
      }

      const artifact = data.skillArtifacts.find((a) => a.id === artifactId);
      if (!artifact) {
        throw new AppError(404, 'artifact_not_found', `Artifact ${artifactId} not found`);
      }

      // Capture previous state
      previousState = artifact.lifecycleState;

      // Apply team access check
      if (artifact.teamId) {
        requireTeamAccess(auth, artifact.teamId);
      }

      // Apply strictly higher level check
      requireHigherLevel(auth, artifact.requiredLevel);

      const deactivatedAt = nowIso();

      // Set lifecycle state
      transitionLifecycleState(artifact, 'deactivated', 'artifact deactivate');
      nextState = 'deactivated';

      // Add lifecycle event
      artifact.lifecycleHistory.push({
        id: app.skillShareer.store.nextId(data, 'artifact_event'),
        type: 'deactivated',
        createdAt: deactivatedAt,
        actorUserId: auth.user?.id ?? null,
        submissionId: artifact.metadata.latestSubmissionId ?? null,
        revision: artifact.latestRevision.revision,
        state: 'deactivated',
        note: body.reason,
      });

      artifact.updatedAt = deactivatedAt;

      // Record audit event
      const auditEvent = createAuditEvent({
        store: app.skillShareer.store,
        data,
        teamId: artifact.teamId,
        actor: auth,
        action: 'artifact-deactivated',
        entityId: artifact.id,
        payload: { reason: body.reason, previousState },
      });
      data.auditEvents.push(auditEvent);

      return {
        artifact: toSkillArtifact(data, artifact),
        previousState: previousState!,
        newState: artifact.lifecycleState,
      };
    });

    // Trigger skill graph indexing AFTER the transaction commits (P36-02, T-36-12)
    // Indexing must complete before response so graph state is consistent
    if (previousState && nextState && previousState !== nextState) {
      try {
        await runSkillIndexEvent({
          services: {
            store: app.skillShareer.store,
            data: await app.skillShareer.store.snapshot(),
            graphQueryBackend: app.skillShareer.graphQueryBackend,
          },
          artifactId,
          previousState,
          nextState,
          reason: 'deactivated',
          adapters: [artifactGraphIndexAdapter],
        });
      } catch {
        // Indexing failure should not block deactivation response
        // Graph state will be reconciled on next lifecycle event
      }
    }

    return artifactDeactivateResponseSchema.parse({
      artifact: result.artifact,
      previousState: result.previousState,
      newState: result.newState,
    });
  });
};

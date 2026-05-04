import {
  artifactImportRequestSchema,
  artifactImportResponseSchema,
  artifactImportResultItemSchema,
  importRequestSchema,
  importResponseSchema,
  importResultItemSchema,
} from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { deriveSkillArtifactOutputs } from '../../lib/artifacts/derive.js';
import { createSkillArtifactRecord } from '../../lib/artifacts/model.js';
import { applyDerivedArtifactOutputs } from '../../lib/artifacts/model.js';
import { createAuditEvent } from '../../lib/audit.js';
import { AppError } from '../../lib/errors.js';
import { createImportedEntry, normalizeArtifactBundle } from '../../lib/import-export.js';
import { runPreReview } from '../../lib/pre-review.js';
import { requirePermission } from '../../lib/rbac.js';
import { resolveAuthContext } from '../../lib/session.js';
import { nowIso } from '../../lib/store.js';
import { logUserOperation } from '../../lib/user-ops-log.js';

export const artifactsImportRoutes: FastifyPluginAsync = async (app) => {
  app.post('/v1/operations/import', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:import');

    // System-admin cannot import (needs real user as owner)
    if (auth.subjectType === 'system-admin') {
      throw new AppError(403, 'invalid_subject', 'System admin cannot import entries directly');
    }

    const ownerUserId = auth.user?.id;
    if (!ownerUserId) {
      throw new AppError(403, 'user_not_found', 'User record not found');
    }

    const body = importRequestSchema.parse((request.body as Record<string, unknown>) ?? {});

    const results: Array<{
      success: boolean;
      entry: ReturnType<typeof importResultItemSchema.parse> | null;
      error: string | null;
      source: 'json' | 'claude-skill';
    }> = [];

    let importedCount = 0;
    let failedCount = 0;

    await app.skillShareer.store.transact(async (data) => {
      for (const entryPayload of body.entries) {
        // Validate requestedLevel <= auth.securityLevel
        if (entryPayload.requestedLevel > auth.securityLevel) {
          results.push({
            success: false,
            entry: null,
            error: `requestedLevel ${entryPayload.requestedLevel} exceeds user level ${auth.securityLevel}`,
            source: entryPayload.source,
          });
          failedCount++;
          continue;
        }

        // Run pre-review
        const preReview = await runPreReview({
          existingEntries: data.knowledgeEntries,
          submission: entryPayload,
        });

        // Create imported entry
        const importedRecord = createImportedEntry({
          store: app.skillShareer.store,
          data,
          ownerUserId,
          teamId: auth.activeTeamId,
          payload: entryPayload,
          requestedLevel: entryPayload.requestedLevel,
          source: entryPayload.source,
          createdAt: nowIso(),
          preReview,
        });

        data.knowledgeEntries.push(importedRecord);

        // Record audit event for successful import
        const auditEvent = createAuditEvent({
          store: app.skillShareer.store,
          data,
          teamId: auth.activeTeamId,
          actor: auth,
          action: 'knowledge-imported',
          entityId: importedRecord.id,
          payload: { source: entryPayload.source, requestedLevel: entryPayload.requestedLevel },
        });
        data.auditEvents.push(auditEvent);

        results.push({
          success: true,
          entry: null,
          error: null,
          source: entryPayload.source,
        });
        importedCount++;
      }
    });

    // Log user operation (fire-and-forget)
    void logUserOperation(app.skillShareer.config.userOpsLog, {
      timestamp: nowIso(),
      actorId: auth.actorId,
      actorHandle: auth.handle,
      action: 'import',
      targetId: null,
      teamId: auth.activeTeamId,
      metadata: { endpoint: 'legacy-import', importedCount, failedCount },
    });

    return importResponseSchema.parse({
      results: results.map((r) =>
        importResultItemSchema.parse({
          success: r.success,
          entry: r.entry,
          error: r.error,
          source: r.source,
        }),
      ),
      importedCount,
      failedCount,
    });
  });

  // Artifact-native import route (Phase 13: IMEX-01, IMEX-04, COMP-02)
  app.post('/v1/operations/artifacts/import', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:import');

    // System-admin cannot import (needs real user as owner)
    if (auth.subjectType === 'system-admin') {
      throw new AppError(403, 'invalid_subject', 'System admin cannot import artifacts directly');
    }

    const ownerUserId = auth.user?.id;
    if (!ownerUserId) {
      throw new AppError(403, 'user_not_found', 'User record not found');
    }

    const body = artifactImportRequestSchema.parse((request.body as Record<string, unknown>) ?? {});

    const results: Array<{
      success: boolean;
      artifactId: string | null;
      title: string | null;
      error: string | null;
      sourceKind: 'skill-directory' | 'single-skill-md' | 'legacy-knowledge' | null;
    }> = [];

    let importedCount = 0;
    let failedCount = 0;

    await app.skillShareer.store.transact(async (data) => {
      for (const bundle of body.bundles) {
        try {
          // Validate requestedLevel <= auth.securityLevel
          if (bundle.requiredLevel > auth.securityLevel) {
            results.push({
              success: false,
              artifactId: null,
              title: bundle.title,
              error: `requiredLevel ${bundle.requiredLevel} exceeds user level ${auth.securityLevel}`,
              sourceKind: bundle.sourceKind,
            });
            failedCount++;
            continue;
          }

          // Normalize bundle: validate paths, classify files, compute source hash
          const artifactId = app.skillShareer.store.nextId(data, 'artifact');
          const createdAt = nowIso();
          const normalized = normalizeArtifactBundle({
            bundle,
            artifactId,
            revision: 1,
            storedAt: createdAt,
          });

          // Run pre-review (reuse existing pre-review for artifact validation)
          const preReview = await runPreReview({
            existingEntries: data.knowledgeEntries,
            submission: {
              scope: bundle.scope,
              labels: bundle.labels,
              shortcut: bundle.title,
              detail: `Artifact import: ${bundle.title}`,
            },
          });

          // Create artifact record with canonical source hash
          const artifact = await createSkillArtifactRecord({
            store: app.skillShareer.store,
            data,
            ...(app.skillShareer.artifactRepo
              ? { artifactRepo: app.skillShareer.artifactRepo }
              : {}),
            ownerUserId,
            teamId: auth.activeTeamId,
            payload: {
              ...bundle,
              sourceHash: normalized.sourceHash,
            },
            requiredLevel: bundle.requiredLevel,
            createdAt,
            preReview,
          });

          // Store file payloads for round-trip export (IMEX-04)
          data.artifactFilePayloads.push(...normalized.filePayloads);

          // Derive outputs immediately after persistence (IMEX-04, COMP-02)
          const derived = deriveSkillArtifactOutputs(artifact, artifact.latestRevision);
          await applyDerivedArtifactOutputs(
            data,
            artifact,
            artifact.latestRevision,
            derived,
            app.skillShareer.artifactRepo ?? undefined,
          );

          // Record audit event (T-13-04 mitigation)
          const auditEvent = createAuditEvent({
            store: app.skillShareer.store,
            data,
            teamId: auth.activeTeamId,
            actor: auth,
            action: 'artifact-imported',
            entityId: artifact.id,
            payload: {
              sourceKind: bundle.sourceKind,
              requiredLevel: bundle.requiredLevel,
              fileCount: bundle.files.length,
              format: 'bundle-json',
            },
          });
          data.auditEvents.push(auditEvent);

          results.push({
            success: true,
            artifactId: artifact.id,
            title: artifact.title,
            error: null,
            sourceKind: bundle.sourceKind,
          });
          importedCount++;
        } catch (error) {
          results.push({
            success: false,
            artifactId: null,
            title: bundle.title,
            error: error instanceof Error ? error.message : 'Unknown error',
            sourceKind: bundle.sourceKind,
          });
          failedCount++;
        }
      }
    });

    // Log user operation (fire-and-forget)
    void logUserOperation(app.skillShareer.config.userOpsLog, {
      timestamp: nowIso(),
      actorId: auth.actorId,
      actorHandle: auth.handle,
      action: 'import',
      targetId: null,
      teamId: auth.activeTeamId,
      metadata: { endpoint: 'artifact-import', importedCount, failedCount },
    });

    return artifactImportResponseSchema.parse({
      results: results.map((r) =>
        artifactImportResultItemSchema.parse({
          success: r.success,
          artifactId: r.artifactId,
          title: r.title,
          error: r.error,
          sourceKind: r.sourceKind,
        }),
      ),
      importedCount,
      failedCount,
    });
  });
};

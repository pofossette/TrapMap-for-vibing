import {
  activationRequestSchema,
  activationResponseSchema,
  artifactDeactivateRequestSchema,
  artifactDeactivateResponseSchema,
  artifactExportRequestSchema,
  artifactExportResponseSchema,
  artifactImportRequestSchema,
  artifactImportResponseSchema,
  artifactImportResultItemSchema,
  auditListResponseSchema,
  auditQuerySchema,
  compatibilityStatusRequestSchema,
  compatibilityStatusResponseSchema,
  exportBundleSchema,
  exportRequestSchema,
  importRequestSchema,
  importResponseSchema,
  importResultItemSchema,
  knowledgeDeactivateRequestSchema,
  knowledgeDeactivateResponseSchema,
  knowledgeListRequestSchema,
  knowledgeListResponseSchema,
  legacyMigrationRequestSchema,
  legacyMigrationResponseSchema,
  legacyMigrationResultItemSchema,
  skillEditRequestSchema,
  skillEditResponseSchema,
  skillHistoryRequestSchema,
  skillHistoryResponseSchema,
  skillReviewDecisionRequestSchema,
  skillReviewDecisionResponseSchema,
  skillReviewQueueResponseSchema,
} from '@trapmap/contracts';
import type { LifecycleState } from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { deriveSkillArtifactOutputs } from '../lib/artifacts/derive.js';
import { getSkillHistory, mergeEditPayload, submitSkillEdit } from '../lib/artifacts/edit.js';
import { createSkillArtifactRecord, toSkillArtifact } from '../lib/artifacts/model.js';
import { applyDerivedArtifactOutputs } from '../lib/artifacts/model.js';
import { createAuditEvent, queryAuditEvents, toAuditEvent } from '../lib/audit.js';
import { AppError } from '../lib/errors.js';
import {
  createImportedEntry,
  detectDuplicates,
  migrateLegacyEntryToArtifactBundle,
  normalizeArtifactBundle,
  parseClaudeSkill,
  validateLegacyEntryMigration,
} from '../lib/import-export.js';
import { artifactGraphIndexAdapter } from '../lib/indexing/adapters/artifact-graph.js';
import { runKnowledgeIndexEvent } from '../lib/indexing/events.js';
import { runSkillIndexEvent } from '../lib/indexing/skill-events.js';
import { toKnowledgeEntry, toKnowledgeListItem } from '../lib/knowledge.js';
import { transitionLifecycleState } from '../lib/lifecycle/state-machine.js';
import { runPreReview } from '../lib/pre-review.js';
import { requireHigherLevel, requirePermission, requireTeamAccess } from '../lib/rbac.js';
import { resolveAuthContext } from '../lib/session.js';
import { nowIso } from '../lib/store.js';
import { logUserOperation } from '../lib/user-ops-log.js';

export const operationsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/operations/audit', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'audit:read');

    const query = auditQuerySchema.parse(request.query as Record<string, unknown>);
    const data = await app.skillShareer.store.snapshot();

    const result = queryAuditEvents({
      data,
      query: {
        ...(query.action !== undefined && { action: query.action }),
        ...(query.actorId !== undefined && { actorId: query.actorId }),
        ...(query.entityId !== undefined && { entityId: query.entityId }),
        ...(query.teamId !== undefined && { teamId: query.teamId }),
        ...(query.from !== undefined && { from: query.from }),
        ...(query.to !== undefined && { to: query.to }),
        limit: query.limit,
      },
      auth,
    });

    const items = result.items.map((record) => toAuditEvent(record, data));

    return auditListResponseSchema.parse({
      items,
      nextCursor: null,
      total: result.total,
    });
  });

  app.get('/v1/operations/knowledge', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:export');

    const query = knowledgeListRequestSchema.parse(request.query as Record<string, unknown>);
    const data = await app.skillShareer.store.snapshot();

    let entries = data.knowledgeEntries;

    // Filter based on user permissions
    if (auth.subjectType !== 'system-admin') {
      entries = entries.filter((entry) => {
        // User can see entries where their level > entry.requiredLevel
        if (auth.securityLevel > entry.requiredLevel) {
          return true;
        }
        // Or entries in their active team
        if (entry.teamId && auth.activeTeamId === entry.teamId) {
          return true;
        }
        return false;
      });
    }

    // Apply optional filters
    if (query.scope !== undefined) {
      entries = entries.filter((entry) => entry.scope === query.scope);
    }

    if (query.lifecycleState !== undefined && query.lifecycleState.length > 0) {
      const states = new Set(query.lifecycleState);
      entries = entries.filter((entry) => states.has(entry.lifecycleState));
    }

    if (query.requiredLevelMax !== undefined) {
      const maxLevel = query.requiredLevelMax;
      entries = entries.filter((entry) => entry.requiredLevel <= maxLevel);
    }

    if (query.ownerUserId !== undefined) {
      entries = entries.filter((entry) => entry.ownerUserId === query.ownerUserId);
    }

    // Apply evidence-based filters
    if (query.evidenceLevel && query.evidenceLevel.length > 0) {
      entries = entries.filter(
        (entry) =>
          entry.evidenceMeta && query.evidenceLevel!.includes(entry.evidenceMeta.evidenceLevel),
      );
    }

    if (query.sourceType && query.sourceType.length > 0) {
      entries = entries.filter(
        (entry) => entry.evidenceMeta && query.sourceType!.includes(entry.evidenceMeta.sourceType),
      );
    }

    if (query.verifiedBefore) {
      entries = entries.filter(
        (entry) => entry.evidenceMeta && entry.evidenceMeta.verifiedAt < query.verifiedBefore!,
      );
    }

    if (query.verifiedAfter) {
      entries = entries.filter(
        (entry) => entry.evidenceMeta && entry.evidenceMeta.verifiedAt > query.verifiedAfter!,
      );
    }

    if (query.missingEvidence) {
      entries = entries.filter((entry) => !entry.evidenceMeta);
    }

    // Sort by updatedAt descending
    entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    // Apply limit
    const limit = query.limit;
    const total = entries.length;
    entries = entries.slice(0, limit);

    const items = entries.map((entry) => toKnowledgeListItem(entry));

    return knowledgeListResponseSchema.parse({
      items,
      nextCursor: null,
      total,
    });
  });

  app.post('/v1/operations/knowledge/:entryId/deactivate', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:update');

    const entryId = (request.params as { entryId: string }).entryId;
    const payload = knowledgeDeactivateRequestSchema.parse({
      ...((request.body as Record<string, unknown>) ?? {}),
      entryId,
    });

    // Capture transition context for post-commit indexing
    let previousState: LifecycleState | undefined;
    let nextState: LifecycleState | undefined;

    const updatedEntry = await app.skillShareer.store.transact((data) => {
      const entry = data.knowledgeEntries.find((candidate) => candidate.id === entryId);

      if (!entry) {
        throw new AppError(404, 'knowledge_not_found', 'Knowledge entry not found');
      }

      if (entry.teamId) {
        requireTeamAccess(auth, entry.teamId);
      }

      requireHigherLevel(auth, entry.requiredLevel);

      const deactivatedAt = nowIso();

      // Capture previous state before deactivation
      previousState = entry.lifecycleState;

      // Set lifecycle state
      transitionLifecycleState(entry, 'deactivated', 'knowledge deactivate');
      nextState = 'deactivated';

      // Add lifecycle event
      entry.lifecycleHistory.push({
        id: app.skillShareer.store.nextId(data, 'knowledge_event'),
        type: 'deactivated',
        createdAt: deactivatedAt,
        actorUserId: auth.user?.id ?? null,
        submissionId: entry.latestSubmissionId,
        revision: entry.latestRevision.revision,
        state: 'deactivated',
        note: payload.reason,
      });

      entry.updatedAt = deactivatedAt;

      // Record audit event
      const auditEvent = createAuditEvent({
        store: app.skillShareer.store,
        data,
        teamId: entry.teamId,
        actor: auth,
        action: 'knowledge-deactivated',
        entityId: entry.id,
        payload: { reason: payload.reason, previousState },
      });
      data.auditEvents.push(auditEvent);

      return toKnowledgeEntry(data, entry);
    });

    // Trigger indexing AFTER the transaction commits (post-commit pattern)
    // Deactivation always removes index state (IDX-06, T-11-06)
    if (previousState && nextState && previousState !== nextState) {
      await runKnowledgeIndexEvent({
        services: {
          store: app.skillShareer.store,
          data: await app.skillShareer.store.snapshot(),
        },
        entryId,
        previousState,
        nextState,
        reason: 'deactivated',
        adapters: app.skillShareer.indexAdapters,
      });
    }

    return knowledgeDeactivateResponseSchema.parse({ entry: updatedEntry });
  });

  app.post('/v1/operations/export', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:export');

    const body = exportRequestSchema.parse((request.body as Record<string, unknown>) ?? {});

    const data = await app.skillShareer.store.snapshot();

    let entries = data.knowledgeEntries;

    // Filter by teamId if specified
    if (body.teamId !== undefined) {
      if (body.teamId === null) {
        // Export global entries only
        entries = entries.filter((entry) => entry.teamId === null);
      } else {
        // Export specific team entries
        entries = entries.filter((entry) => entry.teamId === body.teamId);
      }
    }

    // Non-system-admin can only export entries where their level >= entry.requiredLevel
    if (auth.subjectType !== 'system-admin') {
      entries = entries.filter((entry) => auth.securityLevel >= entry.requiredLevel);
    }

    const items = entries.map((entry) => toKnowledgeEntry(data, entry));

    const actorRef = {
      id: auth.actorId,
      handle: auth.handle,
      securityLevel: auth.securityLevel,
    };

    const exportedAt = nowIso();
    const entryCount = items.length;
    const exportTeamId = body.teamId;

    // Record audit event
    await app.skillShareer.store.transact((data) => {
      const auditEvent = createAuditEvent({
        store: app.skillShareer.store,
        data,
        teamId: exportTeamId ?? null,
        actor: auth,
        action: 'knowledge-exported',
        entityId: entryCount > 0 ? (items[0]?.id ?? 'batch') : 'batch',
        payload: { entryCount, teamId: exportTeamId, includeHistory: body.includeHistory },
      });
      data.auditEvents.push(auditEvent);
    });

    // Log user operation (fire-and-forget)
    void logUserOperation(app.skillShareer.config.userOpsLog, {
      timestamp: nowIso(),
      actorId: auth.actorId,
      actorHandle: auth.handle,
      action: 'export',
      targetId: null,
      teamId: auth.activeTeamId,
      metadata: { endpoint: 'legacy-export', entryCount },
    });

    return exportBundleSchema.parse({
      exportedAt,
      exportedBy: actorRef,
      items,
    });
  });

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
      entry: ReturnType<typeof toKnowledgeEntry> | null;
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
          entry: toKnowledgeEntry(data, importedRecord),
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

  // Artifact-native export route (Phase 13: IMEX-02, COMP-02)
  app.post('/v1/operations/artifacts/export', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:export');

    const body = artifactExportRequestSchema.parse((request.body as Record<string, unknown>) ?? {});
    const { artifactId, format } = body;

    const data = await app.skillShareer.store.snapshot();

    // Find the artifact
    const artifact = data.skillArtifacts?.find((a) => a.id === artifactId);
    if (!artifact) {
      throw new AppError(404, 'artifact_not_found', `Artifact ${artifactId} not found`);
    }

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

    const actorRef = {
      id: auth.actorId,
      handle: auth.handle,
      securityLevel: auth.securityLevel,
    };

    const exportedAt = nowIso();

    // Record audit event (T-13-10 mitigation)
    await app.skillShareer.store.transact((data) => {
      const auditEvent = createAuditEvent({
        store: app.skillShareer.store,
        data,
        teamId: artifact.teamId,
        actor: auth,
        action: 'artifact-exported',
        entityId: artifact.id,
        payload: { format, artifactId, title: artifact.title },
      });
      data.auditEvents.push(auditEvent);
    });

    // Log user operation (fire-and-forget)
    void logUserOperation(app.skillShareer.config.userOpsLog, {
      timestamp: nowIso(),
      actorId: auth.actorId,
      actorHandle: auth.handle,
      action: 'export',
      targetId: artifactId,
      teamId: auth.activeTeamId,
      metadata: { endpoint: 'artifact-export', format },
    });

    // Build response based on format
    if (format === 'distilled-json') {
      // Distilled projection from cached derived outputs (T-13-08 mitigation)
      const derived = artifact.latestRevision.derived;
      return artifactExportResponseSchema.parse({
        format: 'distilled-json',
        exportedAt,
        exportedBy: actorRef,
        bundle: null,
        distilled: {
          artifactId: artifact.id,
          scope: artifact.scope,
          labels: artifact.labels,
          title: artifact.title,
          slug: artifact.slug,
          requiredLevel: artifact.requiredLevel,
          sourceKind: artifact.metadata.sourceKind,
          profile: derived?.profile ?? null,
          capsules: derived?.capsules ?? null,
          clientManifest: derived?.clientManifest ?? null,
          exportedAt,
        },
      });
    }
    // bundle-json or skill-dir: return canonical bundle
    // Reconstruct bundle from stored artifact and file payloads
    const filePayloads =
      data.artifactFilePayloads?.filter(
        (p) => p.artifactId === artifactId && p.revision === artifact.latestRevision.revision,
      ) ?? [];

    const bundle = {
      scope: artifact.scope,
      labels: artifact.labels,
      title: artifact.title,
      slug: artifact.slug,
      requiredLevel: artifact.requiredLevel,
      sourceKind: artifact.metadata.sourceKind,
      files: artifact.latestRevision.files.map((f) => {
        const payload = filePayloads.find((p) => p.path === f.path);
        return {
          path: f.path,
          kind: f.kind,
          sha256: f.sha256,
          sizeBytes: f.sizeBytes,
          mediaType: f.mediaType,
          source: f.source,
          includeInDerivation: f.includeInDerivation,
          activationOnly: f.activationOnly,
          content: payload?.content ?? '',
        };
      }),
      scriptDescriptors: artifact.latestRevision.scriptDescriptors,
    };

    return artifactExportResponseSchema.parse({
      format: format === 'skill-dir' ? 'bundle-json' : format,
      exportedAt,
      exportedBy: actorRef,
      bundle,
      distilled: null,
    });
  });

  // Selective activation route (Phase 15-03: ACTV-01, T-15-07)
  app.post('/v1/operations/artifacts/activate', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:export');

    const body = activationRequestSchema.parse((request.body as Record<string, unknown>) ?? {});
    const { artifactId, revision, selectedPaths } = body;

    const data = await app.skillShareer.store.snapshot();

    // Find the artifact
    const artifact = data.skillArtifacts?.find((a) => a.id === artifactId);
    if (!artifact) {
      throw new AppError(404, 'artifact_not_found', `Artifact ${artifactId} not found`);
    }

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
    const targetRevision = revision ?? artifact.latestRevision;
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

  // Legacy migration route (Phase 16-01: ARTF-04, COMP-02, T-16-01, T-16-02)
  app.post('/v1/operations/migrate', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:import');

    // System-admin cannot migrate (needs real user as owner)
    if (auth.subjectType === 'system-admin') {
      throw new AppError(403, 'invalid_subject', 'System admin cannot migrate entries directly');
    }

    const ownerUserId = auth.user?.id;
    if (!ownerUserId) {
      throw new AppError(403, 'user_not_found', 'User record not found');
    }

    const body = legacyMigrationRequestSchema.parse(
      (request.body as Record<string, unknown>) ?? {},
    );

    const results: Array<{
      entryId: string;
      artifactId: string | null;
      success: boolean;
      skipReason: string | null;
      error: string | null;
    }> = [];

    let migratedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    const migratedAt = nowIso();

    await app.skillShareer.store.transact(async (data) => {
      // Ensure skillArtifacts array exists
      if (!data.skillArtifacts) {
        data.skillArtifacts = [];
      }
      if (!data.artifactFilePayloads) {
        data.artifactFilePayloads = [];
      }

      // Determine which entries to migrate based on mode
      let entriesToMigrate: typeof data.knowledgeEntries = [];

      if (body.mode === 'explicit') {
        // Migrate specific entry IDs
        if (!body.entryIds || body.entryIds.length === 0) {
          throw new AppError(400, 'invalid_request', 'entryIds required for explicit mode');
        }
        entriesToMigrate = data.knowledgeEntries.filter((entry) =>
          body.entryIds?.includes(entry.id),
        );
      } else if (body.mode === 'all-approved') {
        // Migrate all approved entries (bounded by limit)
        entriesToMigrate = data.knowledgeEntries
          .filter((entry) => entry.lifecycleState === 'approved')
          .slice(0, body.limit);
      } else if (body.mode === 'all-team') {
        // Migrate all entries for a specific team (bounded by limit)
        if (!body.teamId) {
          throw new AppError(400, 'invalid_request', 'teamId required for all-team mode');
        }
        entriesToMigrate = data.knowledgeEntries
          .filter((entry) => entry.teamId === body.teamId)
          .slice(0, body.limit);
      }

      // Get existing artifact IDs for duplicate detection
      const existingArtifactIds = new Set(data.skillArtifacts.map((a) => a.id));

      for (const legacyEntry of entriesToMigrate) {
        // Validate migration eligibility
        const validation = validateLegacyEntryMigration({
          legacyEntry,
          existingArtifactIds,
        });

        if (!validation.valid) {
          results.push({
            entryId: legacyEntry.id,
            artifactId: null,
            success: false,
            skipReason: validation.reason?.includes('lifecycle') ? validation.reason : null,
            error: validation.reason?.includes('lifecycle') ? null : validation.reason,
          });
          if (validation.reason?.includes('lifecycle')) {
            skippedCount++;
          } else {
            failedCount++;
          }
          continue;
        }

        // Check team access
        if (legacyEntry.teamId) {
          requireTeamAccess(auth, legacyEntry.teamId);
        }

        // Check security level (T-16-01 mitigation: preserve required level)
        requireHigherLevel(auth, legacyEntry.requiredLevel);

        try {
          // Build minimal artifact bundle from legacy entry
          const bundle = migrateLegacyEntryToArtifactBundle({ legacyEntry });

          // Normalize bundle for persistence
          const artifactId = app.skillShareer.store.nextId(data, 'artifact');
          const normalized = normalizeArtifactBundle({
            bundle,
            artifactId,
            revision: 1,
            storedAt: migratedAt,
          });

          // Run pre-review (lightweight since entry was already approved)
          const preReview = await runPreReview({
            existingEntries: data.knowledgeEntries,
            submission: {
              scope: legacyEntry.scope,
              labels: legacyEntry.labels,
              shortcut: legacyEntry.shortcut,
              detail: legacyEntry.detail,
            },
          });

          // Create artifact record
          const artifact = await createSkillArtifactRecord({
            store: app.skillShareer.store,
            data,
            ...(app.skillShareer.artifactRepo
              ? { artifactRepo: app.skillShareer.artifactRepo }
              : {}),
            ownerUserId,
            teamId: legacyEntry.teamId,
            payload: {
              ...bundle,
              sourceHash: normalized.sourceHash,
            },
            requiredLevel: legacyEntry.requiredLevel,
            createdAt: migratedAt,
            preReview,
          });

          // Store file payloads for round-trip export
          data.artifactFilePayloads.push(...normalized.filePayloads);

          // Derive outputs immediately after persistence
          const derived = deriveSkillArtifactOutputs(artifact, artifact.latestRevision);
          await applyDerivedArtifactOutputs(
            data,
            artifact,
            artifact.latestRevision,
            derived,
            app.skillShareer.artifactRepo ?? undefined,
          );

          // Record audit event (T-16-02 mitigation)
          const auditEvent = createAuditEvent({
            store: app.skillShareer.store,
            data,
            teamId: legacyEntry.teamId,
            actor: auth,
            action: 'artifact-imported',
            entityId: artifact.id,
            payload: {
              migration: true,
              sourceEntryId: legacyEntry.id,
              sourceKind: 'legacy-knowledge',
              requiredLevel: legacyEntry.requiredLevel,
            },
          });
          data.auditEvents.push(auditEvent);

          results.push({
            entryId: legacyEntry.id,
            artifactId: artifact.id,
            success: true,
            skipReason: null,
            error: null,
          });
          migratedCount++;

          // Add artifact ID to existing set for duplicate detection
          existingArtifactIds.add(artifact.id);
        } catch (error) {
          results.push({
            entryId: legacyEntry.id,
            artifactId: null,
            success: false,
            skipReason: null,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          failedCount++;
        }
      }
    });

    // Calculate remaining legacy entries
    const data = await app.skillShareer.store.snapshot();
    const remainingLegacyCount =
      data.knowledgeEntries.filter((entry) => entry.lifecycleState === 'approved').length -
      migratedCount;

    return legacyMigrationResponseSchema.parse({
      results: results.map((r) =>
        legacyMigrationResultItemSchema.parse({
          entryId: r.entryId,
          artifactId: r.artifactId,
          success: r.success,
          skipReason: r.skipReason,
          error: r.error,
        }),
      ),
      migratedCount,
      skippedCount,
      failedCount,
      remainingLegacyCount: Math.max(0, remainingLegacyCount),
      migratedAt,
    });
  });

  // Compatibility status route (Phase 16-01: COMP-03)
  app.get('/v1/operations/status', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:export');

    const query = compatibilityStatusRequestSchema.parse(
      (request.query as Record<string, unknown>) ?? {},
    );

    const data = await app.skillShareer.store.snapshot();

    // Ensure skillArtifacts exists
    if (!data.skillArtifacts) {
      data.skillArtifacts = [];
    }

    // Filter by team if specified
    let legacyEntries = data.knowledgeEntries;
    let artifacts = data.skillArtifacts;

    if (query.teamId) {
      legacyEntries = legacyEntries.filter((entry) => entry.teamId === query.teamId);
      artifacts = artifacts.filter((artifact) => artifact.teamId === query.teamId);
    }

    // Calculate migration status
    const totalLegacyEntries = legacyEntries.length;
    const migratedArtifacts = artifacts.filter(
      (artifact) => artifact.metadata.sourceKind === 'legacy-knowledge',
    );
    const migratedEntriesCount = migratedArtifacts.length;
    const unmigratedEntriesCount = Math.max(0, totalLegacyEntries - migratedEntriesCount);
    const totalArtifacts = artifacts.length;

    // Count by source kind
    const artifactsBySourceKind = {
      'skill-directory': artifacts.filter((a) => a.metadata.sourceKind === 'skill-directory')
        .length,
      'single-skill-md': artifacts.filter((a) => a.metadata.sourceKind === 'single-skill-md')
        .length,
      'legacy-knowledge': migratedArtifacts.length,
    };

    // Get sample of unmigrated entry IDs
    const migratedSlugs = new Set(migratedArtifacts.map((a) => a.slug));
    const unmigratedEntries = legacyEntries.filter((entry) => {
      const expectedSlug = entry.shortcut
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
      return !migratedSlugs.has(expectedSlug);
    });
    const unmigratedEntryIds = unmigratedEntries.slice(0, 50).map((entry) => entry.id);

    // Determine coexistence and sunset status
    const coexistenceActive = totalLegacyEntries > 0 && totalArtifacts > 0;
    const sunsetBlockers: string[] = [];

    if (unmigratedEntriesCount > 0) {
      sunsetBlockers.push(`${unmigratedEntriesCount} unmigrated entries remaining`);
    }
    if (totalLegacyEntries > 0 && totalArtifacts === 0) {
      sunsetBlockers.push('No artifacts created yet');
    }

    const sunsetReady = sunsetBlockers.length === 0;

    return compatibilityStatusResponseSchema.parse({
      totalLegacyEntries,
      migratedEntriesCount,
      unmigratedEntriesCount,
      totalArtifacts,
      artifactsBySourceKind,
      unmigratedEntryIds,
      coexistenceActive,
      sunsetReady,
      sunsetBlockers,
      reportedAt: nowIso(),
    });
  });

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

  // Skill review queue endpoint (Phase 20-01: SKED-03)
  app.get('/v1/operations/artifacts/review-queue', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:review');

    const data = await app.skillShareer.store.snapshot();

    // Ensure skillArtifacts exists
    if (!data.skillArtifacts) {
      data.skillArtifacts = [];
    }

    // Filter artifacts for review queue
    // Only show artifacts with lifecycleState of 'agent-pass' (pending review)
    const pendingArtifacts = data.skillArtifacts.filter((artifact) => {
      // Filter to agent-pass state
      if (artifact.lifecycleState !== 'agent-pass') {
        return false;
      }

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

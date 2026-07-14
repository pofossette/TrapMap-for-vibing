import {
  artifactExportRequestSchema,
  artifactExportResponseSchema,
  exportBundleSchema,
  exportRequestSchema,
} from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { buildUserLookupContextFromActorLookup } from '@trapmap/server/lib/actors/lookup.js';
import { createAuditEvent } from '@trapmap/server/lib/audit.js';
import { AppError } from '@trapmap/server/lib/errors.js';
import { toKnowledgeEntry } from '@trapmap/server/lib/knowledge.js';
import { listArtifactRevisionFilePayloads } from '@trapmap/server/lib/operations/read-model.js';
import { requirePermission, requireTeamAccess } from '@trapmap/server/lib/rbac.js';
import { resolveAuthContext } from '@trapmap/server/lib/session.js';
import { nowIso } from '@trapmap/server/lib/store.js';
import { logUserOperation } from '@trapmap/server/lib/user-ops-log.js';

export const artifactsExportRoutes: FastifyPluginAsync = async (app) => {
  app.post('/v1/operations/export', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:export');

    const body = exportRequestSchema.parse((request.body as Record<string, unknown>) ?? {});

    // Use repository for listing entries (replaces store.snapshot() for initial data load)
    const { knowledge: knowledgeRepo } = app.skillShareer.repos;
    let entries = await knowledgeRepo.listByFilter({});

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

    const lookup = await buildUserLookupContextFromActorLookup(
      app.skillShareer.identity.actorLookup,
      entries,
    );
    const items = entries.map((entry) => toKnowledgeEntry(lookup, entry));

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

  // Artifact-native export route (Phase 13: IMEX-02, COMP-02)
  app.post('/v1/operations/artifacts/export', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:export');

    const body = artifactExportRequestSchema.parse((request.body as Record<string, unknown>) ?? {});
    const { artifactId, format } = body;

    // Use repository for artifact lookup (replaces store.snapshot() for initial find)
    const { artifact: artifactRepo } = app.skillShareer.repos;
    const artifact = await artifactRepo.getById(artifactId);
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
    const filePayloads = await listArtifactRevisionFilePayloads(
      app.skillShareer.store,
      artifactId,
      artifact.latestRevision.revision,
    );

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
};

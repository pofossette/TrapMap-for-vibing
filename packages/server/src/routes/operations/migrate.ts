import {
  legacyMigrationRequestSchema,
  legacyMigrationResponseSchema,
  legacyMigrationResultItemSchema,
} from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { deriveFromPayloads, deriveSkillArtifactOutputs } from '../../lib/artifacts/derive.js';
import { createSkillArtifactRecord } from '../../lib/artifacts/model.js';
import { applyDerivedArtifactOutputs } from '../../lib/artifacts/model.js';
import { createAuditEvent } from '../../lib/audit.js';
import { AppError } from '../../lib/errors.js';
import {
  migrateLegacyEntryToArtifactBundle,
  normalizeArtifactBundle,
  validateLegacyEntryMigration,
} from '../../lib/import-export.js';
import { runPreReview } from '../../lib/pre-review.js';
import { requireHigherLevel, requirePermission, requireTeamAccess } from '../../lib/rbac.js';
import { resolveAuthContext } from '../../lib/session.js';
import { nowIso } from '../../lib/store.js';

export const migrateRoutes: FastifyPluginAsync = async (app) => {
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

    // store.transact() retained: complex multi-entity migration that creates artifacts,
    // stores file payloads, derives outputs, and records audit events atomically.
    // No single repository method provides this cross-entity transactional behavior.
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
          // Prefer deriveFromPayloads for retrieval-grade results; fallback to legacy
          const derived =
            normalized.filePayloads.length > 0
              ? deriveFromPayloads(normalized.filePayloads, {
                  artifactId: artifact.id,
                  labels: artifact.labels,
                  title: artifact.title,
                  scope: artifact.scope,
                  requiredLevel: artifact.requiredLevel,
                })
              : deriveSkillArtifactOutputs(artifact, artifact.latestRevision);
          await applyDerivedArtifactOutputs(
            data,
            artifact,
            artifact.latestRevision,
            derived,
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
};

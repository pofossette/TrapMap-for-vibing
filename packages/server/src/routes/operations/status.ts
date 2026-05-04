import {
  compatibilityStatusRequestSchema,
  compatibilityStatusResponseSchema,
} from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { requirePermission } from '../../lib/rbac.js';
import { resolveAuthContext } from '../../lib/session.js';
import { nowIso } from '../../lib/store.js';

export const statusRoutes: FastifyPluginAsync = async (app) => {
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
};

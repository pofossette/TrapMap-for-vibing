import type { AuditEvent } from '@trapmap/contracts';

import type { SkillShareerRepos } from '@trapmap/server/lib/repos/index.js';
import type { SkillShareerStore } from '@trapmap/server/lib/store.js';

type FeedbackEntryType = 'trap' | 'skill';

function normalizeLegacySlug(shortcut: string): string {
  return shortcut
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export async function buildOperatorEntryDisplayLookup(repos: Pick<
  SkillShareerRepos,
  'artifact' | 'knowledge'
>) {
  const [knowledgeEntries, artifacts] = await Promise.all([
    repos.knowledge.listByFilter({}),
    repos.artifact.listByFilter({}),
  ]);

  const knowledgeShortcuts = new Map(knowledgeEntries.map((entry) => [entry.id, entry.shortcut]));
  const artifactSlugs = new Map(artifacts.map((artifact) => [artifact.id, artifact.slug]));
  const artifactTitles = new Map(artifacts.map((artifact) => [artifact.id, artifact.title]));

  return {
    getEntryShortcut(entryId: string, entryType: FeedbackEntryType) {
      if (entryType === 'trap') {
        return knowledgeShortcuts.get(entryId) ?? 'unknown';
      }
      return artifactSlugs.get(entryId) ?? 'unknown';
    },
    getArtifactTitle(artifactId: string) {
      return artifactTitles.get(artifactId) ?? null;
    },
  };
}

export async function buildCompatibilityStatusProjection(
  repos: Pick<SkillShareerRepos, 'artifact' | 'knowledge'>,
  query: { teamId?: string },
) {
  const [legacyEntries, artifacts] = await Promise.all([
    repos.knowledge.listByFilter(query.teamId ? { teamId: query.teamId } : {}),
    repos.artifact.listByFilter(query.teamId ? { teamId: query.teamId } : {}),
  ]);

  const migratedArtifacts = artifacts.filter(
    (artifact) => artifact.metadata.sourceKind === 'legacy-knowledge',
  );
  const migratedSlugs = new Set(migratedArtifacts.map((artifact) => artifact.slug));
  const unmigratedEntries = legacyEntries.filter(
    (entry) => !migratedSlugs.has(normalizeLegacySlug(entry.shortcut)),
  );
  const artifactsBySourceKind = {
    'skill-directory': artifacts.filter((a) => a.metadata.sourceKind === 'skill-directory').length,
    'single-skill-md': artifacts.filter((a) => a.metadata.sourceKind === 'single-skill-md').length,
    'legacy-knowledge': migratedArtifacts.length,
  };
  const sunsetBlockers: string[] = [];

  if (unmigratedEntries.length > 0) {
    sunsetBlockers.push(`${unmigratedEntries.length} unmigrated entries remaining`);
  }
  if (legacyEntries.length > 0 && artifacts.length === 0) {
    sunsetBlockers.push('No artifacts created yet');
  }

  return {
    totalLegacyEntries: legacyEntries.length,
    migratedEntriesCount: migratedArtifacts.length,
    unmigratedEntriesCount: unmigratedEntries.length,
    totalArtifacts: artifacts.length,
    artifactsBySourceKind,
    unmigratedEntryIds: unmigratedEntries.slice(0, 50).map((entry) => entry.id),
    coexistenceActive: legacyEntries.length > 0 && artifacts.length > 0,
    sunsetReady: sunsetBlockers.length === 0,
    sunsetBlockers,
  };
}

export async function buildAuditEventProjection(
  repos: Pick<SkillShareerRepos, 'user'>,
  records: Array<{
    id: string;
    teamId: string | null;
    actorId: string;
    action: string;
    entityId: string;
    payload: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
  }>,
): Promise<AuditEvent[]> {
  const actorIds = [...new Set(records.map((record) => record.actorId))];
  const users = await Promise.all(actorIds.map((actorId) => repos.user.getById(actorId)));
  const userHandles = new Map(
    users
      .filter((user): user is NonNullable<typeof user> => user !== null)
      .map((user) => [user.id, user.handle]),
  );

  return records.map((record) => ({
    id: record.id,
    teamId: record.teamId,
    actor: {
      id: record.actorId,
      handle: userHandles.get(record.actorId) ?? record.actorId,
      securityLevel: 0,
    },
    action: record.action as AuditEvent['action'],
    entityId: record.entityId,
    payload: record.payload,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }));
}

export async function listArtifactRevisionFilePayloads(
  store: SkillShareerStore,
  artifactId: string,
  revision: number,
) {
  const data = await store.snapshot();
  return (
    data.artifactFilePayloads?.filter(
      (payload) => payload.artifactId === artifactId && payload.revision === revision,
    ) ?? []
  );
}

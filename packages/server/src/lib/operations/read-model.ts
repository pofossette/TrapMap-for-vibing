import type {
  AuditEvent,
  DecayAwareListItem,
  FeedbackFailureClassification,
  FeedbackListItem,
} from '@trapmap/contracts';

import { buildUserLookupContextFromRepos } from '@trapmap/server/lib/actors/lookup.js';
import { computeDecayState } from '@trapmap/server/lib/decay/state-machine.js';
import { toKnowledgeEntry } from '@trapmap/server/lib/knowledge.js';
import type { SkillShareerRepos } from '@trapmap/server/lib/repos/index.js';
import type { KnowledgeRecord, SkillShareerStore } from '@trapmap/server/lib/store.js';

type FeedbackEntryType = 'trap' | 'skill';
type FailureClassification = FeedbackFailureClassification;

const FAILURE_CLASSIFICATIONS: FailureClassification[] = [
  'missing-recall',
  'ranking-error',
  'summary-hallucination',
  'governance-leak',
  'outdated-content',
  'other',
];

export interface FailureClassificationCount {
  classification: FailureClassification;
  count: number;
}

export interface FailureClassificationSummary {
  totalClassified: number;
  dominantClassification: FailureClassification | null;
  counts: FailureClassificationCount[];
}

function normalizeLegacySlug(shortcut: string): string {
  return shortcut
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export async function buildOperatorEntryDisplayLookup(
  repos: Pick<SkillShareerRepos, 'artifact' | 'knowledge'>,
) {
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

export async function buildReviewQueueProjection(
  repos: Pick<SkillShareerRepos, 'knowledge' | 'user' | 'membership'>,
  input: {
    auth: {
      subjectType: 'user' | 'system-admin';
      activeTeamId: string | null;
      securityLevel: number;
    };
    status?: string;
  },
) {
  const { knowledge: knowledgeRepo, user: userRepo } = repos;
  const allEntries = await knowledgeRepo.listByFilter({});
  const filteredEntries = allEntries.filter((entry) => {
    if (
      entry.teamId &&
      input.auth.subjectType !== 'system-admin' &&
      input.auth.activeTeamId !== entry.teamId
    ) {
      return false;
    }
    if (
      input.auth.subjectType !== 'system-admin' &&
      input.auth.securityLevel <= entry.requiredLevel
    ) {
      return false;
    }
    return input.status ? entry.lifecycleState === input.status : true;
  });

  const fullEntries = await Promise.all(
    filteredEntries.map(
      async (entrySummary) => (await knowledgeRepo.getById(entrySummary.id)) ?? entrySummary,
    ),
  );
  const lookup = await buildUserLookupContextFromRepos(repos, fullEntries);

  const items = (
    await Promise.all(
      fullEntries.map(async (entry) => {
        const owner = await userRepo.getById(entry.ownerUserId);
        if (!owner) {
          return null;
        }

        const lastDecision = entry.reviewHistory.at(-1) ?? null;
        const lastDecisionUserId = lastDecision?.decidedByUserId ?? owner.id;
        const lastDecisionUser =
          lastDecisionUserId === owner.id ? owner : await userRepo.getById(lastDecisionUserId);

        const serializedEntry = toKnowledgeEntry(lookup, entry);
        const latestSubmission = serializedEntry.latestSubmission;
        return {
          entry: serializedEntry,
          agentReview: entry.agentReview,
          submittedBy: latestSubmission?.submittedBy ?? serializedEntry.owner,
          latestSubmission,
          reviewNotes: serializedEntry.reviewNotes,
          lastDecision: lastDecision
            ? {
                decidedAt: lastDecision.decidedAt,
                decidedBy: {
                  id: lastDecisionUserId,
                  handle: lastDecisionUser?.handle ?? owner.handle,
                  securityLevel: entry.requiredLevel,
                },
                decision: lastDecision.decision,
                notes: lastDecision.notes,
              }
            : null,
        };
      }),
    )
  ).filter((item): item is NonNullable<typeof item> => item !== null);

  return {
    items,
    total: items.length,
  };
}

export function summarizeFailureClassifications(
  records: Array<{
    failureClassification?: string | null;
  }>,
): FailureClassificationSummary {
  const counts = new Map<FailureClassification, number>(
    FAILURE_CLASSIFICATIONS.map((classification) => [classification, 0]),
  );

  for (const record of records) {
    const classification = record.failureClassification;
    if (!classification || !counts.has(classification as FailureClassification)) {
      continue;
    }
    counts.set(
      classification as FailureClassification,
      (counts.get(classification as FailureClassification) ?? 0) + 1,
    );
  }

  const countEntries = FAILURE_CLASSIFICATIONS.map((classification) => ({
    classification,
    count: counts.get(classification) ?? 0,
  }));
  const dominant = [...countEntries]
    .sort((left, right) => right.count - left.count)
    .find((entry) => entry.count > 0)?.classification;

  return {
    totalClassified: countEntries.reduce((sum, entry) => sum + entry.count, 0),
    dominantClassification: dominant ?? null,
    counts: countEntries,
  };
}

export function toFailureClassificationAwareFeedbackItem(
  item: FeedbackListItem,
  failureClassification: string | null | undefined,
): FeedbackListItem & { failureClassification?: FailureClassification } {
  if (
    !failureClassification ||
    !FAILURE_CLASSIFICATIONS.includes(failureClassification as FailureClassification)
  ) {
    return item;
  }

  return {
    ...item,
    failureClassification: failureClassification as FailureClassification,
  };
}

function computeAgeDays(lastVerifiedAt: string | null, now: Date): number | null {
  if (!lastVerifiedAt) return null;
  const verifiedAt = new Date(lastVerifiedAt);
  const ageMs = now.getTime() - verifiedAt.getTime();
  return ageMs / (1000 * 60 * 60 * 24);
}

function filterEntriesByPermission(
  entries: Array<{
    id: string;
    teamId: string | null;
    requiredLevel: number;
  }>,
  auth: {
    subjectType: 'user' | 'system-admin';
    activeTeamId: string | null;
    securityLevel: number;
  },
): Array<{ id: string; teamId: string | null; requiredLevel: number }> {
  return entries.filter((entry) => {
    if (auth.subjectType === 'system-admin') return true;
    if (auth.securityLevel > entry.requiredLevel) return false;
    if (entry.teamId === null) return true;
    return entry.teamId === auth.activeTeamId;
  });
}

function toDecayAwareListItem(
  entry: KnowledgeRecord,
  now: Date,
  config: Parameters<typeof computeDecayState>[1],
): DecayAwareListItem {
  const decayResult = entry.decayMeta
    ? computeDecayState(
        {
          lastVerifiedAt: entry.decayMeta.lastVerifiedAt,
          decayState: entry.decayMeta.decayState,
          supersededById: entry.decayMeta.supersededById,
        },
        config,
        now,
      )
    : null;

  return {
    id: entry.id,
    scope: entry.scope,
    labels: entry.labels,
    shortcut: entry.shortcut,
    lifecycleState: entry.lifecycleState,
    requiredLevel: entry.requiredLevel,
    updatedAt: entry.updatedAt,
    decayState: decayResult?.decayState ?? null,
    freshnessType: entry.decayMeta?.freshnessType ?? null,
    ageDays: computeAgeDays(entry.decayMeta?.lastVerifiedAt ?? null, now),
    lastVerifiedAt: entry.decayMeta?.lastVerifiedAt ?? null,
    supersededById: entry.decayMeta?.supersededById ?? null,
  };
}

export async function buildDecayEntriesProjection(
  repos: Pick<SkillShareerRepos, 'knowledge'>,
  input: {
    auth: {
      subjectType: 'user' | 'system-admin';
      activeTeamId: string | null;
      securityLevel: number;
    };
    filters: {
      decayStates?: string[];
      ageMinDays?: number;
      ageMaxDays?: number;
      labels?: string[];
      scope?: string;
      pattern?: string;
      limit: number;
    };
    config: Parameters<typeof computeDecayState>[1];
    now: Date;
  },
) {
  const allEntries = await repos.knowledge.listByFilter({});
  const permittedIds = new Set(
    filterEntriesByPermission(
      allEntries.map((entry) => ({
        id: entry.id,
        teamId: entry.teamId,
        requiredLevel: entry.requiredLevel,
      })),
      input.auth,
    ).map((entry) => entry.id),
  );
  const patternLower = input.filters.pattern?.toLowerCase() ?? '';

  const items = allEntries
    .filter((entry) => permittedIds.has(entry.id))
    .filter((entry) => {
      if (!input.filters.pattern) return true;
      const searchText = `${entry.shortcut} ${entry.detail}`.toLowerCase();
      return searchText.includes(patternLower);
    })
    .map((entry) => toDecayAwareListItem(entry, input.now, input.config))
    .filter((item) => {
      if (
        input.filters.decayStates?.length &&
        (!item.decayState || !input.filters.decayStates.includes(item.decayState))
      ) {
        return false;
      }
      if (
        input.filters.ageMinDays !== undefined &&
        (item.ageDays === null || item.ageDays < input.filters.ageMinDays)
      ) {
        return false;
      }
      if (
        input.filters.ageMaxDays !== undefined &&
        (item.ageDays === null || item.ageDays > input.filters.ageMaxDays)
      ) {
        return false;
      }
      if (
        input.filters.labels?.length &&
        !input.filters.labels.every((label) => item.labels.includes(label))
      ) {
        return false;
      }
      if (input.filters.scope && item.scope !== input.filters.scope) {
        return false;
      }
      return true;
    });

  items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return {
    items: items.slice(0, input.filters.limit),
    total: items.length,
  };
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

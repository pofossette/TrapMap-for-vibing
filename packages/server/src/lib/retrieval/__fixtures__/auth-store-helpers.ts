/**
 * Auth and store seeding helpers for integration tests.
 *
 * Extracts the common patterns from artifacts-activate.test.ts and other
 * route tests into reusable functions for building authenticated test servers.
 */

import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';

import type {
  GraphEdgeRecord,
  GraphIndexDocumentRecord,
  GraphNodeRecord,
  Permission,
  RoleTemplate,
} from '@trapmap/contracts';

import type { StoreData } from '@trapmap/server/lib/store.js';
import { createEmptyStoreData, hashSecret, nowIso } from '@trapmap/server/lib/store.js';
import {
  createArtifactSnapshotOwner,
  createKnowledgeSnapshotOwner,
} from '../../../../../service-knowledge-write/src/index.js';

import { buildPostgresTestServer } from '../../../../../../scripts/testing/server-test-composition.js';

function mapLifecycleState(state: string): string {
  const mapping: Record<string, string> = {
    pending: 'submitted',
    approved: 'approved',
    rejected: 'rejected',
    draft: 'draft',
    submitted: 'submitted',
    'agent-pass': 'agent-pass',
    'agent-rejected': 'agent-rejected',
    deactivated: 'deactivated',
  };

  return mapping[state] ?? 'submitted';
}

function cloneStoreData(data: StoreData): StoreData {
  return JSON.parse(JSON.stringify(data)) as StoreData;
}

const FALLBACK_AI_CONFIG = {
  provider: 'fallback' as const,
  baseUrl: '',
  apiKey: '',
  chatModel: '',
  embeddingModel: '',
  isConfigured: false,
  promptTemplateFile: null,
};

function slugifySeedValue(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug.length > 0 ? slug : 'fixture';
}

function ensureFixtureUser(data: StoreData, userId: string | null | undefined) {
  if (!userId || data.users.some((user) => user.id === userId)) {
    return;
  }

  const createdAt = nowIso();
  data.users.push({
    id: userId,
    handle: `fixture-${slugifySeedValue(userId)}`,
    notes: null,
    createdAt,
    updatedAt: createdAt,
  });
}

function ensureFixtureTeam(data: StoreData, teamId: string | null | undefined) {
  if (!teamId || data.teams.some((team) => team.id === teamId)) {
    return;
  }

  const createdAt = nowIso();
  data.teams.push({
    id: teamId,
    name: `Team ${teamId}`,
    slug: slugifySeedValue(teamId),
    description: null,
    createdAt,
    updatedAt: createdAt,
  });
}

function normalizeKnowledgeEntriesForPg(data: StoreData) {
  data.knowledgeEntries = data.knowledgeEntries.map((entry) => {
    const history =
      entry.history.length > 0
        ? entry.history
        : [
            {
              ...entry.latestRevision,
            },
          ];

    return {
      ...entry,
      lifecycleState: mapLifecycleState(entry.lifecycleState) as typeof entry.lifecycleState,
      history,
    };
  });
}

function normalizeArtifactsForPg(data: StoreData) {
  data.skillArtifacts = data.skillArtifacts.map((artifact) => {
    const normalizedHistory =
      artifact.history.length > 0
        ? artifact.history.map((revision) => {
            if (
              revision.revision === artifact.latestRevision.revision &&
              revision.derived == null &&
              artifact.latestRevision.derived != null
            ) {
              return {
                ...revision,
                derived: artifact.latestRevision.derived,
              };
            }

            return revision;
          })
        : [
            {
              ...artifact.latestRevision,
            },
          ];

    const hasLatestRevision = normalizedHistory.some(
      (revision) => revision.revision === artifact.latestRevision.revision,
    );

    return {
      ...artifact,
      lifecycleState: mapLifecycleState(artifact.lifecycleState) as typeof artifact.lifecycleState,
      history: hasLatestRevision
        ? normalizedHistory
        : [
            ...normalizedHistory,
            {
              ...artifact.latestRevision,
            },
          ],
    };
  });
}

function prepareStoreDataForPg(seedData: StoreData): StoreData {
  const prepared = cloneStoreData(seedData);

  for (const membership of prepared.memberships) {
    ensureFixtureUser(prepared, membership.userId);
    ensureFixtureTeam(prepared, membership.teamId);
  }

  for (const session of prepared.sessions) {
    ensureFixtureUser(prepared, session.userId);
    ensureFixtureTeam(prepared, session.activeTeamId);
  }

  for (const entry of prepared.knowledgeEntries) {
    ensureFixtureUser(prepared, entry.ownerUserId);
    ensureFixtureTeam(prepared, entry.teamId);
    ensureFixtureUser(prepared, entry.latestRevision.submittedByUserId);
    for (const revision of entry.history) {
      ensureFixtureUser(prepared, revision.submittedByUserId);
    }
  }

  for (const artifact of prepared.skillArtifacts) {
    ensureFixtureUser(prepared, artifact.ownerUserId);
    ensureFixtureTeam(prepared, artifact.teamId);
    ensureFixtureUser(prepared, artifact.latestRevision.submittedByUserId);
    for (const revision of artifact.history) {
      ensureFixtureUser(prepared, revision.submittedByUserId);
    }
  }

  for (const doc of prepared.graphIndexDocuments) {
    ensureFixtureTeam(prepared, doc.teamId);
  }

  normalizeKnowledgeEntriesForPg(prepared);
  normalizeArtifactsForPg(prepared);

  return prepared;
}

async function resetPgFixtureState(pool: Pool) {
  await pool.query(`
    TRUNCATE TABLE
      knowledge_entries, knowledge_labels, knowledge_keywords,
      knowledge_embeddings, knowledge_revisions, knowledge_search_documents,
      knowledge_boundary_contexts, knowledge_boundary_evidence,
      knowledge_boundary_exclusions, knowledge_boundary_prerequisites,
      knowledge_boundary_signals, knowledge_boundary_versions,
      knowledge_maintenance_assignments,
      skill_artifacts, skill_artifact_capsules, skill_artifact_files,
      skill_artifact_profiles, skill_artifact_client_manifests,
      skill_artifact_script_descriptors, skill_artifact_metadata,
      skill_artifact_agent_reviews, skill_artifact_maintenance_assignments,
      skill_artifact_manifest_assets, skill_artifact_manifest_references,
      skill_artifact_manifest_scripts,
      skill_artifact_boundary_contexts, skill_artifact_boundary_evidence,
      skill_artifact_boundary_exclusions, skill_artifact_boundary_prerequisites,
      skill_artifact_boundary_signals, skill_artifact_boundary_versions,
      artifact_revisions, artifact_lifecycle_events,
      candidates, candidate_analyses, candidate_duplicate_cases,
      candidate_duplicate_matches, candidate_manual_results,
      candidate_resolution_outcomes,
      sessions, users, teams, memberships, access_keys,
      feedback_records, feedback_custom_answers,
      graph_index_documents, entity_lineage,
      lifecycle_events, usage_events, usage_events_daily_rollup,
      task_queue, workflow_runs, retrieval_badcase_traces
    CASCADE
  `);
}

async function materializeToPgRepos(app: FastifyInstance, seedData: StoreData) {
  const { identity, pool, repos } = app.skillShareer;
  for (const user of seedData.users) {
    const existingUser = await identity.userRepo.getById(user.id);
    if (!existingUser) {
      await identity.userRepo.insert(user);
    }
  }

  for (const team of seedData.teams) {
    const existingTeam = await identity.teamRepo.getById(team.id);
    if (!existingTeam) {
      await identity.teamRepo.insert(team);
    }
  }

  for (const membership of seedData.memberships) {
    const existingMembership = await identity.membershipRepo.getById(membership.id);
    if (!existingMembership) {
      await identity.membershipRepo.insert(membership);
    }
  }

  for (const session of seedData.sessions) {
    const existingSession = await identity.sessionRepo.getByTokenHash(session.tokenHash);
    if (!existingSession) {
      await identity.sessionRepo.create({
        userId: session.userId,
        tokenHash: session.tokenHash,
        activeTeamId: session.activeTeamId,
        subjectType: session.subjectType,
        expiresAt: session.expiresAt,
      });
    }
  }

  const knowledgeSnapshotOwner = createKnowledgeSnapshotOwner(pool);
  for (const entry of seedData.knowledgeEntries) {
    const existingEntry = await repos.knowledge.getById(entry.id);
    if (!existingEntry) {
      await knowledgeSnapshotOwner.put(entry);
    }
  }

  const artifactSnapshotOwner = createArtifactSnapshotOwner(pool);
  for (const artifact of seedData.skillArtifacts) {
    const existingArtifact = await repos.artifact.getById(artifact.id);
    if (!existingArtifact) {
      await artifactSnapshotOwner.put(artifact);
    }
  }

  for (const doc of seedData.graphIndexDocuments) {
    await repos.graphIndex.upsert(doc);
  }
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

export interface SeedUserResult {
  userId: string;
  sessionId: string;
  authToken: string;
}

/**
 * Seed an authenticated user with a session token.
 * Returns the raw token to use as Bearer auth.
 */
export function seedAuthenticatedUser(
  data: StoreData,
  overrides: {
    userId?: string;
    handle?: string;
    teamId?: string;
    securityLevel?: number;
    permissions?: Permission[];
    roleTemplate?: RoleTemplate;
  } = {},
): SeedUserResult {
  const userId = overrides.userId ?? `user_test_${Date.now()}`;
  const handle = overrides.handle ?? 'testuser';
  const teamId = overrides.teamId ?? `team_${userId}`;
  const securityLevel = overrides.securityLevel ?? 10;
  const permissions: Permission[] = overrides.permissions ?? [
    'knowledge:search',
    'knowledge:update',
    'knowledge:review',
    'knowledge:submit',
    'knowledge:export',
  ];
  const roleTemplate: RoleTemplate = overrides.roleTemplate ?? 'admin';
  const createdAt = nowIso();

  data.users.push({
    id: userId,
    handle,
    notes: null,
    createdAt,
    updatedAt: createdAt,
  });

  data.memberships.push({
    id: `membership_${userId}`,
    userId,
    teamId,
    roleTemplate,
    securityLevel,
    permissions,
    notes: null,
    createdAt,
    updatedAt: createdAt,
  });

  const authToken = `session_test_${userId}_${Date.now()}`;
  const sessionId = `session_${userId}_${Date.now()}`;
  data.sessions.push({
    id: sessionId,
    userId,
    tokenHash: hashSecret(authToken),
    activeTeamId: null,
    subjectType: 'user',
    createdAt,
    updatedAt: createdAt,
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  });

  return { userId, sessionId, authToken };
}

/**
 * Seed an approved knowledge entry into the store data.
 */
export function seedApprovedKnowledgeEntry(
  data: { knowledgeEntries: any[]; counters: Record<string, number> },
  userId: string,
  overrides: {
    id?: string;
    shortcut?: string;
    detail?: string;
    labels?: string[];
    requiredLevel?: number;
    scope?: 'global' | 'project';
  } = {},
) {
  const id = overrides.id ?? `knowledge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const shortcut = overrides.shortcut ?? `Shortcut for ${id}`;
  const detail = overrides.detail ?? `Detail for ${id}`;
  const labels = overrides.labels ?? ['test'];
  const requiredLevel = overrides.requiredLevel ?? 0;
  const scope = overrides.scope ?? 'global';
  const submittedAt = nowIso();
  const initialRevision = {
    revision: 1,
    submittedAt,
    submittedByUserId: userId,
    shortcut,
    detail,
    labels,
    reviewNotes: [],
  };

  const entry = {
    id,
    teamId: null,
    scope,
    labels,
    shortcut,
    detail,
    requiredLevel,
    lifecycleState: 'approved',
    ownerUserId: userId,
    latestRevision: initialRevision,
    history: [initialRevision],
    metadata: {
      scopeLabel: 'global-constraint',
      submissionCount: 1,
      resubmissionCount: 0,
      revisionCount: 1,
      latestSubmissionId: null,
      latestSubmittedAt: null,
      latestReviewedAt: null,
      latestDecision: null,
    },
    latestSubmissionId: null,
    submissionHistory: [],
    agentReview: null,
    reviewHistory: [],
    reviewNotes: [],
    lifecycleHistory: [],
    embeddingCache: null,
    indexState: null,
    boundary: null,
    decayMeta: null,
    evidenceMeta: null,
    maintenanceMeta: null,
    createdAt: submittedAt,
    updatedAt: submittedAt,
  };

  data.knowledgeEntries.push(entry);
  return entry;
}

const FAKE_HASH = 'a'.repeat(64);

/**
 * Seed an approved skill artifact with derived data (profile, capsules, clientManifest).
 */
export function seedApprovedSkillArtifact(
  data: { skillArtifacts: any[]; counters: Record<string, number>; artifactFilePayloads?: any[] },
  userId: string,
  overrides: {
    id?: string;
    title?: string;
    labels?: string[];
    requiredLevel?: number;
    scope?: 'global' | 'project';
    withClientManifest?: boolean;
    files?: { path: string; content: string; kind: string }[];
    capsuleId?: string;
    capsuleContent?: string;
  } = {},
) {
  const id = overrides.id ?? `artifact_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const title = overrides.title ?? `Skill ${id}`;
  const labels = overrides.labels ?? ['test'];
  const requiredLevel = overrides.requiredLevel ?? 0;
  const scope = overrides.scope ?? 'global';

  // Default file for schema compliance (min 1 file required)
  const defaultFile = {
    path: 'SKILL.md',
    kind: 'skill-markdown' as const,
    sha256: FAKE_HASH,
    sizeBytes: 100,
    mediaType: 'text/markdown',
    source: 'SKILL.md',
    includeInDerivation: true,
    activationOnly: false,
  };

  const files =
    (overrides.files ?? []).length > 0
      ? (overrides.files ?? []).map((f) => ({
          path: f.path,
          kind: f.kind,
          sha256: FAKE_HASH,
          sizeBytes: f.content.length,
          mediaType: 'text/markdown',
          source: f.path.startsWith('references/')
            ? 'references/'
            : f.path.startsWith('assets/')
              ? 'assets/'
              : f.path.startsWith('scripts/')
                ? 'scripts/'
                : 'SKILL.md',
          includeInDerivation: f.kind === 'skill-markdown',
          activationOnly: f.kind !== 'skill-markdown',
        }))
      : [defaultFile];

  const clientManifest = overrides.withClientManifest
    ? {
        artifactId: id,
        revision: 1,
        references: [
          {
            path: 'references/cache-strategy.md',
            sha256: FAKE_HASH,
            sizeBytes: 200,
            mediaType: 'text/markdown',
          },
        ],
        assets: [
          {
            path: 'assets/docker-compose.yml',
            sha256: FAKE_HASH,
            sizeBytes: 500,
            mediaType: 'text/yaml',
          },
        ],
        scripts: [
          {
            path: 'scripts/deploy.sh',
            sha256: FAKE_HASH,
            capability: 'deploy',
            argsSchemaSummary: 'No arguments.',
            sideEffectSummary: 'Deploys the packaged artifact.',
            defaultPolicy: 'needs-approval',
          },
        ],
        sourceHash: FAKE_HASH,
      }
    : null;

  const derived = {
    profile: {
      artifactId: id,
      revision: 1,
      sourceHash: FAKE_HASH,
      title,
      summary: `Summary for ${title}`,
      keywords: labels,
      referencePaths: files.filter((f: any) => f.kind === 'reference').map((f: any) => f.path),
      contentHash: FAKE_HASH,
    },
    capsules: [
      {
        capsuleId: overrides.capsuleId ?? `capsule_${id}`,
        artifactId: id,
        revision: 1,
        sourcePaths: files.length > 0 ? [files[0]!.path] : ['SKILL.md'],
        content: overrides.capsuleContent ?? `Content for ${title}`,
        situation: `Situation for ${title}`,
        problem: `Problem for ${title}`,
        goal: `Goal for ${title}`,
        errorText: '',
        labels,
        scope,
        requiredLevel,
      },
    ],
    clientManifest,
    sourceHash: FAKE_HASH,
    derivedAt: nowIso(),
  };

  const artifact = {
    id,
    teamId: null,
    scope,
    labels,
    title,
    slug: `skill-${id}`,
    requiredLevel,
    lifecycleState: 'approved',
    ownerUserId: userId,
    latestRevision: {
      revision: 1,
      sourceHash: FAKE_HASH,
      files,
      submittedAt: nowIso(),
      submittedByUserId: userId,
      scriptDescriptors: [],
      derived,
    },
    history: [
      {
        revision: 1,
        sourceHash: FAKE_HASH,
        files:
          files.length > 0
            ? files
            : [
                // Ensure at least one file for schema compliance
                {
                  path: 'SKILL.md',
                  kind: 'skill-markdown' as const,
                  sha256: FAKE_HASH,
                  sizeBytes: 100,
                  mediaType: 'text/markdown',
                  source: 'SKILL.md',
                  includeInDerivation: true,
                  activationOnly: false,
                },
              ],
        submittedAt: nowIso(),
        submittedByUserId: userId,
        scriptDescriptors: [],
        derived,
      },
    ],
    metadata: {
      sourceKind: 'skill-directory',
      submissionCount: 1,
      resubmissionCount: 0,
      revisionCount: 1,
      latestSubmissionId: null,
      latestSubmittedAt: null,
      latestReviewedAt: null,
      latestDecision: null,
    },
    agentReview: null,
    reviewHistory: [],
    reviewNotes: [],
    lifecycleHistory: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  data.skillArtifacts.push(artifact);
  return artifact;
}

/**
 * Seed a file payload for a specific artifact revision.
 */
export function seedFilePayload(
  data: { artifactFilePayloads: any[] },
  artifactId: string,
  revision: number,
  path: string,
  content: string,
) {
  data.artifactFilePayloads.push({
    artifactId,
    revision,
    path,
    sha256: FAKE_HASH,
    sizeBytes: Buffer.byteLength(content, 'utf-8'),
    mediaType: 'text/markdown',
    content,
    storedAt: nowIso(),
  });
}

/**
 * Seed a graph document into the store data.
 */
export function seedGraphDocument(
  data: { graphIndexDocuments: GraphIndexDocumentRecord[] },
  sourceType: 'trap' | 'skill',
  sourceId: string,
  nodes: GraphNodeRecord[],
  edges: GraphEdgeRecord[],
  requiredLevel = 0,
) {
  const doc: GraphIndexDocumentRecord = {
    id: `graphdoc_${sourceType}_${sourceId}_r1`,
    sourceType,
    sourceId,
    revision: 1,
    contentHash: `hash-${sourceId}`,
    teamId: null,
    scope: 'global',
    requiredLevel,
    nodes,
    edges,
    evidence: 'test evidence',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  data.graphIndexDocuments.push(doc);
  return doc;
}

// ---------------------------------------------------------------------------
// Test server builder
// ---------------------------------------------------------------------------

export interface TestServerResult {
  app: FastifyInstance;
  pool: Pool;
  authToken: string;
  userId: string;
}

/**
 * Apply a fixture mutation through owner repositories backed by PostgreSQL.
 */
export async function seedTestData(
  app: FastifyInstance,
  mutate: (data: StoreData) => void | Promise<void>,
): Promise<StoreData> {
  const nextSnapshot = createEmptyStoreData();

  await mutate(nextSnapshot);
  await materializeToPgRepos(app, prepareStoreDataForPg(nextSnapshot));

  return nextSnapshot;
}

/**
 * Build a test server with pre-seeded data and an authenticated user.
 * Uses app.inject() for HTTP testing without real network I/O.
 */
export async function buildTestServer(
  seedFn?: (data: any, auth: SeedUserResult) => void,
  options: {
    securityLevel?: number;
    permissions?: Permission[];
    roleTemplate?: RoleTemplate;
  } = {},
): Promise<TestServerResult> {
  const testDataFile = `/tmp/trapmap-test-${Date.now()}-${Math.random()}.json`;
  const app = await buildPostgresTestServer({
    config: { dataFile: testDataFile, ai: FALLBACK_AI_CONFIG },
  });
  await app.ready();

  const seedData = createEmptyStoreData();
  let authResult: SeedUserResult = { userId: '', sessionId: '', authToken: '' };

  authResult = seedAuthenticatedUser(seedData, {
    securityLevel: options.securityLevel ?? 10,
    ...(options.permissions !== undefined && { permissions: options.permissions }),
    ...(options.roleTemplate !== undefined && { roleTemplate: options.roleTemplate }),
  });

  if (seedFn) {
    seedFn(seedData, authResult);
  }

  await resetPgFixtureState(app.skillShareer.pool);
  await materializeToPgRepos(app, prepareStoreDataForPg(seedData));

  return {
    app,
    pool: app.skillShareer.pool,
    authToken: authResult.authToken,
    userId: authResult.userId,
  };
}

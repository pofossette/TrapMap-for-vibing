/**
 * Auth and store seeding helpers for integration tests.
 *
 * Extracts the common patterns from artifacts-activate.test.ts and other
 * route tests into reusable functions for building authenticated test servers.
 */

import type { FastifyInstance } from 'fastify';

import type { Permission, RoleTemplate } from '@trapmap/contracts';

import { buildServer } from '@trapmap/server/app.js';
import type {
  GraphEdgeRecord,
  GraphIndexDocumentRecord,
  GraphNodeRecord,
} from '@trapmap/server/lib/indexing/graph-lite/documents.js';
import type { SkillShareerStore, StoreData } from '@trapmap/server/lib/store.js';
import { hashSecret, nowIso } from '@trapmap/server/lib/store.js';

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

  data.users.push({
    id: userId,
    handle,
    notes: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });

  data.memberships.push({
    id: `membership_${userId}`,
    userId,
    teamId,
    roleTemplate,
    securityLevel,
    permissions,
    notes: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });

  const authToken = `session_test_${userId}_${Date.now()}`;
  data.sessions.push({
    id: `session_${userId}_${Date.now()}`,
    userId,
    tokenHash: hashSecret(authToken),
    activeTeamId: null,
    subjectType: 'user',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  });

  return { userId, sessionId: `session_${userId}_${Date.now()}`, authToken };
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
    latestRevision: {
      revision: 1,
      submittedAt: nowIso(),
      submittedByUserId: userId,
      shortcut,
      detail,
      labels,
      reviewNotes: [],
    },
    history: [],
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
    createdAt: nowIso(),
    updatedAt: nowIso(),
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
        references: [{ path: 'references/cache-strategy.md', sha256: FAKE_HASH, sizeBytes: 200 }],
        assets: [{ path: 'assets/docker-compose.yml', sha256: FAKE_HASH, sizeBytes: 500 }],
        scripts: [
          {
            path: 'scripts/deploy.sh',
            sha256: FAKE_HASH,
            sizeBytes: 100,
            defaultPolicy: 'needs-approval',
          },
        ],
      }
    : null;

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
      derived: {
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
            labels,
            scope,
            requiredLevel,
          },
        ],
        clientManifest,
        sourceHash: FAKE_HASH,
        derivedAt: nowIso(),
      },
    },
    history: [
      // Include initial revision in history (required by schema: min 1 item)
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
        derived: null,
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
  store: SkillShareerStore;
  authToken: string;
  userId: string;
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
  const app = buildServer({ config: { dataFile: testDataFile } });
  await app.ready();

  const store = app.skillShareer.store;
  let authResult: SeedUserResult = { userId: '', sessionId: '', authToken: '' };

  await store.transact(async (data) => {
    if (!data.counters) data.counters = {};

    authResult = seedAuthenticatedUser(data, {
      securityLevel: options.securityLevel ?? 10,
      ...(options.permissions !== undefined && { permissions: options.permissions }),
      ...(options.roleTemplate !== undefined && { roleTemplate: options.roleTemplate }),
    });

    if (seedFn) {
      seedFn(data, authResult);
    }
  });

  return {
    app,
    store,
    authToken: authResult.authToken,
    userId: authResult.userId,
  };
}

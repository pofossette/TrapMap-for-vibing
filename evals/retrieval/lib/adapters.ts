/**
 * Endpoint execution adapters for retrieval evaluation.
 *
 * Phase 26-01: REVAL-01
 * Provides execution boundary between the runner and the actual endpoints.
 * Executes through explicit adapters that record execution path and fallback usage.
 */

import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';

import type {
  DerivedSkillCapsuleRecord,
  GraphIndexDocumentRecord,
  KnowledgeOwnerPort,
  KnowledgeRecord,
  RetrievalQuery,
  RetrievalV2Query,
  SkillArtifact,
  SkillLookupQuery,
} from '@trapmap/contracts';
import { nowIso, sha256 } from '@trapmap/lib';
import type { ArtifactWritePort } from '@trapmap/service-knowledge-write';
import type { RetrievalEvalCase, RetrievalEvalScenario } from '../../types/index.js';

import type { HostLocalRuntime } from '../../../packages/host-local/src/nest/runtime/host-runtime.js';
import type { EvalSeedPort } from '@trapmap/backend-core';
import { resetRetrievalReadModelCacheForTests } from '../../../packages/service-knowledge-read/src/retrieval-read-model-cache.js';
import { createKnowledgeEntryRecord } from '../../../packages/service-knowledge-write/src/knowledge-record-mutations.js';
import { buildPostgresComposedServer } from '../../../scripts/testing/postgres-server-composition.js';

import { loadScenario } from './load.js';
import { normalizeResponse } from './normalize.js';
import { hydrateScenarioSnapshot } from './snapshot.js';
import type { AdapterType, AdapterWarning, ExecutionMetadata, NormalizedResult } from './types.js';

// =============================================================================
// Helpers
// =============================================================================

/**
 * Map fixture lifecycle states to PostgreSQL-valid values.
 * PG constraint: draft, submitted, agent-pass, agent-rejected, approved, rejected, deactivated
 */
function mapLifecycleState(state: string): KnowledgeRecord['lifecycleState'] {
  const mapping: Record<string, KnowledgeRecord['lifecycleState']> = {
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

type ArtifactFixture = {
  id: string;
  teamId: string | null;
  scope: 'global' | 'project';
  labels: string[];
  title: string;
  slug: string;
  requiredLevel: number;
  lifecycleState: string;
  capsules: Array<{
    capsuleId: string;
    content: string;
    situation: string;
    problem: string;
    goal: string;
    labels: string[];
    scope: 'global' | 'project';
    requiredLevel: number;
  }>;
};

type KnowledgeFixture = {
  id: string;
  teamId: string | null;
  scope: 'global' | 'project';
  labels: string[];
  shortcut: string;
  detail: string;
  requiredLevel: number;
  lifecycleState: string;
};

function createKnowledgeFixtureRecord(entry: KnowledgeFixture, actorId: string, createdAt: string) {
  const preReview = {
    status: (entry.lifecycleState === 'approved' || entry.lifecycleState === 'pending'
      ? 'agent-pass'
      : 'agent-rejected') as 'agent-pass' | 'agent-rejected',
    duplicateRisk: 'low' as const,
    correctnessRisk: 'low' as const,
    completenessRisk: 'low' as const,
    checkedAt: createdAt,
    notes: [] as string[],
    issues: [],
    suggestions: [],
    duplicateCandidates: [],
  };

  return createKnowledgeEntryRecord({
    ownerUserId: actorId,
    teamId: entry.teamId,
    payload: {
      scope: entry.scope,
      labels: entry.labels,
      shortcut: entry.shortcut,
      detail: entry.detail,
    },
    requiredLevel: entry.requiredLevel,
    createdAt,
    preReview,
    entryId: entry.id,
  });
}

function buildDerivedCapsules(artifact: ArtifactFixture): DerivedSkillCapsuleRecord[] {
  return artifact.capsules.map((capsule) => ({
    capsuleId: capsule.capsuleId,
    artifactId: artifact.id,
    revision: 1,
    sourcePaths: ['mock-source.md'],
    content: capsule.content,
    situation: capsule.situation,
    problem: capsule.problem,
    goal: capsule.goal,
    errorText: '',
    labels: capsule.labels,
    scope: capsule.scope,
    requiredLevel: capsule.requiredLevel,
  }));
}

function buildDerivedPayload(
  artifact: ArtifactFixture,
  capsules: DerivedSkillCapsuleRecord[],
  createdAt: string,
) {
  return {
    profile: {
      artifactId: artifact.id,
      revision: 1,
      sourceHash: '',
      title: artifact.title,
      summary: artifact.capsules.map((capsule) => capsule.content).join('. '),
      keywords: artifact.labels,
      referencePaths: [],
      contentHash: '',
    },
    capsules,
    clientManifest: null,
    sourceHash: '',
    derivedAt: createdAt,
  };
}

function buildArtifactFixtureFields(artifact: ArtifactFixture) {
  return {
    id: artifact.id,
    teamId: artifact.teamId,
    scope: artifact.scope,
    labels: artifact.labels,
    title: artifact.title,
    slug: artifact.slug,
    requiredLevel: artifact.requiredLevel,
  };
}

// =============================================================================
// Execution Context
// =============================================================================

/**
 * Context for executing an eval case.
 */
export interface ExecutionContext {
  /** Fastify app for HTTP injection. */
  app: FastifyInstance;
  /** Host-local runtime with all service ports. */
  runtime: HostLocalRuntime;
  /** Host-local services (identity, graphIndex, graphQueryBackend, etc.). */
  services: EvalSeedPort;
  /** Host-owned PostgreSQL pool for fixture cleanup. */
  pool: Pool;
  /** Session token for authentication */
  sessionToken: string;
  /** Actor ID for the session */
  actorId: string;
  artifactWriter: ArtifactWritePort;
  knowledgeOwner: KnowledgeOwnerPort;
  /** Closes the host-composed app and its owner pool. */
  close(): Promise<void>;
}

// =============================================================================
// Adapter Result
// =============================================================================

/**
 * Result from adapter execution.
 */
export interface AdapterResult {
  /** Normalized result from endpoint */
  result: NormalizedResult;
  /** Execution metadata */
  execution: ExecutionMetadata;
  /** Any warnings generated during execution */
  warnings: AdapterWarning[];
}

// =============================================================================
// Context Creation
// =============================================================================

/**
 * Create an execution context for running eval cases.
 * Seeds the store with fixture data and creates a session for the actor.
 *
 * Requires a PostgreSQL URL and writes identity fixtures through owner ports.
 *
 * @param config - Configuration options
 * @returns Execution context with app, store, and session token
 */
export async function createExecutionContext(options?: {
  databaseUrl?: string;
}): Promise<ExecutionContext> {
  resetRetrievalReadModelCacheForTests();

  const databaseUrl = options?.databaseUrl ?? process.env.TRAPMAP_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('retrieval eval requires TRAPMAP_DATABASE_URL and PostgreSQL host composition');
  }
  const composed = await buildPostgresComposedServer(databaseUrl);
  const { app, runtime, services } = composed;
  const pool = services.store.getPool() as Pool;

  const identity = services.identity;

  // Create a system admin user and session for the eval runner
  const actorId = 'user_eval_runner';

  const existingUser = await identity.userRepo.getById(actorId);
  if (!existingUser) {
    await identity.userRepo.insert({
      id: actorId,
      handle: 'eval-runner',
      notes: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
  }

  const sessionToken = await createSession(actorId, null, 'system-admin', identity.sessionRepo);

  return {
    app,
    runtime,
    services,
    pool,
    sessionToken,
    actorId,
    artifactWriter: composed.artifactWriter,
    knowledgeOwner: composed.knowledgeOwner,
    close: composed.close,
  };
}

/**
 * Create a session for an actor.
 * Uses the host-owned identity session port.
 */
async function createSession(
  userId: string,
  activeTeamId: string | null,
  subjectType: 'user' | 'system-admin',
  sessionRepo: NonNullable<FastifyInstance['skillShareer']['identity']>['sessionRepo'],
): Promise<string> {
  const token = `session_eval_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  await sessionRepo.create({
    userId,
    tokenHash: sha256(token),
    activeTeamId,
    subjectType,
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  });

  return token;
}

/**
 * Close an execution context.
 * In PostgreSQL mode, truncates all tables and closes the pool to prevent connection leaks.
 */
export async function closeExecutionContext(ctx: ExecutionContext): Promise<void> {
  resetRetrievalReadModelCacheForTests();

  // Eval cases run in isolated app instances, but a shared Neo4j projection can
  // outlive each case. Clear the projection before closing so graph-backed
  // scenarios do not leak fixture state into subsequent cases.
  if (ctx.services.graphQueryBackend.isEnabled()) {
    try {
      await ctx.services.graphQueryBackend.rebuildProjection([]);
    } catch {
      // Ignore projection cleanup errors during teardown.
    }
  }

  const { pool } = ctx;
  const { rows } = await pool.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '%migration%'",
  );
  if (rows.length > 0) {
    const tables = rows.map(({ tablename }) => `"${tablename.replaceAll('"', '""')}"`).join(', ');
    await pool.query(`TRUNCATE TABLE ${tables} CASCADE`);
  }
  await ctx.close();
}

// =============================================================================
// Fixture Seeding
// =============================================================================

/**
 * Seed fixture data for a scenario.
 * Loads the scenario by case.scenarioId and materializes knowledge entries
 * and skill artifacts into the store with exact fixture IDs.
 *
 * @param ctx - Execution context
 * @param case_ - Retrieval eval case (or case-like object with scenarioId)
 * @param explicitScenario - Optional scenario to use directly (bypasses loadScenario)
 */
export async function seedScenarioFixtures(
  ctx: ExecutionContext,
  case_: Pick<RetrievalEvalCase, 'scenarioId'>,
  explicitScenario?: RetrievalEvalScenario,
): Promise<void> {
  const loadedScenario = explicitScenario ?? loadScenario(case_.scenarioId);
  const scenario = loadedScenario ? await hydrateScenarioSnapshot(loadedScenario) : undefined;
  if (!scenario) return;

  const fixtureEntries = scenario.fixtures.knowledgeEntries as KnowledgeFixture[];

  const fixtureArtifacts = scenario.fixtures.skillArtifacts as ArtifactFixture[];
  const fixtureGraphDocs = (scenario.fixtures.graphIndexDocuments ??
    []) as GraphIndexDocumentRecord[];

  const createdAt = nowIso();
  const services = ctx.services;

  // Seed through owners so fixtures exercise the same aggregate/revision/lifecycle
  // transaction as commands.
  for (const entry of fixtureEntries) {
    const record = createKnowledgeFixtureRecord(entry, ctx.actorId, createdAt);
    const lifecycleState = mapLifecycleState(entry.lifecycleState);
    await ctx.knowledgeOwner.submit({
      actorId: ctx.actorId,
      entryId: record.id,
      lifecycleState,
      content: record.detail,
      title: record.shortcut,
      labels: record.labels,
      teamId: record.teamId,
      scope: record.scope,
      requiredLevel: record.requiredLevel,
    });
  }

  for (const artifact of fixtureArtifacts) {
    const capsules = buildDerivedCapsules(artifact);

    const record = {
      ...buildArtifactFixtureFields(artifact),
      lifecycleState: mapLifecycleState(artifact.lifecycleState),
      owner: { id: ctx.actorId, handle: ctx.actorId, securityLevel: 0 },
      latestRevision: 1,
      history: [
        {
          revision: 1,
          sourceHash: '',
          files: [],
          submittedAt: createdAt,
          submittedBy: { id: ctx.actorId, handle: ctx.actorId, securityLevel: 0 },
          scriptDescriptors: [],
          derived: buildDerivedPayload(artifact, capsules, createdAt),
        },
      ],
      metadata: {
        sourceKind: 'skill-directory',
        submissionCount: 1,
        resubmissionCount: 0,
        revisionCount: 1,
        latestSubmissionId: null,
        latestSubmittedAt: createdAt,
        latestReviewedAt: null,
        latestDecision: null,
      },
      agentReview: null,
      reviewHistory: [],
      reviewNotes: [],
      lifecycleHistory: [],
      boundaryMeta: null,
      evidenceMeta: null,
      maintenanceMeta: null,
      createdAt,
      updatedAt: createdAt,
      remediation: null,
    } satisfies SkillArtifact;

    await ctx.artifactWriter.insert(record);
  }

  for (const graphDoc of fixtureGraphDocs) {
    await services.graphIndex.upsert(graphDoc as never);
  }

  // Keep the active graph backend aligned with the scenario fixture set. In
  // Neo4j-primary mode the PG truth source alone is insufficient, because
  // graph queries read from the projected backend during eval execution.
  await services.graphQueryBackend.rebuildProjection(fixtureGraphDocs as never);

  // Set up actor session with scenario permissions
  await createActorSession(ctx, scenario.actor);
}

/**
 * Create a session for a specific scenario actor.
 */
export async function createActorSession(
  ctx: ExecutionContext,
  actor: {
    subjectType: 'user' | 'system-admin';
    activeTeamId: string | null;
    securityLevel: number;
    permissions: string[];
  },
): Promise<string> {
  const identity = ctx.services.identity;
  if (actor.activeTeamId) {
    const existing = await identity.teamRepo.getById(actor.activeTeamId);
    if (!existing) {
      await identity.teamRepo.insert({
        id: actor.activeTeamId,
        name: `Team ${actor.activeTeamId}`,
        slug: `team-${actor.activeTeamId}`,
        description: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
    }

    const membershipId = `membership_${ctx.actorId}_${actor.activeTeamId}`;
    const existingMembership = await identity.membershipRepo.getById(membershipId);
    if (!existingMembership) {
      await identity.membershipRepo.insert({
        id: membershipId,
        userId: ctx.actorId,
        teamId: actor.activeTeamId,
        roleTemplate: actor.subjectType === 'system-admin' ? 'admin' : 'user',
        securityLevel: actor.securityLevel,
        permissions: actor.permissions,
        notes: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
    }
  }

  await identity.sessionRepo.deleteByTokenHash(sha256(ctx.sessionToken));
  ctx.sessionToken = await createSession(
    ctx.actorId,
    actor.activeTeamId,
    actor.subjectType,
    identity.sessionRepo,
  );

  return ctx.sessionToken;
}

// =============================================================================
// Endpoint Execution
// =============================================================================

/**
 * Execute a retrieval case through the Fastify route.
 *
 * @param ctx - Execution context
 * @param case_ - The case to execute
 * @returns Adapter result with normalized output and metadata
 */
export async function executeThroughRoute(
  ctx: ExecutionContext,
  case_: RetrievalEvalCase,
): Promise<AdapterResult> {
  const startTime = Date.now();
  const warnings: AdapterWarning[] = [];

  const adapterType: AdapterType = 'route';
  const fallbackUsed = false;
  let fallbackReason: string | undefined;

  try {
    const payload: RetrievalQuery | RetrievalV2Query | SkillLookupQuery =
      case_.endpoint === '/v1/retrieval/skills/search-by-content'
        ? {
            text: case_.request.seed,
            ...(case_.request.maxResults !== undefined
              ? { maxResults: case_.request.maxResults }
              : {}),
          }
        : case_.request;

    const response = await ctx.app.inject({
      method: 'POST',
      url: case_.endpoint,
      headers: {
        authorization: `Bearer ${ctx.sessionToken}`,
      },
      payload,
    });

    const durationMs = Date.now() - startTime;

    if (response.statusCode >= 500) {
      // Server error - could indicate route instability
      warnings.push({
        code: 'route-error',
        message: `Route returned ${response.statusCode}: ${response.body}`,
        degraded: true,
      });
    }

    if (response.statusCode >= 400) {
      // Client error - could be auth/validation issue
      warnings.push({
        code: 'client-error',
        message: `Request failed with ${response.statusCode}`,
        degraded: false,
      });

      // Return empty result for errors
      const emptyResult: NormalizedResult = {
        hits: [],
        returnedIds: [],
        buckets: { globalConstraints: [], projectKnowledge: [] },
        profileHintArtifactIds: [],
        artifactIds: [],
        isEmpty: true,
        rawResponse: response.json(),
        endpoint: case_.endpoint,
      };

      return {
        result: emptyResult,
        execution: {
          adapterType,
          fallbackUsed,
          fallbackReason,
          endpoint: case_.endpoint,
          durationMs,
          fallbackApplied: false,
        },
        warnings,
      };
    }

    const responseBody = response.json();
    const result = normalizeResponse(responseBody, case_.endpoint);
    const routingTrace = result.routingTrace;

    return {
      result,
      execution: {
        adapterType,
        fallbackUsed: routingTrace?.fallbackApplied ?? fallbackUsed,
        fallbackReason: routingTrace?.routingReason ?? fallbackReason,
        endpoint: case_.endpoint,
        durationMs,
        selectedMode: routingTrace?.selectedMode as ExecutionMetadata['selectedMode'],
        routingReason: routingTrace?.routingReason as ExecutionMetadata['routingReason'],
        fallbackApplied: routingTrace?.fallbackApplied ?? false,
      },
      warnings,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    warnings.push({
      code: 'execution-error',
      message: errorMessage,
      degraded: true,
    });

    // Return empty result on error
    const emptyResult: NormalizedResult = {
      hits: [],
      returnedIds: [],
      buckets: { globalConstraints: [], projectKnowledge: [] },
      profileHintArtifactIds: [],
      artifactIds: [],
      isEmpty: true,
      rawResponse: { error: errorMessage },
      endpoint: case_.endpoint,
    };

    return {
      result: emptyResult,
      execution: {
        adapterType,
        fallbackUsed,
        fallbackReason,
        endpoint: case_.endpoint,
        durationMs,
        fallbackApplied: false,
      },
      warnings,
    };
  }
}

// =============================================================================
// Main Execution Entry Point
// =============================================================================

/**
 * Execute a retrieval eval case.
 * Defaults to route execution, with fallback handling if needed.
 *
 * @param ctx - Execution context
 * @param case_ - The case to execute
 * @returns Adapter result
 */
export async function executeCase(
  ctx: ExecutionContext,
  case_: RetrievalEvalCase,
): Promise<AdapterResult> {
  // Default: execute through route
  return executeThroughRoute(ctx, case_);
}

/**
 * Execute multiple cases in sequence.
 */
export async function executeCases(
  ctx: ExecutionContext,
  cases: RetrievalEvalCase[],
): Promise<AdapterResult[]> {
  const results: AdapterResult[] = [];

  for (const case_ of cases) {
    const result = await executeCase(ctx, case_);
    results.push(result);
  }

  return results;
}

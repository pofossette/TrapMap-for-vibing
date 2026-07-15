/**
 * Endpoint execution adapters for retrieval evaluation.
 *
 * Phase 26-01: REVAL-01
 * Provides execution boundary between the runner and the actual endpoints.
 * Executes through explicit adapters that record execution path and fallback usage.
 */

import type { FastifyInstance } from 'fastify';

import type {
  RetrievalQuery,
  RetrievalV2Query,
  SkillArtifact,
  SkillLookupQuery,
} from '@trapmap/contracts';
import type { RetrievalEvalCase, RetrievalEvalScenario } from '@trapmap/contracts/evals';
import { buildPostgresComposedServer } from '../../../scripts/testing/postgres-server-composition.js';
import type { ArtifactWritePort } from '../../../packages/service-knowledge-write/src/artifact-ports.js';
import { resetRetrievalReadModelCacheForTests } from '../../../packages/server/src/lib/cache/retrieval-read-model-cache.js';
import type { GraphIndexDocumentRecord } from '../../../packages/server/src/lib/indexing/graph-lite/documents.js';
import { createKnowledgeEntryRecord } from '../../../packages/server/src/lib/knowledge.js';
import { hashSecret, nowIso } from '../../../packages/server/src/lib/store.js';
import type {
  DerivedSkillCapsuleRecord,
  KnowledgeRecord,
  SkillArtifactRecord,
  SkillShareerStore,
} from '../../../packages/server/src/lib/store.js';
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

// =============================================================================
// Execution Context
// =============================================================================

/**
 * Context for executing an eval case.
 */
export interface ExecutionContext {
  /** Fastify app instance */
  app: FastifyInstance;
  /** Store instance for fixture seeding */
  store: SkillShareerStore;
  /** Session token for authentication */
  sessionToken: string;
  /** Actor ID for the session */
  actorId: string;
  artifactWriter: ArtifactWritePort;
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
  const composed = buildPostgresComposedServer(databaseUrl);
  const app = composed.app;
  await app.ready();

  const store = composed.store;
  const identity = app.skillShareer.identity;

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
    store,
    sessionToken,
    actorId,
    artifactWriter: composed.artifactWriter,
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
    tokenHash: hashSecret(token),
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
  if (ctx.app.skillShareer.graphQueryBackend.isEnabled()) {
    try {
      await ctx.app.skillShareer.graphQueryBackend.rebuildProjection([]);
    } catch {
      // Ignore projection cleanup errors during teardown.
    }
  }

  const pool = ctx.store.getPool();
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

  const fixtureEntries = scenario.fixtures.knowledgeEntries as Array<{
    id: string;
    teamId: string | null;
    scope: 'global' | 'project';
    labels: string[];
    shortcut: string;
    detail: string;
    requiredLevel: number;
    lifecycleState: string;
  }>;

  const fixtureArtifacts = scenario.fixtures.skillArtifacts as Array<{
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
  }>;
  const fixtureGraphDocs = (scenario.fixtures.graphIndexDocuments ??
    []) as GraphIndexDocumentRecord[];

  const createdAt = nowIso();
  const repos = ctx.app.skillShareer.repos;

  if (repos) {
    // PostgreSQL mode: use repository layer
    for (const entry of fixtureEntries) {
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

      const record = createKnowledgeEntryRecord({
        ownerUserId: ctx.actorId,
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
      record.lifecycleState = mapLifecycleState(entry.lifecycleState);
      await repos.knowledge.insert(record);
    }

    for (const artifact of fixtureArtifacts) {
      const capsules: DerivedSkillCapsuleRecord[] = artifact.capsules.map((c) => ({
        capsuleId: c.capsuleId,
        artifactId: artifact.id,
        revision: 1,
        sourcePaths: ['mock-source.md'],
        content: c.content,
        situation: c.situation,
        problem: c.problem,
        goal: c.goal,
        errorText: '',
        labels: c.labels,
        scope: c.scope,
        requiredLevel: c.requiredLevel,
      }));

      const record = {
        id: artifact.id,
        teamId: artifact.teamId,
        scope: artifact.scope,
        labels: artifact.labels,
        title: artifact.title,
        slug: artifact.slug,
        requiredLevel: artifact.requiredLevel,
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
            derived: {
              profile: {
                artifactId: artifact.id,
                revision: 1,
                sourceHash: '',
                title: artifact.title,
                summary: artifact.capsules.map((c: { content: string }) => c.content).join('. '),
                keywords: artifact.labels,
                referencePaths: [],
                contentHash: '',
              },
              capsules,
              clientManifest: null,
              sourceHash: '',
              derivedAt: createdAt,
            },
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
      await repos.graphIndex.upsert(graphDoc);
    }
  } else {
    await ctx.store.transact(async (data) => {
      for (const entry of fixtureEntries) {
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

        const record = createKnowledgeEntryRecord({
          ownerUserId: ctx.actorId,
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

        record.lifecycleState = entry.lifecycleState as KnowledgeRecord['lifecycleState'];

        data.knowledgeEntries.push(record);
      }

      for (const artifact of fixtureArtifacts) {
        const capsules: DerivedSkillCapsuleRecord[] = artifact.capsules.map((c) => ({
          capsuleId: c.capsuleId,
          artifactId: artifact.id,
          revision: 1,
          sourcePaths: ['mock-source.md'],
          content: c.content,
          situation: c.situation,
          problem: c.problem,
          goal: c.goal,
          errorText: '',
          labels: c.labels,
          scope: c.scope,
          requiredLevel: c.requiredLevel,
        }));

        const record: SkillArtifactRecord = {
          id: artifact.id,
          teamId: artifact.teamId,
          scope: artifact.scope,
          labels: artifact.labels,
          title: artifact.title,
          slug: artifact.slug,
          requiredLevel: artifact.requiredLevel,
          lifecycleState: artifact.lifecycleState as SkillArtifactRecord['lifecycleState'],
          ownerUserId: ctx.actorId,
          latestRevision: {
            revision: 1,
            sourceHash: '',
            files: [],
            submittedAt: createdAt,
            submittedByUserId: ctx.actorId,
            scriptDescriptors: [],
            derived: {
              profile: {
                artifactId: artifact.id,
                revision: 1,
                sourceHash: '',
                title: artifact.title,
                summary: artifact.capsules.map((c: { content: string }) => c.content).join('. '),
                keywords: artifact.labels,
                referencePaths: [],
                contentHash: '',
              },
              capsules,
              clientManifest: null,
              sourceHash: '',
              derivedAt: createdAt,
            },
          },
          history: [],
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
          boundary: null,
          decayMeta: null,
          evidenceMeta: null,
          maintenanceMeta: null,
          createdAt,
          updatedAt: createdAt,
        };

        data.skillArtifacts.push(record);
      }

      for (const graphDoc of fixtureGraphDocs) {
        data.graphIndexDocuments.push(graphDoc);
      }
    });
  }

  // Keep the active graph backend aligned with the scenario fixture set. In
  // Neo4j-primary mode the PG truth source alone is insufficient, because
  // graph queries read from the projected backend during eval execution.
  await ctx.app.skillShareer.graphQueryBackend.rebuildProjection(fixtureGraphDocs);

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
  const identity = ctx.app.skillShareer.identity;
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

  await identity.sessionRepo.deleteByTokenHash(hashSecret(ctx.sessionToken));
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

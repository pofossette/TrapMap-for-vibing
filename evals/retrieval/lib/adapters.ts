/**
 * Endpoint execution adapters for retrieval evaluation.
 *
 * Phase 26-01: REVAL-01
 * Provides execution boundary between the runner and the actual endpoints.
 * Executes through explicit adapters that record execution path and fallback usage.
 */

import type { FastifyInstance } from 'fastify';

import type { RetrievalQuery, RetrievalV2Query } from '@trapmap/contracts';
import type { RetrievalEvalCase } from '@trapmap/contracts/evals';
import { buildServer } from '../../../packages/server/src/app.js';
import type { GraphIndexDocumentRecord } from '../../../packages/server/src/lib/indexing/graph-lite/documents.js';
import { createKnowledgeEntryRecord } from '../../../packages/server/src/lib/knowledge.js';
import { hashSecret, nowIso } from '../../../packages/server/src/lib/store.js';
import type {
  DerivedSkillCapsuleRecord,
  JsonStore,
  KnowledgeRecord,
  SkillArtifactRecord,
} from '../../../packages/server/src/lib/store.js';
import { loadScenario } from './load.js';
import { normalizeResponse } from './normalize.js';
import type { AdapterType, AdapterWarning, ExecutionMetadata, NormalizedResult } from './types.js';

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
  store: JsonStore;
  /** Session token for authentication */
  sessionToken: string;
  /** Actor ID for the session */
  actorId: string;
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
 * @param config - Configuration options
 * @returns Execution context with app, store, and session token
 */
export async function createExecutionContext(options?: {
  dataFile?: string;
}): Promise<ExecutionContext> {
  const dataFile =
    options?.dataFile ??
    `/tmp/trapmap-eval-${Date.now()}-${Math.random().toString(36).slice(2)}.json`;

  const app = buildServer({ config: { dataFile } });
  await app.ready();

  const store = app.skillShareer.store;

  // Create a system admin user and session for the eval runner
  const actorId = 'user_eval_runner';

  await store.transact(async (data) => {
    if (!data.counters) data.counters = {};
    data.counters.user = 1;

    // Create the eval runner user
    data.users.push({
      id: actorId,
      handle: 'eval-runner',
      notes: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
  });

  const sessionToken = await createSession(store, actorId, null, 'system-admin');

  return { app, store, sessionToken, actorId };
}

/**
 * Create a session for an actor.
 */
async function createSession(
  store: JsonStore,
  userId: string,
  activeTeamId: string | null,
  subjectType: 'user' | 'system-admin',
): Promise<string> {
  const token = `session_eval_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  await store.transact(async (data) => {
    data.sessions.push({
      id: `session_${Date.now()}`,
      userId,
      tokenHash: hashSecret(token),
      activeTeamId,
      subjectType,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour
    });
  });

  return token;
}

/**
 * Close an execution context.
 */
export async function closeExecutionContext(ctx: ExecutionContext): Promise<void> {
  await ctx.app.close();
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
  case_: RetrievalEvalCase,
  explicitScenario?: RetrievalEvalScenario,
): Promise<void> {
  const scenario = explicitScenario ?? loadScenario(case_.scenarioId);
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

  await ctx.store.transact(async (data) => {
    // Seed knowledge entries
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

      // Override with exact fixture ID and lifecycle state (entry.id already set above)
      record.lifecycleState = entry.lifecycleState as KnowledgeRecord['lifecycleState'];

      data.knowledgeEntries.push(record);
    }

    // Seed skill artifacts
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
        createdAt,
        updatedAt: createdAt,
      };

      data.skillArtifacts.push(record);
    }

    for (const graphDoc of fixtureGraphDocs) {
      data.graphIndexDocuments.push(graphDoc);
    }
  });

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
  // Create a team if needed
  if (actor.activeTeamId) {
    await ctx.store.transact(async (data) => {
      const teamExists = data.teams.some((t) => t.id === actor.activeTeamId);
      if (!teamExists) {
        data.teams.push({
          id: actor.activeTeamId,
          name: `Team ${actor.activeTeamId}`,
          slug: `team-${actor.activeTeamId}`,
          description: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      }
    });
  }

  // Create membership with permissions
  await ctx.store.transact(async (data) => {
    const membershipId = `membership_${ctx.actorId}_${actor.activeTeamId ?? 'global'}`;
    const membershipExists = data.memberships.some((m) => m.id === membershipId);

    if (!membershipExists) {
      data.memberships.push({
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
  });

  // Update session with active team
  await ctx.store.transact(async (data) => {
    const session = data.sessions.find((s) => s.userId === ctx.actorId);
    if (session) {
      session.activeTeamId = actor.activeTeamId;
      session.subjectType = actor.subjectType;
    }
  });

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
    const response = await ctx.app.inject({
      method: 'POST',
      url: case_.endpoint,
      headers: {
        authorization: `Bearer ${ctx.sessionToken}`,
      },
      payload: case_.request,
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

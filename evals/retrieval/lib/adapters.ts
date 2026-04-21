/**
 * Endpoint execution adapters for retrieval evaluation.
 *
 * Phase 26-01: REVAL-01
 * Provides execution boundary between the runner and the actual endpoints.
 * Executes through explicit adapters that record execution path and fallback usage.
 */

import type { FastifyInstance } from 'fastify';

import type {
  RetrievalEvalCase,
  RetrievalQuery,
  RetrievalV2Query,
} from '../../../packages/contracts/src/index.js';
import { buildServer } from '../../../packages/server/src/app.js';
import { hashSecret, nowIso } from '../../../packages/server/src/lib/store.js';
import type { JsonStore } from '../../../packages/server/src/lib/store.js';
import type { NormalizedResult, AdapterType, ExecutionMetadata, AdapterWarning } from './types.js';
import { normalizeResponse } from './normalize.js';

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
  const dataFile = options?.dataFile ?? `/tmp/trapmap-eval-${Date.now()}-${Math.random().toString(36).slice(2)}.json`;

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
 * This is a simplified implementation that creates the necessary data structures.
 */
export async function seedScenarioFixtures(
  ctx: ExecutionContext,
  case_: RetrievalEvalCase,
): Promise<void> {
  // For Phase 26-01, we use a simplified fixture seeding approach.
  // The actual scenario fixtures would be materialized in a full implementation.
  // For now, we rely on the in-process server with its default test configuration.

  // The scenario is referenced by case.scenarioId, but fixture materialization
  // would require loading the scenario and populating the store.
  // This is a placeholder for the full implementation.
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

  let adapterType: AdapterType = 'route';
  let fallbackUsed = false;
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

    return {
      result,
      execution: {
        adapterType,
        fallbackUsed,
        fallbackReason,
        endpoint: case_.endpoint,
        durationMs,
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

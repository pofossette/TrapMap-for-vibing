/**
 * Endpoint execution adapters for retrieval evaluation.
 *
 * Phase 26-01: REVAL-01
 * Provides execution boundary between the runner and the actual endpoints.
 * Executes through explicit adapters that record execution path and fallback usage.
 */

import type { FastifyInstance } from 'fastify';

import type { RetrievalQuery, RetrievalV2Query } from '@trapmap/contracts';
import type { RetrievalEvalCase, RetrievalEvalScenario } from '@trapmap/contracts/evals';
import { buildServer } from '../../../packages/server/src/app.js';
import type { GraphIndexDocumentRecord } from '../../../packages/server/src/lib/indexing/graph-lite/documents.js';
import { createKnowledgeEntryRecord } from '../../../packages/server/src/lib/knowledge.js';
import type { SkillShareerRepos } from '../../../packages/server/src/lib/repos/index.js';
import { hashSecret, nowIso } from '../../../packages/server/src/lib/store.js';
import type {
  DerivedSkillCapsuleRecord,
  KnowledgeRecord,
  SkillArtifactRecord,
  SkillShareerStore,
} from '../../../packages/server/src/lib/store.js';
import { loadScenario } from './load.js';
import { normalizeResponse } from './normalize.js';
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
 * Uses repository layer when PostgreSQL is active (repos available),
 * falls back to store.transact() for JSON mode.
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
  const repos = app.skillShareer.repos;

  // Create a system admin user and session for the eval runner
  const actorId = 'user_eval_runner';

  if (repos) {
    // PostgreSQL mode: use repository layer
    const existingUser = await repos.user.getById(actorId);
    if (!existingUser) {
      await repos.user.insert({
        id: actorId,
        handle: 'eval-runner',
        notes: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
    }
  } else {
    // JSON mode: use store.transact()
    await store.transact(async (data) => {
      if (!data.counters) data.counters = {};
      data.counters.user = 1;

      data.users.push({
        id: actorId,
        handle: 'eval-runner',
        notes: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
    });
  }

  const sessionToken = await createSession(store, actorId, null, 'system-admin', repos);

  return { app, store, sessionToken, actorId };
}

/**
 * Create a session for an actor.
 * Uses repository layer when PostgreSQL is active, falls back to store.transact().
 */
async function createSession(
  store: SkillShareerStore,
  userId: string,
  activeTeamId: string | null,
  subjectType: 'user' | 'system-admin',
  repos?: SkillShareerRepos,
): Promise<string> {
  const token = `session_eval_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  if (repos) {
    // PostgreSQL mode: use session repository
    await repos.session.create({
      userId,
      tokenHash: hashSecret(token),
      activeTeamId,
      subjectType,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
  } else {
    // JSON mode: use store.transact()
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
  }

  return token;
}

/**
 * Close an execution context.
 * In PostgreSQL mode, truncates all tables and closes the pool to prevent connection leaks.
 */
export async function closeExecutionContext(ctx: ExecutionContext): Promise<void> {
  const { PostgresStore } = await import(
    '../../../packages/server/src/lib/persistence/postgres-store.js'
  );
  if (ctx.store instanceof PostgresStore) {
    try {
      const pool = ctx.store.getPool();
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
          store_snapshot, task_queue
        CASCADE
      `);
    } catch {
      // Ignore cleanup errors
    }
    await ctx.store.close();
  }
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
  case_: Pick<RetrievalEvalCase, 'scenarioId'>,
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
      } satisfies SkillArtifactRecord;

      await repos.artifact.insert(record);
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
  const repos = ctx.app.skillShareer.repos;

  if (repos) {
    if (actor.activeTeamId) {
      const existing = await repos.team.getById(actor.activeTeamId);
      if (!existing) {
        await repos.team.insert({
          id: actor.activeTeamId,
          name: `Team ${actor.activeTeamId}`,
          slug: `team-${actor.activeTeamId}`,
          description: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      }
    }

    const membershipId = `membership_${ctx.actorId}_${actor.activeTeamId ?? 'global'}`;
    const existingMembership = await repos.membership.getById(membershipId);
    if (!existingMembership) {
      await repos.membership.insert({
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

    if (ctx.sessionToken) {
      await repos.session.deleteByTokenHash(hashSecret(ctx.sessionToken));
    }

    ctx.sessionToken = await createSession(
      ctx.store,
      ctx.actorId,
      actor.activeTeamId,
      actor.subjectType,
      repos,
    );
  } else {
    // JSON mode: use store.transact()
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

    await ctx.store.transact(async (data) => {
      const session = data.sessions.find((s) => s.userId === ctx.actorId);
      if (session) {
        session.activeTeamId = actor.activeTeamId;
        session.subjectType = actor.subjectType;
      }
    });
  }

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

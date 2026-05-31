import { randomUUID } from 'node:crypto';

import type { FastifyPluginAsync } from 'fastify';

import {
  graphPlanSearchQuerySchema,
  graphPlanSearchResponseSchema,
  planQuerySchema,
  retrievalQuerySchema,
  retrievalResponseSchema,
  retrievalV2QuerySchema,
  retrievalV2ResponseWithHintsSchema,
  skillLookupQuerySchema,
  skillLookupResponseSchema,
  trapFirstPlanSchema,
} from '@trapmap/contracts';

import type { UsageEventInput } from '@trapmap/server/lib/analytics/index.js';
import { requirePermission } from '@trapmap/server/lib/rbac.js';
import { searchKnowledge, searchKnowledgeV2 } from '@trapmap/server/lib/retrieval.js';
import { searchSkillsByContent } from '@trapmap/server/lib/retrieval/capsules/skill-lookup.js';
import { searchKnowledgeGraphPlan } from '@trapmap/server/lib/retrieval/graph-plan/graph-plan-search.js';
import { compileTrapFirstPlan } from '@trapmap/server/lib/retrieval/graph-plan/plan-compiler.js';
import { resolveAuthContext } from '@trapmap/server/lib/session.js';
import { nowIso } from '@trapmap/server/lib/store.js';
import { logUserOperation } from '@trapmap/server/lib/user-ops-log.js';

/**
 * Build usage events from v1 retrieval result.
 * Creates one event per returned entry (hit).
 */
function buildUsageEvents(
  auth: { actorId: string; activeTeamId: string | null },
  result: {
    globalConstraints: Array<{ entryId: string }>;
    projectKnowledge: Array<{ entryId: string }>;
  },
  queryId: string,
  queryText?: string,
): UsageEventInput[] {
  const events: UsageEventInput[] = [];

  for (const entry of result.globalConstraints) {
    events.push({
      queryId,
      teamId: auth.activeTeamId,
      accountId: auth.actorId,
      entryType: 'knowledge',
      entryId: entry.entryId,
      ...(queryText !== undefined && { queryText }),
    });
  }

  for (const entry of result.projectKnowledge) {
    events.push({
      queryId,
      teamId: auth.activeTeamId,
      accountId: auth.actorId,
      entryType: 'knowledge',
      entryId: entry.entryId,
      ...(queryText !== undefined && { queryText }),
    });
  }

  return events;
}

export const retrievalRoutes: FastifyPluginAsync = async (app) => {
  // Legacy v1 retrieval path (COMP-03)
  // Preserved for backward compatibility during v1.2 migration
  app.post('/v1/retrieval/search', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);

    // Enforce knowledge:search permission
    requirePermission(auth, 'knowledge:search');

    // Parse and validate query
    const query = retrievalQuerySchema.parse(request.body);

    // Execute retrieval search
    const result = await searchKnowledge(app.skillShareer, auth, query);

    // Log user operation (fire-and-forget)
    void logUserOperation(app.skillShareer.config.userOpsLog, {
      timestamp: nowIso(),
      actorId: auth.actorId,
      actorHandle: auth.handle,
      action: 'search',
      targetId: null,
      teamId: auth.activeTeamId,
      metadata: {
        endpoint: 'v1-retrieval-search',
        resultCount: result.globalConstraints.length + result.projectKnowledge.length,
      },
    });

    // Record usage events (fire-and-forget)
    const { usageAnalytics } = app.skillShareer.repos;
    const queryId = randomUUID();
    void usageAnalytics
      .recordEvents(buildUsageEvents(auth, result, queryId, query.seed))
      .catch(() => {});

    // Validate and return response
    return retrievalResponseSchema.parse(result);
  });

  // v2 capsule-native retrieval path (RETR-01, RETR-04, COMP-03)
  // Accepts seed-only input and returns capsule-first distilled results
  // Phase 15: Returns activation hints from governed clientManifest (T-15-02)
  app.post('/v2/retrieval/search', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);

    // Enforce knowledge:search permission (T-14-10)
    requirePermission(auth, 'knowledge:search');

    // Parse and validate v2 query (seed-only contract)
    const query = retrievalV2QuerySchema.parse(request.body);

    // Execute capsule-native retrieval
    const result = await searchKnowledgeV2(app.skillShareer, auth, query);

    // Log user operation (fire-and-forget)
    void logUserOperation(app.skillShareer.config.userOpsLog, {
      timestamp: nowIso(),
      actorId: auth.actorId,
      actorHandle: auth.handle,
      action: 'search',
      targetId: null,
      teamId: auth.activeTeamId,
      metadata: { endpoint: 'v2-retrieval-search', resultCount: result.capsules.length },
    });

    // Record usage events (fire-and-forget)
    const { usageAnalytics } = app.skillShareer.repos;
    const queryId = randomUUID();
    const events: UsageEventInput[] = result.capsules.map((capsule) => ({
      queryId,
      teamId: auth.activeTeamId,
      accountId: auth.actorId,
      entryType: 'skill' as const,
      entryId: capsule.artifactId,
      queryText: query.seed,
    }));
    void usageAnalytics.recordEvents(events).catch(() => {});

    // Validate and return v2 response with activation hints (T-15-03)
    return retrievalV2ResponseWithHintsSchema.parse(result);
  });

  // Phase 38: Confidence-aware GraphRAG-lite wrapper route
  // Returns a plan when confidence is high, otherwise a governed fallback payload.
  app.post('/v3/retrieval/search', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);

    requirePermission(auth, 'knowledge:search');

    const query = graphPlanSearchQuerySchema.parse(request.body);
    const result = await searchKnowledgeGraphPlan(app.skillShareer, auth, query);

    const resultCount = result.plan
      ? result.plan.recommendedSkills.length
      : result.fallback?.routeFamily === 'capsule'
        ? result.fallback.response.capsules.length
        : (result.fallback?.response.globalConstraints.length ?? 0) +
          (result.fallback?.response.projectKnowledge.length ?? 0);

    void logUserOperation(app.skillShareer.config.userOpsLog, {
      timestamp: nowIso(),
      actorId: auth.actorId,
      actorHandle: auth.handle,
      action: 'search',
      targetId: null,
      teamId: auth.activeTeamId,
      metadata: {
        endpoint: 'v3-retrieval-search',
        routeFamily: result.routingTrace.routeFamily,
        fallbackTarget: result.routingTrace.fallbackTarget,
        confidenceBucket: result.routingTrace.confidenceBucket,
        trapCount: result.plan?.blockingTraps.length ?? 0,
        skillCount: result.plan?.recommendedSkills.length ?? 0,
        resultCount,
      },
    });

    // Record usage events (fire-and-forget)
    if (result.plan) {
      const { usageAnalytics } = app.skillShareer.repos;
      const queryId = randomUUID();
      const events: UsageEventInput[] = [
        // Record trap hits
        ...result.plan.blockingTraps.map((trap) => ({
          queryId,
          teamId: auth.activeTeamId,
          accountId: auth.actorId,
          entryType: 'trap' as const,
          entryId: trap.sourceId,
          queryText: query.seed,
        })),
        // Record skill recommendations
        ...result.plan.recommendedSkills.map((skill) => ({
          queryId,
          teamId: auth.activeTeamId,
          accountId: auth.actorId,
          entryType: 'skill' as const,
          entryId: skill.artifactId,
          queryText: query.seed,
        })),
      ];
      void usageAnalytics.recordEvents(events).catch(() => {});
    }

    return graphPlanSearchResponseSchema.parse(result);
  });

  // Phase 18: Skill lookup by content (SKED-01)
  // Returns artifact-first matches with metadata-only fields
  // Enforces governance: team, security level, approval state (T-18-05)
  app.post('/v1/retrieval/skills/search-by-content', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);

    // Enforce knowledge:search permission (T-18-04)
    requirePermission(auth, 'knowledge:search');

    // Parse and validate lookup query
    const query = skillLookupQuerySchema.parse(request.body);

    // Execute artifact-first lookup
    const result = await searchSkillsByContent(app.skillShareer, auth, query);

    // Log user operation (fire-and-forget)
    void logUserOperation(app.skillShareer.config.userOpsLog, {
      timestamp: nowIso(),
      actorId: auth.actorId,
      actorHandle: auth.handle,
      action: 'search',
      targetId: null,
      teamId: auth.activeTeamId,
      metadata: {
        endpoint: 'v1-retrieval-skills-search-by-content',
        resultCount: result.matches.length,
      },
    });

    // Validate and return artifact-first response
    return skillLookupResponseSchema.parse(result);
  });

  // Phase 37: Trap-first plan compilation (P37-05)
  // Returns minimal typed execution plan instead of flat result list
  app.post('/v3/retrieval/plan', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);

    // Enforce knowledge:search permission
    requirePermission(auth, 'knowledge:search');

    // Parse and validate plan query
    const query = planQuerySchema.parse(request.body);

    // Compile trap-first plan
    const result = await compileTrapFirstPlan(app.skillShareer, auth, query);

    // Log user operation (fire-and-forget)
    void logUserOperation(app.skillShareer.config.userOpsLog, {
      timestamp: nowIso(),
      actorId: auth.actorId,
      actorHandle: auth.handle,
      action: 'plan',
      targetId: null,
      teamId: auth.activeTeamId,
      metadata: {
        endpoint: 'v3-retrieval-plan',
        trapCount: result.blockingTraps.length,
        skillCount: result.recommendedSkills.length,
      },
    });

    // Validate and return plan
    return trapFirstPlanSchema.parse(result);
  });
};

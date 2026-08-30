// fallow-ignore-file complexity -- admin artifact handlers keep filtering + governance + pagination co-located for T6 closeout
// fallow-ignore-file code-duplication -- artifact projection helpers reuse existing ArtifactReadProjection shape
import {
  InvocationError,
  type KnowledgeWritePort,
  type RouteContext,
  type RouteDef,
  createServiceReadinessHandler,
  registerFastifyRoutes,
  routeResponse,
} from '@trapmap/backend-core';
import type { ArtifactReadProjection, KnowledgeOwnerPort } from '@trapmap/contracts';
import {
  type AdminArtifactQuery,
  type ExperienceGeneDerivationTaskPayload,
  adminArtifactQuerySchema,
  experienceGeneDerivationTaskPayloadSchema,
} from '@trapmap/contracts';
import type { SkillArtifact } from '@trapmap/contracts';
import type { FastifyInstance } from 'fastify';
import { type ZodType, z } from 'zod';
import { trustedActor } from './route-helpers.js';

export interface KnowledgeWriteReadinessOptions {
  checkDependency?: () => Promise<{ reachable: boolean; detail?: string }>;
  getOperatorStatus?: () => Promise<Record<string, unknown>>;
  conflictCandidateRead?: Pick<KnowledgeOwnerPort, 'getById' | 'listByFilter'>;
  experienceGeneDerive?: (request: ExperienceGeneDerivationTaskPayload) => Promise<unknown>;
  planExperienceGeneDerivations?: (event: unknown) => Promise<unknown>;
  markExperienceGenesStale?: (event: unknown) => Promise<number>;
}

export type KnowledgeWriteRouteDeps = KnowledgeWritePort &
  Partial<KnowledgeWriteReadinessOptions> & {
    // Admin artifact deps — minimal list/get functions returning typed responses
    artifactReadProjection?: Pick<
      ArtifactReadProjection,
      'getById' | 'listByFilter' | 'listForRetrieval'
    >;
    listArtifacts?: () => Promise<SkillArtifact[]>;
    getArtifact?: (id: string) => Promise<SkillArtifact | null>;
  };

const KNOWLEDGE_WRITE_OWNERSHIP = {
  service: 'knowledge-write',
  boundedContext: 'knowledge-write',
  dataOwner: [
    'knowledge-aggregate',
    'knowledge-lifecycle',
    'trap-aggregate',
    'evidence-record',
    'knowledge-revision',
    'lifecycle-event',
  ],
  projectionOwner: [],
  doesNotOwn: [
    'governance-command-flow',
    'review-queue',
    'feedback-record',
    'candidate-ingestion-workflow',
    'retrieval-read-projection',
  ],
  syncBoundary:
    'knowledge-write owns final aggregate mutation, lifecycle rules, and authoritative write truth. It does not own governance command flow judgment itself.',
  asyncBoundary:
    'Follow-up actions after aggregate mutation (retrieval projection refresh, artifact/skill follow-up, outbox event dispatch) enter outbox/queue/workflow as async follow-up and never return to the synchronous command path.',
  commandSurface: [
    'submit',
    'updateEntry',
    'resubmit',
    'supersede',
    'createTrap',
    'approveReviewDecision',
    'rejectReviewDecision',
    'returnReviewDecision',
    'applyMaintenanceDecision',
    'applyDecayDecision',
    'publishCandidateResult',
    'listTraps',
    'getTrap',
  ],
  acceptsDelegationFrom: ['governance-review', 'candidate-ingestion'],
} as const;

type KnowledgeWriteRpcMethod =
  | 'approveReviewDecision'
  | 'rejectReviewDecision'
  | 'returnReviewDecision'
  | 'applyMaintenanceDecision'
  | 'applyDecayDecision'
  | 'publishCandidateResult';

function reviewDecisionArgs(
  ctx: RouteContext,
): Parameters<KnowledgeWritePort['approveReviewDecision']>[0] {
  const body = ctx.body as {
    actorId?: string;
    entryId: string;
    evidence?: Record<string, unknown>;
    note?: string;
  };
  const trusted = trustedActor(ctx.headers ?? {}, body);
  return {
    entryId: body.entryId,
    ...(body.note !== undefined ? { note: body.note } : {}),
    ...(body.evidence !== undefined ? { evidence: body.evidence } : {}),
    actorId: trusted.actorId,
  };
}

function maintenanceDecisionArgs(
  ctx: RouteContext,
): Parameters<KnowledgeWritePort['applyMaintenanceDecision']>[0] {
  const body = ctx.body as {
    action: string;
    actorId?: string;
    entryId: string;
    evidence?: Record<string, unknown>;
    note?: string;
  };
  const trusted = trustedActor(ctx.headers ?? {}, body);
  return {
    entryId: body.entryId,
    action: body.action,
    ...(body.note !== undefined ? { note: body.note } : {}),
    ...(body.evidence !== undefined ? { evidence: body.evidence } : {}),
    actorId: trusted.actorId,
  };
}

async function invokeKnowledgeWriteRpc(
  module: KnowledgeWritePort,
  method: KnowledgeWriteRpcMethod,
  input: unknown,
) {
  switch (method) {
    case 'approveReviewDecision':
      return module.approveReviewDecision(
        input as Parameters<KnowledgeWritePort['approveReviewDecision']>[0],
      );
    case 'rejectReviewDecision':
      return module.rejectReviewDecision(
        input as Parameters<KnowledgeWritePort['rejectReviewDecision']>[0],
      );
    case 'returnReviewDecision':
      return module.returnReviewDecision(
        input as Parameters<KnowledgeWritePort['returnReviewDecision']>[0],
      );
    case 'applyMaintenanceDecision':
      return module.applyMaintenanceDecision(
        input as Parameters<KnowledgeWritePort['applyMaintenanceDecision']>[0],
      );
    case 'applyDecayDecision':
      return module.applyDecayDecision(
        input as Parameters<KnowledgeWritePort['applyDecayDecision']>[0],
      );
    case 'publishCandidateResult':
      return module.publishCandidateResult(
        input as Parameters<KnowledgeWritePort['publishCandidateResult']>[0],
      );
  }
}

const emptyRecord = z.record(z.string(), z.unknown());
const headersSchema = z.record(z.string(), z.unknown());

const submitSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  headers: headersSchema,
  body: z.object({
    content: z.string(),
    actorId: z.string().optional(),
    title: z.string().optional(),
    labels: z.array(z.string()).optional(),
    teamId: z.string().optional(),
  }),
});

const entryMutationSchema = z.object({
  params: z.object({ entryId: z.string() }),
  query: emptyRecord,
  headers: headersSchema,
  body: z.object({
    updates: z.record(z.string(), z.unknown()),
    actorId: z.string().optional(),
  }),
});

const supersedeSchema = z.object({
  params: z.object({ entryId: z.string() }),
  query: emptyRecord,
  headers: headersSchema,
  body: z.object({
    replacementId: z.string(),
    actorId: z.string().optional(),
  }),
});

const reviewDecisionSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  headers: headersSchema,
  body: z.object({
    entryId: z.string(),
    actorId: z.string().optional(),
    note: z.string().optional(),
    evidence: z.record(z.string(), z.unknown()).optional(),
  }),
});

const maintenanceDecisionSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  headers: headersSchema,
  body: z.object({
    entryId: z.string(),
    actorId: z.string().optional(),
    action: z.string(),
    note: z.string().optional(),
    evidence: z.record(z.string(), z.unknown()).optional(),
  }),
});

const createTrapSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  headers: headersSchema,
  body: z.object({
    content: z.string(),
    teamId: z.string(),
    actorId: z.string().optional(),
    title: z.string().optional(),
  }),
});

const listTrapsSchema = z.object({
  params: emptyRecord,
  query: z.object({ teamId: z.string().optional() }),
  body: z.unknown(),
});

const getTrapSchema = z.object({
  params: z.object({ trapId: z.string() }),
  query: emptyRecord,
  body: z.unknown(),
});

const publishCandidateSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  headers: headersSchema,
  body: z.object({
    candidateId: z.string(),
    actorId: z.string().optional(),
    result: z.record(z.string(), z.unknown()),
  }),
});

const rpcSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  headers: headersSchema,
  body: z.object({
    method: z.enum([
      'approveReviewDecision',
      'rejectReviewDecision',
      'returnReviewDecision',
      'applyMaintenanceDecision',
      'applyDecayDecision',
      'publishCandidateResult',
    ]),
    input: z.record(z.string(), z.unknown()).optional(),
  }),
});

const conflictCandidatesSchema = z.object({
  params: z.object({ entryId: z.string() }),
  query: emptyRecord,
  body: z.unknown(),
});

const experienceGeneDerivationSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  headers: headersSchema,
  body: experienceGeneDerivationTaskPayloadSchema,
});

const experienceGeneStalenessSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  headers: headersSchema,
  body: z.unknown(),
});

const healthSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: z.unknown(),
});

// ---------------------------------------------------------------------------
// Admin artifact schemas — via T2 shared Zod
// ---------------------------------------------------------------------------

const adminArtifactListSchema = z.object({
  params: emptyRecord,
  query: adminArtifactQuerySchema,
  headers: headersSchema,
  body: z.unknown(),
});

const adminArtifactDetailSchema = z.object({
  params: z.object({ id: z.string().min(1).max(128) }),
  query: emptyRecord,
  headers: headersSchema,
  body: z.unknown(),
});

function toConflictCandidate(entry: {
  id: string;
  shortcut: string;
  detail: string;
  lifecycleState: string;
}) {
  return {
    id: entry.id,
    shortcut: entry.shortcut,
    detail: entry.detail,
    lifecycleState: entry.lifecycleState,
  };
}

function knowledgeWriteRouteDef<Ctx extends RouteContext>(def: {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  schema: ZodType<Ctx>;
  successStatus?: number;
  handler(ctx: Ctx, deps: KnowledgeWriteRouteDeps): Promise<unknown>;
}): RouteDef<Ctx, KnowledgeWriteRouteDeps> {
  return def;
}

function readinessHandler(deps: KnowledgeWriteRouteDeps, service: string) {
  return createServiceReadinessHandler({
    service,
    checkDependency: deps.checkDependency,
    checks: {
      persistence: { status: 'ok', detail: null },
    },
    extra: {
      aggregateMutationAuthority: true,
      lifecycleRuleAuthority: true,
      followUpDisposition: 'outbox-queue-workflow-async',
    },
  });
}

// ---------------------------------------------------------------------------
// Admin artifact helpers — reuse existing artifact projection helpers
// ---------------------------------------------------------------------------

type ArtifactAuth = {
  subjectType: 'user' | 'system-admin';
  activeTeamId: string | null;
  securityLevel: number;
};

function getArtifactAuth(headers: Record<string, unknown>): ArtifactAuth {
  const subjectType =
    headers['x-trapmap-subject-type'] === 'system-admin' ? 'system-admin' : 'user';
  const activeTeamId =
    typeof headers['x-trapmap-team-id'] === 'string'
      ? (headers['x-trapmap-team-id'] as string)
      : typeof headers['x-trapmap-active-team-id'] === 'string'
        ? (headers['x-trapmap-active-team-id'] as string)
        : null;
  const rawLevel = headers['x-trapmap-security-level'] ?? headers['x-trapmap-securityLevel'];
  const securityLevel =
    typeof rawLevel === 'string'
      ? Number.parseInt(rawLevel, 10)
      : typeof rawLevel === 'number'
        ? rawLevel
        : 0;
  const clamped = Number.isFinite(securityLevel) ? Math.max(0, Math.min(10, securityLevel)) : 0;
  return { subjectType, activeTeamId, securityLevel: clamped };
}

function isArtifactVisible(artifact: SkillArtifact, auth: ArtifactAuth): boolean {
  if (
    artifact.teamId &&
    auth.subjectType !== 'system-admin' &&
    auth.activeTeamId !== artifact.teamId
  ) {
    return false;
  }
  if (auth.subjectType !== 'system-admin' && auth.securityLevel <= artifact.requiredLevel) {
    return false;
  }
  return true;
}

function parseArtifactCursor(cursor?: string): number {
  if (cursor === undefined) return 0;
  if (!/^[0-9]{1,128}$/.test(cursor)) {
    throw new Error('Invalid artifact cursor');
  }
  return Number.parseInt(cursor, 10);
}

async function fetchAllArtifacts(deps: KnowledgeWriteRouteDeps): Promise<SkillArtifact[]> {
  if (
    deps.artifactReadProjection &&
    typeof deps.artifactReadProjection.listByFilter === 'function'
  ) {
    // Use owner projection — reuse existing helper
    const result = await deps.artifactReadProjection.listByFilter({});
    return result as SkillArtifact[];
  }
  if (typeof deps.listArtifacts === 'function') {
    return deps.listArtifacts();
  }
  const anyDeps = deps as unknown as Record<string, unknown>; // lib type gap: dynamic admin port probe
  if (anyDeps.artifacts && typeof (anyDeps.artifacts as { list?: unknown }).list === 'function') {
    return (anyDeps.artifacts as { list(): Promise<SkillArtifact[]> }).list();
  }
  return [];
}

async function fetchArtifactById(
  deps: KnowledgeWriteRouteDeps,
  id: string,
): Promise<SkillArtifact | null> {
  if (deps.artifactReadProjection && typeof deps.artifactReadProjection.getById === 'function') {
    return deps.artifactReadProjection.getById(id);
  }
  if (typeof deps.getArtifact === 'function') {
    return deps.getArtifact(id);
  }
  const anyDeps = deps as unknown as Record<string, unknown>; // lib type gap: dynamic admin port probe
  if (
    anyDeps.artifacts &&
    typeof (anyDeps.artifacts as { getById?: unknown }).getById === 'function'
  ) {
    return (anyDeps.artifacts as { getById(id: string): Promise<SkillArtifact | null> }).getById(
      id,
    );
  }
  const all = await fetchAllArtifacts(deps);
  return all.find((artifact) => artifact.id === id) ?? null;
}

export function createKnowledgeAdminRouteDefs(
  _deps: KnowledgeWriteRouteDeps,
): RouteDef<RouteContext, KnowledgeWriteRouteDeps>[] {
  return [
    knowledgeWriteRouteDef({
      method: 'GET',
      path: '/api/admin/artifacts',
      schema: adminArtifactListSchema,
      handler: async (ctx, deps) => {
        // Enforce trusted actor — 401 if missing
        trustedActor(ctx.headers ?? {}, {} as Record<string, unknown>);
        const query = ctx.query as unknown as AdminArtifactQuery; // lib type gap: dynamic admin port probe
        const auth = getArtifactAuth(ctx.headers ?? {});
        const all = await fetchAllArtifacts(deps);
        const effectiveLifecycle = query.lifecycleState ?? query.lifecycle;
        const effectiveLevel = query.requiredLevel ?? query.level;
        const search = query.search?.trim().toLowerCase() ?? '';
        const cursor = query.cursor;
        const limit = query.limit;
        const filtered = all.filter((artifact) => {
          if (!isArtifactVisible(artifact, auth)) return false;
          if (effectiveLifecycle && artifact.lifecycleState !== effectiveLifecycle) return false;
          if (query.scope && artifact.scope !== query.scope) return false;
          if (effectiveLevel !== undefined && artifact.requiredLevel !== effectiveLevel)
            return false;
          if (search.length > 0) {
            const hit = [artifact.id, artifact.title, artifact.slug, ...artifact.labels].some(
              (value) => value.toLowerCase().includes(search),
            );
            if (!hit) return false;
          }
          return true;
        });
        const sorted = [...filtered].sort(
          (left, right) =>
            right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id),
        );
        const offset = parseArtifactCursor(cursor);
        const paged = sorted.slice(offset, offset + limit);
        return {
          items: paged,
          filteredTotal: sorted.length,
          total: all.length,
          nextCursor: offset + limit < sorted.length ? String(offset + limit) : null,
        };
      },
    }),

    knowledgeWriteRouteDef({
      method: 'GET',
      path: '/api/admin/artifacts/:id',
      schema: adminArtifactDetailSchema,
      handler: async (ctx, deps) => {
        trustedActor(ctx.headers ?? {}, {} as Record<string, unknown>);
        const auth = getArtifactAuth(ctx.headers ?? {});
        const artifact = await fetchArtifactById(deps, ctx.params.id);
        if (!artifact) {
          throw InvocationError.notFound('Artifact not found');
        }
        if (!isArtifactVisible(artifact, auth)) {
          throw InvocationError.notFound('Artifact not found');
        }
        return artifact;
      },
    }),
  ];
}

export function createKnowledgeWriteRouteDefs(
  deps: KnowledgeWriteRouteDeps,
): RouteDef<RouteContext, KnowledgeWriteRouteDeps>[] {
  return [...createKnowledgeWriteRouteDefsInternal(deps), ...createKnowledgeAdminRouteDefs(deps)];
}

function createKnowledgeWriteRouteDefsInternal(
  _deps: KnowledgeWriteRouteDeps,
): RouteDef<RouteContext, KnowledgeWriteRouteDeps>[] {
  return [
    knowledgeWriteRouteDef({
      method: 'POST',
      path: '/internal/knowledge',
      schema: submitSchema,
      successStatus: 201,
      handler: async (ctx, module) => {
        const trusted = trustedActor(ctx.headers ?? {}, ctx.body);
        return module.submit({
          content: ctx.body.content,
          ...(ctx.body.title !== undefined ? { title: ctx.body.title } : {}),
          ...(ctx.body.labels !== undefined ? { labels: ctx.body.labels } : {}),
          ...(ctx.body.teamId !== undefined ? { teamId: ctx.body.teamId } : {}),
          actorId: trusted.actorId,
        });
      },
    }),

    knowledgeWriteRouteDef({
      method: 'GET',
      path: '/internal/knowledge/:entryId/conflict-candidates',
      schema: conflictCandidatesSchema,
      handler: async (ctx, module) => {
        if (!module.conflictCandidateRead) {
          throw InvocationError.unavailable(
            'knowledge-write conflict candidate read projection unavailable',
          );
        }
        const entry = await module.conflictCandidateRead.getById(ctx.params.entryId);
        if (!entry || entry.lifecycleState !== 'approved') return null;
        const { items: candidates } = await module.conflictCandidateRead.listByFilter({
          lifecycleState: 'approved',
        });
        return {
          entry: toConflictCandidate(entry),
          candidates: candidates
            .filter((candidate) => candidate.lifecycleState === 'approved')
            .map(toConflictCandidate),
        };
      },
    }),

    knowledgeWriteRouteDef({
      method: 'PUT',
      path: '/internal/knowledge/:entryId',
      schema: entryMutationSchema,
      handler: async (ctx, module) => {
        const body = trustedActor(ctx.headers ?? {}, ctx.body);
        await module.updateEntry(ctx.params.entryId, body.updates, body.actorId);
        return { ok: true };
      },
    }),

    knowledgeWriteRouteDef({
      method: 'POST',
      path: '/internal/knowledge/:entryId/resubmit',
      schema: entryMutationSchema,
      handler: async (ctx, module) => {
        const body = trustedActor(ctx.headers ?? {}, ctx.body);
        await module.resubmit(ctx.params.entryId, body.updates, body.actorId);
        return { ok: true };
      },
    }),

    knowledgeWriteRouteDef({
      method: 'POST',
      path: '/internal/knowledge/:entryId/supersede',
      schema: supersedeSchema,
      handler: async (ctx, module) => {
        const body = trustedActor(ctx.headers ?? {}, ctx.body);
        await module.supersede(ctx.params.entryId, body.replacementId, body.actorId);
        return { ok: true };
      },
    }),

    knowledgeWriteRouteDef({
      method: 'POST',
      path: '/internal/traps',
      schema: createTrapSchema,
      successStatus: 201,
      handler: async (ctx, module) => {
        const trusted = trustedActor(ctx.headers ?? {}, ctx.body);
        return module.createTrap({
          content: ctx.body.content,
          teamId: ctx.body.teamId,
          ...(ctx.body.title !== undefined ? { title: ctx.body.title } : {}),
          actorId: trusted.actorId,
        });
      },
    }),

    knowledgeWriteRouteDef({
      method: 'GET',
      path: '/internal/traps',
      schema: listTrapsSchema,
      handler: async (ctx, module) => {
        return module.listTraps(ctx.query.teamId ?? '');
      },
    }),

    knowledgeWriteRouteDef({
      method: 'GET',
      path: '/internal/traps/:trapId',
      schema: getTrapSchema,
      handler: async (ctx, module) => {
        const result = await module.getTrap(ctx.params.trapId);
        if (!result) {
          throw InvocationError.notFound('Trap not found');
        }
        return result;
      },
    }),

    knowledgeWriteRouteDef({
      method: 'POST',
      path: '/internal/knowledge/review/approve',
      schema: reviewDecisionSchema,
      handler: async (ctx, module) => {
        return module.approveReviewDecision(reviewDecisionArgs(ctx));
      },
    }),

    knowledgeWriteRouteDef({
      method: 'POST',
      path: '/internal/knowledge/review/reject',
      schema: reviewDecisionSchema,
      handler: async (ctx, module) => {
        return module.rejectReviewDecision(reviewDecisionArgs(ctx));
      },
    }),

    knowledgeWriteRouteDef({
      method: 'POST',
      path: '/internal/knowledge/review/return-for-correction',
      schema: reviewDecisionSchema,
      handler: async (ctx, module) => {
        return module.returnReviewDecision(reviewDecisionArgs(ctx));
      },
    }),

    knowledgeWriteRouteDef({
      method: 'POST',
      path: '/internal/knowledge/maintenance',
      schema: maintenanceDecisionSchema,
      handler: async (ctx, module) => {
        return module.applyMaintenanceDecision(maintenanceDecisionArgs(ctx));
      },
    }),

    knowledgeWriteRouteDef({
      method: 'POST',
      path: '/internal/knowledge/decay',
      schema: maintenanceDecisionSchema,
      handler: async (ctx, module) => {
        return module.applyDecayDecision(maintenanceDecisionArgs(ctx));
      },
    }),

    knowledgeWriteRouteDef({
      method: 'POST',
      path: '/internal/candidates/publish',
      schema: publishCandidateSchema,
      handler: async (ctx, module) => {
        const body = trustedActor(ctx.headers ?? {}, ctx.body);
        return module.publishCandidateResult(body);
      },
    }),

    knowledgeWriteRouteDef({
      method: 'POST',
      path: '/internal/experience-genes/derive',
      schema: experienceGeneDerivationSchema,
      handler: async (ctx, deps) => {
        if (!deps.experienceGeneDerive) {
          throw InvocationError.unavailable('experience gene derivation is not assembled');
        }
        return deps.experienceGeneDerive(ctx.body);
      },
    }),

    knowledgeWriteRouteDef({
      method: 'POST',
      path: '/internal/experience-genes/derivation-plan',
      schema: z.object({
        params: emptyRecord,
        query: emptyRecord,
        headers: headersSchema,
        body: z.unknown(),
      }),
      handler: async (ctx, deps) => {
        if (!deps.planExperienceGeneDerivations) {
          throw InvocationError.unavailable('experience gene planning is not assembled');
        }
        return { tasks: await deps.planExperienceGeneDerivations(ctx.body) };
      },
    }),

    knowledgeWriteRouteDef({
      method: 'POST',
      path: '/internal/experience-genes/stale',
      schema: experienceGeneStalenessSchema,
      handler: async (ctx, deps) => {
        if (!deps.markExperienceGenesStale) {
          throw InvocationError.unavailable('experience gene staleness handling is not assembled');
        }
        return { marked: await deps.markExperienceGenesStale(ctx.body) };
      },
    }),

    knowledgeWriteRouteDef({
      method: 'POST',
      path: '/internal/rpc/knowledge-write',
      schema: rpcSchema,
      handler: async (ctx, module) => {
        const input = trustedActor(ctx.headers ?? {}, ctx.body.input ?? {});
        const result = await invokeKnowledgeWriteRpc(module, ctx.body.method, input);
        return { ok: true, result };
      },
    }),

    knowledgeWriteRouteDef({
      method: 'GET',
      path: '/internal/health',
      schema: healthSchema,
      handler: async (_ctx, _module) => ({
        status: 'ok',
        service: 'knowledge-write',
        owner: KNOWLEDGE_WRITE_OWNERSHIP.boundedContext,
        acceptsDelegationFrom: KNOWLEDGE_WRITE_OWNERSHIP.acceptsDelegationFrom,
      }),
    }),

    knowledgeWriteRouteDef({
      method: 'GET',
      path: '/internal/live',
      schema: healthSchema,
      handler: async () => ({ status: 'alive', service: 'knowledge-write' }),
    }),

    knowledgeWriteRouteDef({
      method: 'GET',
      path: '/internal/readiness',
      schema: healthSchema,
      handler: async (_ctx, module) => readinessHandler(module, 'knowledge-write')(),
    }),

    knowledgeWriteRouteDef({
      method: 'GET',
      path: '/internal/ready',
      schema: healthSchema,
      handler: async (_ctx, module) => readinessHandler(module, 'knowledge-write')(),
    }),

    knowledgeWriteRouteDef({
      method: 'GET',
      path: '/internal/ownership',
      schema: healthSchema,
      handler: async () => KNOWLEDGE_WRITE_OWNERSHIP,
    }),

    knowledgeWriteRouteDef({
      method: 'GET',
      path: '/internal/operator-status',
      schema: healthSchema,
      handler: async (_ctx, module) => {
        try {
          const details = (await module.getOperatorStatus?.()) ?? {};
          return {
            service: 'knowledge-write',
            owner: KNOWLEDGE_WRITE_OWNERSHIP.boundedContext,
            ...details,
          };
        } catch (error) {
          return routeResponse(503, {
            service: 'knowledge-write',
            owner: KNOWLEDGE_WRITE_OWNERSHIP.boundedContext,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
    }),
  ];
}

/**
 * Fastify-plugin compatibility shim: registers the knowledge-write RouteDefs
 * onto an existing Fastify instance. Consumed by the host-distributed bridge.
 */
export function registerKnowledgeWriteRoutes(
  app: FastifyInstance,
  module: KnowledgeWritePort,
  options?: KnowledgeWriteReadinessOptions,
): void {
  const deps: KnowledgeWriteRouteDeps = { ...module, ...options };
  registerFastifyRoutes(app, createKnowledgeWriteRouteDefs(deps), deps);
}

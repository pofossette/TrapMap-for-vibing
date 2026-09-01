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
import { trustedActor } from '../route-helpers.js';

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

export const KNOWLEDGE_WRITE_OWNERSHIP = {
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

export function reviewDecisionArgs(
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

export function maintenanceDecisionArgs(
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

export async function invokeKnowledgeWriteRpc(
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

export const submitSchema = z.object({
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

export const entryMutationSchema = z.object({
  params: z.object({ entryId: z.string() }),
  query: emptyRecord,
  headers: headersSchema,
  body: z.object({
    updates: z.record(z.string(), z.unknown()),
    actorId: z.string().optional(),
  }),
});

export const supersedeSchema = z.object({
  params: z.object({ entryId: z.string() }),
  query: emptyRecord,
  headers: headersSchema,
  body: z.object({
    replacementId: z.string(),
    actorId: z.string().optional(),
  }),
});

export const reviewDecisionSchema = z.object({
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

export const maintenanceDecisionSchema = z.object({
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

export const createTrapSchema = z.object({
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

export const listTrapsSchema = z.object({
  params: emptyRecord,
  query: z.object({ teamId: z.string().optional() }),
  body: z.unknown(),
});

export const getTrapSchema = z.object({
  params: z.object({ trapId: z.string() }),
  query: emptyRecord,
  body: z.unknown(),
});

export const publishCandidateSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  headers: headersSchema,
  body: z.object({
    candidateId: z.string(),
    actorId: z.string().optional(),
    result: z.record(z.string(), z.unknown()),
  }),
});

export const rpcSchema = z.object({
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

export const conflictCandidatesSchema = z.object({
  params: z.object({ entryId: z.string() }),
  query: emptyRecord,
  body: z.unknown(),
});

export const experienceGeneDerivationSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  headers: headersSchema,
  body: experienceGeneDerivationTaskPayloadSchema,
});

export const experienceGeneStalenessSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  headers: headersSchema,
  body: z.unknown(),
});

export const healthSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: z.unknown(),
});

// ---------------------------------------------------------------------------
// Admin artifact schemas — via T2 shared Zod
// ---------------------------------------------------------------------------

export const adminArtifactListSchema = z.object({
  params: emptyRecord,
  query: adminArtifactQuerySchema,
  headers: headersSchema,
  body: z.unknown(),
});

export const adminArtifactDetailSchema = z.object({
  params: z.object({ id: z.string().min(1).max(128) }),
  query: emptyRecord,
  headers: headersSchema,
  body: z.unknown(),
});

export function toConflictCandidate(entry: {
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

export function knowledgeWriteRouteDef<Ctx extends RouteContext>(def: {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  schema: ZodType<Ctx>;
  successStatus?: number;
  handler(ctx: Ctx, deps: KnowledgeWriteRouteDeps): Promise<unknown>;
}): RouteDef<Ctx, KnowledgeWriteRouteDeps> {
  return def;
}

export function readinessHandler(deps: KnowledgeWriteRouteDeps, service: string) {
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

export function getArtifactAuth(headers: Record<string, unknown>): ArtifactAuth {
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

export function isArtifactVisible(artifact: SkillArtifact, auth: ArtifactAuth): boolean {
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

export function parseArtifactCursor(cursor?: string): number {
  if (cursor === undefined) return 0;
  if (!/^[0-9]{1,128}$/.test(cursor)) {
    throw new Error('Invalid artifact cursor');
  }
  return Number.parseInt(cursor, 10);
}

export async function fetchAllArtifacts(deps: KnowledgeWriteRouteDeps): Promise<SkillArtifact[]> {
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

export async function fetchArtifactById(
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


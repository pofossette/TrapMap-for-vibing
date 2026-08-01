import { type KnowledgeWritePort, toInvocationErrorResponse } from '@trapmap/backend-core';
import type { KnowledgeOwnerPort } from '@trapmap/contracts';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { sendInvocation, sendInvocationError, trustedActor } from './route-helpers.js';

export interface KnowledgeWriteReadinessOptions {
  checkDependency?: () => Promise<{ reachable: boolean; detail?: string }>;
  getOperatorStatus?: () => Promise<Record<string, unknown>>;
  conflictCandidateRead?: Pick<KnowledgeOwnerPort, 'getById' | 'listByFilter'>;
}

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
  | 'applyMaintenanceDecision'
  | 'applyDecayDecision'
  | 'publishCandidateResult';

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

type EntryUpdateBody = { updates: Record<string, unknown>; actorId?: string };
type SupersedeBody = { replacementId: string; actorId?: string };
type ReviewDecisionBody = {
  entryId: string;
  actorId?: string;
  note?: string;
  evidence?: Record<string, unknown>;
};
type MaintenanceDecisionBody = {
  entryId: string;
  actorId?: string;
  action: string;
  note?: string;
  evidence?: Record<string, unknown>;
};

function readEntryUpdateBody(req: FastifyRequest): EntryUpdateBody & { actorId: string } {
  return trustedActor(req, (req.body ?? {}) as EntryUpdateBody);
}

function readSupersedeBody(req: FastifyRequest): SupersedeBody & { actorId: string } {
  return trustedActor(req, (req.body ?? {}) as SupersedeBody);
}

function readReviewDecisionBody(req: FastifyRequest): ReviewDecisionBody & { actorId: string } {
  return trustedActor(req, (req.body ?? {}) as ReviewDecisionBody);
}

function readMaintenanceDecisionBody(
  req: FastifyRequest,
): MaintenanceDecisionBody & { actorId: string } {
  return trustedActor(req, (req.body ?? {}) as MaintenanceDecisionBody);
}

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

function runEntryMutation<T>(
  req: FastifyRequest,
  reply: FastifyReply,
  readBody: (req: FastifyRequest) => T,
  operation: (entryId: string, body: T) => Promise<void>,
) {
  return sendInvocation(reply, 200, async () => {
    const { entryId } = req.params as { entryId: string };
    await operation(entryId, readBody(req));
    return { ok: true };
  });
}

function runReviewDecision(
  req: FastifyRequest,
  reply: FastifyReply,
  operation: (body: ReviewDecisionBody & { actorId: string }) => Promise<unknown>,
) {
  return sendInvocation(reply, 200, () => operation(readReviewDecisionBody(req)));
}

function runMaintenanceDecision(
  req: FastifyRequest,
  reply: FastifyReply,
  operation: (body: MaintenanceDecisionBody & { actorId: string }) => Promise<unknown>,
) {
  return sendInvocation(reply, 200, () => operation(readMaintenanceDecisionBody(req)));
}

export function registerKnowledgeWriteRoutes(
  app: FastifyInstance,
  module: KnowledgeWritePort,
  options?: KnowledgeWriteReadinessOptions,
): void {
  const readinessHandler = async (_req: FastifyRequest, reply: FastifyReply) => {
    let dependencyStatus: { reachable: boolean; detail?: string } = { reachable: true };
    if (options?.checkDependency) {
      try {
        dependencyStatus = await options.checkDependency();
      } catch {
        dependencyStatus = { reachable: false, detail: 'dependency check threw' };
      }
    }
    const ready = dependencyStatus.reachable;
    return reply.status(ready ? 200 : 503).send({
      ready,
      service: 'knowledge-write',
      checks: {
        self: { status: 'ok' },
        persistence: {
          status: dependencyStatus.reachable ? 'ok' : 'degraded',
          detail: dependencyStatus.detail ?? null,
        },
      },
      aggregateMutationAuthority: true,
      lifecycleRuleAuthority: true,
      followUpDisposition: 'outbox-queue-workflow-async',
    });
  };
  app.post('/internal/knowledge', async (req: FastifyRequest, reply: FastifyReply) =>
    sendInvocation(reply, 201, async () => {
      const body = trustedActor(
        req,
        (req.body ?? {}) as {
          content: string;
          actorId?: string;
          title?: string;
          labels?: string[];
          teamId?: string;
        },
      );
      return module.submit(body);
    }),
  );

  app.get(
    '/internal/knowledge/:entryId/conflict-candidates',
    async (req: FastifyRequest, reply: FastifyReply) => {
      if (!options?.conflictCandidateRead) {
        return reply.status(503).send({
          error: 'knowledge-write conflict candidate read projection unavailable',
          kind: 'unavailable',
        });
      }
      return sendInvocation(reply, 200, async () => {
        const { entryId } = req.params as { entryId: string };
        const entry = await options.conflictCandidateRead!.getById(entryId);
        if (!entry || entry.lifecycleState !== 'approved') return null;
        const candidates = await options.conflictCandidateRead!.listByFilter({
          lifecycleState: 'approved',
        });
        return {
          entry: toConflictCandidate(entry),
          candidates: candidates
            .filter((candidate) => candidate.lifecycleState === 'approved')
            .map(toConflictCandidate),
        };
      });
    },
  );

  app.put('/internal/knowledge/:entryId', async (req: FastifyRequest, reply: FastifyReply) =>
    runEntryMutation(req, reply, readEntryUpdateBody, (entryId, body) =>
      module.updateEntry(entryId, body.updates, body.actorId),
    ),
  );

  app.post(
    '/internal/knowledge/:entryId/resubmit',
    async (req: FastifyRequest, reply: FastifyReply) =>
      runEntryMutation(req, reply, readEntryUpdateBody, (entryId, body) =>
        module.resubmit(entryId, body.updates, body.actorId),
      ),
  );

  app.post(
    '/internal/knowledge/:entryId/supersede',
    async (req: FastifyRequest, reply: FastifyReply) =>
      runEntryMutation(req, reply, readSupersedeBody, (entryId, body) =>
        module.supersede(entryId, body.replacementId, body.actorId),
      ),
  );

  app.post('/internal/traps', async (req: FastifyRequest, reply: FastifyReply) =>
    sendInvocation(reply, 201, async () => {
      const body = trustedActor(
        req,
        (req.body ?? {}) as {
          content: string;
          teamId: string;
          actorId?: string;
          title?: string;
        },
      );
      return module.createTrap(body);
    }),
  );

  app.get('/internal/traps', async (req: FastifyRequest, reply: FastifyReply) =>
    sendInvocation(reply, 200, async () => {
      const { teamId } = req.query as { teamId?: string };
      return module.listTraps(teamId ?? '');
    }),
  );

  app.get('/internal/traps/:trapId', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { trapId } = req.params as { trapId: string };
      const result = await module.getTrap(trapId);
      if (!result) {
        return reply.status(404).send({ error: 'Trap not found', kind: 'not-found' });
      }
      return reply.status(200).send(result);
    } catch (err) {
      const { status, body } = toInvocationErrorResponse(err);
      return reply.status(status).send(body);
    }
  });

  app.post('/internal/knowledge/review/approve', async (req: FastifyRequest, reply: FastifyReply) =>
    runReviewDecision(req, reply, (body) => module.approveReviewDecision(body)),
  );

  app.post('/internal/knowledge/review/reject', async (req: FastifyRequest, reply: FastifyReply) =>
    runReviewDecision(req, reply, (body) => module.rejectReviewDecision(body)),
  );

  app.post('/internal/knowledge/maintenance', async (req: FastifyRequest, reply: FastifyReply) =>
    runMaintenanceDecision(req, reply, (body) => module.applyMaintenanceDecision(body)),
  );

  app.post('/internal/knowledge/decay', async (req: FastifyRequest, reply: FastifyReply) =>
    runMaintenanceDecision(req, reply, (body) => module.applyDecayDecision(body)),
  );

  app.post('/internal/candidates/publish', async (req: FastifyRequest, reply: FastifyReply) =>
    sendInvocation(reply, 200, async () => {
      const body = trustedActor(
        req,
        (req.body ?? {}) as {
          candidateId: string;
          actorId?: string;
          result: Record<string, unknown>;
        },
      );
      return module.publishCandidateResult(body);
    }),
  );

  app.post('/internal/rpc/knowledge-write', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = req.body as { method: KnowledgeWriteRpcMethod; input: Record<string, unknown> };
      const input = trustedActor(req, body.input ?? {});
      const result = await invokeKnowledgeWriteRpc(module, body.method, input);
      return reply.status(200).send({ ok: true, result });
    } catch (err) {
      return sendInvocationError(reply, err);
    }
  });

  app.get('/internal/health', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.status(200).send({
      status: 'ok',
      service: 'knowledge-write',
      owner: KNOWLEDGE_WRITE_OWNERSHIP.boundedContext,
      acceptsDelegationFrom: KNOWLEDGE_WRITE_OWNERSHIP.acceptsDelegationFrom,
    });
  });

  app.get('/internal/live', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.status(200).send({ status: 'alive', service: 'knowledge-write' });
  });

  app.get('/internal/readiness', readinessHandler);
  app.get('/internal/ready', readinessHandler);

  app.get('/internal/ownership', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.status(200).send(KNOWLEDGE_WRITE_OWNERSHIP);
  });

  app.get('/internal/operator-status', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const details = (await options?.getOperatorStatus?.()) ?? {};
      return reply.status(200).send({
        service: 'knowledge-write',
        owner: KNOWLEDGE_WRITE_OWNERSHIP.boundedContext,
        ...details,
      });
    } catch (error) {
      return reply.status(503).send({
        service: 'knowledge-write',
        owner: KNOWLEDGE_WRITE_OWNERSHIP.boundedContext,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

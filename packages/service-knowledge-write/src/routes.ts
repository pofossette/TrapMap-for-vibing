import type { KnowledgeWritePort } from '@trapmap/backend-core';
import { InvocationError } from '@trapmap/backend-core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export interface KnowledgeWriteReadinessOptions {
  checkDependency?: () => Promise<{ reachable: boolean; detail?: string }>;
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

function translateInvocationError(error: unknown): {
  status: number;
  body: { error: string; kind: string };
} {
  if (error instanceof InvocationError) {
    const statusMap: Record<string, number> = {
      validation: 400,
      'not-found': 404,
      conflict: 409,
      forbidden: 403,
      timeout: 504,
      unavailable: 503,
      internal: 500,
    };
    return {
      status: statusMap[error.kind] ?? 500,
      body: { error: error.message, kind: error.kind },
    };
  }
  return {
    status: 500,
    body: { error: 'Internal server error', kind: 'internal' },
  };
}

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

export function registerKnowledgeWriteRoutes(
  app: FastifyInstance,
  module: KnowledgeWritePort,
  options?: KnowledgeWriteReadinessOptions,
): void {
  app.post('/internal/knowledge', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = req.body as {
        content: string;
        actorId: string;
        title?: string;
        labels?: string[];
        teamId?: string;
      };
      const result = await module.submit(body);
      return reply.status(201).send(result);
    } catch (err) {
      const { status, body } = translateInvocationError(err);
      return reply.status(status).send(body);
    }
  });

  app.put('/internal/knowledge/:entryId', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { entryId } = req.params as { entryId: string };
      const body = req.body as { updates: Record<string, unknown>; actorId: string };
      await module.updateEntry(entryId, body.updates, body.actorId);
      return reply.status(200).send({ ok: true });
    } catch (err) {
      const { status, body } = translateInvocationError(err);
      return reply.status(status).send(body);
    }
  });

  app.post(
    '/internal/knowledge/:entryId/resubmit',
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const { entryId } = req.params as { entryId: string };
        const body = req.body as { updates: Record<string, unknown>; actorId: string };
        await module.resubmit(entryId, body.updates, body.actorId);
        return reply.status(200).send({ ok: true });
      } catch (err) {
        const { status, body } = translateInvocationError(err);
        return reply.status(status).send(body);
      }
    },
  );

  app.post(
    '/internal/knowledge/:entryId/supersede',
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const { entryId } = req.params as { entryId: string };
        const body = req.body as { replacementId: string; actorId: string };
        await module.supersede(entryId, body.replacementId, body.actorId);
        return reply.status(200).send({ ok: true });
      } catch (err) {
        const { status, body } = translateInvocationError(err);
        return reply.status(status).send(body);
      }
    },
  );

  app.post('/internal/traps', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = req.body as {
        content: string;
        teamId: string;
        actorId: string;
        title?: string;
      };
      const result = await module.createTrap(body);
      return reply.status(201).send(result);
    } catch (err) {
      const { status, body } = translateInvocationError(err);
      return reply.status(status).send(body);
    }
  });

  app.get('/internal/traps', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { teamId } = req.query as { teamId?: string };
      const result = await module.listTraps(teamId ?? '');
      return reply.status(200).send(result);
    } catch (err) {
      const { status, body } = translateInvocationError(err);
      return reply.status(status).send(body);
    }
  });

  app.get('/internal/traps/:trapId', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { trapId } = req.params as { trapId: string };
      const result = await module.getTrap(trapId);
      if (!result) {
        return reply.status(404).send({ error: 'Trap not found', kind: 'not-found' });
      }
      return reply.status(200).send(result);
    } catch (err) {
      const { status, body } = translateInvocationError(err);
      return reply.status(status).send(body);
    }
  });

  app.post(
    '/internal/knowledge/review/approve',
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = req.body as {
          entryId: string;
          actorId: string;
          note?: string;
          evidence?: Record<string, unknown>;
        };
        const result = await module.approveReviewDecision(body);
        return reply.status(200).send(result);
      } catch (err) {
        const { status, body } = translateInvocationError(err);
        return reply.status(status).send(body);
      }
    },
  );

  app.post(
    '/internal/knowledge/review/reject',
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = req.body as {
          entryId: string;
          actorId: string;
          note?: string;
          evidence?: Record<string, unknown>;
        };
        const result = await module.rejectReviewDecision(body);
        return reply.status(200).send(result);
      } catch (err) {
        const { status, body } = translateInvocationError(err);
        return reply.status(status).send(body);
      }
    },
  );

  app.post('/internal/knowledge/maintenance', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = req.body as {
        entryId: string;
        actorId: string;
        action: string;
        note?: string;
        evidence?: Record<string, unknown>;
      };
      const result = await module.applyMaintenanceDecision(body);
      return reply.status(200).send(result);
    } catch (err) {
      const { status, body } = translateInvocationError(err);
      return reply.status(status).send(body);
    }
  });

  app.post('/internal/knowledge/decay', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = req.body as {
        entryId: string;
        actorId: string;
        action: string;
        note?: string;
        evidence?: Record<string, unknown>;
      };
      const result = await module.applyDecayDecision(body);
      return reply.status(200).send(result);
    } catch (err) {
      const { status, body } = translateInvocationError(err);
      return reply.status(status).send(body);
    }
  });

  app.post('/internal/candidates/publish', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = req.body as {
        candidateId: string;
        actorId: string;
        result: Record<string, unknown>;
      };
      const result = await module.publishCandidateResult(body);
      return reply.status(200).send(result);
    } catch (err) {
      const { status, body } = translateInvocationError(err);
      return reply.status(status).send(body);
    }
  });

  app.post('/internal/rpc/knowledge-write', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = req.body as { method: KnowledgeWriteRpcMethod; input: unknown };
      const result = await invokeKnowledgeWriteRpc(module, body.method, body.input);
      return reply.status(200).send({ ok: true, result });
    } catch (err) {
      const { status, body } = translateInvocationError(err);
      return reply.status(status).send(body);
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

  app.get('/internal/readiness', async (_req: FastifyRequest, reply: FastifyReply) => {
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
  });

  app.get('/internal/ownership', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.status(200).send(KNOWLEDGE_WRITE_OWNERSHIP);
  });
}

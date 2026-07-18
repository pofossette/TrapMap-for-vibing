import type { ReviewPort } from '@trapmap/backend-core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export interface GovernanceReviewReadinessOptions {
  checkDependency?: () => Promise<{ reachable: boolean; detail?: string }>;
  getOperatorStatus?: () => Promise<Record<string, unknown>>;
}

function toInvocationErrorResponse(error: unknown): {
  status: number;
  body: { error: string; kind: string };
} {
  const candidate = error as { kind?: unknown; message?: unknown } | undefined;
  const statusByKind: Record<string, number> = {
    validation: 400,
    forbidden: 403,
    'not-found': 404,
    conflict: 409,
    unavailable: 503,
    timeout: 504,
    internal: 500,
  };
  if (
    candidate &&
    typeof candidate.kind === 'string' &&
    typeof candidate.message === 'string' &&
    candidate.kind in statusByKind
  ) {
    return {
      status: statusByKind[candidate.kind] ?? 500,
      body: { error: candidate.message, kind: candidate.kind },
    };
  }
  return { status: 500, body: { error: 'Internal server error', kind: 'internal' } };
}

function sendGovernanceInvocation<T>(
  reply: FastifyReply,
  status: number,
  operation: () => Promise<T>,
): Promise<FastifyReply> {
  return operation()
    .then((result) => reply.status(status).send(result))
    .catch((error: unknown) => {
      const response = toInvocationErrorResponse(error);
      return reply.status(response.status).send(response.body);
    });
}

type ReviewCommandBody = {
  entryId: string;
  actorId: string;
  note?: string;
  evidence?: Record<string, unknown>;
};

type MaintenanceCommandBody = ReviewCommandBody & {
  action: string;
};

function runGovernanceCommand<T>(
  request: FastifyRequest,
  reply: FastifyReply,
  operation: (body: T) => Promise<unknown>,
) {
  return sendGovernanceInvocation(reply, 200, () => operation(request.body as T));
}

const GOVERNANCE_REVIEW_OWNERSHIP = {
  service: 'governance-review',
  boundedContext: 'governance-review',
  dataOwner: [
    'review-queue',
    'feedback-record',
    'remediation-workbench',
    'maintenance-decay-workbench',
    'governance-audit',
  ],
  projectionOwner: [
    'review-queue-projection',
    'feedback-operator-projection',
    'maintenance-decay-operator-projection',
  ],
  doesNotOwn: [
    'knowledge-aggregate-final-mutation',
    'knowledge-lifecycle-authoritative-tables',
    'retrieval-read-projection',
  ],
  syncBoundary:
    'governance-review only owns governance command receipt, eligibility check, flow interpretation, and audit. Final aggregate mutation must be delegated through KnowledgeWritePort.',
  asyncBoundary:
    'Post-approval/rejection/maintenance/decay follow-up actions (projection refresh, artifact follow-up, remediation draft) enter outbox/queue/workflow as async follow-up and never return to the synchronous command path.',
  commandSurface: [
    'approve',
    'reject',
    'applyMaintenance',
    'applyDecay',
    'reviewArtifact',
    'submitFeedback',
  ],
  delegateTo: 'knowledge-write',
} as const;

export function registerGovernanceReviewRoutes(
  app: FastifyInstance,
  module: ReviewPort,
  options?: GovernanceReviewReadinessOptions,
): void {
  const readinessHandler = async (_request: FastifyRequest, reply: FastifyReply) => {
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
      service: 'governance-review',
      checks: {
        self: { status: 'ok' },
        'delegate-to-knowledge-write': {
          status: dependencyStatus.reachable ? 'ok' : 'degraded',
          detail: dependencyStatus.detail ?? null,
        },
      },
      commandSurfaceReceived: true,
      finalAggregateMutation: 'delegated-to-knowledge-write',
      followUpDisposition: 'outbox-queue-workflow-async',
    });
  };
  app.post('/internal/review/approve', (request: FastifyRequest, reply: FastifyReply) =>
    runGovernanceCommand<ReviewCommandBody>(request, reply, (body) => module.approve(body)),
  );

  app.post('/internal/review/reject', (request: FastifyRequest, reply: FastifyReply) =>
    runGovernanceCommand<ReviewCommandBody>(request, reply, (body) => module.reject(body)),
  );

  app.post('/internal/review/maintenance', (request: FastifyRequest, reply: FastifyReply) =>
    runGovernanceCommand<MaintenanceCommandBody>(request, reply, (body) =>
      module.applyMaintenance(body),
    ),
  );

  app.post('/internal/review/decay', (request: FastifyRequest, reply: FastifyReply) =>
    runGovernanceCommand<MaintenanceCommandBody>(request, reply, (body) => module.applyDecay(body)),
  );

  app.post('/internal/review/artifact', (request: FastifyRequest, reply: FastifyReply) =>
    sendGovernanceInvocation(reply, 200, async () => {
      const body = request.body as {
        artifactId: string;
        decision: 'approve' | 'reject';
        actorId: string;
        note?: string;
      };
      await module.reviewArtifact(body.artifactId, body.decision, body.actorId, body.note);
      return { ok: true };
    }),
  );

  app.post('/internal/feedback', async (request: FastifyRequest, reply: FastifyReply) => {
    const requestActorId = request.headers['x-trapmap-actor-id'];
    if (typeof requestActorId !== 'string' || requestActorId.length === 0) {
      return reply.status(401).send({ error: 'Missing authenticated actor', kind: 'auth' });
    }
    const body = request.body as {
      entryId: string;
      problemType: string;
      description: string;
      actorId?: string;
      [key: string]: unknown;
    };
    if (body.actorId !== undefined && body.actorId !== requestActorId) {
      return reply.status(403).send({ error: 'Body actor does not match authenticated actor', kind: 'forbidden' });
    }
    return sendGovernanceInvocation(reply, 201, () =>
      module.submitFeedback({ ...body, actorId: requestActorId }),
    );
  });

  app.get('/internal/health', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.status(200).send({
      status: 'ok',
      service: 'governance-review',
      owner: GOVERNANCE_REVIEW_OWNERSHIP.boundedContext,
      delegateTo: GOVERNANCE_REVIEW_OWNERSHIP.delegateTo,
    });
  });

  app.get('/internal/live', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.status(200).send({ status: 'alive', service: 'governance-review' });
  });

  app.get('/internal/readiness', readinessHandler);
  app.get('/internal/ready', readinessHandler);

  app.get('/internal/ownership', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.status(200).send(GOVERNANCE_REVIEW_OWNERSHIP);
  });

  app.get('/internal/operator-status', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const details = (await options?.getOperatorStatus?.()) ?? {};
      return reply.status(200).send({
        service: 'governance-review',
        owner: GOVERNANCE_REVIEW_OWNERSHIP.boundedContext,
        ...details,
      });
    } catch (error) {
      return reply.status(503).send({
        service: 'governance-review',
        owner: GOVERNANCE_REVIEW_OWNERSHIP.boundedContext,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

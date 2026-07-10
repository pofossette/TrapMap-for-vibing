import type { ReviewPort } from '@trapmap/backend-core';
import { toInvocationErrorResponse } from '@trapmap/backend-core/invocation/invocation-model.js';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export interface GovernanceReviewReadinessOptions {
  checkDependency?: () => Promise<{ reachable: boolean; detail?: string }>;
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
  app.post('/internal/review/approve', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as {
        entryId: string;
        actorId: string;
        note?: string;
        evidence?: Record<string, unknown>;
      };
      const result = await module.approve(body);
      return reply.status(200).send(result);
    } catch (err) {
      const { status, body } = toInvocationErrorResponse(err);
      return reply.status(status).send(body);
    }
  });

  app.post('/internal/review/reject', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as {
        entryId: string;
        actorId: string;
        note?: string;
        evidence?: Record<string, unknown>;
      };
      const result = await module.reject(body);
      return reply.status(200).send(result);
    } catch (err) {
      const { status, body } = toInvocationErrorResponse(err);
      return reply.status(status).send(body);
    }
  });

  app.post('/internal/review/maintenance', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as {
        entryId: string;
        actorId: string;
        action: string;
        note?: string;
        evidence?: Record<string, unknown>;
      };
      const result = await module.applyMaintenance(body);
      return reply.status(200).send(result);
    } catch (err) {
      const { status, body } = toInvocationErrorResponse(err);
      return reply.status(status).send(body);
    }
  });

  app.post('/internal/review/decay', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as {
        entryId: string;
        actorId: string;
        action: string;
        note?: string;
        evidence?: Record<string, unknown>;
      };
      const result = await module.applyDecay(body);
      return reply.status(200).send(result);
    } catch (err) {
      const { status, body } = toInvocationErrorResponse(err);
      return reply.status(status).send(body);
    }
  });

  app.post('/internal/review/artifact', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as {
        artifactId: string;
        decision: 'approve' | 'reject';
        actorId: string;
        note?: string;
      };
      await module.reviewArtifact(body.artifactId, body.decision, body.actorId, body.note);
      return reply.status(200).send({ ok: true });
    } catch (err) {
      const { status, body } = toInvocationErrorResponse(err);
      return reply.status(status).send(body);
    }
  });

  app.post('/internal/feedback', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as {
        entryId: string;
        problemType: string;
        description: string;
        actorId: string;
      };
      const result = await module.submitFeedback(body);
      return reply.status(201).send(result);
    } catch (err) {
      const { status, body } = toInvocationErrorResponse(err);
      return reply.status(status).send(body);
    }
  });

  app.get('/internal/health', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.status(200).send({
      status: 'ok',
      service: 'governance-review',
      owner: GOVERNANCE_REVIEW_OWNERSHIP.boundedContext,
      delegateTo: GOVERNANCE_REVIEW_OWNERSHIP.delegateTo,
    });
  });

  app.get('/internal/readiness', async (_request: FastifyRequest, reply: FastifyReply) => {
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
  });

  app.get('/internal/ownership', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.status(200).send(GOVERNANCE_REVIEW_OWNERSHIP);
  });
}

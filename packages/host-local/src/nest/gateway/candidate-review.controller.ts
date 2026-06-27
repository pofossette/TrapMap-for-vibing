import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ManualResultSubmissionSchema,
  manualResultResponseSchema,
  reviewDecisionRequestSchema,
  reviewQueueResponseSchema,
} from '@trapmap/contracts';
import type { FastifyRequest } from 'fastify';

import { applyResolution, attachManualResult } from '@trapmap/server/lib/candidates/services/resolution-service.js';
import { createLifecyclePublisher } from '@trapmap/server/lib/lifecycle/publisher.js';
import { createReviewApplicationService } from '@trapmap/server/lib/knowledge/review-application-service.js';
import { buildReviewQueueProjection } from '@trapmap/server/lib/operations/read-model.js';
import { nowIso } from '@trapmap/server/lib/store.js';

import { HOST_LOCAL_RUNTIME_TOKEN } from '../runtime/host-runtime.js';
import type { HostLocalRuntime } from '../runtime/host-runtime.js';
import { AuthGuard } from '../runtime/auth.guard.js';
import { ZodBodyValidationPipe } from '../runtime/validation.pipe.js';

@Controller('v1')
@UseGuards(AuthGuard)
export class CandidateReviewController {
  constructor(
    @Inject(HOST_LOCAL_RUNTIME_TOKEN)
    private readonly runtime: HostLocalRuntime,
  ) {}

  @Post('candidates/:candidateId/manual-result')
  @HttpCode(200)
  async submitManualResult(
    @Param('candidateId') candidateId: string,
    @Body(new ZodBodyValidationPipe(ManualResultSubmissionSchema))
    body: typeof ManualResultSubmissionSchema._type,
    @Req() request: FastifyRequest,
  ) {
    const auth = request.authContext!;
    const lifecyclePublisher = createLifecyclePublisher(
      this.runtime.services.asyncTransport
        ? {
            store: this.runtime.services.store,
            eventBus: this.runtime.services.eventBus,
            asyncTransport: this.runtime.services.asyncTransport,
          }
        : {
            store: this.runtime.services.store,
            eventBus: this.runtime.services.eventBus,
          },
    );

    const result = await attachManualResult(
      {
        store: this.runtime.services.store,
        repos: this.runtime.services.repos,
        lifecyclePublisher,
        config: this.runtime.services.config,
      },
      auth,
      candidateId,
      body,
    );

    return manualResultResponseSchema.parse(result);
  }

  @Post('candidates/:candidateId/apply-resolution')
  @HttpCode(200)
  async applyCandidateResolution(
    @Param('candidateId') candidateId: string,
    @Req() request: FastifyRequest,
  ) {
    const auth = request.authContext!;
    const lifecyclePublisher = createLifecyclePublisher(
      this.runtime.services.asyncTransport
        ? {
            store: this.runtime.services.store,
            eventBus: this.runtime.services.eventBus,
            asyncTransport: this.runtime.services.asyncTransport,
          }
        : {
            store: this.runtime.services.store,
            eventBus: this.runtime.services.eventBus,
          },
    );

    return applyResolution(
      {
        store: this.runtime.services.store,
        repos: {
          candidate: this.runtime.services.repos.candidate,
          lineage: this.runtime.services.repos.lineage,
        },
        lifecyclePublisher,
        config: this.runtime.services.config,
      },
      auth,
      candidateId,
    );
  }

  @Get('knowledge/review-queue')
  async getReviewQueue(
    @Query('status') status: string | undefined,
    @Req() request: FastifyRequest,
  ) {
    const auth = request.authContext!;
    const projection = await buildReviewQueueProjection(
      this.runtime.services.repos,
      status !== undefined ? { auth, status } : { auth },
    );

    return reviewQueueResponseSchema.parse({
      items: projection.items,
      nextCursor: null,
      total: projection.total,
    });
  }

  @Post('knowledge/review')
  @HttpCode(200)
  async applyReviewDecision(
    @Body(new ZodBodyValidationPipe(reviewDecisionRequestSchema))
    body: typeof reviewDecisionRequestSchema._type,
    @Req() request: FastifyRequest,
  ) {
    const auth = request.authContext!;
    const lifecyclePublisher = createLifecyclePublisher(
      this.runtime.services.asyncTransport
        ? {
            store: this.runtime.services.store,
            eventBus: this.runtime.services.eventBus,
            asyncTransport: this.runtime.services.asyncTransport,
          }
        : {
            store: this.runtime.services.store,
            eventBus: this.runtime.services.eventBus,
          },
    );
    const reviewService = createReviewApplicationService({
      repos: {
        knowledge: this.runtime.services.repos.knowledge,
        audit: this.runtime.services.repos.audit,
        user: this.runtime.services.repos.user,
        membership: this.runtime.services.repos.membership,
      },
      lifecyclePublisher,
      feedbackRepo: this.runtime.services.repos.feedback,
    });

    const result = await reviewService.applyDecision({
      actorId: auth.actorId,
      authContext: auth,
      entryId: body.entryId,
      decision: body.decision,
      notes: body.notes,
      appliedAt: nowIso(),
      boundary: body.boundary ?? undefined,
      evidence: body.evidence,
    });

    return {
      entry: result.entry,
    };
  }
}

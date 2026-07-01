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
import type { CandidateIngestionPort, ReviewPort } from '@trapmap/backend-core';
import type { FastifyRequest } from 'fastify';
import { buildReviewQueueProjection } from '@trapmap/service-governance-review';

import { CANDIDATE_INGESTION_PORT } from "@trapmap/host-local/nest/candidate-ingestion/candidate-ingestion.tokens.js";
import { GOVERNANCE_REVIEW_PORT } from "@trapmap/host-local/nest/governance-review/governance-review.tokens.js";
import { HOST_LOCAL_RUNTIME_TOKEN } from "@trapmap/host-local/nest/runtime/host-runtime.js";
import type { HostLocalRuntime } from "@trapmap/host-local/nest/runtime/host-runtime.js";
import { AuthGuard } from "@trapmap/host-local/nest/runtime/auth.guard.js";
import { ZodBodyValidationPipe } from "@trapmap/host-local/nest/runtime/validation.pipe.js";

@Controller('v1')
@UseGuards(AuthGuard)
export class CandidateReviewController {
  constructor(
    @Inject(CANDIDATE_INGESTION_PORT)
    private readonly candidateIngestion: CandidateIngestionPort,
    @Inject(GOVERNANCE_REVIEW_PORT)
    private readonly governanceReview: ReviewPort,
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
    await this.candidateIngestion.submitManualResult(candidateId, body, auth.actorId);

    return manualResultResponseSchema.parse({
      candidateId,
      decision: body.decision,
      reviewedAt: new Date().toISOString(),
      reviewedBy: auth.actorId,
      nextState: body.decision === 'independent' ? 'ready_for_review' : 'rejected',
    });
  }

  @Post('candidates/:candidateId/apply-resolution')
  @HttpCode(200)
  async applyCandidateResolution(
    @Param('candidateId') candidateId: string,
    @Req() request: FastifyRequest,
  ) {
    const auth = request.authContext!;
    const candidate = await this.runtime.services.repos.candidate.getById(candidateId);
    if (!candidate?.manualResult) {
      return {
        candidateId,
        status: candidate?.status ?? 'missing',
        outcome: null,
      };
    }

    await this.candidateIngestion.applyResolution(candidateId, candidate.manualResult, auth.actorId);

    const resolvedCandidate = await this.runtime.services.repos.candidate.getById(candidateId);

    return {
      candidateId,
      status: resolvedCandidate?.status ?? 'resolved',
      outcome: candidate.manualResult,
    };
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
    const result =
      body.decision === 'approve'
        ? await this.governanceReview.approve({
            entryId: body.entryId,
            actorId: auth.actorId,
            note: body.notes,
            evidence: body.evidence,
          })
        : await this.governanceReview.reject({
            entryId: body.entryId,
            actorId: auth.actorId,
            note: body.notes,
            evidence: body.evidence,
          });

    const entry = await this.runtime.services.repos.knowledge.getById(result.entryId);

    return {
      entry:
        entry ?? {
          id: result.entryId,
          lifecycleState: result.lifecycleState,
        },
    };
  }
}

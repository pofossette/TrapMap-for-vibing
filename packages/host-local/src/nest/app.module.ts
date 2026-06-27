import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import {
  createStubAuditLog,
  createStubCandidateRepository,
  createStubFeedbackRepository,
  createStubKnowledgeRepository,
  createStubMembershipRepository,
  createStubOutbox,
  createStubPermissionCheck,
  createStubSessionLookup,
  createStubSessionRepository,
  createStubAccessKeyRepository,
  createStubTaskQueue,
  createStubTeamLookup,
  createStubTeamRepository,
  createStubUserRepository,
} from '@trapmap/backend-core/testing';

import { loadServerConfigBridge, SERVER_CONFIG_TOKEN } from './config/config-bridge.js';
import { GatewayModule } from './gateway/gateway.module.js';
import { CandidateIngestionModule } from './candidate-ingestion/candidate-ingestion.module.js';
import { GovernanceReviewModule } from './governance-review/governance-review.module.js';
import { IdentityAccessModule } from './identity-access/identity-access.module.js';
import { JobRuntimeModule } from './job-runtime/job-runtime.module.js';
import { KnowledgeReadModule } from './knowledge-read/knowledge-read.module.js';
import { KnowledgeWriteModule } from './knowledge-write/knowledge-write.module.js';
import { LoggingMiddleware } from './runtime/logging.middleware.js';
import { RequestContextMiddleware } from './runtime/request-context.middleware.js';
import { RequestContextService } from './runtime/request-context.service.js';

/**
 * Root application module for the Nest host.
 *
 * Phase 2 modular-monolith graph:
 * - Every bounded-context Nest module is registered here; the embedded
 *   / local-agent and team-monolith profiles share this exact module
 *   graph. Profile differences happen at capability / provider wiring
 *   / route surface gating, never at the bounded-context module layer.
 * - Default registrations use `backend-core/testing` stub ports so the
 *   app still boots when no host-specific provider wiring has run. A
 *   real deployment replaces individual stub providers through the
 *   `forDeps` / `forTesting` dynamic-module seams on each bounded
 *   context module — the last registration for a token wins.
 *   TODO(Phase 4 cutover): replace stub providers with host-local owned
 *   real wiring via each module's forDeps() seam.
 * - `packages/server` and legacy Fastify host paths stay as the
 *   compatibility shell / rollback surface; they do not appear in this
 *   module graph.
 */

const auditLog = createStubAuditLog();
const knowledgeRepo = createStubKnowledgeRepository();
const candidateRepo = createStubCandidateRepository();
const feedbackRepo = createStubFeedbackRepository();
const sessionRepo = createStubSessionRepository();
const accessKeyRepo = createStubAccessKeyRepository();
const teamRepo = createStubTeamRepository();
const membershipRepo = createStubMembershipRepository();
const userRepo = createStubUserRepository();

const identityAccessStub = IdentityAccessModule.forDeps({
  sessionRepo,
  accessKeyRepo,
  teamRepo,
  membershipRepo,
  userRepo,
  sessionLookup: createStubSessionLookup(),
  teamLookup: createStubTeamLookup(),
  permissionCheck: createStubPermissionCheck(),
  auditLog,
});

const knowledgeReadStub = KnowledgeReadModule.forDeps({
  knowledgeRepo: {
    getById: knowledgeRepo.getById.bind(knowledgeRepo),
    listByFilter: knowledgeRepo.listByFilter.bind(knowledgeRepo),
  },
  retrievalQuery: {
    async search() {
      return { results: [] };
    },
  },
});

const knowledgeWriteStub = KnowledgeWriteModule.forDeps({
  knowledgeRepo,
  auditLog,
});

const governanceReviewStub = GovernanceReviewModule.forDeps({
  knowledgeWrite: {
    approveReviewDecision: async () => ({
      entryId: '',
      lifecycleState: 'approved',
    }),
    rejectReviewDecision: async () => ({
      entryId: '',
      lifecycleState: 'rejected',
    }),
    applyMaintenanceDecision: async () => ({ entryId: '', action: '' }),
    applyDecayDecision: async () => ({ entryId: '', action: '' }),
  },
  feedbackRepo,
  auditLog,
});

const candidateIngestionStub = CandidateIngestionModule.forDeps({
  candidateRepo,
  auditLog,
  knowledgeWrite: {
    publishCandidateResult: async () => ({ candidateId: '' }),
  },
  jobRuntime: {
    schedule: async () => `job_${Date.now()}`,
  },
});

const jobRuntimeStub = JobRuntimeModule.forDeps({
  queuePorts: {
    task: createStubTaskQueue(),
    outbox: createStubOutbox(),
  },
  auditLog,
});

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [loadServerConfigBridge],
    }),
    identityAccessStub,
    knowledgeReadStub,
    knowledgeWriteStub,
    governanceReviewStub,
    candidateIngestionStub,
    jobRuntimeStub,
    GatewayModule,
  ],
  providers: [
    RequestContextService,
    {
      provide: SERVER_CONFIG_TOKEN,
      useFactory: () => loadServerConfigBridge().serverConfig,
    },
  ],
  exports: [RequestContextService, SERVER_CONFIG_TOKEN],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware, LoggingMiddleware).forRoutes('*');
  }
}

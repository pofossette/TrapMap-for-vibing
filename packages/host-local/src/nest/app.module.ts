import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { createJobRuntimeModule } from '@trapmap/backend-core';
import { createKnowledgeReadModule } from '@trapmap/backend-core';
import { createKnowledgeWriteModule } from '@trapmap/backend-core';
import { createCandidateIngestionModule } from '@trapmap/backend-core';
import { createCandidateIngestionDeps } from '@trapmap/service-candidate-ingestion';
import {
  createGovernanceAsyncCommandModule,
  createGovernanceReviewAdminModule,
  createGovernanceReviewDeps,
  createGovernanceReviewServiceModule,
} from '@trapmap/service-governance-review';
import {
  createIdentityAccessDeps,
  createIdentityAccessOwnerBundle,
  createIdentityAccessServiceModule,
} from '@trapmap/service-identity-access';
import { createJobRuntimeDeps } from '@trapmap/service-job-runtime';
import { createKnowledgeReadDeps } from '@trapmap/service-knowledge-read';
import { createKnowledgeWriteDeps } from '@trapmap/service-knowledge-write';

import { CandidateIngestionModule } from './candidate-ingestion/candidate-ingestion.module.js';
import { CandidateProcessingService } from './candidate-ingestion/candidate-processing.service.js';
import { HOST_LOCAL_CONFIG_TOKEN, loadHostLocalConfig } from './config/index.js';
import { GatewayModule } from './gateway/gateway.module.js';
import { GovernanceReviewModule } from './governance-review/governance-review.module.js';
import { HealthModule } from './health/index.js';
import { IdentityAccessModule } from './identity-access/identity-access.module.js';
import { JobRuntimeModule } from './job-runtime/job-runtime.module.js';
import { KnowledgeReadModule } from './knowledge-read/knowledge-read.module.js';
import { KnowledgeWriteModule } from './knowledge-write/knowledge-write.module.js';
import { LifecycleModule } from './lifecycle/index.js';
import {
  HttpMetricsMiddleware,
  LangfuseModule,
  LokiModule,
  OtelModule,
  PrometheusModule,
  SentryModule,
} from './observability/index.js';
import {
  createHostLocalGovernanceConflictWorkflow,
  createHostLocalGovernanceTaskHandlers,
} from './runtime/governance-composition.js';
import { HOST_LOCAL_RUNTIME_TOKEN, createHostLocalRuntime } from './runtime/host-runtime.js';
import { LoggingMiddleware } from './runtime/logging.middleware.js';
import { RequestContextMiddleware } from './runtime/request-context.middleware.js';
import { RequestContextService } from './runtime/request-context.service.js';
import { ConsulModule } from './service-discovery/index.js';

/**
 * Root application module for the Nest host.
 *
 * Phase 2 modular-monolith graph:
 * - Every bounded-context Nest module is registered here; the embedded
 *   / local-agent and team-monolith profiles share this exact module
 *   graph. Profile differences happen at capability / provider wiring
 *   / route surface gating, never at the bounded-context module layer.
 * - Default registrations are host-local owned real wiring backed by the
 *   authoritative server config, store, repos, audit, retrieval, and async
 *   transport seams. No `backend-core/testing` stub ports remain on the
 *   default light mainline.
 * - Legacy Fastify host paths have been removed; they do not appear in this
 *   module graph.
 */
const hostLocalRuntime = await createHostLocalRuntime();
const knowledgeProjection = {
  getById: hostLocalRuntime.services.knowledgeOwner.getById,
  async listMine(input: { userId: string; teamId?: string }) {
    return hostLocalRuntime.services.knowledgeOwner.listByFilter({
      ownerUserId: input.userId,
      ...(input.teamId ? { teamId: input.teamId } : {}),
    }) as never;
  },
  async getStatus() {
    return { status: 'ready', provider: 'knowledge-write-owner' } as never;
  },
};

const identityAccessModule = IdentityAccessModule.forPort(
  createIdentityAccessServiceModule(
    createIdentityAccessDeps(
      createIdentityAccessOwnerBundle({
        ...hostLocalRuntime.identity,
      }),
    ),
  ),
);

const knowledgeReadDeps = createKnowledgeReadDeps({
  knowledgeRepo: knowledgeProjection as never,
  retrievalQuery: hostLocalRuntime.retrievalQuery,
});
const knowledgeReadPort = createKnowledgeReadModule(knowledgeReadDeps);
const knowledgeReadModule = KnowledgeReadModule.forTesting(knowledgeReadPort);

const knowledgeWritePort = createKnowledgeWriteModule(
  createKnowledgeWriteDeps({
    knowledgeOwner: hostLocalRuntime.services.knowledgeOwner,
    auditLog: hostLocalRuntime.auditLog,
  }),
);
const knowledgeWriteModule = KnowledgeWriteModule.forTesting(knowledgeWritePort);

const governanceConflictWorkflow = createHostLocalGovernanceConflictWorkflow({
  knowledgeOwner: hostLocalRuntime.services.knowledgeOwner,
  conflictProjection: hostLocalRuntime.services.governanceReview.conflictProjection,
});

const governanceAsyncCommands = createGovernanceAsyncCommandModule({
  feedbackRepo: hostLocalRuntime.services.governanceReview.feedbackRepo,
  auditLog: hostLocalRuntime.auditLog,
});

const jobRuntimeDeps = createJobRuntimeDeps({
  queuePorts: hostLocalRuntime.queuePorts,
  auditLog: hostLocalRuntime.auditLog,
  taskHandlers: createHostLocalGovernanceTaskHandlers(
    governanceConflictWorkflow,
    governanceAsyncCommands,
  ),
  ownsWork: true,
});
const jobRuntimePort = createJobRuntimeModule(jobRuntimeDeps);

const governanceAdmin = createGovernanceReviewAdminModule({
  feedbackRepo: hostLocalRuntime.services.governanceReview.feedbackRepo,
  knowledgeRead: hostLocalRuntime.services.knowledgeOwner,
  artifactReadProjection: hostLocalRuntime.services.artifactReadProjection,
  knowledgeWrite: knowledgeWritePort,
  jobRuntime: jobRuntimePort,
  auditLog: hostLocalRuntime.auditLog,
});

const governanceReviewPort = createGovernanceReviewServiceModule(
  createGovernanceReviewDeps({
    knowledgeWrite: knowledgeWritePort,
    feedbackRepo: hostLocalRuntime.services.governanceReview.feedbackRepo,
    auditLog: hostLocalRuntime.auditLog,
    asyncCommands: governanceAsyncCommands,
    admin: governanceAdmin,
    conflictWorkflow: governanceConflictWorkflow,
    governanceRetrievalProjection: hostLocalRuntime.services.governanceReview.retrievalProjection,
  }),
);
const governanceReviewModule = GovernanceReviewModule.forTesting(governanceReviewPort);

const jobRuntimeModule = JobRuntimeModule.forDeps(jobRuntimeDeps);

const candidateIngestionPort = createCandidateIngestionModule(
  createCandidateIngestionDeps({
    candidateRepo: hostLocalRuntime.services.candidateIngestion.candidateRepo,
    auditLog: hostLocalRuntime.auditLog,
    knowledgeWrite: knowledgeWritePort,
    jobRuntime: jobRuntimePort,
  }),
);
const candidateIngestionModule = CandidateIngestionModule.forTesting(candidateIngestionPort);

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [() => ({ hostLocalConfig: loadHostLocalConfig() })],
    }),
    identityAccessModule,
    knowledgeReadModule,
    knowledgeWriteModule,
    governanceReviewModule,
    candidateIngestionModule,
    jobRuntimeModule,
    GatewayModule.forRuntime(hostLocalRuntime, {
      knowledgeRead: knowledgeReadPort,
      candidateIngestion: candidateIngestionPort,
      governanceReview: governanceReviewPort,
    }),
    ConsulModule,
    OtelModule,
    PrometheusModule,
    LokiModule,
    SentryModule,
    LangfuseModule,
    LifecycleModule,
    HealthModule,
  ],
  providers: [
    RequestContextService,
    CandidateProcessingService,
    {
      provide: HOST_LOCAL_RUNTIME_TOKEN,
      useValue: hostLocalRuntime,
    },
    {
      provide: HOST_LOCAL_CONFIG_TOKEN,
      useFactory: () => loadHostLocalConfig(),
    },
  ],
  exports: [RequestContextService, HOST_LOCAL_CONFIG_TOKEN],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RequestContextMiddleware, HttpMetricsMiddleware, LoggingMiddleware)
      .forRoutes('*');
  }
}

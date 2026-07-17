import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { createCandidateIngestionDeps } from '@trapmap/service-candidate-ingestion';
import { createGovernanceReviewDeps } from '@trapmap/service-governance-review';
import { createJobRuntimeDeps } from '@trapmap/service-job-runtime';
import {
  createIdentityAccessDeps,
  createIdentityAccessOwnerBundle,
  createIdentityAccessServiceModule,
} from '@trapmap/service-identity-access';
import { createKnowledgeWriteDeps } from '@trapmap/service-knowledge-write';
import { createJobRuntimeModule, createKnowledgeWriteModule } from '@trapmap/backend-core';

import { HOST_LOCAL_CONFIG_TOKEN, loadHostLocalConfig } from './config/index.js';
import { GatewayModule, GatewayRuntimeModule } from './gateway/gateway.module.js';
import { CandidateIngestionModule } from './candidate-ingestion/candidate-ingestion.module.js';
import { CandidateProcessingService } from './candidate-ingestion/candidate-processing.service.js';
import { GovernanceReviewModule } from './governance-review/governance-review.module.js';
import { IdentityAccessModule } from './identity-access/identity-access.module.js';
import { JobRuntimeModule } from './job-runtime/job-runtime.module.js';
import { KnowledgeReadModule } from './knowledge-read/knowledge-read.module.js';
import { KnowledgeWriteModule } from './knowledge-write/knowledge-write.module.js';
import { LoggingMiddleware } from './runtime/logging.middleware.js';
import { ConsulModule } from './service-discovery/index.js';
import { OtelModule, PrometheusModule, LokiModule } from './observability/index.js';
import { HealthModule } from './health/index.js';
import { LifecycleModule } from './lifecycle/index.js';
import { createHostLocalRuntime, HOST_LOCAL_RUNTIME_TOKEN } from './runtime/host-runtime.js';
import {
  createFeedbackRepoPort,
} from './runtime/backend-core-adapters.js';
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
    createIdentityAccessDeps(createIdentityAccessOwnerBundle({
    ...hostLocalRuntime.identity,
    })),
  ),
);

const knowledgeReadModule = KnowledgeReadModule.forDeps(
  {
    knowledgeRepo: knowledgeProjection as never,
    retrievalQuery: hostLocalRuntime.retrievalQuery,
  },
);

const knowledgeWritePort = createKnowledgeWriteModule(
  createKnowledgeWriteDeps({
    knowledgeOwner: hostLocalRuntime.services.knowledgeOwner,
    auditLog: hostLocalRuntime.auditLog,
  }),
);
const knowledgeWriteModule = KnowledgeWriteModule.forTesting(knowledgeWritePort);

const governanceReviewModule = GovernanceReviewModule.forDeps(
  createGovernanceReviewDeps({
    knowledgeWrite: knowledgeWritePort,
    feedbackRepo: createFeedbackRepoPort(hostLocalRuntime.services.repos.feedback),
    auditLog: hostLocalRuntime.auditLog,
  }),
);

const jobRuntimePort = createJobRuntimeModule(
  createJobRuntimeDeps({
    queuePorts: hostLocalRuntime.queuePorts,
    auditLog: hostLocalRuntime.auditLog,
  }),
);
const jobRuntimeModule = JobRuntimeModule.forTesting(jobRuntimePort);

const candidateIngestionModule = CandidateIngestionModule.forDeps(
  createCandidateIngestionDeps({
    candidateRepo: hostLocalRuntime.services.candidateIngestion.candidateRepo,
    auditLog: hostLocalRuntime.auditLog,
    knowledgeWrite: knowledgeWritePort,
    jobRuntime: jobRuntimePort,
  }),
);

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
    GatewayRuntimeModule.forRuntime(hostLocalRuntime),
    GatewayModule,
    ConsulModule,
    OtelModule,
    PrometheusModule,
    LokiModule,
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
    consumer.apply(RequestContextMiddleware, LoggingMiddleware).forRoutes('*');
  }
}

import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { createCandidateIngestionDeps } from '@trapmap/service-candidate-ingestion';
import { createGovernanceReviewDeps } from '@trapmap/service-governance-review';
import { createJobRuntimeDeps } from '@trapmap/service-job-runtime';
import { createKnowledgeWriteDeps } from '@trapmap/service-knowledge-write';
import { createJobRuntimeModule, createKnowledgeWriteModule } from '@trapmap/backend-core';

import { HOST_LOCAL_CONFIG_TOKEN, loadHostLocalConfig } from './config/index.js';
import { GatewayModule, GatewayRuntimeModule } from './gateway/gateway.module.js';
import { CandidateIngestionModule } from './candidate-ingestion/candidate-ingestion.module.js';
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
  createIdentityAccessRepos,
  createKnowledgeRepoPort,
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
const identityAccessRepos = createIdentityAccessRepos(hostLocalRuntime.services.repos);
const knowledgeRepoPort = createKnowledgeRepoPort(hostLocalRuntime.services.repos.knowledge);

const identityAccessModule = IdentityAccessModule.forDeps(
  {
    sessionRepo: identityAccessRepos.sessionRepo,
    accessKeyRepo: identityAccessRepos.accessKeyRepo,
    teamRepo: identityAccessRepos.teamRepo,
    membershipRepo: identityAccessRepos.membershipRepo,
    userRepo: identityAccessRepos.userRepo,
    sessionLookup: hostLocalRuntime.sessionLookup,
    teamLookup: hostLocalRuntime.teamLookup,
    permissionCheck: hostLocalRuntime.permissionCheck,
    auditLog: hostLocalRuntime.auditLog,
  },
);

const knowledgeReadModule = KnowledgeReadModule.forDeps(
  {
    knowledgeRepo: knowledgeRepoPort,
    retrievalQuery: hostLocalRuntime.retrievalQuery,
  },
);

const knowledgeWritePort = createKnowledgeWriteModule(
  createKnowledgeWriteDeps({
    knowledgeRepo: knowledgeRepoPort,
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
    candidateRepo: hostLocalRuntime.services.repos.candidate,
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

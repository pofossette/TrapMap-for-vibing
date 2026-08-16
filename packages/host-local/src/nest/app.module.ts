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
import { createCronServiceModule } from '@trapmap/service-cron';

import { CandidateIngestionModule } from './candidate-ingestion/candidate-ingestion.module.js';
import { CandidateProcessingService } from './candidate-ingestion/candidate-processing.service.js';
import { HOST_LOCAL_CONFIG_TOKEN, loadHostLocalConfig } from './config/index.js';
import { CronModule } from './cron/cron.module.js';
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
import { HOST_LOCAL_RUNTIME_TOKEN, type HostLocalRuntime } from './runtime/host-runtime.js';
import { buildKnowledgeProjection } from './runtime/knowledge-projection.js';
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
 *
 * Phase 2 (assembly pilot): runtime construction has moved out of module
 * scope into {@link AppModule.forRuntime}. The Nest bootstrap either calls
 * `AppModule.forRuntime(runtime)` directly (legacy direct path, used by
 * tests) or builds the runtime through the assembly profile and lets the
 * nest-transport node construct the same module surface.
 */

/**
 * Root module builder.
 *
 * Kept as a Nest module class so Nest dynamic-module composition
 * (`AppModule.forRuntime(runtime)`) yields the exact same surface as the
 * pre-Phase-2 top-level-await wiring. All six bounded-context modules plus
 * the gateway, observability, lifecycle and health imports are produced
 * here from a pre-built {@link HostLocalRuntime}.
 */
@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: NestJS dynamic-module pattern (static factory is the idiomatic composition API)
export class AppModule implements NestModule {
  static forRuntime(runtime: HostLocalRuntime) {
    const knowledgeProjection = buildKnowledgeProjection(runtime);

    const identityAccessModule = IdentityAccessModule.forPort(
      createIdentityAccessServiceModule(
        createIdentityAccessDeps(
          createIdentityAccessOwnerBundle({
            ...runtime.identity,
          }),
        ),
      ),
    );

    const knowledgeReadDeps = createKnowledgeReadDeps({
      knowledgeRepo: knowledgeProjection,
      retrievalQuery: runtime.retrievalQuery,
    });
    const knowledgeReadPort = createKnowledgeReadModule(knowledgeReadDeps);
    const knowledgeReadModule = KnowledgeReadModule.forTesting(knowledgeReadPort);

    const knowledgeWritePort = createKnowledgeWriteModule(
      createKnowledgeWriteDeps({
        knowledgeOwner: runtime.services.knowledgeOwner,
        auditLog: runtime.auditLog,
      }),
    );
    const knowledgeWriteModule = KnowledgeWriteModule.forTesting(knowledgeWritePort);

    const governanceConflictWorkflow = createHostLocalGovernanceConflictWorkflow({
      knowledgeOwner: runtime.services.knowledgeOwner,
      conflictProjection: runtime.services.governanceReview.conflictProjection,
    });

    const governanceAsyncCommands = createGovernanceAsyncCommandModule({
      feedbackRepo: runtime.services.governanceReview.feedbackRepo,
      auditLog: runtime.auditLog,
    });

    const jobRuntimeDeps = createJobRuntimeDeps({
      queuePorts: runtime.queuePorts,
      auditLog: runtime.auditLog,
      taskHandlers: createHostLocalGovernanceTaskHandlers(
        governanceConflictWorkflow,
        governanceAsyncCommands,
      ),
      ownsWork: true,
    });
    const jobRuntimePort = createJobRuntimeModule(jobRuntimeDeps);

    const governanceAdmin = createGovernanceReviewAdminModule({
      feedbackRepo: runtime.services.governanceReview.feedbackRepo,
      knowledgeRead: runtime.services.knowledgeOwner,
      artifactReadProjection: runtime.services.artifactReadProjection,
      knowledgeWrite: knowledgeWritePort,
      jobRuntime: jobRuntimePort,
      auditLog: runtime.auditLog,
    });

    const governanceReviewPort = createGovernanceReviewServiceModule(
      createGovernanceReviewDeps({
        knowledgeWrite: knowledgeWritePort,
        feedbackRepo: runtime.services.governanceReview.feedbackRepo,
        auditLog: runtime.auditLog,
        asyncCommands: governanceAsyncCommands,
        admin: governanceAdmin,
        conflictWorkflow: governanceConflictWorkflow,
        governanceRetrievalProjection: runtime.services.governanceReview.retrievalProjection,
      }),
    );
    const governanceReviewModule = GovernanceReviewModule.forTesting(governanceReviewPort);

    const jobRuntimeModule = JobRuntimeModule.forDeps(jobRuntimeDeps);

    const candidateIngestionPort = createCandidateIngestionModule(
      createCandidateIngestionDeps({
        candidateRepo: runtime.services.candidateIngestion.candidateRepo,
        auditLog: runtime.auditLog,
        knowledgeWrite: knowledgeWritePort,
        jobRuntime: jobRuntimePort,
      }),
    );
    const candidateIngestionModule = CandidateIngestionModule.forTesting(candidateIngestionPort);

    const cronDeps = CronModule.cronDepsForRuntime(runtime);
    const cronPort = createCronServiceModule(cronDeps);
    const cronModule = CronModule.forTesting(cronPort);

    const config = loadHostLocalConfig();

    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [() => ({ hostLocalConfig: config })],
        }),
        identityAccessModule,
        knowledgeReadModule,
        knowledgeWriteModule,
        governanceReviewModule,
        candidateIngestionModule,
        jobRuntimeModule,
        cronModule,
        GatewayModule.forRuntime(runtime, {
          knowledgeRead: knowledgeReadPort,
          candidateIngestion: candidateIngestionPort,
          governanceReview: governanceReviewPort,
          cron: cronPort,
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
          useValue: runtime,
        },
        {
          provide: HOST_LOCAL_CONFIG_TOKEN,
          useValue: config,
        },
      ],
      exports: [RequestContextService, HOST_LOCAL_CONFIG_TOKEN],
    };
  }

  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RequestContextMiddleware, HttpMetricsMiddleware, LoggingMiddleware)
      .forRoutes('*');
  }
}

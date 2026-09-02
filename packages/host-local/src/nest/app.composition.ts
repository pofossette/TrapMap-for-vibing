import { ConfigModule } from '@nestjs/config';
import { createCandidateIngestionModule, createJobRuntimeModule, createKnowledgeReadModule, createKnowledgeWriteModule, filterGraphDocumentsBySource, mapGraphDocumentsToAdminGraphResponse, mapGraphDocumentsToListView } from '@trapmap/backend-core';
import { createCandidateIngestionDeps } from '@trapmap/service-candidate-ingestion';
import { createCronServiceModule } from '@trapmap/service-cron';
import { createGovernanceAsyncCommandModule, createGovernanceReviewAdminModule, createGovernanceReviewDeps, createGovernanceReviewServiceModule } from '@trapmap/service-governance-review';
import { createIdentityAccessDeps, createIdentityAccessOwnerBundle, createIdentityAccessServiceModule } from '@trapmap/service-identity-access';
import { createJobRuntimeDeps } from '@trapmap/service-job-runtime';
import { createKnowledgeReadDeps } from '@trapmap/service-knowledge-read';
import { createKnowledgeWriteDeps } from '@trapmap/service-knowledge-write';
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
import { LangfuseModule, LokiModule, OtelModule, PrometheusModule, SentryModule } from './observability/index.js';
import { createHostLocalExperienceGeneHandlers } from './runtime/experience-gene-composition.js';
import { createHostLocalGovernanceConflictWorkflow, createHostLocalGovernanceTaskHandlers } from './runtime/governance-composition.js';
import { HOST_LOCAL_RUNTIME_TOKEN, type HostLocalRuntime } from './runtime/host-runtime.js';
import { buildKnowledgeProjection } from './runtime/knowledge-projection.js';
import { RequestContextService } from './runtime/request-context.service.js';
import { ConsulModule } from './service-discovery/index.js';

export function buildHostLocalModule(runtime: HostLocalRuntime) {

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
      skillLookup: runtime.skillLookup,
    });
    const knowledgeReadPortBase = createKnowledgeReadModule(knowledgeReadDeps);
    // Admin graph wiring — reuse the shared backend-core mapper
    // (mapGraphDocumentsToAdminGraphResponse / filterGraphDocumentsBySource)
    // so service-knowledge-read and host-local stay in sync. GraphIndex is
    // the canonical source; deps filter by artifactId/sourceType via the
    // shared helper and delegate node/edge projection to the mapper.
    const createAdminGraphFetcher =
      (defaultSourceType: 'trap' | 'skill') => async (query: Record<string, unknown>) => {
        const docs = await runtime.services.graphIndex.listAll();
        const artifactId = query.artifactId as string | undefined;
        const sourceDocs = filterGraphDocumentsBySource(docs, {
          ...(artifactId ? { artifactId } : { sourceType: defaultSourceType }),
        });
        return mapGraphDocumentsToAdminGraphResponse(sourceDocs);
      };
    const knowledgeReadPort = {
      ...knowledgeReadPortBase,
      getTrapGraph: createAdminGraphFetcher('trap'),
      getSkillGraph: createAdminGraphFetcher('skill'),
      listGraphDocuments: async () => {
        const docs = await runtime.services.graphIndex.listAll();
        return mapGraphDocumentsToListView(docs);
      },
    };
    const knowledgeReadModule = KnowledgeReadModule.forTesting(knowledgeReadPort);

    const knowledgeWritePortBase = createKnowledgeWriteModule(
      createKnowledgeWriteDeps({
        knowledgeOwner: runtime.services.knowledgeOwner,
        auditLog: runtime.auditLog,
        artifactReadProjection: runtime.services.artifactReadProjection,
        artifactWriter: runtime.services.artifactWriter,
      }),
    );
    // Host assembly stays thin — extend the base port with the artifact
    // projection needed by createKnowledgeAdminRouteDefs via a typed spread
    // (no Object.assign patch, no as unknown cast).
    const knowledgeWritePort = {
      ...knowledgeWritePortBase,
      artifactReadProjection: runtime.services.artifactReadProjection,
    };
    const knowledgeWriteModule = KnowledgeWriteModule.forTesting(knowledgeWritePort);

    const governanceConflictWorkflow = createHostLocalGovernanceConflictWorkflow({
      knowledgeOwner: runtime.services.knowledgeOwner,
      conflictProjection: runtime.services.governanceReview.conflictProjection,
    });

    const governanceAsyncCommands = createGovernanceAsyncCommandModule({
      feedbackRepo: runtime.services.governanceReview.feedbackRepo,
      auditLog: runtime.auditLog,
    });

    const experienceGeneRuntime = createHostLocalExperienceGeneHandlers({
      experienceGeneMode: runtime.services.config.experienceGeneMode,
      derive: runtime.services.experienceGeneDerive,
      markStale: runtime.services.experienceGeneMarkStale,
      plan: runtime.services.experienceGenePlan,
      queuePorts: runtime.queuePorts,
    });

    const jobRuntimeDeps = createJobRuntimeDeps({
      queuePorts: runtime.queuePorts,
      auditLog: runtime.auditLog,
      taskHandlers: [
        ...createHostLocalGovernanceTaskHandlers(
          governanceConflictWorkflow,
          governanceAsyncCommands,
        ),
        ...(experienceGeneRuntime.taskHandler ? [experienceGeneRuntime.taskHandler] : []),
      ],
      ...(experienceGeneRuntime.outboxHandlers.length > 0
        ? { outboxHandlers: experienceGeneRuntime.outboxHandlers }
        : {}),
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

    const governanceReviewPortBase = createGovernanceReviewServiceModule(
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
    // Thin host extension for admin parity (knowledgeOwner +
    // artifactReadProjection) — typed spread replaces Object.assign patch.
    const governanceReviewPort = {
      ...governanceReviewPortBase,
      knowledgeOwner: runtime.services.knowledgeOwner,
      artifactReadProjection: runtime.services.artifactReadProjection,
    };
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

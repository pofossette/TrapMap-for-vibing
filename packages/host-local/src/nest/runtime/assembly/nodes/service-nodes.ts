/**
 * Host-local assembly pilot service nodes (D2 mapping).
 *
 * One `defineNode` descriptor per service package, registered here (under
 * the host-local zone) so the node factories can reuse the host-local
 * composition seams (`governance-composition`, `CronModule.cronDepsForRuntime`)
 * without the `service-*` packages having to depend on `@trapmap/assembly`
 * or a host. The fallow `service-standard` / `service-knowledge-read`
 * zones only allow backend-core/contracts/lib/ai-providers, and the
 * `assembly` zone only allows backend-core/contracts/lib, so keeping the
 * descriptors here is the sanctioned Phase 2 placement.
 *
 * Node ids / provides follow D2 exactly:
 *   identity-access → identity
 *   candidate-ingestion → candidateIngestion
 *   governance-review → governanceReview
 *   job-runtime → jobRuntime
 *   knowledge-read → knowledgeRead
 *   knowledge-write → knowledgeWrite
 *   cron → cronRegistry
 *
 * Inject deviations (Phase 2 transitional wiring): D2 lists infra services
 * (audit / taskQueue / retrievalEngine / intentRecognition) that do not exist
 * as assembly services yet. This pilot injects the composed
 * hostLocalRuntime instead (see host-runtime node), plus the cross-context
 * ports (knowledgeWrite / jobRuntime) the two depend on. Phase 3 introduces
 * the missing infra services and refines these injects.
 */
import type { CapabilityNode } from '@trapmap/assembly';
import { defineNode } from '@trapmap/assembly';
import {
  createCandidateIngestionModule,
  createJobRuntimeModule,
  createKnowledgeReadModule,
  createKnowledgeWriteModule,
} from '@trapmap/backend-core';
import { createCandidateIngestionDeps } from '@trapmap/service-candidate-ingestion';
import { createCronServiceModule } from '@trapmap/service-cron';
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

import { CronModule } from '../../../cron/cron.module.js';
import {
  createHostLocalGovernanceConflictWorkflow,
  createHostLocalGovernanceTaskHandlers,
} from '../../governance-composition.js';
import type { HostLocalRuntime } from '../../host-runtime.js';
import { buildKnowledgeProjection } from '../../knowledge-projection.js';

function requireRuntime(ctx: Parameters<CapabilityNode['apply']>[0]): HostLocalRuntime {
  const runtime = ctx.get('hostLocalRuntime') as HostLocalRuntime | undefined;
  if (!runtime) {
    throw new Error('service node requires hostLocalRuntime to be provided');
  }
  return runtime;
}

export const identityAccessNode: CapabilityNode = defineNode({
  id: 'identity-access',
  provides: 'identity',
  inject: ['hostLocalRuntime'],
  topology: 'embedded',
  apply(ctx) {
    const runtime = requireRuntime(ctx);
    const port = createIdentityAccessServiceModule(
      createIdentityAccessDeps(
        createIdentityAccessOwnerBundle({
          ...runtime.identity,
        }),
      ),
    );
    ctx.provide('identity', port);
  },
});

export const knowledgeReadNode: CapabilityNode = defineNode({
  id: 'knowledge-read',
  provides: 'knowledgeRead',
  inject: ['hostLocalRuntime'],
  topology: 'embedded',
  apply(ctx) {
    const runtime = requireRuntime(ctx);
    const port = createKnowledgeReadModule(
      createKnowledgeReadDeps({
        knowledgeRepo: buildKnowledgeProjection(runtime),
        retrievalQuery: runtime.retrievalQuery,
        skillLookup: runtime.skillLookup,
      }),
    );
    ctx.provide('knowledgeRead', port);
  },
});

export const knowledgeWriteNode: CapabilityNode = defineNode({
  id: 'knowledge-write',
  provides: 'knowledgeWrite',
  inject: ['hostLocalRuntime'],
  topology: 'embedded',
  apply(ctx) {
    const runtime = requireRuntime(ctx);
    const port = createKnowledgeWriteModule(
      createKnowledgeWriteDeps({
        knowledgeOwner: runtime.services.knowledgeOwner,
        auditLog: runtime.auditLog,
      }),
    );
    ctx.provide('knowledgeWrite', port);
  },
});

export const jobRuntimeNode: CapabilityNode = defineNode({
  id: 'job-runtime',
  provides: 'jobRuntime',
  inject: ['hostLocalRuntime'],
  topology: 'embedded',
  apply(ctx) {
    const runtime = requireRuntime(ctx);
    const conflictWorkflow = createHostLocalGovernanceConflictWorkflow({
      knowledgeOwner: runtime.services.knowledgeOwner,
      conflictProjection: runtime.services.governanceReview.conflictProjection,
    });
    const asyncCommands = createGovernanceAsyncCommandModule({
      feedbackRepo: runtime.services.governanceReview.feedbackRepo,
      auditLog: runtime.auditLog,
    });
    const deps = createJobRuntimeDeps({
      queuePorts: runtime.queuePorts,
      auditLog: runtime.auditLog,
      taskHandlers: createHostLocalGovernanceTaskHandlers(conflictWorkflow, asyncCommands),
      ownsWork: true,
    });
    ctx.provide('jobRuntime', createJobRuntimeModule(deps));
  },
});

export const governanceReviewNode: CapabilityNode = defineNode({
  id: 'governance-review',
  provides: 'governanceReview',
  inject: ['hostLocalRuntime', 'knowledgeWrite', 'jobRuntime'],
  topology: 'embedded',
  apply(ctx) {
    const runtime = requireRuntime(ctx);
    const knowledgeWritePort = ctx.get('knowledgeWrite');
    if (!knowledgeWritePort) {
      throw new Error('governance-review node requires knowledgeWrite');
    }
    const jobRuntimePort = ctx.get('jobRuntime');
    if (!jobRuntimePort) {
      throw new Error('governance-review node requires jobRuntime');
    }
    const conflictWorkflow = createHostLocalGovernanceConflictWorkflow({
      knowledgeOwner: runtime.services.knowledgeOwner,
      conflictProjection: runtime.services.governanceReview.conflictProjection,
    });
    const asyncCommands = createGovernanceAsyncCommandModule({
      feedbackRepo: runtime.services.governanceReview.feedbackRepo,
      auditLog: runtime.auditLog,
    });
    const admin = createGovernanceReviewAdminModule({
      feedbackRepo: runtime.services.governanceReview.feedbackRepo,
      knowledgeRead: runtime.services.knowledgeOwner,
      artifactReadProjection: runtime.services.artifactReadProjection,
      knowledgeWrite: knowledgeWritePort,
      jobRuntime: jobRuntimePort,
      auditLog: runtime.auditLog,
    });
    const port = createGovernanceReviewServiceModule(
      createGovernanceReviewDeps({
        knowledgeWrite: knowledgeWritePort,
        feedbackRepo: runtime.services.governanceReview.feedbackRepo,
        auditLog: runtime.auditLog,
        asyncCommands,
        admin,
        conflictWorkflow,
        governanceRetrievalProjection: runtime.services.governanceReview.retrievalProjection,
      }),
    );
    ctx.provide('governanceReview', port);
  },
});

export const candidateIngestionNode: CapabilityNode = defineNode({
  id: 'candidate-ingestion',
  provides: 'candidateIngestion',
  inject: ['hostLocalRuntime', 'knowledgeWrite', 'jobRuntime'],
  topology: 'embedded',
  apply(ctx) {
    const runtime = requireRuntime(ctx);
    const knowledgeWritePort = ctx.get('knowledgeWrite');
    if (!knowledgeWritePort) {
      throw new Error('candidate-ingestion node requires knowledgeWrite');
    }
    const jobRuntimePort = ctx.get('jobRuntime');
    if (!jobRuntimePort) {
      throw new Error('candidate-ingestion node requires jobRuntime');
    }
    const port = createCandidateIngestionModule(
      createCandidateIngestionDeps({
        candidateRepo: runtime.services.candidateIngestion.candidateRepo,
        auditLog: runtime.auditLog,
        knowledgeWrite: knowledgeWritePort,
        jobRuntime: jobRuntimePort,
      }),
    );
    ctx.provide('candidateIngestion', port);
  },
});

export const cronNode: CapabilityNode = defineNode({
  id: 'cron',
  provides: 'cronRegistry',
  inject: ['hostLocalRuntime'],
  topology: 'embedded',
  apply(ctx) {
    const runtime = requireRuntime(ctx);
    const deps = CronModule.cronDepsForRuntime(runtime);
    ctx.provide('cronRegistry', createCronServiceModule(deps));
  },
});

/** Ordered list of the seven D2 service node descriptors. */
export const serviceNodes: readonly CapabilityNode[] = [
  identityAccessNode,
  knowledgeReadNode,
  knowledgeWriteNode,
  jobRuntimeNode,
  governanceReviewNode,
  candidateIngestionNode,
  cronNode,
];

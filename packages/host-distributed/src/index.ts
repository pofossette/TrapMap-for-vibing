/**
 * @trapmap/host-distributed -- distributed host library.
 *
 * Boots are wired exclusively through the app shell entry point
 * (`apps/distributed/src/index.ts`), which owns the `--service` dispatch and
 * provides the `startService` starter. This library package exposes only the
 * runner API and does NOT boot on direct module execution.
 *
 * Usage:
 *   import { startDistributedService, runDistributedServices } from '@trapmap/host-distributed';
 *   await runDistributedServices({ startService: startDistributedService });
 */

import type { ServiceName } from './config/index.js';
import {
  assertDistributedConnectionBudget,
  assertDistributedResilienceConfig,
} from './config/index.js';
import type { DistributedServiceHandle } from './runner.js';

export {
  type DistributedServiceHandle,
  type DistributedServiceStarter,
  runDistributedServices,
} from './runner.js';

/**
 * Dispatch a single distributed service by name through the service-specific
 * bootstrap exports. This is a library-provided starter that app shells wrap
 * when invoking {@link runDistributedServices}; the library itself does NOT
 * boot on direct module execution.
 */
export async function startDistributedService(
  name: ServiceName,
): Promise<DistributedServiceHandle> {
  assertDistributedConnectionBudget();
  assertDistributedResilienceConfig();
  switch (name) {
    case 'gateway': {
      const { startGatewayService } = await import('./gateway/index.js');
      return startGatewayService();
    }
    case 'identity-access': {
      const { startIdentityAccessService } = await import('./identity-access/index.js');
      return startIdentityAccessService();
    }
    case 'knowledge-read': {
      const { startKnowledgeReadService } = await import('./knowledge-read/index.js');
      return startKnowledgeReadService();
    }
    case 'knowledge-write': {
      const { startKnowledgeWriteService } = await import('./knowledge-write/index.js');
      return startKnowledgeWriteService();
    }
    case 'candidate-ingestion': {
      const { startCandidateIngestionService } = await import('./candidate-ingestion/index.js');
      return startCandidateIngestionService();
    }
    case 'governance-review': {
      const { startGovernanceReviewService } = await import('./governance-review/index.js');
      return startGovernanceReviewService();
    }
    case 'job-runtime': {
      const { startJobRuntimeService } = await import('./job-runtime/index.js');
      return startJobRuntimeService();
    }
    case 'cron-scheduler': {
      const { startCronService } = await import('./cron-scheduler/index.js');
      return startCronService();
    }
    default: {
      const exhaustive: never = name;
      throw new Error(`Unknown service: ${exhaustive}`);
    }
  }
}

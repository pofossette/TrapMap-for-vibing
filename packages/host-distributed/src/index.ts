/**
 * @trapmap/host-distributed -- main entry point.
 *
 * Accepts a `--service <name>` flag to start a specific service,
 * or starts all services when no flag is provided.
 *
 * Usage:
 *   node dist/index.js                           # Start all services
 *   node dist/index.js --service gateway          # Start only gateway
 *   node dist/index.js --service identity-access  # Start only identity-access
 */

import { assertDistributedConnectionBudget } from './config/index.js';
import type { ServiceName } from './config/index.js';
import { type DistributedServiceHandle, runDistributedServices } from './runner.js';

export {
  type DistributedServiceHandle,
  type DistributedServiceStarter,
  runDistributedServices,
} from './runner.js';

async function startService(name: ServiceName): Promise<DistributedServiceHandle> {
  assertDistributedConnectionBudget();
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

const isDirectExecution =
  process.argv[1] &&
  (process.argv[1].endsWith('/host-distributed/src/index.ts') ||
    process.argv[1].endsWith('\\host-distributed\\src\\index.ts') ||
    process.argv[1].endsWith('/host-distributed/dist/index.js') ||
    process.argv[1].endsWith('\\host-distributed\\dist\\index.js'));

if (isDirectExecution) {
  runDistributedServices({ startService }).catch((error: unknown) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

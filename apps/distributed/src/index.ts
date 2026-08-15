/**
 * @trapmap/app-distributed -- assembly center (thin adapter) for the distributed host.
 *
 * This package is the *composition layer* on top of the `@trapmap/host-distributed`
 * library package: it owns the `--service` CLI dispatch, env binding and signal
 * handling, but carries NO business logic. All service implementations live in
 * `packages/host-distributed` and are reached exclusively through its package
 * exports subpaths (no internal deep imports are allowed).
 *
 * Usage:
 *   node dist/index.js                                  # Start all services
 *   node dist/index.js --service gateway                # Start only gateway
 *   node dist/index.js --service candidate-ingestion    # Start only candidate-ingestion
 */

import { type DistributedServiceHandle, runDistributedServices } from '@trapmap/host-distributed';
import type { ServiceName } from '@trapmap/host-distributed/config/index.js';
import { assertDistributedConnectionBudget } from '@trapmap/host-distributed/config/index.js';

async function startService(name: ServiceName): Promise<DistributedServiceHandle> {
  assertDistributedConnectionBudget();
  switch (name) {
    case 'gateway': {
      const { startGatewayService } = await import('@trapmap/host-distributed/gateway/index.js');
      return startGatewayService();
    }
    case 'identity-access': {
      const { startIdentityAccessService } = await import(
        '@trapmap/host-distributed/identity-access/index.js'
      );
      return startIdentityAccessService();
    }
    case 'knowledge-read': {
      const { startKnowledgeReadService } = await import(
        '@trapmap/host-distributed/knowledge-read/index.js'
      );
      return startKnowledgeReadService();
    }
    case 'knowledge-write': {
      const { startKnowledgeWriteService } = await import(
        '@trapmap/host-distributed/knowledge-write/index.js'
      );
      return startKnowledgeWriteService();
    }
    case 'candidate-ingestion': {
      const { startCandidateIngestionService } = await import(
        '@trapmap/host-distributed/candidate-ingestion/index.js'
      );
      return startCandidateIngestionService();
    }
    case 'governance-review': {
      const { startGovernanceReviewService } = await import(
        '@trapmap/host-distributed/governance-review/index.js'
      );
      return startGovernanceReviewService();
    }
    case 'job-runtime': {
      const { startJobRuntimeService } = await import(
        '@trapmap/host-distributed/job-runtime/index.js'
      );
      return startJobRuntimeService();
    }
    default: {
      const exhaustive: never = name;
      throw new Error(`Unknown service: ${exhaustive}`);
    }
  }
}

const isDirectExecution =
  process.argv[1] &&
  (process.argv[1].endsWith('/apps/distributed/src/index.ts') ||
    process.argv[1].endsWith('\\apps\\distributed\\src\\index.ts') ||
    process.argv[1].endsWith('/apps/distributed/dist/index.js') ||
    process.argv[1].endsWith('\\apps\\distributed\\dist\\index.js'));

if (isDirectExecution) {
  runDistributedServices({ startService }).catch((error: unknown) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

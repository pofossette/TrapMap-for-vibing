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

import type { ServiceName } from '@trapmap/host-distributed/config/index.js';
import {
  ALL_SERVICES,
  assertDistributedConnectionBudget,
} from '@trapmap/host-distributed/config/index.js';

// ---------------------------------------------------------------------------
// Service handle (structural shape every start<X>Service() result satisfies)
// ---------------------------------------------------------------------------

interface ServiceHandle {
  config: { port: number };
  server: { close(): Promise<void> };
  db?: { close(): Promise<void> };
}

// ---------------------------------------------------------------------------
// Service starters (lazy-imported via package exports subpaths to avoid
// loading unnecessary modules for a single-service process)
// ---------------------------------------------------------------------------

async function startService(name: ServiceName): Promise<ServiceHandle> {
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

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseArgs(): { service: ServiceName | null } {
  const args = process.argv.slice(2);
  let service: ServiceName | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--service' && args[i + 1]) {
      const name = args[i + 1] as ServiceName;
      if (!ALL_SERVICES.includes(name)) {
        console.error(`Unknown service: ${name}`);
        console.error(`Available services: ${ALL_SERVICES.join(', ')}`);
        process.exit(1);
      }
      service = name;
      i++; // skip the value
    }
  }

  return { service };
}

// ---------------------------------------------------------------------------
// Graceful shutdown (close server + db)
// ---------------------------------------------------------------------------

async function closeHandle(handle: ServiceHandle): Promise<void> {
  await handle.server.close();
  if (handle.db) {
    await handle.db.close();
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { service } = parseArgs();

  if (service) {
    // Start a single service
    console.log(`Starting service: ${service}`);
    const result = await startService(service);
    console.log(`Service ${service} started on port ${result.config.port}`);

    const shutdown = async () => {
      console.log(`Shutting down service: ${service}...`);
      try {
        await closeHandle(result);
      } catch (error) {
        console.error(`Error shutting down ${service}:`, error);
        process.exit(1);
      }
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } else {
    // Start all services
    console.log('Starting all services...');
    const handles: Array<{ name: ServiceName; handle: ServiceHandle }> = [];

    for (const name of ALL_SERVICES) {
      try {
        const handle = await startService(name);
        handles.push({ name, handle });
        console.log(`  ${name} started on port ${handle.config.port}`);
      } catch (error) {
        console.error(`  Failed to start ${name}:`, error);
        process.exit(1);
      }
    }

    console.log(`All ${handles.length} services started.`);

    const shutdown = async () => {
      console.log('Shutting down all services...');
      await Promise.all(
        handles.map(async ({ name, handle }) => {
          try {
            await closeHandle(handle);
          } catch (error) {
            console.error(`Error shutting down ${name}:`, error);
          }
        }),
      );
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }
}

// ---------------------------------------------------------------------------
// Direct execution (guard keeps the entry import-safe for tests/tools)
// ---------------------------------------------------------------------------

const isDirectExecution =
  process.argv[1] &&
  (process.argv[1].endsWith('/apps/distributed/src/index.ts') ||
    process.argv[1].endsWith('\\apps\\distributed\\src\\index.ts') ||
    process.argv[1].endsWith('/apps/distributed/dist/index.js') ||
    process.argv[1].endsWith('\\apps\\distributed\\dist\\index.js'));

if (isDirectExecution) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

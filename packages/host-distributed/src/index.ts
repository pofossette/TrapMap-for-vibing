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

import type { ServiceName } from './config/index.js';
import { ALL_SERVICES, assertDistributedConnectionBudget } from './config/index.js';

// ---------------------------------------------------------------------------
// Service starters (lazy-imported to avoid loading unnecessary modules)
// ---------------------------------------------------------------------------

async function startService(name: ServiceName) {
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
    default: {
      throw new Error(`Unknown service: ${name}`);
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
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { service } = parseArgs();

  if (service) {
    // Start a single service
    console.log(`Starting service: ${service}`);
    const result = await startService(service);
    console.log(`Service ${service} started on port ${result.config.port}`);

    // Graceful shutdown
    const shutdown = async () => {
      console.log(`Shutting down service: ${service}...`);
      await result.server.close();
      if ('db' in result && result.db) {
        await (result.db as { close(): Promise<void> }).close();
      }
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } else {
    // Start all services
    console.log('Starting all services...');
    const handles: Array<{
      name: ServiceName;
      config: { port: number };
      server: { close(): Promise<void> };
      db?: { close(): Promise<void> };
    }> = [];

    for (const name of ALL_SERVICES) {
      try {
        const result = await startService(name);
        handles.push({ name, ...result } as never);
        console.log(`  ${name} started on port ${result.config.port}`);
      } catch (error) {
        console.error(`  Failed to start ${name}:`, error);
        process.exit(1);
      }
    }

    console.log(`All ${handles.length} services started.`);

    // Graceful shutdown
    const shutdown = async () => {
      console.log('Shutting down all services...');
      await Promise.all(
        handles.map(async (h) => {
          try {
            await h.server.close();
            if (h.db) {
              await h.db.close();
            }
          } catch (error) {
            console.error(`Error shutting down ${h.name}:`, error);
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
// Direct execution
// ---------------------------------------------------------------------------

const isDirectExecution =
  process.argv[1] &&
  (process.argv[1].endsWith('/host-distributed/src/index.ts') ||
    process.argv[1].endsWith('\\host-distributed\\src\\index.ts') ||
    process.argv[1].endsWith('/host-distributed/dist/index.js') ||
    process.argv[1].endsWith('\\host-distributed\\dist\\index.js'));

if (isDirectExecution) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

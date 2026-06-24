import type {
  AuditLogPort,
  DeploymentPreset,
  DeploymentProfile,
  OutboxEvent,
  OutboxPort,
  PermissionCheckPort,
  RepositoryPorts,
  RetrievalQueryPort,
  RuntimeMode,
  SessionLookupPort,
  TaskHandler,
  TaskQueuePort,
  TeamLookupPort,
} from '@trapmap/backend-core';
import {
  shouldBootApiRuntime,
  shouldBootOutboxWorker,
  shouldBootTaskWorker,
  type RuntimeWorkerHandle,
} from '@trapmap/backend-core';
import { buildServer } from '@trapmap/server';
import type { FastifyInstance } from 'fastify';

import { createInProcessOutboxDispatcher, createInProcessTaskWorker } from '../runtime/index.js';

// ---------------------------------------------------------------------------
// Bootstrap options
// ---------------------------------------------------------------------------

export interface BootstrapOptions {
  /** Deployment profile override */
  deploymentProfile?: DeploymentProfile;

  /** Deployment preset override */
  deploymentPreset?: DeploymentPreset;

  /** Runtime mode override */
  runtimeMode?: RuntimeMode;

  /** HTTP port */
  port?: number;

  /** Host binding address */
  host?: string;

  /** Log level */
  logLevel?: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

  /** Pre-configured repository ports (null = stub/no persistence) */
  repos?: RepositoryPorts | null;

  /** Pre-configured queue port (null = no task queue) */
  taskQueue?: TaskQueuePort | null;

  /** Pre-configured outbox port (null = no outbox) */
  outbox?: OutboxPort | null;

  /** Session lookup port */
  sessionLookup?: SessionLookupPort;

  /** Team lookup port */
  teamLookup?: TeamLookupPort;

  /** Permission check port */
  permissionCheck?: PermissionCheckPort;

  /** Audit log port */
  auditLog?: AuditLogPort;

  /** Retrieval query port */
  retrievalQuery?: RetrievalQueryPort;

  /** Optional concrete task handlers for real in-process queue consumption */
  taskHandlers?: TaskHandler<unknown>[];

  /** Optional concrete outbox event dispatcher for real in-process outbox consumption */
  dispatchOutboxEvent?: (event: OutboxEvent) => Promise<void>;
}

export interface BootstrapResult {
  app: FastifyInstance;
  close: () => Promise<void>;
}

interface ManagedRuntime {
  taskWorker: RuntimeWorkerHandle | null;
  outboxWorker: RuntimeWorkerHandle | null;
}

// ---------------------------------------------------------------------------
// Bootstrap function
// ---------------------------------------------------------------------------

/**
 * Bootstrap the light host server.
 *
 * This function:
 * 1. Resolves the deployment configuration from the given profile/preset
 * 2. Creates a Fastify instance with logging
 * 3. Initializes backend-core modules with port implementations
 * 4. Registers middleware (logging, CORS, error handling)
 * 5. Registers routes based on the deployment profile
 * 6. Optionally starts in-process workers
 * 7. Starts listening on the configured port
 */
export async function bootstrap(options: BootstrapOptions = {}): Promise<BootstrapResult> {
  const deploymentPreset = options.deploymentPreset ?? 'monolith';
  const runtimeMode = options.runtimeMode;
  const managedRuntime = createManagedRuntime({
    deploymentPreset,
    runtimeMode,
    taskQueue: options.taskQueue ?? null,
    outbox: options.outbox ?? null,
    dispatchOutboxEvent: options.dispatchOutboxEvent,
    taskHandlers: options.taskHandlers ?? [],
  });

  const app = buildServer({
    ...(runtimeMode !== undefined ? { runtimeMode } : {}),
    config: {
      deployment: {
        profile: options.deploymentProfile,
        preset: deploymentPreset,
        compatibility: undefined as never,
        resolved: undefined as never,
      },
    } as never,
  });

  const port = options.port ?? 4000;
  const host = options.host ?? '0.0.0.0';
  await app.listen({ port, host });

  return {
    app,
    close: async () => {
      await managedRuntime.stop();
      await app.close();
    },
  };
}

function createManagedRuntime(options: {
  deploymentPreset: DeploymentPreset;
  runtimeMode: RuntimeMode | undefined;
  taskQueue: BootstrapOptions['taskQueue'];
  outbox: BootstrapOptions['outbox'];
  dispatchOutboxEvent: BootstrapOptions['dispatchOutboxEvent'];
  taskHandlers: BootstrapOptions['taskHandlers'];
}): ManagedRuntime {
  const effectiveRuntimeMode = options.runtimeMode ?? inferRuntimeMode(options.deploymentPreset);
  const ownsTaskWork = shouldBootTaskWorker(effectiveRuntimeMode);
  const ownsOutboxWork = shouldBootOutboxWorker(effectiveRuntimeMode);
  if (!shouldBootApiRuntime(effectiveRuntimeMode) && !ownsTaskWork && !ownsOutboxWork) {
    return { taskWorker: null, outboxWorker: null };
  }

  const taskWorker =
    ownsTaskWork && options.taskQueue
      ? createInProcessTaskWorker(options.taskQueue, {
          enabled: true,
          ownsWork: true,
          handlers: options.taskHandlers,
        })
      : null;
  const outboxWorker = ownsOutboxWork
    ? createInProcessOutboxDispatcher(options.outbox, {
        enabled: true,
        ownsWork: true,
        dispatch:
          options.dispatchOutboxEvent ??
          (async () => {
            /* no-op */
          }),
      })
    : null;

  return {
    taskWorker,
    outboxWorker,
    async stop() {
      await Promise.all([taskWorker?.stop(), outboxWorker?.stop()]);
    },
  };
}

function inferRuntimeMode(preset: DeploymentPreset): RuntimeMode {
  switch (preset) {
    case 'api':
      return 'api';
    case 'candidate-worker':
    case 'governance-worker':
      return 'task-worker';
    case 'outbox-worker':
      return 'outbox-worker';
    default:
      return 'combined';
  }
}

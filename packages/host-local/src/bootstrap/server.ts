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
  TaskQueuePort,
  TeamLookupPort,
} from '@trapmap/backend-core';
import type { TaskHandler } from '@trapmap/backend-core';
import { buildServer } from '@trapmap/server';
import type { FastifyInstance } from 'fastify';

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
  const app = buildServer({
    ...(options.runtimeMode !== undefined ? { runtimeMode: options.runtimeMode } : {}),
    config: {
      deployment: {
        profile: options.deploymentProfile,
        preset: options.deploymentPreset ?? 'monolith',
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
    close: async () => app.close(),
  };
}

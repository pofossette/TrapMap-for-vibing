/**
 * HTTP server setup and configuration.
 *
 * Creates a Fastify instance, initializes backend-core modules with
 * the provided port implementations, registers middleware and routes,
 * and starts listening on the configured port.
 *
 * This is the top-level assembly point for the light host.
 */

import Fastify, { type FastifyInstance } from 'fastify';

import type {
  AuditLogPort,
  DeploymentPreset,
  DeploymentProfile,
  OutboxPort,
  PermissionCheckPort,
  RepositoryPorts,
  RetrievalQueryPort,
  RuntimeMode,
  RuntimeWorkerHandle,
  SessionLookupPort,
  TaskQueuePort,
  TeamLookupPort,
} from '@trapmap/backend-core';
import {
  createCandidateIngestionModule,
  createGovernanceReviewModule,
  createIdentityAccessModule,
  createJobRuntimeModule,
  createKnowledgeReadModule,
  createKnowledgeWriteModule,
  resolveRuntimeDeployment,
  shouldBootOutboxWorker,
  shouldBootTaskWorker,
  type OutboxEvent,
  type TaskHandler,
} from '@trapmap/backend-core';

import { createInProcessOutboxDispatcher } from '../runtime/outbox.js';
import { createInProcessTaskWorker } from '../runtime/worker.js';
import { registerCors, registerErrorHandler, registerRequestLogging } from './middleware.js';
import { registerRoutes } from './routes.js';
import {
  createQueuePorts,
  createStubAccessKeyRepo,
  createStubAuditLog,
  createStubCandidateRepo,
  createStubFeedbackRepo,
  createStubKnowledgeRepo,
  createStubMembershipRepo,
  createStubPermissionCheck,
  createStubRetrievalQuery,
  createStubSessionLookup,
  createStubSessionRepo,
  createStubTeamLookup,
  createStubTeamRepo,
  createStubUserRepo,
} from './stubs.js';

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
  // Resolve deployment configuration
  const deployment = resolveRuntimeDeployment({
    profile: options.deploymentProfile,
    preset: options.deploymentPreset ?? 'monolith',
    ...(options.runtimeMode !== undefined ? { runtimeMode: options.runtimeMode } : {}),
  });

  // Create Fastify instance
  const app = Fastify({
    logger: {
      level: options.logLevel ?? 'info',
    },
  });

  // Resolve port implementations with safe defaults
  const repos = options.repos ?? null;
  const sessionLookup = options.sessionLookup ?? createStubSessionLookup();
  const teamLookup = options.teamLookup ?? createStubTeamLookup();
  const permissionCheck = options.permissionCheck ?? createStubPermissionCheck();
  const auditLog = options.auditLog ?? createStubAuditLog();
  const retrievalQuery = options.retrievalQuery ?? createStubRetrievalQuery();

  // Initialize backend-core modules
  const modules = {
    identityAccess: createIdentityAccessModule({
      sessionRepo: repos?.session ?? createStubSessionRepo(),
      accessKeyRepo: repos?.accessKey ?? createStubAccessKeyRepo(),
      teamRepo: repos?.team ?? createStubTeamRepo(),
      membershipRepo: repos?.membership ?? createStubMembershipRepo(),
      userRepo: repos?.user ?? createStubUserRepo(),
      sessionLookup,
      teamLookup,
      permissionCheck,
      auditLog,
    }),
    knowledgeRead: createKnowledgeReadModule({
      knowledgeRepo: repos?.knowledge ?? createStubKnowledgeRepo(),
      retrievalQuery,
    }),
    knowledgeWrite: createKnowledgeWriteModule({
      knowledgeRepo: repos?.knowledge ?? createStubKnowledgeRepo(),
      auditLog,
    }),
    candidateIngestion: createCandidateIngestionModule({
      candidateRepo: repos?.candidate ?? createStubCandidateRepo(),
      auditLog,
    }),
    governanceReview: createGovernanceReviewModule({
      knowledgeRepo: repos?.knowledge ?? createStubKnowledgeRepo(),
      feedbackRepo: repos?.feedback ?? createStubFeedbackRepo(),
      auditLog,
    }),
    jobRuntime: createJobRuntimeModule({
      queuePorts: createQueuePorts(options.taskQueue, options.outbox),
      auditLog,
    }),
  };

  // Register middleware
  registerRequestLogging(app);
  registerCors(app);
  registerErrorHandler(app);

  // Register routes based on deployment profile
  registerRoutes({
    app,
    deployment,
    repos,
    modules,
  });

  // Optionally start in-process workers
  let taskWorker: RuntimeWorkerHandle | null = null;
  let outboxDispatcher: RuntimeWorkerHandle | null = null;

  if (shouldBootTaskWorker(deployment.runtimeMode)) {
    taskWorker = createInProcessTaskWorker(options.taskQueue ?? null, {
      ownsWork: deployment.deploymentProfile === 'team-monolith',
      handlers: options.taskHandlers ?? [],
    });
    if (taskWorker) {
      app.log.info('In-process task worker started');
    }
  }

  if (shouldBootOutboxWorker(deployment.runtimeMode)) {
    outboxDispatcher = createInProcessOutboxDispatcher(options.outbox ?? null, {
      ownsWork: deployment.deploymentProfile === 'team-monolith',
      dispatch: options.dispatchOutboxEvent ?? (async () => {}),
    });
    if (outboxDispatcher) {
      app.log.info('In-process outbox dispatcher started');
    }
  }

  // Start listening
  const port = options.port ?? 4000;
  const host = options.host ?? '0.0.0.0';
  await app.listen({ port, host });

  app.log.info(
    {
      port,
      host,
      profile: deployment.deploymentProfile,
      runtimeMode: deployment.runtimeMode,
      routeSurface: deployment.capabilities.routeSurface,
    },
    'Light host started',
  );

  return {
    app,
    close: async () => {
      taskWorker?.stop();
      outboxDispatcher?.stop();
      await app.close();
    },
  };
}

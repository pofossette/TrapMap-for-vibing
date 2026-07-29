import pg from 'pg';

import { createJobRuntimeModule } from '../../packages/backend-core/src/index.js';
import { buildServer, type BuildServerOptions } from '../../packages/server/src/app.js';
import {
  createJobRuntimeAsyncTransport,
  createJobRuntimeOutboxConsumer,
} from '../../packages/service-job-runtime/src/index.js';
import { PostgresStore } from '../../packages/server/src/lib/persistence/postgres-store.js';
import { createIdentityAccessPgDeps } from '../../packages/service-identity-access/src/pg-ports.js';
import {
  createKnowledgeWriteOwnerBundle,
  type ArtifactWritePort,
} from '../../packages/service-knowledge-write/src/pg-ports.js';
import { createGovernanceReviewPgOwnerBundle } from '../../packages/service-governance-review/src/pg-ports.js';
import {
  createKnowledgeReadGraphIndexRepository,
  createMemoryGraphQueryBackend,
} from '../../packages/service-knowledge-read/src/index.js';
import type { KnowledgeOwnerPort } from '../../packages/contracts/src/index.js';

export interface PostgresComposedServer {
  app: ReturnType<typeof buildServer>;
  store: PostgresStore;
  artifactWriter: ArtifactWritePort;
  knowledgeOwner: KnowledgeOwnerPort;
  close(): Promise<void>;
}

/** Host-equivalent PostgreSQL composition for evals and one-shot scripts. */
export function buildPostgresComposedServer(
  databaseUrl: string,
  options: Omit<BuildServerOptions, 'identityBundle' | 'ownsStore' | 'store'> = {},
): PostgresComposedServer {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const store = new PostgresStore(pool);
  const identity = createIdentityAccessPgDeps(pool);
  const knowledgeWrite = createKnowledgeWriteOwnerBundle(pool);
  const governanceReview = createGovernanceReviewPgOwnerBundle(pool);
  const graphIndex = createKnowledgeReadGraphIndexRepository(pool);
  const graphQueryBackend = options.graphQueryBackend ?? createMemoryGraphQueryBackend(graphIndex);
  const graphQuery = options.graphQuery ??
    options.graphQueryBackend?.getRuntimeState() ?? {
      backendKind: 'memory' as const,
      failOpen: true,
      mode: 'disabled' as const,
    };
  const asyncTransport = createJobRuntimeAsyncTransport({
    config: {
      asyncTaskTransport: {
        provider: 'postgres',
        rabbitmq: null,
      },
    },
    pool,
  });
  const app = buildServer({
    ...options,
    config: { ...options.config, databaseUrl },
    identityBundle: createIdentityAccessPgDeps(pool),
    artifactReadProjection: knowledgeWrite.artifactReadProjection,
    knowledgeOwner: knowledgeWrite.knowledgeOwner,
    governanceRetrievalProjection: governanceReview.retrievalProjection,
    graphIndex,
    graphQueryBackend,
    graphQuery,
    asyncTransport,
    jobRuntime: createJobRuntimeModule({
      queuePorts: {
        task: asyncTransport.task,
        outbox: asyncTransport.outbox,
      },
      auditLog: identity.auditLog,
    }),
    outboxWorkerFactory: {
      create: (worker) => createJobRuntimeOutboxConsumer(worker),
    },
    ownsStore: false,
    store,
  });
  const closeApp = app.close.bind(app);

  return {
    app,
    store,
    artifactWriter: knowledgeWrite.artifactWriter,
    knowledgeOwner: knowledgeWrite.knowledgeOwner,
    async close() {
      await closeApp();
      await pool.end();
    },
  };
}

import pg from 'pg';

import { buildServer, type BuildServerOptions } from '../../packages/server/src/app.js';
import { PostgresStore } from '../../packages/server/src/lib/persistence/postgres-store.js';
import { createIdentityAccessPgDeps } from '../../packages/service-identity-access/src/pg-ports.js';

export interface PostgresComposedServer {
  app: ReturnType<typeof buildServer>;
  store: PostgresStore;
  close(): Promise<void>;
}

/** Host-equivalent PostgreSQL composition for evals and one-shot scripts. */
export function buildPostgresComposedServer(
  databaseUrl: string,
  options: Omit<BuildServerOptions, 'identityBundle' | 'ownsStore' | 'store'> = {},
): PostgresComposedServer {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const store = new PostgresStore(pool);
  const app = buildServer({
    ...options,
    config: { ...options.config, databaseUrl },
    identityBundle: createIdentityAccessPgDeps(pool),
    ownsStore: false,
    store,
  });
  const closeApp = app.close.bind(app);

  return {
    app,
    store,
    async close() {
      await closeApp();
      await pool.end();
    },
  };
}

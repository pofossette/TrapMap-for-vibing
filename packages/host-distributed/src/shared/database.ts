/**
 * Database connection pool management for distributed services.
 *
 * Each service gets its own PostgreSQL connection pool. The pool is
 * configured per-service based on the service configuration.
 */

import type { ServiceConfig } from '@trapmap/host-distributed/config/index.js';
import pg from 'pg';

// ---------------------------------------------------------------------------
// Database pool interface
// ---------------------------------------------------------------------------

export interface ServiceDatabase {
  pool: pg.Pool;
  healthCheck(): Promise<boolean>;
  close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Pool configuration
// ---------------------------------------------------------------------------

interface PoolConfig {
  max: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
}

const DEFAULT_POOL_CONFIG: PoolConfig = {
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a PostgreSQL connection pool for a specific service.
 *
 * Uses the service configuration to determine the database URL
 * and pool size. Falls back to DATABASE_URL / TRAPMAP_DATABASE_URL
 * if the service doesn't have its own database URL.
 */
export function createServiceDatabase(config: ServiceConfig): ServiceDatabase {
  const databaseUrl =
    config.databaseUrl ?? process.env.DATABASE_URL ?? process.env.TRAPMAP_DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      `Database URL required for service '${config.serviceName}'. Set DATABASE_URL, TRAPMAP_DATABASE_URL, or TRAPMAP_SERVICE_DATABASE_URL environment variable.`,
    );
  }

  const poolConfig: PoolConfig = {
    ...DEFAULT_POOL_CONFIG,
    max: config.poolSize ?? DEFAULT_POOL_CONFIG.max,
  };

  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: poolConfig.max,
    idleTimeoutMillis: poolConfig.idleTimeoutMillis,
    connectionTimeoutMillis: poolConfig.connectionTimeoutMillis,
  });

  // Log pool errors
  pool.on('error', (err) => {
    console.error(`[${config.serviceName}] Unexpected database pool error:`, err);
  });

  return {
    pool,

    async healthCheck(): Promise<boolean> {
      try {
        const client = await pool.connect();
        try {
          await client.query('SELECT 1');
          return true;
        } finally {
          client.release();
        }
      } catch (error) {
        console.error(`[${config.serviceName}] Database health check failed:`, error);
        return false;
      }
    },

    async close(): Promise<void> {
      await pool.end();
    },
  };
}

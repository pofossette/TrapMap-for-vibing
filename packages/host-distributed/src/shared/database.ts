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
  healthCheck(): Promise<ServiceDatabaseHealth>;
  getPoolSnapshot(): ServicePoolSnapshot;
  close(): Promise<void>;
}

export interface ServicePoolSnapshot {
  total: number | 'unknown';
  idle: number | 'unknown';
  waiting: number | 'unknown';
  max: number;
  saturation: number | 'unknown';
}

export interface ServiceDatabaseHealth {
  status: 'healthy' | 'unhealthy';
  latencyMs: number;
  pool: ServicePoolSnapshot;
  error?: string;
}

// ---------------------------------------------------------------------------
// Pool configuration
// ---------------------------------------------------------------------------

export interface PoolConfig {
  max: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
  statement_timeout: number;
  query_timeout: number;
  idle_in_transaction_session_timeout: number;
}

export function getServicePoolConfig(config: ServiceConfig): PoolConfig {
  return {
    max: config.poolSize,
    idleTimeoutMillis: config.idleTimeoutMs,
    connectionTimeoutMillis: config.connectionTimeoutMs,
    statement_timeout: config.statementTimeoutMs,
    query_timeout: config.queryTimeoutMs,
    idle_in_transaction_session_timeout: config.idleInTransactionTimeoutMs,
  };
}

export interface ServicePoolCounters {
  totalCount?: number | undefined;
  idleCount?: number | undefined;
  waitingCount?: number | undefined;
}

export function getServicePoolSnapshot(
  pool: Pick<pg.Pool, 'options'> & ServicePoolCounters,
  max: number,
): ServicePoolSnapshot {
  const total = typeof pool.totalCount === 'number' ? pool.totalCount : 'unknown';
  const idle = typeof pool.idleCount === 'number' ? pool.idleCount : 'unknown';
  const waiting = typeof pool.waitingCount === 'number' ? pool.waitingCount : 'unknown';
  return {
    total,
    idle,
    waiting,
    max,
    saturation: typeof total === 'number' && max > 0 ? total / max : 'unknown',
  };
}

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

  const poolConfig = getServicePoolConfig(config);

  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ...poolConfig,
  });

  // Log pool errors
  pool.on('error', (err) => {
    console.error(`[${config.serviceName}] Unexpected database pool error:`, err);
  });

  return {
    pool,

    getPoolSnapshot() {
      return getServicePoolSnapshot(pool, poolConfig.max);
    },

    async healthCheck(): Promise<ServiceDatabaseHealth> {
      const startedAt = Date.now();
      try {
        const client = await pool.connect();
        try {
          await client.query('SELECT 1');
          return {
            status: 'healthy',
            latencyMs: Date.now() - startedAt,
            pool: getServicePoolSnapshot(pool, poolConfig.max),
          };
        } finally {
          client.release();
        }
      } catch (error) {
        console.error(`[${config.serviceName}] Database health check failed:`, error);
        return {
          status: 'unhealthy',
          latencyMs: Date.now() - startedAt,
          pool: getServicePoolSnapshot(pool, poolConfig.max),
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },

    async close(): Promise<void> {
      await pool.end();
    },
  };
}

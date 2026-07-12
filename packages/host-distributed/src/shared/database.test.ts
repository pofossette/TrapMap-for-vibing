import { describe, expect, it } from 'vitest';

import {
  assertDistributedConnectionBudget,
  getDistributedConnectionBudgetSnapshot,
  loadServiceConfig,
} from '../config/index.js';
import { createServiceDatabase, getServicePoolConfig } from './database.js';

describe('distributed database pool configuration', () => {
  it('maps service config into bounded PostgreSQL pool timeouts', () => {
    const config = loadServiceConfig('knowledge-read');
    const poolConfig = getServicePoolConfig(config);

    expect(poolConfig).toMatchObject({
      max: config.poolSize,
      idleTimeoutMillis: config.idleTimeoutMs,
      connectionTimeoutMillis: config.connectionTimeoutMs,
      statement_timeout: config.statementTimeoutMs,
      query_timeout: config.queryTimeoutMs,
      idle_in_transaction_session_timeout: config.idleInTransactionTimeoutMs,
    });
  });

  it('keeps a service pool health snapshot bounded to pool counters', async () => {
    const config = loadServiceConfig('knowledge-read');
    const pool = {
      totalCount: 3,
      idleCount: 1,
      waitingCount: 2,
      options: { max: config.poolSize },
    } as never;

    const snapshot = {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount,
      max: pool.options.max,
    };

    expect(snapshot).toEqual({ total: 3, idle: 1, waiting: 2, max: config.poolSize });
  });

  it('reports total configured service pools against the shared budget', () => {
    const previous = { ...process.env };
    process.env.TRAPMAP_SERVICE_POOL_SIZE = '4';
    process.env.TRAPMAP_DATABASE_CONNECTION_BUDGET = '20';

    const snapshot = getDistributedConnectionBudgetSnapshot();

    process.env = previous;
    expect(snapshot).toEqual({ configured: 24, budget: 20, withinBudget: false });
  });

  it('rejects a distributed startup that exceeds the shared connection budget', () => {
    const previous = { ...process.env };
    process.env.TRAPMAP_SERVICE_POOL_SIZE = '4';
    process.env.TRAPMAP_DATABASE_CONNECTION_BUDGET = '20';

    expect(() => assertDistributedConnectionBudget()).toThrow(/connection budget/i);

    process.env = previous;
  });

  it('reports a failed database health probe with its pool diagnostics', async () => {
    const previous = { ...process.env };
    process.env.TRAPMAP_SERVICE_DATABASE_URL = 'postgres://trapmap:test@localhost:5432/trapmap';

    const database = createServiceDatabase(loadServiceConfig('knowledge-write'));
    const connect = database.pool.connect.bind(database.pool);
    database.pool.connect = async () => {
      throw new Error('connection timeout');
    };

    await expect(database.healthCheck()).resolves.toMatchObject({
      status: 'unhealthy',
      error: 'connection timeout',
      pool: { max: 5 },
    });

    database.pool.connect = connect;
    await database.close();
    process.env = previous;
  });
});

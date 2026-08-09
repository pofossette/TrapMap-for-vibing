/**
 * retrieval --runner promptfoo parity test (PostgreSQL-backed).
 *
 * Retrieval execution drives the real composed server (adapters require
 * TRAPMAP_DATABASE_URL). This test provisions a temporary database from
 * TRAPMAP_POSTGRES_COORDINATOR_URL (same mechanism as run-postgres-coordinated),
 * runs the six owner migrations, then compares native `executeRetrievalCase`
 * per-case results against the promptfoo bridge. Skips when the coordinator URL
 * is absent.
 */

import { randomUUID } from 'node:crypto';

import pg from 'pg';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';

import { runCandidateIngestionMigrations } from '../../packages/service-candidate-ingestion/src/migrations.js';
import { runGovernanceReviewMigrations } from '../../packages/service-governance-review/src/migrations.js';
import { runIdentityAccessMigrations } from '../../packages/service-identity-access/src/migrations.js';
import { runJobRuntimeMigrations } from '../../packages/service-job-runtime/src/migrations.js';
import { runKnowledgeReadMigrations } from '../../packages/service-knowledge-read/src/migrations.js';
import { runKnowledgeWriteMigrations } from '../../packages/service-knowledge-write/src/migrations.js';

import { executeRetrievalCase } from '../retrieval/lib/execute-case.js';
import { getRetrievalEvaluationCases } from '../retrieval/lib/runner-api.js';
import type { CaseResult } from '../retrieval/lib/types.js';
import { retrievalBridge } from '../retrieval/bridge.js';
import { runSuiteWithPromptfoo } from './runner.js';
import type { SuiteRunOptions } from './types.js';

const migrations = [
  runIdentityAccessMigrations,
  runKnowledgeWriteMigrations,
  runCandidateIngestionMigrations,
  runGovernanceReviewMigrations,
  runJobRuntimeMigrations,
  runKnowledgeReadMigrations,
] as const;

const coordinatorUrl = process.env.TRAPMAP_POSTGRES_COORDINATOR_URL;
const databaseName = `trapmap_parity_${randomUUID().replace(/-/g, '')}`;
let databaseUrl: string | undefined;

function databaseUrlFromAdmin(adminUrl: string, name: string): string {
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

async function provision(): Promise<void> {
  if (!coordinatorUrl) throw new Error('TRAPMAP_POSTGRES_COORDINATOR_URL is required');

  const adminPool = new pg.Pool({ connectionString: coordinatorUrl });
  try {
    await adminPool.query(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await adminPool.end();
  }

  databaseUrl = databaseUrlFromAdmin(coordinatorUrl, databaseName);
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    for (const migrate of migrations) await migrate(pool);
    const extension = await pool.query("SELECT extname FROM pg_extension WHERE extname = 'vector'");
    if (extension.rowCount !== 1) {
      throw new Error('temporary database is missing the vector extension');
    }
  } finally {
    await pool.end();
  }
  process.env.TRAPMAP_DATABASE_URL = databaseUrl;
}

async function teardown(): Promise<void> {
  if (!coordinatorUrl || !databaseUrl) return;
  const adminPool = new pg.Pool({ connectionString: coordinatorUrl });
  try {
    await adminPool.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1',
      [databaseName],
    );
    await adminPool.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
  } finally {
    await adminPool.end();
  }
}

describe.skipIf(!coordinatorUrl)('retrieval --runner promptfoo parity (PostgreSQL)', () => {
  beforeAll(async () => {
    await provision();
  });

  afterAll(async () => {
    await teardown();
  });

  it('matches native per-case passed, metrics, and governance failures', async () => {
    const cases = getRetrievalEvaluationCases('smoke');
    expect(cases.length).toBeGreaterThan(0);

    const native: CaseResult[] = [];
    for (const case_ of cases) {
      native.push(await executeRetrievalCase(case_));
    }

    const opts: SuiteRunOptions = {
      tier: 'smoke',
      dryRun: false,
      allowEmpty: false,
      runner: 'promptfoo',
    };
    const pf = await runSuiteWithPromptfoo(retrievalBridge, opts);

    expect(pf.caseCount).toBe(native.length);
    // The assertion mapping drives `pf.passed`; exercise it directly.
    expect(pf.passed).toBe(native.every((r) => r.passed));

    const nativeByCaseId = new Map(native.map((r) => [r.case.caseId, r]));
    for (const pfCase of pf.report.caseResults) {
      const nativeCase = nativeByCaseId.get(pfCase.case.caseId);
      expect(nativeCase).toBeDefined();
      expect(pfCase.passed).toBe(nativeCase!.passed);
      expect(pfCase.metrics.hitAt1).toBe(nativeCase!.metrics.hitAt1);
      expect(pfCase.metrics.hitAt5).toBe(nativeCase!.metrics.hitAt5);
      expect(pfCase.metrics.mrr).toBe(nativeCase!.metrics.mrr);
      expect(pfCase.metrics.ndcg).toBe(nativeCase!.metrics.ndcg);
      expect(pfCase.metrics.recallAt10).toBe(nativeCase!.metrics.recallAt10);
      expect(pfCase.governance.failures).toEqual(nativeCase!.governance.failures);
    }
  });
});

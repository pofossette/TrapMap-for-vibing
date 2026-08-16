import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import pg from 'pg';

import { runCandidateIngestionMigrations } from '../packages/service-candidate-ingestion/src/migrations.js';
import { runGovernanceReviewMigrations } from '../packages/service-governance-review/src/migrations.js';
import { runIdentityAccessMigrations } from '../packages/service-identity-access/src/migrations.js';
import { runJobRuntimeMigrations } from '../packages/service-job-runtime/src/migrations.js';
import { runKnowledgeReadMigrations } from '../packages/service-knowledge-read/src/migrations.js';
import { runKnowledgeWriteMigrations } from '../packages/service-knowledge-write/src/migrations.js';

const migrations = [
  runIdentityAccessMigrations,
  runKnowledgeWriteMigrations,
  runCandidateIngestionMigrations,
  runGovernanceReviewMigrations,
  runJobRuntimeMigrations,
  runKnowledgeReadMigrations,
] as const;

function run(command: string, args: string[], environment = process.env): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', env: environment });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code ?? 'unknown'}`));
    });
  });
}

async function commandOutput(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`${command} ${args.join(' ')} failed: ${stderr.trim()}`));
    });
  });
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

async function waitForDatabase(databaseUrl: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const pool = new pg.Pool({ connectionString: databaseUrl });
    try {
      await pool.query('SELECT 1');
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    } finally {
      await pool.end().catch(() => undefined);
    }
  }
  throw new Error(`temporary PostgreSQL coordinator did not become ready: ${String(lastError)}`);
}

interface PostgresCoordinatorConfig {
  adminUrl: string;
  containerName?: string;
}

export function resolvePostgresCoordinatorConfig(
  environment: NodeJS.ProcessEnv = process.env,
): PostgresCoordinatorConfig | undefined {
  const configuredUrl = environment.TRAPMAP_POSTGRES_COORDINATOR_URL;
  if (!configuredUrl) return undefined;

  const url = new URL(configuredUrl);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('TRAPMAP_POSTGRES_COORDINATOR_URL must use a PostgreSQL URL');
  }
  if (url.pathname === '/' || url.pathname === '') {
    throw new Error('TRAPMAP_POSTGRES_COORDINATOR_URL must name an admin database');
  }

  return { adminUrl: url.toString() };
}

function databaseUrlFromAdminUrl(adminUrl: string, databaseName: string): string {
  const url = new URL(adminUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

async function main(): Promise<void> {
  const separator = process.argv.indexOf('--');
  const command = separator >= 0 ? process.argv.slice(separator + 1) : [];
  if (command.length === 0) {
    throw new Error('Usage: run-postgres-coordinated.ts -- <command> [args...]');
  }

  const databaseName = `trapmap_wave1_${randomUUID().replaceAll('-', '')}`;
  let coordinator = resolvePostgresCoordinatorConfig();
  let databasePool: pg.Pool | undefined;

  try {
    if (!coordinator) {
      const containerName = `trapmap-wave1-${randomUUID().replaceAll('-', '')}`;
      await run('docker', [
        'run',
        '--detach',
        '--rm',
        '--name',
        containerName,
        '--env',
        'POSTGRES_USER=trapmap',
        '--env',
        'POSTGRES_PASSWORD=trapmap',
        '--env',
        'POSTGRES_DB=postgres',
        '--publish',
        '127.0.0.1::5432',
        'pgvector/pgvector:pg16',
      ]);
      const port = (await commandOutput('docker', ['port', containerName, '5432/tcp']))
        .split('\n')[0]
        ?.trim()
        .match(/:(\d+)$/)?.[1];
      if (!port) throw new Error('temporary PostgreSQL container did not expose port 5432');

      coordinator = {
        adminUrl: `postgres://trapmap:trapmap@127.0.0.1:${port}/postgres`,
        containerName,
      };
    }

    await waitForDatabase(coordinator.adminUrl);
    const adminPool = new pg.Pool({ connectionString: coordinator.adminUrl });
    try {
      await adminPool.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
    } finally {
      await adminPool.end();
    }

    const databaseUrl = databaseUrlFromAdminUrl(coordinator.adminUrl, databaseName);
    databasePool = new pg.Pool({ connectionString: databaseUrl });
    // pgvector image ships the extension at cluster level; newly created
    // eval databases must enable it explicitly (pre-existing infra gap that
    // blocked eval:smoke for every temp database).
    await databasePool.query('CREATE EXTENSION IF NOT EXISTS vector');
    for (const migrate of migrations) await migrate(databasePool);
    const extension = await databasePool.query(
      "SELECT extname FROM pg_extension WHERE extname = 'vector'",
    );
    if (extension.rowCount !== 1) {
      throw new Error('temporary PostgreSQL database is missing the vector extension');
    }
    await databasePool.end();
    databasePool = undefined;

    await run(command[0]!, command.slice(1), {
      ...process.env,
      TRAPMAP_DATABASE_URL: databaseUrl,
      VITEST_MAX_WORKERS: '1',
      VITEST_MIN_WORKERS: '1',
    });
  } finally {
    await databasePool?.end().catch(() => undefined);
    if (coordinator) {
      const adminPool = new pg.Pool({ connectionString: coordinator.adminUrl });
      try {
        await adminPool.query(
          'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1',
          [databaseName],
        );
        await adminPool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`);
      } finally {
        await adminPool.end().catch(() => undefined);
      }
    }
    if (coordinator?.containerName) {
      await run('docker', ['rm', '--force', coordinator.containerName]).catch(() => undefined);
    }
  }
}

const isDirectExecution = process.argv[1]?.endsWith('run-postgres-coordinated.ts');

if (isDirectExecution) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

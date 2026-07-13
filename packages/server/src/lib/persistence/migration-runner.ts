import path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Pool } from 'pg';

import {
  assertDrizzleJournalComplete,
  assertMigrationManifestComplete,
} from './migration-ownership.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_LOCK_KEY = 42187319;

interface DrizzleJournal {
  entries: Array<{
    tag: string;
  }>;
}

export async function runMigrations(pool: Pool): Promise<void> {
  const migrationsFolder = path.resolve(__dirname, '../../../drizzle');
  const migrationFiles = (await readdir(migrationsFolder)).filter((file) => file.endsWith('.sql'));
  assertMigrationManifestComplete(migrationFiles);
  const journal = JSON.parse(
    await readFile(path.join(migrationsFolder, 'meta', '_journal.json'), 'utf8'),
  ) as DrizzleJournal;
  assertDrizzleJournalComplete(
    migrationFiles,
    journal.entries.map((entry) => entry.tag),
  );

  try {
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
  } catch (error) {
    console.warn(
      '[MigrationRunner] Could not enable pgvector extension:',
      error instanceof Error ? error.message : String(error),
    );
  }

  await withMigrationLock(pool, async () => {
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder });
    await runCompatibilityOperations(pool);
  });

  console.log('[MigrationRunner] Migrations applied successfully');
}

async function runCompatibilityOperations(pool: Pool): Promise<void> {
  await ensureLeaseColumns(pool);
  await ensureSystemAdminUser(pool);
}

async function withMigrationLock(pool: Pool, operation: () => Promise<void>): Promise<void> {
  await pool.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
  try {
    await operation();
  } finally {
    await pool.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
  }
}

async function ensureLeaseColumns(pool: Pool): Promise<void> {
  // Compatibility guard for databases that recorded later migrations while
  // 0015_phase0_atomic_delivery_and_leases was absent from the Drizzle journal.
  await pool.query(`
    ALTER TABLE "task_queue"
      ADD COLUMN IF NOT EXISTS "worker_id" TEXT,
      ADD COLUMN IF NOT EXISTS "started_at" TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS "heartbeat_at" TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS "lease_until" TIMESTAMPTZ;

    CREATE INDEX IF NOT EXISTS "task_queue_running_lease_idx"
    ON "task_queue" ("type", "lease_until", "updated_at")
    WHERE "status" = 'running';

    ALTER TABLE "domain_event_outbox"
      ADD COLUMN IF NOT EXISTS "worker_id" TEXT,
      ADD COLUMN IF NOT EXISTS "started_at" TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS "heartbeat_at" TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS "lease_until" TIMESTAMPTZ;

    CREATE INDEX IF NOT EXISTS "domain_event_outbox_processing_lease_idx"
    ON "domain_event_outbox" ("event_name", "lease_until", "created_at")
    WHERE "status" = 'processing';
  `);
}

async function ensureSystemAdminUser(pool: Pool): Promise<void> {
  // Access keys issued by the virtual system-admin still satisfy the
  // access_keys.issued_by_user_id FK in PostgreSQL-backed deployments.
  await pool.query(`
    INSERT INTO "users" ("id", "handle", "notes", "created_at", "updated_at")
    VALUES ('system-admin', 'system-admin', 'Virtual system administrator account', NOW(), NOW())
    ON CONFLICT ("id") DO UPDATE
    SET "handle" = EXCLUDED."handle",
        "notes" = COALESCE("users"."notes", EXCLUDED."notes"),
        "updated_at" = NOW();
  `);
}

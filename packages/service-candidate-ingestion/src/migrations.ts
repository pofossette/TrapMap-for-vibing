import type { Pool } from 'pg';
import { runMigrations } from '@trapmap/db';

/** @deprecated Per-owner 0000 versioned migrations removed. Delegates to @trapmap/db runMigrations. */
export async function assertCandidateIngestionMigrationSet(): Promise<void> {
  return;
}

export async function runCandidateIngestionMigrations(pool: Pool): Promise<void> {
  await runMigrations(pool);
}

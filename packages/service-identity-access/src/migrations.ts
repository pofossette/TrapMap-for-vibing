import { runMigrations } from '@trapmap/db';
import type { Pool } from 'pg';

/** @deprecated Per-owner 0000 versioned migrations removed. Delegates to @trapmap/db runMigrations. */
export async function assertIdentityAccessMigrationSet(): Promise<void> {
  return;
}

export async function runIdentityAccessMigrations(pool: Pool): Promise<void> {
  await runMigrations(pool);
}

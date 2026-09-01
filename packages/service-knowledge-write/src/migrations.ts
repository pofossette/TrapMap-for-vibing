import { runMigrations } from '@trapmap/db';
import type { Pool } from 'pg';

/** @deprecated Per-owner 0000 versioned migrations removed. Delegates to @trapmap/db runMigrations. */
export async function assertKnowledgeWriteMigrationSet(): Promise<void> {
  return;
}

export async function runKnowledgeWriteMigrations(pool: Pool): Promise<void> {
  await runMigrations(pool);
}

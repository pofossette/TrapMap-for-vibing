import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';

const schemaSqlPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../migrations/schema.sql',
);

export async function runMigrations(pool: Pool, sqlPath: string = schemaSqlPath): Promise<void> {
  const sql = await readFile(sqlPath, 'utf8');
  if (!sql.trim()) {
    throw new Error(`schema.sql not found or empty at ${sqlPath}`);
  }
  // Split by drizzle's statement-breakpoint marker and by semicolon boundaries.
  // The file contains "--> statement-breakpoint" markers between statements.
  const statements = sql
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    // Further split any chunk that still contains multiple statements separated by semicolons
    // but keep the semicolon with the statement.
    .flatMap((chunk) => {
      // If chunk already contains a single statement (ends with ;), keep as is.
      // Otherwise, split by ; and re-add it.
      const parts = chunk
        .split(';')
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
      if (parts.length <= 1) return [chunk];
      return parts.map((p) => (p.endsWith(';') ? p : `${p};`));
    })
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    if (!statement) continue;
    // Skip empty or comment-only chunks
    const trimmed = statement.trim();
    if (!trimmed || trimmed.startsWith('--')) {
      // If it's just a comment, still try to execute the next real statement
      // Check if there's actual SQL after comment lines
      const lines = trimmed
        .split('\n')
        .filter((l) => !l.trim().startsWith('--') && l.trim().length > 0);
      if (lines.length === 0) continue;
    }
    try {
      await pool.query(statement);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Ignore "already exists" errors for idempotent re-runs
      if (
        message.includes('already exists') ||
        message.includes('duplicate key') ||
        message.includes('duplicate_object')
      ) {
        continue;
      }
      throw error;
    }
  }
}

// Backwards compat for per-service wrappers
export const runDbMigrations = runMigrations;

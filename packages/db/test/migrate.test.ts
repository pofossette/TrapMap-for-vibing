import { describe, expect, it, vi } from 'vitest';
import { runMigrations } from '../src/migrate.js';

describe('runMigrations', () => {
  it('executes schema.sql via pool.query with splitting', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as any;
    // Create a temp sql file with two statements separated by breakpoint
    const { writeFile, unlink } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const tmpPath = join(tmpdir(), `test-schema-${Date.now()}.sql`);
    await writeFile(
      tmpPath,
      'CREATE TABLE IF NOT EXISTS "test_a" ("id" text PRIMARY KEY);\n--> statement-breakpoint\nCREATE TABLE IF NOT EXISTS "test_b" ("id" text PRIMARY KEY);',
      'utf8',
    );
    await runMigrations(pool, tmpPath);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain('test_a');
    expect(query.mock.calls[1][0]).toContain('test_b');
    await unlink(tmpPath);
  });

  it('is idempotent (ignores already exists errors)', async () => {
    const query = vi
      .fn()
      .mockRejectedValueOnce(new Error('relation "test_a" already exists'))
      .mockResolvedValue({ rows: [] });
    const pool = { query } as any;
    const { writeFile, unlink } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const tmpPath = join(tmpdir(), `test-schema2-${Date.now()}.sql`);
    await writeFile(
      tmpPath,
      'CREATE TABLE IF NOT EXISTS "test_a" ("id" text PRIMARY KEY);',
      'utf8',
    );
    // Should not throw despite first call failing with already exists
    await expect(runMigrations(pool, tmpPath)).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(1);
    await unlink(tmpPath);
  });

  it('throws on non-idempotent errors', async () => {
    const query = vi.fn().mockRejectedValue(new Error('syntax error at or near'));
    const pool = { query } as any;
    const { writeFile, unlink } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const tmpPath = join(tmpdir(), `test-schema3-${Date.now()}.sql`);
    await writeFile(tmpPath, 'CREATE TABLE "bad" ("id" text);', 'utf8');
    await expect(runMigrations(pool, tmpPath)).rejects.toThrow('syntax error');
    await unlink(tmpPath);
  });
});

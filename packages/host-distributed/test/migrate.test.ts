import { describe, expect, it, vi } from 'vitest';

import { createDistributedMigrationRunner, runDistributedMigrations } from '../src/migrate.js';

describe('runDistributedMigrations', () => {
  it('closes its migration pool after a successful run', async () => {
    const end = vi.fn(async () => undefined);
    const migrate = vi.fn(async () => undefined);
    const previous = process.env.TRAPMAP_DATABASE_URL;
    process.env.TRAPMAP_DATABASE_URL = 'postgres://trapmap:test@localhost/trapmap';

    const run = createDistributedMigrationRunner({
      createPool: () => ({ end, query: vi.fn() }),
      runners: [migrate],
    });
    await run();

    expect(migrate).toHaveBeenCalledOnce();
    expect(end).toHaveBeenCalledOnce();
    if (previous === undefined) process.env.TRAPMAP_DATABASE_URL = undefined;
    else process.env.TRAPMAP_DATABASE_URL = previous;
  });

  it('closes its migration pool when migration fails', async () => {
    const end = vi.fn(async () => undefined);
    const previous = process.env.TRAPMAP_DATABASE_URL;
    process.env.TRAPMAP_DATABASE_URL = 'postgres://trapmap:test@localhost/trapmap';

    await expect(
      createDistributedMigrationRunner({
        createPool: () => ({ end, query: vi.fn() }),
        runners: [
          async () => {
            throw new Error('migration failed');
          },
        ],
      })(),
    ).rejects.toThrow('migration failed');
    expect(end).toHaveBeenCalledOnce();
    if (previous === undefined) process.env.TRAPMAP_DATABASE_URL = undefined;
    else process.env.TRAPMAP_DATABASE_URL = previous;
  });

  it('runs owner migrations in dependency order and stops at the first failure', async () => {
    const end = vi.fn(async () => undefined);
    const calls: string[] = [];
    const previous = process.env.TRAPMAP_DATABASE_URL;
    process.env.TRAPMAP_DATABASE_URL = 'postgres://trapmap:test@localhost/trapmap';

    await expect(
      createDistributedMigrationRunner({
        createPool: () => ({ end, query: vi.fn() }),
        runners: [
          async () => calls.push('identity-access'),
          async () => {
            calls.push('knowledge-write');
            throw new Error('owner failed');
          },
          async () => calls.push('candidate-ingestion'),
        ],
      })(),
    ).rejects.toThrow('owner failed');

    expect(calls).toEqual(['identity-access', 'knowledge-write']);
    expect(end).toHaveBeenCalledOnce();
    if (previous === undefined) process.env.TRAPMAP_DATABASE_URL = undefined;
    else process.env.TRAPMAP_DATABASE_URL = previous;
  });
});

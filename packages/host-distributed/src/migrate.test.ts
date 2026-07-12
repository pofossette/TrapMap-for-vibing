import { describe, expect, it, vi } from 'vitest';

import { runDistributedMigrations } from './migrate.js';

describe('runDistributedMigrations', () => {
  it('closes its migration pool after a successful run', async () => {
    const end = vi.fn(async () => undefined);
    const migrate = vi.fn(async () => undefined);
    const previous = process.env.TRAPMAP_DATABASE_URL;
    process.env.TRAPMAP_DATABASE_URL = 'postgres://trapmap:test@localhost/trapmap';

    await runDistributedMigrations(() => ({ end, query: vi.fn() }), migrate);

    expect(migrate).toHaveBeenCalledOnce();
    expect(end).toHaveBeenCalledOnce();
    if (previous === undefined) delete process.env.TRAPMAP_DATABASE_URL;
    else process.env.TRAPMAP_DATABASE_URL = previous;
  });

  it('closes its migration pool when migration fails', async () => {
    const end = vi.fn(async () => undefined);
    const previous = process.env.TRAPMAP_DATABASE_URL;
    process.env.TRAPMAP_DATABASE_URL = 'postgres://trapmap:test@localhost/trapmap';

    await expect(
      runDistributedMigrations(
        () => ({ end, query: vi.fn() }),
        async () => {
          throw new Error('migration failed');
        },
      ),
    ).rejects.toThrow('migration failed');
    expect(end).toHaveBeenCalledOnce();
    if (previous === undefined) delete process.env.TRAPMAP_DATABASE_URL;
    else process.env.TRAPMAP_DATABASE_URL = previous;
  });
});

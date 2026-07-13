import { describe, expect, it, vi } from 'vitest';

import { createIdentityAccessPgDeps } from './pg-ports.js';
import { createIdentityAccessServiceModule } from './deps.js';

describe('identity PostgreSQL ports', () => {
  it('builds a login-capable identity module from an owner-local pool', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM users WHERE handle')) {
        return { rows: [{ id: 'user_1', handle: 'alice', notes: null }] };
      }
      if (sql.includes("nextval('session_id_seq')")) return { rows: [{ nextval: '7' }] };
      return { rows: [] };
    });
    const module = createIdentityAccessServiceModule(
      createIdentityAccessPgDeps({ query } as never, { systemAdminKey: 'admin-key' }),
    );

    await expect(module.login('alice', 'secret')).resolves.toMatchObject({
      userId: 'user_1',
      handle: 'alice',
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO sessions'),
      expect.any(Array),
    );
  });
});

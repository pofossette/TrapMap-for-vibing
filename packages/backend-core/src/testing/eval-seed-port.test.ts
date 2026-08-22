import { describe, expect, it } from 'vitest';
import type { EvalSeedPort } from './eval-seed-port.js';

describe('EvalSeedPort contract', () => {
  it('accepts a structural minimal implementation', async () => {
    const port: EvalSeedPort = {
      store: { getPool: () => ({}) },
      identity: {
        userRepo: { getById: async () => null, insert: async () => undefined },
        sessionRepo: {},
        teamRepo: {},
        membershipRepo: {},
      },
      graphIndex: { upsert: async () => undefined },
      graphQueryBackend: { isEnabled: () => false, rebuildProjection: async () => undefined },
    };
    expect(port.store.getPool()).toBeDefined();
    expect(await port.identity.userRepo.getById('x')).toBeNull();
  });
});

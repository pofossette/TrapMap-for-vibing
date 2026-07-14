import { beforeEach, describe, expect, it, vi } from 'vitest';

const pool = { query: vi.fn() };
const ownerBundle = { knowledgeRepo: { nextId: vi.fn() } };
const sharedInfra = {
  store: { kind: 'postgres' },
  adapterRegistry: {},
  ai: {},
  repos: {
    knowledge: { nextId: vi.fn() },
    artifact: {},
    usageAnalytics: {},
  },
  graphQueryBackend: {},
  graphQuery: {},
  eventBus: {},
};

vi.mock('@trapmap/runtime-infra', () => ({
  getStorePool: vi.fn(() => pool),
}));
vi.mock('@trapmap/service-identity-access', () => ({
  createIdentityAccessPgDeps: vi.fn(() => ({ auditLog: {} })),
}));
vi.mock('@trapmap/service-knowledge-write', () => ({
  createKnowledgeWriteOwnerBundle: vi.fn(() => ownerBundle),
}));
vi.mock('./shared-infra.js', () => ({
  createHostLocalSharedInfra: vi.fn(async () => sharedInfra),
}));
vi.mock('./runtime-deployment.js', () => ({
  resolveHostLocalDeployment: vi.fn(() => ({ runtimeMode: 'embedded', serviceUnit: 'host-local' })),
}));
vi.mock('./retrieval-assembly.js', () => ({
  createHostLocalChannelRegistry: vi.fn(() => ({})),
  createHostLocalStrategyRegistry: vi.fn(() => ({})),
}));

import { createKnowledgeWriteOwnerBundle } from '@trapmap/service-knowledge-write';

import { createHostLocalServices } from './host-services.js';

describe('host-local service composition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('injects the knowledge-write owner bundle from the host PostgreSQL pool', async () => {
    const services = await createHostLocalServices({ systemAdminKey: 'test-key' } as never);

    expect(createKnowledgeWriteOwnerBundle).toHaveBeenCalledWith(pool);
    expect(services.knowledgeWrite).toBe(ownerBundle);
    expect(services.knowledgeWrite.knowledgeRepo).not.toBe(sharedInfra.repos.knowledge);
  });
});

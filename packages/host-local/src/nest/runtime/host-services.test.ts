import { beforeEach, describe, expect, it, vi } from 'vitest';

const pool = { query: vi.fn() };
const ownerBundle = {
  knowledgeOwner: { getById: vi.fn() },
  artifactWriter: { insert: vi.fn() },
  artifactReadProjection: { getById: vi.fn() },
};
const candidateIngestionBundle = {
  candidateRepo: { getById: vi.fn() },
  duplicateCases: {},
  resolutionOutcomes: {},
  lineage: {},
};
const sharedInfra = {
  store: { kind: 'postgres', close: vi.fn() },
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
const asyncTransport = { task: {}, events: {} };
const ownerReadModelProjection = { getReadModel: vi.fn() };
const graphIndexRepository = { listAll: vi.fn(), upsert: vi.fn() };

vi.mock('@trapmap/service-identity-access', () => ({
  createIdentityAccessPgDeps: vi.fn(() => ({ auditLog: {} })),
}));
vi.mock('@trapmap/service-candidate-ingestion', () => ({
  createCandidateIngestionPgOwnerBundle: vi.fn(() => candidateIngestionBundle),
}));
vi.mock('@trapmap/service-knowledge-write', () => ({
  createKnowledgeWriteOwnerBundle: vi.fn(() => ownerBundle),
}));
vi.mock('@trapmap/service-job-runtime', () => ({
  createJobRuntimeAsyncTransport: vi.fn(() => asyncTransport),
}));
vi.mock('@trapmap/service-knowledge-read', () => ({
  createCandidateCorpusPgReadPort: vi.fn(() => ({})),
  createKnowledgeReadGraphIndexRepository: vi.fn(() => graphIndexRepository),
  createOwnerReadModelProjection: vi.fn(() => ownerReadModelProjection),
}));
vi.mock('./shared-infra.js', () => ({
  createHostLocalSharedInfra: vi.fn(async () => sharedInfra),
}));
vi.mock('./store-pool.js', () => ({
  getHostLocalStorePool: vi.fn(() => pool),
}));
vi.mock('./runtime-deployment.js', () => ({
  resolveHostLocalDeployment: vi.fn(() => ({ runtimeMode: 'embedded', serviceUnit: 'host-local' })),
}));
vi.mock('./retrieval-assembly.js', () => ({
  createHostLocalChannelRegistry: vi.fn(() => ({})),
  createHostLocalStrategyRegistry: vi.fn(() => ({})),
}));

import { createCandidateIngestionPgOwnerBundle } from '@trapmap/service-candidate-ingestion';
import { createJobRuntimeAsyncTransport } from '@trapmap/service-job-runtime';
import { createOwnerReadModelProjection } from '@trapmap/service-knowledge-read';
import { createKnowledgeReadGraphIndexRepository } from '@trapmap/service-knowledge-read';
import { createKnowledgeWriteOwnerBundle } from '@trapmap/service-knowledge-write';

import type { HostLocalConfig } from '../config/index.js';
import { createHostLocalServices } from './host-services.js';

describe('host-local service composition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('injects the knowledge-write owner bundle from the host PostgreSQL pool', async () => {
    const services = await createHostLocalServices({
      systemAdminKey: 'test-key',
    } as HostLocalConfig);

    expect(createKnowledgeWriteOwnerBundle).toHaveBeenCalledWith(pool);
    expect(createCandidateIngestionPgOwnerBundle).toHaveBeenCalledWith(pool);
    expect(services.candidateIngestion).toBe(candidateIngestionBundle);
    expect(services.knowledgeWrite).toBe(ownerBundle);
    expect(services.knowledgeOwner).toBe(ownerBundle.knowledgeOwner);
    expect(services.artifactWriter).toBe(ownerBundle.artifactWriter);
    expect(services.artifactReadProjection).toBe(ownerBundle.artifactReadProjection);
    expect(services).not.toHaveProperty('artifactRepo');
  });

  it('keeps governance retrieval access on its explicit owner port', async () => {
    const services = await createHostLocalServices({
      systemAdminKey: 'test-key',
    } as HostLocalConfig);

    expect(services.governanceReview.retrievalProjection).toBeDefined();
    expect(services).not.toHaveProperty('adapterRegistry');
    expect(services).not.toHaveProperty('repos');
    expect(services).not.toHaveProperty('usageAnalyticsRepo');
  });

  it('builds the administrative read projection from owner ports', async () => {
    const services = await createHostLocalServices({
      systemAdminKey: 'test-key',
    } as HostLocalConfig);

    expect(createOwnerReadModelProjection).toHaveBeenCalledWith({
      knowledge: ownerBundle.knowledgeOwner,
      artifact: ownerBundle.artifactReadProjection,
      governance: services.governanceReview.retrievalProjection,
    });
    expect(services.ownerReadModel).toBe(ownerReadModelProjection);
  });

  it('creates the graph projection repository through the knowledge-read owner', async () => {
    const services = await createHostLocalServices({
      systemAdminKey: 'test-key',
    } as HostLocalConfig);

    expect(createKnowledgeReadGraphIndexRepository).toHaveBeenCalledWith(pool);
    expect(services.graphIndex).toBe(graphIndexRepository);
  });

  it('composes the async transport through the job-runtime owner', async () => {
    const config = {
      systemAdminKey: 'test-key',
      asyncTaskTransport: { provider: 'postgres', rabbitmq: null },
    } as HostLocalConfig;
    const services = await createHostLocalServices(config);

    expect(createJobRuntimeAsyncTransport).toHaveBeenCalledWith({
      config: { asyncTaskTransport: config.asyncTaskTransport },
      pool,
    });
    expect(services.asyncTransport).toBe(asyncTransport);
  });

  it('releases its host-owned infrastructure through one close operation', async () => {
    const services = await createHostLocalServices({
      systemAdminKey: 'test-key',
    } as HostLocalConfig);

    await services.close();

    expect(sharedInfra.store.close).toHaveBeenCalledTimes(1);
  });
});

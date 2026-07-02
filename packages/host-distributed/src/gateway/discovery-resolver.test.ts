import { describe, expect, it, vi } from 'vitest';
import { DiscoveryResolver } from './discovery-resolver.js';

const noopLogger = {
  warn: vi.fn(),
  debug: vi.fn(),
};

const staticUrls = {
  gateway: 'http://localhost:4000',
  identityAccess: 'http://localhost:4001',
  knowledgeRead: 'http://localhost:4002',
  knowledgeWrite: 'http://localhost:4003',
  candidateIngestion: 'http://localhost:4004',
  review: 'http://localhost:4005',
  governanceReview: 'http://localhost:4005',
  jobRuntime: 'http://localhost:4006',
};

describe('DiscoveryResolver', () => {
  it('returns static URL when no discovery is configured', async () => {
    const resolver = new DiscoveryResolver({
      staticUrls,
      logger: noopLogger,
    });

    const url = await resolver.resolveServiceUrl('identity-access');
    expect(url).toBe('http://localhost:4001');
  });

  it('returns dynamic URL when discovery succeeds', async () => {
    const mockDiscovery = {
      getServiceAddress: vi.fn().mockResolvedValue({
        id: 'ia-1',
        address: '10.0.0.5',
        port: 4001,
      }),
    } as any;

    const resolver = new DiscoveryResolver({
      discovery: mockDiscovery,
      staticUrls,
      logger: noopLogger,
    });

    const url = await resolver.resolveServiceUrl('identity-access');
    expect(url).toBe('http://10.0.0.5:4001');
    expect(mockDiscovery.getServiceAddress).toHaveBeenCalledWith('identity-access');
  });

  it('falls back to static URL when discovery throws', async () => {
    const mockDiscovery = {
      getServiceAddress: vi.fn().mockRejectedValue(new Error('no instances')),
    } as any;

    const resolver = new DiscoveryResolver({
      discovery: mockDiscovery,
      staticUrls,
      logger: noopLogger,
    });

    const url = await resolver.resolveServiceUrl('knowledge-read');
    expect(url).toBe('http://localhost:4002');
    expect(noopLogger.warn).toHaveBeenCalled();
  });

  it('falls back to static URL for governance-review (maps to internalUrls.governanceReview)', async () => {
    const resolver = new DiscoveryResolver({
      staticUrls,
      logger: noopLogger,
    });

    const url = await resolver.resolveServiceUrl('governance-review');
    expect(url).toBe('http://localhost:4005');
  });

  it('returns gateway static URL for unknown service names', async () => {
    const resolver = new DiscoveryResolver({
      staticUrls,
      logger: noopLogger,
    });

    const url = await resolver.resolveServiceUrl('unknown-service');
    expect(url).toBe('http://localhost:4000');
    expect(noopLogger.warn).toHaveBeenCalledWith(expect.stringContaining('unknown service'));
  });

  it('covers all six service name mappings', async () => {
    const resolver = new DiscoveryResolver({
      staticUrls,
      logger: noopLogger,
    });

    const cases: [string, string][] = [
      ['identity-access', 'http://localhost:4001'],
      ['knowledge-read', 'http://localhost:4002'],
      ['knowledge-write', 'http://localhost:4003'],
      ['candidate-ingestion', 'http://localhost:4004'],
      ['governance-review', 'http://localhost:4005'],
      ['job-runtime', 'http://localhost:4006'],
    ];

    for (const [name, expected] of cases) {
      expect(await resolver.resolveServiceUrl(name)).toBe(expected);
    }
  });
});

import { describe, expect, it } from 'vitest';

import { loadServiceConfig } from '../config/index.js';

describe('distributed job-runtime ownership acceptance', () => {
  it('loads job-runtime as a dedicated remote-owned worker service', () => {
    const config = loadServiceConfig('job-runtime');

    expect(config.serviceName).toBe('job-runtime');
    expect(config.port).toBe(4006);
    expect(config.internalUrls.gateway).toBe('http://localhost:4000');
    expect(config.internalUrls.jobRuntime).toBe('http://localhost:4006');
  });

  it('keeps gateway and candidate-worker ownership separated by service config defaults', () => {
    const gateway = loadServiceConfig('gateway');
    const candidateWorker = loadServiceConfig('candidate-ingestion');

    expect(gateway.port).toBe(4000);
    expect(candidateWorker.port).toBe(4004);
    expect(gateway.internalUrls.jobRuntime).toBe(candidateWorker.internalUrls.jobRuntime);
    expect(gateway.internalUrls.candidateIngestion).toBe('http://localhost:4004');
  });
});

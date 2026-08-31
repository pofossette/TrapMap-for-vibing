import { afterEach, describe, expect, it } from 'vitest';

describe('distributed experience gene rollout modes', () => {
  afterEach(() => {
    delete process.env.TRAPMAP_EXPERIENCE_GENE_MODE;
    delete process.env.TRAPMAP_EXPERIENCE_GENES_MODE;
  });

  it('defaults both modes to off and falls back on unknown values', async () => {
    delete process.env.TRAPMAP_EXPERIENCE_GENE_MODE;
    delete process.env.TRAPMAP_EXPERIENCE_GENES_MODE;
    const { loadServiceConfig } = await import('../../src/config/service-config.js');
    expect(loadServiceConfig('gateway').experienceGeneMode).toBe('off');
    expect(loadServiceConfig('gateway').experienceGenesMode).toBe('off');

    process.env.TRAPMAP_EXPERIENCE_GENE_MODE = 'unexpected';
    process.env.TRAPMAP_EXPERIENCE_GENES_MODE = 'bad';
    const fallback = await import('../../src/config/service-config.js').then((m) =>
      m.loadServiceConfig('gateway'),
    );
    // loadServiceConfig reads env at call time, unknown values must fallback to off
    expect(fallback.experienceGeneMode).toBe('off');
    expect(fallback.experienceGenesMode).toBe('off');
  });

  it('parses shadow and serve for both gene mode envs', async () => {
    process.env.TRAPMAP_EXPERIENCE_GENE_MODE = 'shadow';
    process.env.TRAPMAP_EXPERIENCE_GENES_MODE = 'serve';
    const { loadServiceConfig } = await import('../../src/config/service-config.js');
    const cfg = loadServiceConfig('gateway');
    expect(cfg.experienceGeneMode).toBe('shadow');
    expect(cfg.experienceGenesMode).toBe('serve');
  });
});

describe('C5 assertDistributedResilienceConfig', () => {
  it('passes with unset env', async () => {
    const { assertDistributedResilienceConfig } = await import(
      '../../src/config/service-config.js'
    );
    expect(() => assertDistributedResilienceConfig({})).not.toThrow();
  });

  it('passes with valid overrides', async () => {
    const { assertDistributedResilienceConfig } = await import(
      '../../src/config/service-config.js'
    );
    expect(() =>
      assertDistributedResilienceConfig({
        TRAPMAP_INTERNAL_RETRY_MAX_ATTEMPTS: '3',
        TRAPMAP_INTERNAL_BREAKER_THRESHOLD: '2',
        TRAPMAP_INTERNAL_BREAKER_COOLDOWN_MS: '1000',
        TRAPMAP_GATEWAY_RATE_LIMIT_RPS: '25.5',
        TRAPMAP_GATEWAY_RATE_LIMIT_BURST: '10',
      }),
    ).not.toThrow();
  });

  it.each([
    ['TRAPMAP_INTERNAL_RETRY_MAX_ATTEMPTS', '0'],
    ['TRAPMAP_INTERNAL_RETRY_MAX_ATTEMPTS', 'abc'],
    ['TRAPMAP_INTERNAL_BREAKER_THRESHOLD', '-1'],
    ['TRAPMAP_INTERNAL_BREAKER_COOLDOWN_MS', '0'],
    ['TRAPMAP_GATEWAY_RATE_LIMIT_RPS', '-3'],
    ['TRAPMAP_GATEWAY_RATE_LIMIT_BURST', 'NaN'],
  ])('throws on invalid %s=%s', async (name, value) => {
    const { assertDistributedResilienceConfig } = await import(
      '../../src/config/service-config.js'
    );
    expect(() => assertDistributedResilienceConfig({ [name]: value })).toThrow(RangeError);
  });
});

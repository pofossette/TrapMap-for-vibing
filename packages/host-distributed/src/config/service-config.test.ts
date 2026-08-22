import { describe, expect, it } from 'vitest';

describe('C5 assertDistributedResilienceConfig', () => {
  it('passes with unset env', async () => {
    const { assertDistributedResilienceConfig } = await import('./service-config.js');
    expect(() => assertDistributedResilienceConfig({})).not.toThrow();
  });

  it('passes with valid overrides', async () => {
    const { assertDistributedResilienceConfig } = await import('./service-config.js');
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
    const { assertDistributedResilienceConfig } = await import('./service-config.js');
    expect(() => assertDistributedResilienceConfig({ [name]: value })).toThrow(RangeError);
  });
});

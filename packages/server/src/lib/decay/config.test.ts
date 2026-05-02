import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadDecayConfig } from './config.js';

describe('loadDecayConfig', () => {
  const ENV_VARS = {
    reviewDueDays: 'TRAPMAP_DECAY_REVIEW_DUE_DAYS',
    staleDays: 'TRAPMAP_DECAY_STALE_DAYS',
    expireDays: 'TRAPMAP_DECAY_EXPIRE_DAYS',
    enabled: 'TRAPMAP_DECAY_ENABLED',
  } as const;

  // Preserve original env vars
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Save and clear all decay env vars
    for (const key of Object.values(ENV_VARS)) {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    // Restore original env vars
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('returns defaults when no env vars set', () => {
    const config = loadDecayConfig();
    expect(config).toEqual({
      reviewDueDays: 90,
      staleDays: 180,
      expireDays: 365,
      enabled: false,
    });
  });

  it('reads custom values from env vars', () => {
    process.env[ENV_VARS.reviewDueDays] = '45';
    process.env[ENV_VARS.staleDays] = '120';
    process.env[ENV_VARS.expireDays] = '200';
    process.env[ENV_VARS.enabled] = 'true';

    const config = loadDecayConfig();
    expect(config).toEqual({
      reviewDueDays: 45,
      staleDays: 120,
      expireDays: 200,
      enabled: true,
    });
  });

  it('rejects out-of-range day values (too low)', () => {
    process.env[ENV_VARS.expireDays] = '0';
    expect(() => loadDecayConfig()).toThrow();
  });

  it('rejects out-of-range day values (too high)', () => {
    process.env[ENV_VARS.reviewDueDays] = '9999';
    expect(() => loadDecayConfig()).toThrow();
  });

  it('rejects negative day values', () => {
    process.env[ENV_VARS.staleDays] = '-10';
    expect(() => loadDecayConfig()).toThrow();
  });

  it('rejects non-numeric day values', () => {
    process.env[ENV_VARS.reviewDueDays] = 'not-a-number';
    expect(() => loadDecayConfig()).toThrow();
  });

  it('parses enabled flag as true when "true"', () => {
    process.env[ENV_VARS.enabled] = 'true';
    const config = loadDecayConfig();
    expect(config.enabled).toBe(true);
  });

  it('parses enabled flag as false when not "true"', () => {
    process.env[ENV_VARS.enabled] = 'false';
    const config = loadDecayConfig();
    expect(config.enabled).toBe(false);

    process.env[ENV_VARS.enabled] = 'yes';
    const config2 = loadDecayConfig();
    expect(config2.enabled).toBe(false);
  });

  it('enabled defaults to false when env var absent', () => {
    const config = loadDecayConfig();
    expect(config.enabled).toBe(false);
  });

  it('accepts minimum valid day threshold (1)', () => {
    process.env[ENV_VARS.reviewDueDays] = '1';
    const config = loadDecayConfig();
    expect(config.reviewDueDays).toBe(1);
  });

  it('accepts maximum valid day threshold (3650)', () => {
    process.env[ENV_VARS.expireDays] = '3650';
    const config = loadDecayConfig();
    expect(config.expireDays).toBe(3650);
  });

  it('handles partial env var overrides', () => {
    process.env[ENV_VARS.reviewDueDays] = '60';
    // staleDays and expireDays use defaults
    const config = loadDecayConfig();
    expect(config.reviewDueDays).toBe(60);
    expect(config.staleDays).toBe(180);
    expect(config.expireDays).toBe(365);
  });
});

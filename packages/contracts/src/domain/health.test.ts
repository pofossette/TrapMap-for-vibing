import { describe, expect, it } from 'vitest';

import { dependencyStatusSchema, healthStatusSchema } from './health.js';

describe('health contracts', () => {
  describe('dependencyStatusSchema', () => {
    it('accepts a valid healthy dependency with all fields', () => {
      const result = dependencyStatusSchema.parse({
        name: 'database',
        status: 'healthy',
        latencyMs: 12.5,
        message: 'Connection pool active',
        lastChecked: '2025-01-15T10:30:00.000Z',
      });
      expect(result.name).toBe('database');
      expect(result.status).toBe('healthy');
      expect(result.latencyMs).toBe(12.5);
    });

    it('accepts a minimal dependency with only required fields', () => {
      const result = dependencyStatusSchema.parse({
        name: 'consul',
        status: 'unknown',
      });
      expect(result.name).toBe('consul');
      expect(result.status).toBe('unknown');
      expect(result.latencyMs).toBeUndefined();
      expect(result.message).toBeUndefined();
      expect(result.lastChecked).toBeUndefined();
    });

    it('rejects an invalid status value', () => {
      expect(() =>
        dependencyStatusSchema.parse({
          name: 'otel',
          status: 'broken',
        }),
      ).toThrow();
    });

    it('rejects an empty name', () => {
      expect(() =>
        dependencyStatusSchema.parse({
          name: '',
          status: 'healthy',
        }),
      ).toThrow();
    });

    it('rejects negative latency', () => {
      expect(() =>
        dependencyStatusSchema.parse({
          name: 'loki',
          status: 'degraded',
          latencyMs: -1,
        }),
      ).toThrow();
    });

    it('rejects an invalid datetime for lastChecked', () => {
      expect(() =>
        dependencyStatusSchema.parse({
          name: 'prometheus',
          status: 'healthy',
          lastChecked: 'not-a-date',
        }),
      ).toThrow();
    });
  });

  describe('healthStatusSchema', () => {
    const validHealth = {
      status: 'ok' as const,
      timestamp: '2025-01-15T10:30:00.000Z',
      startedAt: '2025-01-15T08:00:00.000Z',
      uptime: 9000,
      readiness: 'ready' as const,
      liveness: 'alive' as const,
      dependencies: [{ name: 'database', status: 'healthy' as const }],
    };

    it('accepts a valid full health response', () => {
      const result = healthStatusSchema.parse(validHealth);
      expect(result.status).toBe('ok');
      expect(result.readiness).toBe('ready');
      expect(result.liveness).toBe('alive');
      expect(result.dependencies).toHaveLength(1);
    });

    it('accepts an optional version field', () => {
      const result = healthStatusSchema.parse({
        ...validHealth,
        version: '1.2.3',
      });
      expect(result.version).toBe('1.2.3');
    });

    it('accepts an optional deployment field', () => {
      const result = healthStatusSchema.parse({
        ...validHealth,
        deployment: { profile: 'local-agent', preset: 'dev-minimal' },
      });
      expect(result.deployment?.profile).toBe('local-agent');
      expect(result.deployment?.preset).toBe('dev-minimal');
    });

    it('accepts empty dependencies array', () => {
      const result = healthStatusSchema.parse({
        ...validHealth,
        dependencies: [],
      });
      expect(result.dependencies).toEqual([]);
    });

    it('accepts a degraded health response', () => {
      const result = healthStatusSchema.parse({
        ...validHealth,
        status: 'degraded',
        readiness: 'degraded',
        dependencies: [{ name: 'consul', status: 'degraded', message: 'High latency' }],
      });
      expect(result.status).toBe('degraded');
      expect(result.readiness).toBe('degraded');
    });

    it('accepts an unhealthy health response with not-ready readiness', () => {
      const result = healthStatusSchema.parse({
        ...validHealth,
        status: 'unhealthy',
        readiness: 'not-ready',
        liveness: 'dead',
      });
      expect(result.status).toBe('unhealthy');
      expect(result.readiness).toBe('not-ready');
      expect(result.liveness).toBe('dead');
    });

    it('rejects an invalid status value', () => {
      expect(() =>
        healthStatusSchema.parse({
          ...validHealth,
          status: 'broken',
        }),
      ).toThrow();
    });

    it('rejects an invalid readiness value', () => {
      expect(() =>
        healthStatusSchema.parse({
          ...validHealth,
          readiness: 'pending',
        }),
      ).toThrow();
    });

    it('rejects an invalid liveness value', () => {
      expect(() =>
        healthStatusSchema.parse({
          ...validHealth,
          liveness: 'running',
        }),
      ).toThrow();
    });

    it('rejects negative uptime', () => {
      expect(() =>
        healthStatusSchema.parse({
          ...validHealth,
          uptime: -1,
        }),
      ).toThrow();
    });

    it('rejects an invalid datetime for timestamp', () => {
      expect(() =>
        healthStatusSchema.parse({
          ...validHealth,
          timestamp: 'not-a-date',
        }),
      ).toThrow();
    });

    it('rejects extra properties (strict mode)', () => {
      expect(() =>
        healthStatusSchema.parse({
          ...validHealth,
          unknown: 'field',
        }),
      ).toThrow();
    });

    it('rejects extra properties on deployment object', () => {
      expect(() =>
        healthStatusSchema.parse({
          ...validHealth,
          deployment: { profile: 'local-agent', extra: 'field' },
        }),
      ).toThrow();
    });
  });
});

describe('C5 dependency summary / readiness schema', () => {
  it('accepts healthStatusSchema payloads unchanged (additive optional)', async () => {
    const { healthStatusSchema, readinessStatusSchema } = await import('./health.js');
    const base = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      uptime: 1,
      readiness: 'ready',
      liveness: 'alive',
      dependencies: [],
    } as const;
    expect(healthStatusSchema.safeParse(base).success).toBe(true);
    expect(readinessStatusSchema.safeParse(base).success).toBe(true);
  });

  it('validates dependencySummary bounds and enum states', async () => {
    const { readinessStatusSchema } = await import('./health.js');
    const base = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      uptime: 1,
      readiness: 'ready',
      liveness: 'alive',
      dependencies: [],
    };
    const ok = readinessStatusSchema.safeParse({
      ...base,
      dependencySummary: {
        dbPoolSaturation: 0.5,
        queueDepth: 3,
        breakerStates: { 'http://a': 'closed', 'http://b': 'open' },
      },
    });
    expect(ok.success).toBe(true);
    const bad = readinessStatusSchema.safeParse({
      ...base,
      dependencySummary: { dbPoolSaturation: 1.5, queueDepth: 0, breakerStates: {} },
    });
    expect(bad.success).toBe(false);
    const badState = readinessStatusSchema.safeParse({
      ...base,
      dependencySummary: { dbPoolSaturation: 0, queueDepth: 0, breakerStates: { x: 'flapping' } },
    });
    expect(badState.success).toBe(false);
  });
});

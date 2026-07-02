import { describe, expect, it } from 'vitest';

import { featureFlagsSchema, observabilityConfigSchema } from './observability-config.js';

describe('observability config contracts', () => {
  describe('featureFlagsSchema', () => {
    it('applies correct defaults for dev-minimal mode', () => {
      const result = featureFlagsSchema.parse({});
      expect(result.metricsEnabled).toBe(true);
      expect(result.tracingEnabled).toBe(true);
      expect(result.loggingEnabled).toBe(true);
      expect(result.serviceDiscoveryEnabled).toBe(false);
    });

    it('accepts explicit override of all flags', () => {
      const result = featureFlagsSchema.parse({
        metricsEnabled: false,
        tracingEnabled: false,
        loggingEnabled: false,
        serviceDiscoveryEnabled: true,
      });
      expect(result.metricsEnabled).toBe(false);
      expect(result.tracingEnabled).toBe(false);
      expect(result.loggingEnabled).toBe(false);
      expect(result.serviceDiscoveryEnabled).toBe(true);
    });

    it('accepts partial overrides', () => {
      const result = featureFlagsSchema.parse({
        serviceDiscoveryEnabled: true,
      });
      expect(result.metricsEnabled).toBe(true);
      expect(result.tracingEnabled).toBe(true);
      expect(result.loggingEnabled).toBe(true);
      expect(result.serviceDiscoveryEnabled).toBe(true);
    });

    it('rejects non-boolean values', () => {
      expect(() =>
        featureFlagsSchema.parse({
          metricsEnabled: 'yes',
        }),
      ).toThrow();
    });

    it('rejects extra properties (strict mode)', () => {
      expect(() =>
        featureFlagsSchema.parse({
          unknownFlag: true,
        }),
      ).toThrow();
    });
  });

  describe('observabilityConfigSchema', () => {
    it('applies correct defaults for dev-minimal mode', () => {
      const result = observabilityConfigSchema.parse({});
      expect(result.consulEnabled).toBe(false);
      expect(result.consulAddress).toBeUndefined();
      expect(result.otelEndpoint).toBeUndefined();
      expect(result.otelDisabled).toBe(false);
      expect(result.lokiUrl).toBeUndefined();
      expect(result.lokiEnabled).toBe(false);
      expect(result.prometheusEnabled).toBe(true);
      expect(result.metricsPrefix).toBe('trapmap_');
    });

    it('accepts explicit override of all config fields', () => {
      const result = observabilityConfigSchema.parse({
        consulAddress: 'http://consul:8500',
        consulEnabled: true,
        otelEndpoint: 'http://otel-collector:4318',
        otelDisabled: true,
        lokiUrl: 'http://loki:3100',
        lokiEnabled: true,
        prometheusEnabled: false,
        metricsPrefix: 'custom_',
      });
      expect(result.consulAddress).toBe('http://consul:8500');
      expect(result.consulEnabled).toBe(true);
      expect(result.otelEndpoint).toBe('http://otel-collector:4318');
      expect(result.otelDisabled).toBe(true);
      expect(result.lokiUrl).toBe('http://loki:3100');
      expect(result.lokiEnabled).toBe(true);
      expect(result.prometheusEnabled).toBe(false);
      expect(result.metricsPrefix).toBe('custom_');
    });

    it('accepts partial overrides', () => {
      const result = observabilityConfigSchema.parse({
        consulEnabled: true,
        consulAddress: 'http://consul:8500',
      });
      expect(result.consulEnabled).toBe(true);
      expect(result.consulAddress).toBe('http://consul:8500');
      expect(result.prometheusEnabled).toBe(true);
      expect(result.metricsPrefix).toBe('trapmap_');
    });

    it('rejects non-boolean values for boolean fields', () => {
      expect(() =>
        observabilityConfigSchema.parse({
          consulEnabled: 'yes',
        }),
      ).toThrow();
    });

    it('rejects non-string values for string fields', () => {
      expect(() =>
        observabilityConfigSchema.parse({
          metricsPrefix: 123,
        }),
      ).toThrow();
    });

    it('rejects extra properties (strict mode)', () => {
      expect(() =>
        observabilityConfigSchema.parse({
          unknownKey: 'value',
        }),
      ).toThrow();
    });
  });
});

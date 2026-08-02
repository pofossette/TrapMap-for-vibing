import { describe, expect, it } from 'vitest';

import {
  featureFlagsSchema,
  observabilityConfigSchema,
  validateOtelPolicy,
  validateSentryPolicy,
} from './observability-config.js';
import type { OtelPolicyResult, SentryPolicyResult } from './observability-config.js';

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

  // ---------------------------------------------------------------------------
  // validateOtelPolicy
  // ---------------------------------------------------------------------------

  describe('validateOtelPolicy', () => {
    it('returns enabled=false with reason when otelDisabled is "true"', () => {
      const result = validateOtelPolicy({ otelDisabled: 'true' });
      expect(result.enabled).toBe(false);
      expect(result.sampleRate).toBe(0);
      expect(result.reason).toBe('OTEL_DISABLED=true');
    });

    it('returns enabled=false when otelDisabled is "TRUE" (case-insensitive)', () => {
      const result = validateOtelPolicy({ otelDisabled: 'TRUE' });
      expect(result.enabled).toBe(false);
    });

    it('returns enabled=false when otelDisabled has surrounding whitespace', () => {
      const result = validateOtelPolicy({ otelDisabled: '  true  ' });
      expect(result.enabled).toBe(false);
    });

    it('returns enabled=true when otelDisabled is "false"', () => {
      const result = validateOtelPolicy({ otelDisabled: 'false' });
      expect(result.enabled).toBe(true);
    });

    it('returns enabled=true when otelDisabled is absent', () => {
      const result = validateOtelPolicy({});
      expect(result.enabled).toBe(true);
    });

    it('accepts sample rate 0', () => {
      const result = validateOtelPolicy({ sampleRate: '0' });
      expect(result.enabled).toBe(true);
      expect(result.sampleRate).toBe(0);
      expect(result.reason).toBeUndefined();
    });

    it('accepts sample rate 0.1', () => {
      const result = validateOtelPolicy({ sampleRate: '0.1' });
      expect(result.sampleRate).toBe(0.1);
      expect(result.reason).toBeUndefined();
    });

    it('accepts sample rate 1', () => {
      const result = validateOtelPolicy({ sampleRate: '1' });
      expect(result.sampleRate).toBe(1);
      expect(result.reason).toBeUndefined();
    });

    it('defaults sample rate to 1 when absent', () => {
      const result = validateOtelPolicy({});
      expect(result.sampleRate).toBe(1);
    });

    it('defaults sample rate to 1 when empty string', () => {
      const result = validateOtelPolicy({ sampleRate: '' });
      expect(result.sampleRate).toBe(1);
    });

    it('clamps negative sample rate to 0 and sets reason', () => {
      const result = validateOtelPolicy({ sampleRate: '-0.5' });
      expect(result.sampleRate).toBe(0);
      expect(result.reason).toContain('below minimum');
    });

    it('clamps sample rate above 1 to 1 and sets reason', () => {
      const result = validateOtelPolicy({ sampleRate: '1.5' });
      expect(result.sampleRate).toBe(1);
      expect(result.reason).toContain('above maximum');
    });

    it('falls back to default sample rate for non-numeric input', () => {
      const result = validateOtelPolicy({ sampleRate: 'abc' });
      expect(result.sampleRate).toBe(1);
      expect(result.reason).toContain('invalid sample rate');
    });

    it('falls back to default sample rate for Infinity', () => {
      const result = validateOtelPolicy({ sampleRate: 'Infinity' });
      expect(result.sampleRate).toBe(1);
      expect(result.reason).toContain('invalid sample rate');
    });

    it('defaults endpoint to localhost:4318 when absent', () => {
      const result = validateOtelPolicy({});
      expect(result.endpoint).toBe('http://localhost:4318');
    });

    it('uses provided endpoint', () => {
      const result = validateOtelPolicy({ endpoint: 'http://otel:4318' });
      expect(result.endpoint).toBe('http://otel:4318');
    });

    it('trims endpoint whitespace', () => {
      const result = validateOtelPolicy({ endpoint: '  http://otel:4318  ' });
      expect(result.endpoint).toBe('http://otel:4318');
    });

    it('defaults serviceName to trapmap', () => {
      const result = validateOtelPolicy({});
      expect(result.serviceName).toBe('trapmap');
    });

    it('uses provided serviceName', () => {
      const result = validateOtelPolicy({ serviceName: 'my-service' });
      expect(result.serviceName).toBe('my-service');
    });

    it('defaults serviceVersion to 0.1.0', () => {
      const result = validateOtelPolicy({});
      expect(result.serviceVersion).toBe('0.1.0');
    });

    it('defaults environment to development', () => {
      const result = validateOtelPolicy({});
      expect(result.environment).toBe('development');
    });

    it('defaults deploymentProfile to local-agent', () => {
      const result = validateOtelPolicy({});
      expect(result.deploymentProfile).toBe('local-agent');
    });

    it('returns all required fields in result', () => {
      const result = validateOtelPolicy({});
      const keys: (keyof OtelPolicyResult)[] = [
        'enabled',
        'sampleRate',
        'endpoint',
        'serviceName',
        'serviceVersion',
        'environment',
        'deploymentProfile',
      ];
      for (const key of keys) {
        expect(result).toHaveProperty(key);
      }
    });

    it('disabled mode always includes reason; enabled mode may omit it', () => {
      const disabled = validateOtelPolicy({ otelDisabled: 'true' });
      const enabled = validateOtelPolicy({});
      // disabled always carries a reason
      expect(disabled.reason).toBe('OTEL_DISABLED=true');
      // enabled with valid config has no reason
      expect(enabled.reason).toBeUndefined();
      // both share all mandatory keys
      const mandatoryKeys = [
        'enabled',
        'sampleRate',
        'endpoint',
        'serviceName',
        'serviceVersion',
        'environment',
        'deploymentProfile',
      ];
      for (const key of mandatoryKeys) {
        expect(disabled).toHaveProperty(key);
        expect(enabled).toHaveProperty(key);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // validateSentryPolicy
  // ---------------------------------------------------------------------------

  describe('validateSentryPolicy', () => {
    it('returns enabled=false with reason when DSN is absent', () => {
      const result = validateSentryPolicy({});
      expect(result.enabled).toBe(false);
      expect(result.dsn).toBe('');
      expect(result.reason).toBe('SENTRY_DSN not configured');
    });

    it('returns enabled=false when DSN is empty string', () => {
      const result = validateSentryPolicy({ dsn: '' });
      expect(result.enabled).toBe(false);
      expect(result.reason).toBe('SENTRY_DSN not configured');
    });

    it('returns enabled=false when DSN is whitespace only', () => {
      const result = validateSentryPolicy({ dsn: '   ' });
      expect(result.enabled).toBe(false);
      expect(result.reason).toBe('SENTRY_DSN not configured');
    });

    it('returns enabled=true when valid DSN is provided', () => {
      const result = validateSentryPolicy({
        dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
      });
      expect(result.enabled).toBe(true);
      expect(result.dsn).toBe('https://examplePublicKey@o0.ingest.sentry.io/0');
      expect(result.reason).toBeUndefined();
    });

    it('trims DSN whitespace', () => {
      const result = validateSentryPolicy({
        dsn: '  https://examplePublicKey@o0.ingest.sentry.io/0  ',
      });
      expect(result.enabled).toBe(true);
      expect(result.dsn).toBe('https://examplePublicKey@o0.ingest.sentry.io/0');
    });

    it('accepts tracesSampleRate 0', () => {
      const result = validateSentryPolicy({
        dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
        tracesSampleRate: '0',
      });
      expect(result.tracesSampleRate).toBe(0);
      expect(result.reason).toBeUndefined();
    });

    it('accepts tracesSampleRate 0.5', () => {
      const result = validateSentryPolicy({
        dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
        tracesSampleRate: '0.5',
      });
      expect(result.tracesSampleRate).toBe(0.5);
    });

    it('accepts tracesSampleRate 1', () => {
      const result = validateSentryPolicy({
        dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
        tracesSampleRate: '1',
      });
      expect(result.tracesSampleRate).toBe(1);
    });

    it('defaults tracesSampleRate to 0 when absent', () => {
      const result = validateSentryPolicy({
        dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
      });
      expect(result.tracesSampleRate).toBe(0);
    });

    it('defaults tracesSampleRate to 0 when empty string', () => {
      const result = validateSentryPolicy({
        dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
        tracesSampleRate: '',
      });
      expect(result.tracesSampleRate).toBe(0);
    });

    it('clamps negative tracesSampleRate to 0 and sets reason', () => {
      const result = validateSentryPolicy({
        dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
        tracesSampleRate: '-0.5',
      });
      expect(result.tracesSampleRate).toBe(0);
      expect(result.reason).toContain('below minimum');
    });

    it('clamps tracesSampleRate above 1 to 1 and sets reason', () => {
      const result = validateSentryPolicy({
        dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
        tracesSampleRate: '1.5',
      });
      expect(result.tracesSampleRate).toBe(1);
      expect(result.reason).toContain('above maximum');
    });

    it('falls back to default tracesSampleRate for non-numeric input', () => {
      const result = validateSentryPolicy({
        dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
        tracesSampleRate: 'abc',
      });
      expect(result.tracesSampleRate).toBe(0);
      expect(result.reason).toContain('invalid sentry traces sample rate');
    });

    it('defaults environment to development', () => {
      const result = validateSentryPolicy({
        dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
      });
      expect(result.environment).toBe('development');
    });

    it('uses provided environment', () => {
      const result = validateSentryPolicy({
        dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
        environment: 'production',
      });
      expect(result.environment).toBe('production');
    });

    it('defaults deploymentProfile to local-agent', () => {
      const result = validateSentryPolicy({
        dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
      });
      expect(result.deploymentProfile).toBe('local-agent');
    });

    it('defaults serviceName to trapmap', () => {
      const result = validateSentryPolicy({
        dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
      });
      expect(result.serviceName).toBe('trapmap');
    });

    it('defaults release to 0.1.0', () => {
      const result = validateSentryPolicy({
        dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
      });
      expect(result.release).toBe('0.1.0');
    });

    it('returns all required fields in result', () => {
      const result = validateSentryPolicy({
        dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
      });
      const keys: (keyof SentryPolicyResult)[] = [
        'enabled',
        'dsn',
        'environment',
        'release',
        'tracesSampleRate',
        'deploymentProfile',
        'serviceName',
      ];
      for (const key of keys) {
        expect(result).toHaveProperty(key);
      }
    });

    it('disabled mode always includes reason; enabled mode may omit it', () => {
      const disabled = validateSentryPolicy({});
      const enabled = validateSentryPolicy({
        dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
      });
      // disabled always carries a reason
      expect(disabled.reason).toBe('SENTRY_DSN not configured');
      // enabled with valid config has no reason
      expect(enabled.reason).toBeUndefined();
      // both share all mandatory keys
      const mandatoryKeys = [
        'enabled',
        'dsn',
        'environment',
        'release',
        'tracesSampleRate',
        'deploymentProfile',
        'serviceName',
      ];
      for (const key of mandatoryKeys) {
        expect(disabled).toHaveProperty(key);
        expect(enabled).toHaveProperty(key);
      }
    });
  });
});

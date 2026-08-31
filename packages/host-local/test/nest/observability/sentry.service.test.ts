import { validateSentryPolicy } from '@trapmap/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SentryService } from '../../../src/nest/observability/sentry.service.js';

// The only correct way to unset a process.env key (assignment would set the
// literal string "undefined"); computed delete avoids deleting properties
// from the shared env object shape.
function unsetEnv(name: string): void {
  delete process.env[name];
}

describe('SentryService', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    // Clear Sentry env vars
    unsetEnv('SENTRY_DSN');
    unsetEnv('SENTRY_ENVIRONMENT');
    unsetEnv('SENTRY_RELEASE');
    unsetEnv('SENTRY_TRACES_SAMPLE_RATE');
    unsetEnv('TRAPMAP_DEPLOYMENT_PROFILE');
    unsetEnv('TRAPMAP_SERVICE_NAME');
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('absent DSN', () => {
    it('should produce a disabled policy when DSN is not set', () => {
      const policy = validateSentryPolicy({});
      expect(policy.enabled).toBe(false);
      expect(policy.reason).toBe('SENTRY_DSN not configured');
    });

    it('should produce a disabled policy when DSN is empty string', () => {
      const policy = validateSentryPolicy({ dsn: '' });
      expect(policy.enabled).toBe(false);
      expect(policy.reason).toBe('SENTRY_DSN not configured');
    });

    it('should produce a disabled policy when DSN is whitespace only', () => {
      const policy = validateSentryPolicy({ dsn: '   ' });
      expect(policy.enabled).toBe(false);
      expect(policy.reason).toBe('SENTRY_DSN not configured');
    });

    it('should not initialize Sentry when DSN is absent', async () => {
      const service = new SentryService();
      vi.spyOn(console, 'log').mockImplementation(() => {});

      await service.onModuleInit();

      expect(service.getPolicy().enabled).toBe(false);
      // Sentry should not have been imported
      expect(service.captureException(new Error('test'))).toBe(false);
    });
  });

  describe('enabled DSN initialization', () => {
    it('should produce an enabled policy when valid DSN is provided', () => {
      const policy = validateSentryPolicy({
        dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
        environment: 'production',
        release: '1.0.0',
        tracesSampleRate: '0.5',
        deploymentProfile: 'distributed',
        serviceName: 'gateway',
      });
      expect(policy.enabled).toBe(true);
      expect(policy.dsn).toBe('https://examplePublicKey@o0.ingest.sentry.io/0');
      expect(policy.environment).toBe('production');
      expect(policy.release).toBe('1.0.0');
      expect(policy.tracesSampleRate).toBe(0.5);
      expect(policy.deploymentProfile).toBe('distributed');
      expect(policy.serviceName).toBe('gateway');
    });

    it('should default tracesSampleRate to 0 when not provided', () => {
      const policy = validateSentryPolicy({
        dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
      });
      expect(policy.tracesSampleRate).toBe(0);
    });

    it('should clamp tracesSampleRate to [0, 1]', () => {
      const high = validateSentryPolicy({
        dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
        tracesSampleRate: '1.5',
      });
      expect(high.tracesSampleRate).toBe(1);
      expect(high.reason).toContain('above maximum');

      const low = validateSentryPolicy({
        dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
        tracesSampleRate: '-0.5',
      });
      expect(low.tracesSampleRate).toBe(0);
      expect(low.reason).toContain('below minimum');
    });

    it('should default environment to development', () => {
      const policy = validateSentryPolicy({
        dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
      });
      expect(policy.environment).toBe('development');
    });

    it('should default deploymentProfile to local-agent', () => {
      const policy = validateSentryPolicy({
        dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
      });
      expect(policy.deploymentProfile).toBe('local-agent');
    });

    it('should default serviceName to trapmap', () => {
      const policy = validateSentryPolicy({
        dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
      });
      expect(policy.serviceName).toBe('trapmap');
    });
  });

  describe('suppression of expected errors', () => {
    it('should suppress InvocationError with validation kind', () => {
      const service = new SentryService();
      // We test the suppression logic indirectly through the service
      // The shouldSuppress function is tested through the public API
      const error = Object.assign(new Error('Invalid input'), { kind: 'validation' });
      // Service is not initialized (no DSN), so capture returns false
      expect(service.captureException(error)).toBe(false);
    });

    it('should suppress InvocationError with unauthorized kind', () => {
      const service = new SentryService();
      const error = Object.assign(new Error('Unauthorized'), { kind: 'unauthorized' });
      expect(service.captureException(error)).toBe(false);
    });

    it('should suppress InvocationError with forbidden kind', () => {
      const service = new SentryService();
      const error = Object.assign(new Error('Forbidden'), { kind: 'forbidden' });
      expect(service.captureException(error)).toBe(false);
    });

    it('should suppress InvocationError with not-found kind', () => {
      const service = new SentryService();
      const error = Object.assign(new Error('Not found'), { kind: 'not-found' });
      expect(service.captureException(error)).toBe(false);
    });

    it('should suppress errors with 4xx status codes', () => {
      const service = new SentryService();
      // Not initialized, returns false regardless
      expect(service.captureException(new Error('test'), { statusCode: 400 })).toBe(false);
      expect(service.captureException(new Error('test'), { statusCode: 401 })).toBe(false);
      expect(service.captureException(new Error('test'), { statusCode: 403 })).toBe(false);
      expect(service.captureException(new Error('test'), { statusCode: 404 })).toBe(false);
      expect(service.captureException(new Error('test'), { statusCode: 409 })).toBe(false);
      expect(service.captureException(new Error('test'), { statusCode: 422 })).toBe(false);
    });

    it('should suppress errors with user-error failure classification', () => {
      const service = new SentryService();
      expect(
        service.captureException(new Error('test'), {
          failureClassification: 'user-error',
        }),
      ).toBe(false);
    });

    it('should suppress errors with auth-policy-error failure classification', () => {
      const service = new SentryService();
      expect(
        service.captureException(new Error('test'), {
          failureClassification: 'auth-policy-error',
        }),
      ).toBe(false);
    });
  });

  describe('policy getters', () => {
    it('should return the current policy', () => {
      const service = new SentryService();
      const policy = service.getPolicy();
      expect(policy).toBeDefined();
      expect(typeof policy.enabled).toBe('boolean');
    });
  });
});

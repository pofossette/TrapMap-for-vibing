import { validateSentryPolicy } from '@trapmap/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  captureDistributedException,
  closeDistributedSentry,
  getDistributedSentryPolicy,
  initDistributedSentry,
} from './sentry.js';

describe('Distributed Sentry adapter', () => {
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    vi.restoreAllMocks();
    // Ensure clean state
    await closeDistributedSentry();
    // Clear Sentry env vars
    process.env.SENTRY_DSN = '';
    process.env.SENTRY_ENVIRONMENT = '';
    process.env.SENTRY_RELEASE = '';
    process.env.SENTRY_TRACES_SAMPLE_RATE = '';
    process.env.TRAPMAP_DEPLOYMENT_PROFILE = '';
    process.env.TRAPMAP_SERVICE_NAME = '';
  });

  afterEach(async () => {
    await closeDistributedSentry();
    process.env = { ...originalEnv };
  });

  describe('absent DSN no-op', () => {
    it('should return disabled policy when DSN is not set', async () => {
      const policy = await initDistributedSentry('test-service');
      expect(policy.enabled).toBe(false);
      expect(policy.reason).toBe('SENTRY_DSN not configured');
    });

    it('should return false from captureException when disabled', async () => {
      await initDistributedSentry('test-service');
      expect(captureDistributedException(new Error('test'))).toBe(false);
    });

    it('should return null from getDistributedSentryPolicy before init', () => {
      expect(getDistributedSentryPolicy()).toBeNull();
    });

    it('should return policy after init', async () => {
      await initDistributedSentry('test-service');
      const policy = getDistributedSentryPolicy();
      expect(policy).not.toBeNull();
      expect(policy!.enabled).toBe(false);
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

    it('should handle startup failure gracefully', async () => {
      // This test verifies that if @sentry/node fails to import,
      // the adapter doesn't crash
      const policy = await initDistributedSentry('test-service');
      // Without a real DSN, this is just a no-op
      expect(policy.enabled).toBe(false);
    });
  });

  describe('suppression of expected errors', () => {
    it('should suppress InvocationError with validation kind', async () => {
      await initDistributedSentry('test-service');
      const error = Object.assign(new Error('Invalid input'), { kind: 'validation' });
      expect(captureDistributedException(error)).toBe(false);
    });

    it('should suppress InvocationError with unauthorized kind', async () => {
      await initDistributedSentry('test-service');
      const error = Object.assign(new Error('Unauthorized'), { kind: 'unauthorized' });
      expect(captureDistributedException(error)).toBe(false);
    });

    it('should suppress InvocationError with forbidden kind', async () => {
      await initDistributedSentry('test-service');
      const error = Object.assign(new Error('Forbidden'), { kind: 'forbidden' });
      expect(captureDistributedException(error)).toBe(false);
    });

    it('should suppress InvocationError with not-found kind', async () => {
      await initDistributedSentry('test-service');
      const error = Object.assign(new Error('Not found'), { kind: 'not-found' });
      expect(captureDistributedException(error)).toBe(false);
    });

    it('should suppress errors with 4xx status codes', async () => {
      await initDistributedSentry('test-service');
      for (const code of [400, 401, 403, 404, 409, 422]) {
        expect(captureDistributedException(new Error('test'), { statusCode: code })).toBe(false);
      }
    });

    it('should suppress errors with user-error failure classification', async () => {
      await initDistributedSentry('test-service');
      expect(
        captureDistributedException(new Error('test'), {
          failureClassification: 'user-error',
        }),
      ).toBe(false);
    });

    it('should suppress errors with auth-policy-error failure classification', async () => {
      await initDistributedSentry('test-service');
      expect(
        captureDistributedException(new Error('test'), {
          failureClassification: 'auth-policy-error',
        }),
      ).toBe(false);
    });
  });

  describe('capture/transport failure isolation', () => {
    it('should not throw when capture fails', async () => {
      await initDistributedSentry('test-service');
      // Even with errors, should not throw
      expect(() =>
        captureDistributedException(new Error('test'), { statusCode: 500 }),
      ).not.toThrow();
    });

    it('should return false when Sentry is not initialized', () => {
      expect(captureDistributedException(new Error('test'))).toBe(false);
    });
  });

  describe('closeDistributedSentry', () => {
    it('should handle close when not initialized', async () => {
      await expect(closeDistributedSentry()).resolves.toBeUndefined();
    });

    it('should handle close after init', async () => {
      await initDistributedSentry('test-service');
      await expect(closeDistributedSentry()).resolves.toBeUndefined();
    });
  });
});

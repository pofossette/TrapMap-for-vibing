import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { validateLangfusePolicy } from '@trapmap/contracts';

import { LangfuseService } from './langfuse.service.js';

describe('LangfuseService', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    // Clear Langfuse env vars
    delete process.env.LANGFUSE_ENABLED;
    delete process.env.LANGFUSE_BASE_URL;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_FLUSH_TIMEOUT_MS;
    delete process.env.LANGFUSE_PRIVACY_MODE;
    delete process.env.TRAPMAP_SERVICE_NAME;
    delete process.env.TRAPMAP_DEPLOYMENT_PROFILE;
    delete process.env.NODE_ENV;
    delete process.env.SENTRY_RELEASE;
    delete process.env.npm_package_version;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('disabled mode', () => {
    it('should produce a disabled policy when LANGFUSE_ENABLED=false', () => {
      const policy = validateLangfusePolicy({ langfuseEnabled: 'false' });
      expect(policy.enabled).toBe(false);
      expect(policy.reason).toBe('LANGFUSE_ENABLED=false');
    });

    it('should produce a disabled policy when credentials are missing', () => {
      const policy = validateLangfusePolicy({});
      expect(policy.enabled).toBe(false);
      expect(policy.reason).toContain('missing');
    });

    it('should not initialize Langfuse SDK when disabled', async () => {
      const service = new LangfuseService();

      await service.onModuleInit();

      expect(service.getPolicy().enabled).toBe(false);
      // Observation should be silently dropped
      service.onChatObservation({
        provider: 'openai',
        model: 'chat',
        operation: 'invoke',
        outcome: 'success',
        latencyMs: 100,
        startTimestamp: new Date().toISOString(),
        endTimestamp: new Date().toISOString(),
      });
    });

    it('should not initialize Langfuse SDK when only partial credentials are provided', async () => {
      process.env.LANGFUSE_BASE_URL = 'https://langfuse.example';
      process.env.LANGFUSE_PUBLIC_KEY = 'pk-test';
      // Missing LANGFUSE_SECRET_KEY

      const service = new LangfuseService();
      await service.onModuleInit();

      expect(service.getPolicy().enabled).toBe(false);
    });
  });

  describe('policy getters', () => {
    it('should return the current policy', () => {
      const service = new LangfuseService();
      const policy = service.getPolicy();
      expect(policy).toBeDefined();
      expect(typeof policy.enabled).toBe('boolean');
    });

    it('should reflect disabled state in policy', () => {
      process.env.LANGFUSE_ENABLED = 'false';
      const service = new LangfuseService();
      const policy = service.getPolicy();
      expect(policy.enabled).toBe(false);
      expect(policy.reason).toBe('LANGFUSE_ENABLED=false');
    });

    it('should reflect missing credentials in policy', () => {
      const service = new LangfuseService();
      const policy = service.getPolicy();
      expect(policy.enabled).toBe(false);
      expect(policy.privacyMode).toBe('strict');
    });
  });

  describe('observation sink when disabled', () => {
    it('should silently drop chat observations when disabled', () => {
      const service = new LangfuseService();

      // Should not throw
      service.onChatObservation({
        provider: 'openai',
        model: 'chat',
        operation: 'invoke',
        outcome: 'success',
        latencyMs: 100,
        startTimestamp: new Date().toISOString(),
        endTimestamp: new Date().toISOString(),
      });
    });

    it('should silently drop embedding observations when disabled', () => {
      const service = new LangfuseService();

      // Should not throw
      service.onEmbeddingObservation({
        provider: 'openai',
        model: 'embed',
        operation: 'embed',
        outcome: 'success',
        latencyMs: 50,
        startTimestamp: new Date().toISOString(),
        endTimestamp: new Date().toISOString(),
        inputLength: 100,
        outputDimensions: 384,
      });
    });

    it('should silently drop error observations when disabled', () => {
      const service = new LangfuseService();

      // Should not throw
      service.onChatObservation({
        provider: 'openai',
        model: 'chat',
        operation: 'invoke',
        outcome: 'error',
        latencyMs: 100,
        startTimestamp: new Date().toISOString(),
        endTimestamp: new Date().toISOString(),
        error: 'rate limited',
      });
    });
  });

  describe('policy validation integration', () => {
    it('defaults privacyMode to strict', () => {
      const service = new LangfuseService();
      expect(service.getPolicy().privacyMode).toBe('strict');
    });

    it('accepts privacyMode metadata-only via env var', () => {
      process.env.LANGFUSE_PRIVACY_MODE = 'metadata-only';
      const service = new LangfuseService();
      expect(service.getPolicy().privacyMode).toBe('metadata-only');
    });

    it('defaults flushTimeoutMs to 5000', () => {
      const service = new LangfuseService();
      expect(service.getPolicy().flushTimeoutMs).toBe(5000);
    });
  });

  describe('safe diagnostics', () => {
    it('never prints keys or endpoint credentials in policy reason', () => {
      const service = new LangfuseService();
      const policy = service.getPolicy();
      if (policy.reason) {
        expect(policy.reason).not.toContain('sk-');
        expect(policy.reason).not.toContain('pk-');
        expect(policy.reason).not.toContain('https://');
      }
    });

    it('never includes credentials in disabled policy output', () => {
      const service = new LangfuseService();
      const policy = service.getPolicy();
      expect(policy.baseUrl).toBe('');
      expect(policy.publicKey).toBe('');
      expect(policy.secretKey).toBe('');
    });
  });
});

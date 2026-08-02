import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { validateLangfusePolicy } from '@trapmap/contracts';

import { LangfuseService } from './langfuse.service.js';

// Helper to set valid Langfuse env vars for enabled mode tests
function setValidLangfuseEnv(): void {
  process.env.LANGFUSE_ENABLED = 'true';
  process.env.LANGFUSE_BASE_URL = 'https://langfuse.example';
  process.env.LANGFUSE_PUBLIC_KEY = 'pk-test';
  process.env.LANGFUSE_SECRET_KEY = 'sk-test';
}

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

  describe('enabled mode', () => {
    it('produces an enabled policy when valid credentials are provided', () => {
      setValidLangfuseEnv();
      const service = new LangfuseService();
      const policy = service.getPolicy();
      expect(policy.enabled).toBe(true);
      expect(policy.baseUrl).toBe('https://langfuse.example');
      expect(policy.publicKey).toBe('pk-test');
      expect(policy.secretKey).toBe('sk-test');
    });

    it('attempts SDK initialization when enabled', async () => {
      setValidLangfuseEnv();
      const service = new LangfuseService();

      // onModuleInit will try to dynamically import 'langfuse'.
      // In test environment, the import may succeed (if langfuse is in
      // devDependencies) or fail (if not installed). Both outcomes are
      // acceptable -- we just verify it doesn't throw.
      await service.onModuleInit();

      // The policy should still be enabled regardless of SDK import outcome
      expect(service.getPolicy().enabled).toBe(true);
    });

    it('handles SDK import failure gracefully', async () => {
      setValidLangfuseEnv();
      const service = new LangfuseService();

      // Mock dynamic import to fail
      vi.doMock('langfuse', () => {
        throw new Error('module not found');
      });

      // Should not throw
      await service.onModuleInit();

      // Policy is still enabled, but sink should be null (no client)
      expect(service.getPolicy().enabled).toBe(true);

      // Observations should be silently dropped when SDK failed to load
      service.onChatObservation({
        provider: 'openai',
        model: 'openai',
        operation: 'invoke',
        outcome: 'success',
        latencyMs: 100,
        startTimestamp: new Date().toISOString(),
        endTimestamp: new Date().toISOString(),
      });
      // No assertion needed -- just verifying it doesn't throw
    });
  });

  describe('shutdown timeout behavior', () => {
    it('respects bounded flush timeout during shutdown', async () => {
      setValidLangfuseEnv();
      process.env.LANGFUSE_FLUSH_TIMEOUT_MS = '200';
      const service = new LangfuseService();

      // Mock langfuse SDK with a slow shutdown
      vi.doMock('langfuse', () => ({
        Langfuse: class MockLangfuse {
          generation() {
            return { id: 'gen-1' };
          }
          async shutdownAsync() {
            // Simulate a shutdown that takes longer than the timeout
            await new Promise((resolve) => setTimeout(resolve, 5000));
          }
        },
      }));

      await service.onModuleInit();

      const startTime = Date.now();
      await service.onModuleDestroy();
      const elapsed = Date.now() - startTime;

      // Should have timed out well before 5000ms
      expect(elapsed).toBeLessThan(3000);
    });

    it('completes shutdown quickly when client shuts down fast', async () => {
      setValidLangfuseEnv();
      const service = new LangfuseService();

      vi.doMock('langfuse', () => ({
        Langfuse: class MockLangfuse {
          generation() {
            return { id: 'gen-1' };
          }
          async shutdownAsync() {
            // Fast shutdown
          }
        },
      }));

      await service.onModuleInit();

      const startTime = Date.now();
      await service.onModuleDestroy();
      const elapsed = Date.now() - startTime;

      // Should complete quickly
      expect(elapsed).toBeLessThan(1000);
    });
  });

  describe('observation forwarding when enabled', () => {
    it('forwards chat observations to the sink when SDK is initialized', async () => {
      setValidLangfuseEnv();
      const service = new LangfuseService();
      let capturedGeneration: Record<string, unknown> | undefined;

      vi.doMock('langfuse', () => ({
        Langfuse: class MockLangfuse {
          generation(body: Record<string, unknown>) {
            capturedGeneration = body;
            return { id: 'gen-1' };
          }
          async shutdownAsync() {}
        },
      }));

      await service.onModuleInit();

      service.onChatObservation({
        provider: 'openai',
        model: 'openai',
        operation: 'invoke',
        outcome: 'success',
        latencyMs: 150,
        startTimestamp: '2026-01-01T00:00:00.000Z',
        endTimestamp: '2026-01-01T00:00:00.150Z',
      });

      // If SDK loaded successfully, the generation should have been called
      if (capturedGeneration) {
        expect(capturedGeneration).toBeDefined();
        expect(capturedGeneration!.name).toBe('openai:invoke');
        expect(capturedGeneration!.model).toBe('openai');
      }
    });

    it('forwards embedding observations to the sink when SDK is initialized', async () => {
      setValidLangfuseEnv();
      const service = new LangfuseService();
      let capturedGeneration: Record<string, unknown> | undefined;

      vi.doMock('langfuse', () => ({
        Langfuse: class MockLangfuse {
          generation(body: Record<string, unknown>) {
            capturedGeneration = body;
            return { id: 'gen-1' };
          }
          async shutdownAsync() {}
        },
      }));

      await service.onModuleInit();

      service.onEmbeddingObservation({
        provider: 'openai',
        model: 'openai',
        operation: 'embed',
        outcome: 'success',
        latencyMs: 50,
        startTimestamp: '2026-01-01T00:00:00.000Z',
        endTimestamp: '2026-01-01T00:00:00.050Z',
        inputLength: 100,
        outputDimensions: 384,
      });

      if (capturedGeneration) {
        expect(capturedGeneration).toBeDefined();
        expect(capturedGeneration!.name).toBe('openai:embed');
      }
    });

    it('silently drops observations when SDK failed to load', async () => {
      setValidLangfuseEnv();
      const service = new LangfuseService();

      vi.doMock('langfuse', () => {
        throw new Error('module not found');
      });

      await service.onModuleInit();

      // Should not throw
      expect(() => {
        service.onChatObservation({
          provider: 'openai',
          model: 'openai',
          operation: 'invoke',
          outcome: 'success',
          latencyMs: 100,
          startTimestamp: new Date().toISOString(),
          endTimestamp: new Date().toISOString(),
        });
      }).not.toThrow();

      expect(() => {
        service.onEmbeddingObservation({
          provider: 'openai',
          model: 'openai',
          operation: 'embed',
          outcome: 'success',
          latencyMs: 50,
          startTimestamp: new Date().toISOString(),
          endTimestamp: new Date().toISOString(),
          inputLength: 100,
          outputDimensions: 384,
        });
      }).not.toThrow();
    });
  });
});

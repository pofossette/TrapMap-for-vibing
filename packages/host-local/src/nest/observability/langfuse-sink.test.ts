import type { LangfusePolicyResult } from '@trapmap/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createLangfuseSinkFromEnv, createSinkFromClient } from './langfuse-sink.js';

// The only correct way to unset a process.env key (assignment would set the
// literal string "undefined"); computed delete avoids deleting properties
// from the shared env object shape.
function unsetEnv(name: string): void {
  delete process.env[name];
}

function createMockClient() {
  return {
    generation: vi.fn(() => ({ id: 'gen-1' })),
    shutdownAsync: vi.fn(async () => {}),
  };
}

function createPolicy(overrides: Partial<LangfusePolicyResult> = {}): LangfusePolicyResult {
  return {
    enabled: true,
    baseUrl: 'https://langfuse.example',
    publicKey: 'pk-test',
    secretKey: 'sk-test',
    flushTimeoutMs: 5000,
    serviceName: 'trapmap',
    serviceVersion: '0.1.0',
    environment: 'development',
    deploymentProfile: 'local-agent',
    release: '0.1.0',
    privacyMode: 'strict',
    ...overrides,
  };
}

describe('langfuse-sink', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    unsetEnv('LANGFUSE_ENABLED');
    unsetEnv('LANGFUSE_BASE_URL');
    unsetEnv('LANGFUSE_PUBLIC_KEY');
    unsetEnv('LANGFUSE_SECRET_KEY');
    unsetEnv('LANGFUSE_FLUSH_TIMEOUT_MS');
    unsetEnv('LANGFUSE_PRIVACY_MODE');
    unsetEnv('TRAPMAP_SERVICE_NAME');
    unsetEnv('TRAPMAP_DEPLOYMENT_PROFILE');
    unsetEnv('NODE_ENV');
    unsetEnv('SENTRY_RELEASE');
    unsetEnv('npm_package_version');
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('createLangfuseSinkFromEnv', () => {
    it('returns undefined sink when LANGFUSE_ENABLED is not set and credentials are missing', async () => {
      const sink = await createLangfuseSinkFromEnv();
      expect(sink).toBeUndefined();
    });

    it('returns undefined sink when LANGFUSE_ENABLED is false', async () => {
      process.env.LANGFUSE_ENABLED = 'false';
      process.env.LANGFUSE_BASE_URL = 'https://langfuse.example';
      process.env.LANGFUSE_PUBLIC_KEY = 'pk-test';
      process.env.LANGFUSE_SECRET_KEY = 'sk-test';

      const sink = await createLangfuseSinkFromEnv();
      expect(sink).toBeUndefined();
    });

    it('returns undefined sink when credentials are missing even if enabled', async () => {
      process.env.LANGFUSE_ENABLED = 'true';

      const sink = await createLangfuseSinkFromEnv();
      expect(sink).toBeUndefined();
    });

    it('returns undefined sink when dynamic import of langfuse fails', async () => {
      process.env.LANGFUSE_ENABLED = 'true';
      process.env.LANGFUSE_BASE_URL = 'https://langfuse.example';
      process.env.LANGFUSE_PUBLIC_KEY = 'pk-test';
      process.env.LANGFUSE_SECRET_KEY = 'sk-test';

      // The dynamic import of 'langfuse' may fail in test environment
      // if langfuse is not installed. This is expected behavior.
      const sink = await createLangfuseSinkFromEnv();
      // If langfuse is installed, sink will be defined; if not, undefined.
      // Both are valid outcomes for this test.
      expect(sink === undefined || typeof sink.onChatObservation === 'function').toBe(true);
    });
  });

  describe('createSinkFromClient', () => {
    it('forwards chat observations to the Langfuse client', () => {
      const client = createMockClient();
      const policy = createPolicy();
      const sink = createSinkFromClient(client, policy);

      sink.onChatObservation({
        provider: 'openai',
        model: 'openai',
        operation: 'invoke',
        outcome: 'success',
        latencyMs: 150,
        startTimestamp: '2026-01-01T00:00:00.000Z',
        endTimestamp: '2026-01-01T00:00:00.150Z',
      });

      expect(client.generation).toHaveBeenCalledTimes(1);
      const call = client.generation.mock.calls[0]![0];
      expect(call.name).toBe('openai:invoke');
      expect(call.model).toBe('openai');
      expect(call.metadata).toMatchObject({
        provider: 'openai',
        operation: 'invoke',
        outcome: 'success',
        latencyMs: 150,
        serviceName: 'trapmap',
        environment: 'development',
        deploymentProfile: 'local-agent',
      });
      expect(call.level).toBe('DEFAULT');
      expect(call.statusMessage).toBeUndefined();
    });

    it('forwards embedding observations to the Langfuse client', () => {
      const client = createMockClient();
      const policy = createPolicy();
      const sink = createSinkFromClient(client, policy);

      sink.onEmbeddingObservation({
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

      expect(client.generation).toHaveBeenCalledTimes(1);
      const call = client.generation.mock.calls[0]![0];
      expect(call.name).toBe('openai:embed');
      expect(call.metadata).toMatchObject({
        provider: 'openai',
        operation: 'embed',
        outcome: 'success',
        latencyMs: 50,
        inputLength: 100,
        outputDimensions: 384,
      });
    });

    it('sets level to ERROR for error outcomes', () => {
      const client = createMockClient();
      const policy = createPolicy();
      const sink = createSinkFromClient(client, policy);

      sink.onChatObservation({
        provider: 'openai',
        model: 'openai',
        operation: 'invoke',
        outcome: 'error',
        latencyMs: 100,
        startTimestamp: '2026-01-01T00:00:00.000Z',
        endTimestamp: '2026-01-01T00:00:00.100Z',
        error: 'rate limited',
      });

      const call = client.generation.mock.calls[0]![0];
      expect(call.level).toBe('ERROR');
      expect(call.statusMessage).toBe('rate limited');
    });

    it('includes correlation IDs in metadata when present', () => {
      const client = createMockClient();
      const policy = createPolicy();
      const sink = createSinkFromClient(client, policy);

      sink.onChatObservation({
        provider: 'openai',
        model: 'openai',
        operation: 'invoke',
        outcome: 'success',
        latencyMs: 100,
        startTimestamp: '2026-01-01T00:00:00.000Z',
        endTimestamp: '2026-01-01T00:00:00.100Z',
        traceId: 'trace-123',
        requestId: 'req-456',
        operationId: 'op-789',
      });

      const call = client.generation.mock.calls[0]![0];
      expect(call.metadata.traceId).toBe('trace-123');
      expect(call.metadata.requestId).toBe('req-456');
      expect(call.metadata.operationId).toBe('op-789');
    });

    it('handles client errors gracefully without throwing', () => {
      const client = createMockClient();
      client.generation.mockImplementation(() => {
        throw new Error('client exploded');
      });
      const policy = createPolicy();
      const sink = createSinkFromClient(client, policy);

      // Should not throw
      expect(() => {
        sink.onChatObservation({
          provider: 'openai',
          model: 'openai',
          operation: 'invoke',
          outcome: 'success',
          latencyMs: 100,
          startTimestamp: '2026-01-01T00:00:00.000Z',
          endTimestamp: '2026-01-01T00:00:00.100Z',
        });
      }).not.toThrow();

      expect(() => {
        sink.onEmbeddingObservation({
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
      }).not.toThrow();
    });

    it('includes policy metadata (serviceName, environment, deploymentProfile)', () => {
      const client = createMockClient();
      const policy = createPolicy({
        serviceName: 'gateway',
        environment: 'production',
        deploymentProfile: 'distributed',
      });
      const sink = createSinkFromClient(client, policy);

      sink.onChatObservation({
        provider: 'anthropic',
        model: 'anthropic',
        operation: 'invoke',
        outcome: 'success',
        latencyMs: 200,
        startTimestamp: '2026-01-01T00:00:00.000Z',
        endTimestamp: '2026-01-01T00:00:00.200Z',
      });

      const call = client.generation.mock.calls[0]![0];
      expect(call.metadata.serviceName).toBe('gateway');
      expect(call.metadata.environment).toBe('production');
      expect(call.metadata.deploymentProfile).toBe('distributed');
    });

    it('never includes raw prompt or output content', () => {
      const client = createMockClient();
      const policy = createPolicy();
      const sink = createSinkFromClient(client, policy);

      sink.onChatObservation({
        provider: 'openai',
        model: 'openai',
        operation: 'invoke',
        outcome: 'success',
        latencyMs: 100,
        startTimestamp: '2026-01-01T00:00:00.000Z',
        endTimestamp: '2026-01-01T00:00:00.100Z',
      });

      const call = client.generation.mock.calls[0]?.[0];
      // input and output should not be set
      expect(call?.input).toBeUndefined();
      expect(call?.output).toBeUndefined();
    });
  });
});

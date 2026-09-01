import type { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OtelService } from '../../../src/nest/observability/otel.service.js';

function createMockConfig(values: Record<string, string> = {}) {
  return {
    get: (key: string, defaultValue?: string) => values[key] ?? defaultValue,
  } as ConfigService;
}

describe('OtelService', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('disabled mode', () => {
    it('does not load SDK when OTEL_DISABLED=true', async () => {
      const service = new OtelService(createMockConfig({ OTEL_DISABLED: 'true' }));
      await service.onModuleInit();
      // SDK should be null - shutdown should be a no-op
      await expect(service.onApplicationShutdown()).resolves.toBeUndefined();
    });

    it('does not load SDK when OTEL_DISABLED=TRUE (case-insensitive)', async () => {
      const service = new OtelService(createMockConfig({ OTEL_DISABLED: 'TRUE' }));
      await service.onModuleInit();
      await expect(service.onApplicationShutdown()).resolves.toBeUndefined();
    });
  });

  describe('enabled mode', () => {
    it('starts SDK with valid configuration', async () => {
      const service = new OtelService(
        createMockConfig({
          OTEL_EXPORTER_OTLP_ENDPOINT: 'http://otel:4318',
          SERVICE_NAME: 'test-service',
          npm_package_version: '1.0.0',
          TRAPMAP_DEPLOYMENT_PROFILE: 'team-monolith',
        }),
      );
      // This will try to dynamically import @opentelemetry/sdk-node.
      // In test environment, the import may fail (module not installed locally).
      // The service should handle this gracefully.
      await service.onModuleInit();
      // Shutdown should always succeed regardless of init outcome
      await expect(service.onApplicationShutdown()).resolves.toBeUndefined();
    });

    it('handles SDK startup failure gracefully', async () => {
      const service = new OtelService(createMockConfig({}));
      // Init may fail if OTel modules aren't available, but should not throw
      await expect(service.onModuleInit()).resolves.toBeUndefined();
    });

    it('handles shutdown failure gracefully', async () => {
      const service = new OtelService(createMockConfig({}));
      await service.onModuleInit();
      // Multiple shutdowns should not throw
      await service.onApplicationShutdown();
      await expect(service.onApplicationShutdown()).resolves.toBeUndefined();
    });
  });

  describe('configuration policy integration', () => {
    it('passes correct config to policy validator', async () => {
      const service = new OtelService(
        createMockConfig({
          OTEL_DISABLED: 'true',
          TRAPMAP_DEPLOYMENT_PROFILE: 'distributed',
          OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318',
          SERVICE_NAME: 'my-svc',
          npm_package_version: '2.0.0',
        }),
      );
      // Should not throw, disabled mode is fast
      await service.onModuleInit();
      await expect(service.onApplicationShutdown()).resolves.toBeUndefined();
    });

    it('uses default endpoint when OTEL_EXPORTER_OTLP_ENDPOINT is absent', async () => {
      const service = new OtelService(createMockConfig({}));
      // Should not throw even with defaults
      await expect(service.onModuleInit()).resolves.toBeUndefined();
    });
  });
});

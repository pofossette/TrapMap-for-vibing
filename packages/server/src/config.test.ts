import { afterEach, describe, expect, it, vi } from 'vitest';

import { ServerConfigSchema, loadConfig } from './config.js';
import { createGraphQueryRuntimeState, loadGraphDbConfig } from './lib/graph-query/config.js';

const originalEnv = { ...process.env };

const minimalAi = {
  provider: 'openai' as const,
  baseUrl: 'https://api.openai.com/v1',
  apiKey: 'sk-test',
  chatModel: 'gpt-4o-mini',
  embeddingModel: 'text-embedding-3-small',
  isConfigured: false,
  promptTemplateFile: null as string | null,
};

const minimalConfig = {
  dataFile: '/tmp/data.json',
  databaseUrl: null as string | null,
  systemAdminKey: null as string | null,
  runtime: {
    requestIdHeader: 'x-request-id',
    traceHeaderName: 'traceparent',
  },
  deployment: {
    profile: null as 'local-agent' | 'team-monolith' | 'distributed' | null,
    preset: 'monolith' as const,
    compatibility: {
      profile: 'team-monolith' as const,
      source: 'inferred' as const,
      requiresGateway: true as const,
      requiresAsyncOwnership: false,
      allowsSingleProcess: true,
      requiresPostgres: true,
      minimumPreset: 'monolith' as const,
    },
  },
  asyncTaskTransport: {
    provider: 'postgres' as const,
    rabbitmq: null,
  },
  graphDb: {
    enabled: false,
    provider: 'neo4j' as const,
    uri: null as string | null,
    username: null as string | null,
    password: null as string | null,
    database: 'neo4j',
    failOpen: true,
    syncOnWrite: true,
  },
  ai: minimalAi,
  userOpsLog: {},
  ragLog: {},
};

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  Object.assign(process.env, vars);
  try {
    fn();
  } finally {
    for (const k of Object.keys(vars)) {
      if (vars[k] === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = originalEnv[k];
      }
    }
  }
}

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllEnvs();
});

// =============================================================================
// Schema-level tests
// =============================================================================

describe('ServerConfigSchema', () => {
  describe('defaults', () => {
    it('uses default host when not provided', () => {
      const result = ServerConfigSchema.safeParse(minimalConfig);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.host).toBe('127.0.0.1');
      }
    });

    it('uses default port when not provided', () => {
      const result = ServerConfigSchema.safeParse(minimalConfig);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.port).toBe(4000);
      }
    });

    it("defaults corsAllowedOrigins to ['*']", () => {
      const result = ServerConfigSchema.safeParse(minimalConfig);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.corsAllowedOrigins).toEqual(['*']);
      }
    });

    it('defaults rateLimitMaxPerMinute to 0 (disabled)', () => {
      const result = ServerConfigSchema.safeParse(minimalConfig);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.rateLimitMaxPerMinute).toBe(0);
      }
    });

    it('defaults sessionTransport to bearer-header', () => {
      const result = ServerConfigSchema.safeParse(minimalConfig);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.sessionTransport).toBe('bearer-header');
      }
    });
  });

  describe('invalid values fail-fast', () => {
    it('rejects invalid port (negative)', () => {
      const result = ServerConfigSchema.safeParse({ ...minimalConfig, port: -1 });
      expect(result.success).toBe(false);
    });

    it('rejects invalid port (out of range)', () => {
      const result = ServerConfigSchema.safeParse({ ...minimalConfig, port: 99999 });
      expect(result.success).toBe(false);
    });

    it('rejects invalid database URL', () => {
      const result = ServerConfigSchema.safeParse({ ...minimalConfig, databaseUrl: 'not-a-url' });
      expect(result.success).toBe(false);
    });

    it('rejects invalid sessionTransport enum value', () => {
      const result = ServerConfigSchema.safeParse({ ...minimalConfig, sessionTransport: 'basic' });
      expect(result.success).toBe(false);
    });

    it('rejects negative rateLimitMaxPerMinute', () => {
      const result = ServerConfigSchema.safeParse({ ...minimalConfig, rateLimitMaxPerMinute: -5 });
      expect(result.success).toBe(false);
    });

    it('accepts rateLimitMaxPerMinute of 0', () => {
      const result = ServerConfigSchema.safeParse({ ...minimalConfig, rateLimitMaxPerMinute: 0 });
      expect(result.success).toBe(true);
    });
  });

  describe('corsAllowedOrigins parsing', () => {
    it('accepts a single origin', () => {
      const result = ServerConfigSchema.safeParse({
        ...minimalConfig,
        corsAllowedOrigins: ['https://example.com'],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.corsAllowedOrigins).toEqual(['https://example.com']);
      }
    });

    it('accepts multiple origins', () => {
      const result = ServerConfigSchema.safeParse({
        ...minimalConfig,
        corsAllowedOrigins: ['https://a.com', 'https://b.com'],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.corsAllowedOrigins).toHaveLength(2);
      }
    });

    it('accepts empty array', () => {
      const result = ServerConfigSchema.safeParse({
        ...minimalConfig,
        corsAllowedOrigins: [],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('sessionTransport valid values', () => {
    it('accepts bearer-header', () => {
      const result = ServerConfigSchema.safeParse({
        ...minimalConfig,
        sessionTransport: 'bearer-header',
      });
      expect(result.success).toBe(true);
    });

    it('accepts cookie', () => {
      const result = ServerConfigSchema.safeParse({
        ...minimalConfig,
        sessionTransport: 'cookie',
      });
      expect(result.success).toBe(true);
    });
  });
});

// =============================================================================
// loadConfig tests with environment variable parsing
// =============================================================================

describe('loadConfig', () => {
  it('returns a valid config with defaults when no env vars are set', () => {
    const cleanEnv: Record<string, string | undefined> = {};
    const envKeys = [
      'TRAPMAP_DATA_FILE',
      'TRAPMAP_DATABASE_URL',
      'HOST',
      'PORT',
      'TRAPMAP_SYSTEM_ADMIN_KEY',
      'CORS_ORIGINS',
      'RATE_LIMIT_MAX_PER_MINUTE',
      'SESSION_TRANSPORT',
      'AI_PROVIDER',
      'AI_BASE_URL',
      'AI_API_KEY',
      'AI_CHAT_MODEL',
      'AI_EMBEDDING_MODEL',
      'OPENAI_API_KEY',
      'NODE_ENV',
      'AI_PROMPT_TEMPLATE_FILE',
      'LOG_USER_OPS_ENABLED',
      'LOG_USER_OPS_DIR',
      'LOG_RAG_ENABLED',
      'LOG_RAG_DIR',
      'TRAPMAP_GRAPH_DB_ENABLED',
      'TRAPMAP_GRAPH_DB_PROVIDER',
      'TRAPMAP_GRAPH_DB_URI',
      'TRAPMAP_GRAPH_DB_USERNAME',
      'TRAPMAP_GRAPH_DB_PASSWORD',
      'TRAPMAP_GRAPH_DB_DATABASE',
      'TRAPMAP_GRAPH_DB_FAIL_OPEN',
      'TRAPMAP_GRAPH_DB_SYNC_ON_WRITE',
      'TRAPMAP_DEPLOYMENT_PROFILE',
      'TRAPMAP_DEPLOYMENT_PRESET',
      'TRAPMAP_TASK_TRANSPORT',
      'TRAPMAP_RABBITMQ_URL',
      'TRAPMAP_RABBITMQ_TASK_EXCHANGE',
      'TRAPMAP_RABBITMQ_TASK_QUEUE',
      'TRAPMAP_RABBITMQ_PREFETCH',
    ];
    for (const k of envKeys) {
      cleanEnv[k] = undefined;
    }

    withEnv(cleanEnv, () => {
      const config = loadConfig();
      expect(config.host).toBe('127.0.0.1');
      expect(config.port).toBe(4000);
      expect(config.corsAllowedOrigins).toEqual(['*']);
      expect(config.rateLimitMaxPerMinute).toBe(0);
      expect(config.sessionTransport).toBe('bearer-header');
      expect(config.runtime).toEqual({
        requestIdHeader: 'x-request-id',
        traceHeaderName: 'traceparent',
      });
      expect(config.systemAdminKey).toBeNull();
      expect(config.databaseUrl).toBeNull();
      expect(config.graphDb).toEqual({
        enabled: false,
        provider: 'neo4j',
        uri: null,
        username: null,
        password: null,
        database: 'neo4j',
        failOpen: true,
        syncOnWrite: true,
      });
      expect(config.deployment).toEqual({
        profile: null,
        preset: 'monolith',
        compatibility: {
          profile: 'team-monolith',
          source: 'inferred',
          requiresGateway: true,
          requiresAsyncOwnership: false,
          allowsSingleProcess: true,
          requiresPostgres: true,
          minimumPreset: 'monolith',
        },
      });
    });
  });

  it('parses CORS_ORIGINS from comma-separated list', () => {
    withEnv({ CORS_ORIGINS: 'https://a.com, https://b.com' }, () => {
      const config = loadConfig();
      expect(config.corsAllowedOrigins).toEqual(['https://a.com', 'https://b.com']);
    });
  });

  it('parses single CORS_ORIGINS value', () => {
    withEnv({ CORS_ORIGINS: 'https://example.com' }, () => {
      const config = loadConfig();
      expect(config.corsAllowedOrigins).toEqual(['https://example.com']);
    });
  });

  it('parses runtime request and trace headers from env', () => {
    withEnv(
      {
        TRAPMAP_REQUEST_ID_HEADER: 'X-Correlation-ID',
        TRAPMAP_TRACE_HEADER_NAME: 'X-Trace-Id',
      },
      () => {
        const config = loadConfig();
        expect(config.runtime).toEqual({
          requestIdHeader: 'x-correlation-id',
          traceHeaderName: 'x-trace-id',
        });
      },
    );
  });

  it("parses CORS_ORIGINS=* as ['*']", () => {
    withEnv({ CORS_ORIGINS: '*' }, () => {
      const config = loadConfig();
      expect(config.corsAllowedOrigins).toEqual(['*']);
    });
  });

  it('parses CORS_ORIGINS="" (empty string) as []', () => {
    withEnv({ CORS_ORIGINS: '' }, () => {
      const config = loadConfig();
      expect(config.corsAllowedOrigins).toEqual([]);
    });
  });

  it('parses RATE_LIMIT_MAX_PER_MINUTE', () => {
    withEnv({ RATE_LIMIT_MAX_PER_MINUTE: '60' }, () => {
      const config = loadConfig();
      expect(config.rateLimitMaxPerMinute).toBe(60);
    });
  });

  it('parses SESSION_TRANSPORT=cookie', () => {
    withEnv({ SESSION_TRANSPORT: 'cookie' }, () => {
      const config = loadConfig();
      expect(config.sessionTransport).toBe('cookie');
    });
  });

  it('parses SESSION_TRANSPORT=bearer-header', () => {
    withEnv({ SESSION_TRANSPORT: 'bearer-header' }, () => {
      const config = loadConfig();
      expect(config.sessionTransport).toBe('bearer-header');
    });
  });

  it('fails fast on invalid port', () => {
    expect(() => loadConfig()).not.toThrow(); // defaults are valid

    withEnv({ PORT: 'abc' }, () => {
      expect(() => loadConfig()).toThrow('Configuration validation failed');
    });
  });

  it('parses HOST env var', () => {
    withEnv({ HOST: '0.0.0.0' }, () => {
      const config = loadConfig();
      expect(config.host).toBe('0.0.0.0');
    });
  });

  it('defaults HOST to 127.0.0.1 when empty string', () => {
    withEnv({ HOST: '' }, () => {
      const config = loadConfig();
      expect(config.host).toBe('127.0.0.1');
    });
  });

  it('parses PORT env var', () => {
    withEnv({ PORT: '3000' }, () => {
      const config = loadConfig();
      expect(config.port).toBe(3000);
    });
  });

  it('accepts valid database URL', () => {
    withEnv({ TRAPMAP_DATABASE_URL: 'postgres://user:pass@localhost:5432/db' }, () => {
      const config = loadConfig();
      expect(config.databaseUrl).toBe('postgres://user:pass@localhost:5432/db');
    });
  });

  it('parses TRAPMAP_SYSTEM_ADMIN_KEY', () => {
    withEnv({ TRAPMAP_SYSTEM_ADMIN_KEY: 'sk-my-secret' }, () => {
      const config = loadConfig();
      expect(config.systemAdminKey).toBe('sk-my-secret');
    });
  });

  it('parses TRAPMAP_DATA_FILE', () => {
    withEnv({ TRAPMAP_DATA_FILE: '/custom/path/data.json' }, () => {
      const config = loadConfig();
      expect(config.dataFile).toContain('/custom/path/data.json');
    });
  });

  it('parses graph DB env vars', () => {
    withEnv(
      {
        TRAPMAP_GRAPH_DB_ENABLED: 'true',
        TRAPMAP_GRAPH_DB_PROVIDER: 'neo4j',
        TRAPMAP_GRAPH_DB_URI: 'bolt://127.0.0.1:7687',
        TRAPMAP_GRAPH_DB_USERNAME: 'neo4j',
        TRAPMAP_GRAPH_DB_PASSWORD: 'secret',
        TRAPMAP_GRAPH_DB_DATABASE: 'trapmap',
        TRAPMAP_GRAPH_DB_FAIL_OPEN: 'false',
        TRAPMAP_GRAPH_DB_SYNC_ON_WRITE: 'false',
      },
      () => {
        const config = loadConfig();
        expect(config.graphDb).toEqual({
          enabled: true,
          provider: 'neo4j',
          uri: 'bolt://127.0.0.1:7687',
          username: 'neo4j',
          password: 'secret',
          database: 'trapmap',
          failOpen: false,
          syncOnWrite: false,
        });
      },
    );
  });

  it('parses optional deployment preset and task transport config', () => {
    withEnv(
      {
        TRAPMAP_DEPLOYMENT_PRESET: 'candidate-worker',
        TRAPMAP_TASK_TRANSPORT: 'rabbitmq',
        TRAPMAP_RABBITMQ_URL: 'amqp://guest:guest@localhost:5672',
      },
      () => {
        const config = loadConfig();

        expect(config.deployment.preset).toBe('candidate-worker');
        expect(config.asyncTaskTransport.provider).toBe('rabbitmq');
        expect(config.asyncTaskTransport.rabbitmq?.url).toBe(
          'amqp://guest:guest@localhost:5672',
        );
        expect(config.deployment.compatibility).toEqual({
          profile: 'distributed',
          source: 'inferred',
          requiresGateway: true,
          requiresAsyncOwnership: true,
          allowsSingleProcess: false,
          requiresPostgres: true,
          minimumPreset: 'api',
        });
      },
    );
  });

  it('accepts local-agent profile without postgres or worker-only settings', () => {
    withEnv({ TRAPMAP_DEPLOYMENT_PROFILE: 'local-agent' }, () => {
      const config = loadConfig();

      expect(config.databaseUrl).toBeNull();
      expect(config.deployment).toEqual({
        profile: 'local-agent',
        preset: 'monolith',
        compatibility: {
          profile: 'local-agent',
          source: 'explicit',
          requiresGateway: true,
          requiresAsyncOwnership: false,
          allowsSingleProcess: true,
          requiresPostgres: false,
          minimumPreset: 'monolith',
        },
      });
    });
  });

  it('accepts explicit distributed profile and keeps it distinct from combined monolith defaults', () => {
    withEnv({ TRAPMAP_DEPLOYMENT_PROFILE: 'distributed' }, () => {
      const config = loadConfig();

      expect(config.deployment.profile).toBe('distributed');
      expect(config.deployment.preset).toBe('monolith');
      expect(config.deployment.compatibility).toEqual({
        profile: 'distributed',
        source: 'explicit',
        requiresGateway: true,
        requiresAsyncOwnership: true,
        allowsSingleProcess: false,
        requiresPostgres: true,
        minimumPreset: 'api',
      });
    });
  });

  it('fails fast when graph DB is enabled without required connection fields', () => {
    withEnv({ TRAPMAP_GRAPH_DB_ENABLED: 'true' }, () => {
      expect(() => loadGraphDbConfig()).toThrow('Graph DB configuration validation failed');
    });
  });

  it('maps graph DB config to disabled mode by default', () => {
    const state = createGraphQueryRuntimeState({
      enabled: false,
      provider: 'neo4j',
      uri: null,
      username: null,
      password: null,
      database: 'neo4j',
      failOpen: true,
      syncOnWrite: true,
    });

    expect(state).toEqual({
      mode: 'disabled',
      backendKind: 'memory',
      failOpen: true,
    });
  });

  it('maps graph DB config to fail-open fallback mode when requested', () => {
    const state = createGraphQueryRuntimeState(
      {
        enabled: true,
        provider: 'neo4j',
        uri: 'bolt://127.0.0.1:7687',
        username: 'neo4j',
        password: 'secret',
        database: 'neo4j',
        failOpen: true,
        syncOnWrite: true,
      },
      { fallbackActive: true, detail: 'neo4j unavailable' },
    );

    expect(state).toEqual({
      mode: 'enabled-fallback',
      backendKind: 'neo4j',
      failOpen: true,
      detail: 'neo4j unavailable',
    });
  });
});

import path from 'node:path';
import { z } from 'zod';

import { loadAiProviderConfig } from './lib/ai/index.js';
import { GraphDbConfigSchema, loadGraphDbConfig } from './lib/graph-query/config.js';
import { loadRagLogConfig } from './lib/rag-log.js';
import { loadUserOpsLogConfig } from './lib/user-ops-log.js';

// =============================================================================
// Zod Schemas for Configuration Validation
// =============================================================================

/**
 * Schema for server host configuration.
 */
const HostSchema = z.string().min(1).default('127.0.0.1');

/**
 * Schema for server port configuration.
 */
const PortSchema = z.coerce.number().int().min(1).max(65535).default(4000);

/**
 * Schema for user operations log configuration.
 */
const UserOpsLogSchema = z.object({
  enabled: z.boolean().default(false),
  logDir: z.string().min(1).default('logs/user-ops'),
  maxFileSizeBytes: z
    .number()
    .int()
    .positive()
    .default(10 * 1024 * 1024),
  maxBackupFiles: z.number().int().min(0).max(100).default(5),
});

/**
 * Schema for RAG log configuration.
 */
const RagLogSchema = z.object({
  enabled: z.boolean().default(false),
  logDir: z.string().min(1).default('logs/rag'),
  maxFileSizeBytes: z
    .number()
    .int()
    .positive()
    .default(10 * 1024 * 1024),
  maxBackupFiles: z.number().int().min(0).max(100).default(5),
});

const CorsOriginsSchema = z.array(z.string()).default(['*']);

const RateLimitMaxSchema = z.coerce.number().int().min(0).default(0);

const SessionTransportSchema = z.enum(['bearer-header', 'cookie']).default('bearer-header');

const RuntimeConfigSchema = z.object({
  requestIdHeader: z.string().min(1).default('x-request-id'),
  traceHeaderName: z.string().min(1).default('traceparent'),
});

/**
 * Full server configuration schema.
 */
export const ServerConfigSchema = z.object({
  dataFile: z.string().min(1),
  databaseUrl: z.string().url().nullable(),
  host: HostSchema,
  port: PortSchema,
  systemAdminKey: z.string().nullable(),
  corsAllowedOrigins: CorsOriginsSchema,
  rateLimitMaxPerMinute: RateLimitMaxSchema,
  sessionTransport: SessionTransportSchema,
  runtime: RuntimeConfigSchema,
  userOpsLog: UserOpsLogSchema,
  ragLog: RagLogSchema,
  graphDb: GraphDbConfigSchema,
  ai: z.object({
    provider: z.enum(['openai', 'openai-compatible', 'ollama', 'google-genai', 'fallback']),
    baseUrl: z.string(),
    apiKey: z.string(),
    chatModel: z.string(),
    embeddingModel: z.string(),
    isConfigured: z.boolean(),
    promptTemplateFile: z.string().nullable(),
  }),
});

// =============================================================================
// Configuration Types
// =============================================================================

export type ServerConfig = z.infer<typeof ServerConfigSchema>;

// =============================================================================
// Configuration Loading with Validation
// =============================================================================

/**
 * Load and validate server configuration from environment variables.
 * Throws on startup if configuration is invalid (fail-fast).
 */
export function loadConfig(): ServerConfig {
  // Load sub-configurations (they have their own validation)
  const userOpsLog = loadUserOpsLogConfig();
  const ragLog = loadRagLogConfig();
  const graphDb = loadGraphDbConfig();
  const ai = loadAiProviderConfig();

  // Parse CORS origins from comma-separated env var
  const corsOriginRaw = process.env.CORS_ORIGINS?.trim();
  const corsOrigins =
    corsOriginRaw !== undefined
      ? corsOriginRaw
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
      : undefined;

  // Build the full config object
  const rawConfig = {
    dataFile: path.resolve(
      process.cwd(),
      process.env.TRAPMAP_DATA_FILE ?? '.data/skill-shareer.json',
    ),
    databaseUrl: process.env.TRAPMAP_DATABASE_URL ?? null,
    host: (process.env.HOST?.trim() || undefined) ?? '127.0.0.1',
    port: process.env.PORT ?? 4000,
    systemAdminKey: process.env.TRAPMAP_SYSTEM_ADMIN_KEY ?? null,
    corsAllowedOrigins: corsOrigins,
    rateLimitMaxPerMinute: process.env.RATE_LIMIT_MAX_PER_MINUTE,
    sessionTransport: process.env.SESSION_TRANSPORT,
    runtime: {
      requestIdHeader:
        (process.env.TRAPMAP_REQUEST_ID_HEADER?.trim().toLowerCase() || undefined) ??
        'x-request-id',
      traceHeaderName:
        (process.env.TRAPMAP_TRACE_HEADER_NAME?.trim().toLowerCase() || undefined) ??
        'traceparent',
    },
    userOpsLog,
    ragLog,
    graphDb,
    ai,
  };

  // Validate the full configuration
  const result = ServerConfigSchema.safeParse(rawConfig);
  if (!result.success) {
    const errors = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n  ');
    throw new Error(`Configuration validation failed:\n  ${errors}`);
  }

  return result.data;
}

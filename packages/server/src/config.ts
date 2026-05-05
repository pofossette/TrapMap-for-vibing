import path from 'node:path';
import { z } from 'zod';

import { type AiProviderConfig, loadAiProviderConfig } from './lib/ai/index.js';
import { type RagLogConfig, loadRagLogConfig } from './lib/rag-log.js';
import { type UserOpsLogConfig, loadUserOpsLogConfig } from './lib/user-ops-log.js';

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

/**
 * Full server configuration schema.
 */
export const ServerConfigSchema = z.object({
  dataFile: z.string().min(1),
  databaseUrl: z.string().url().nullable(),
  host: HostSchema,
  port: PortSchema,
  systemAdminKey: z.string().nullable(),
  userOpsLog: UserOpsLogSchema,
  ragLog: RagLogSchema,
  ai: z.object({
    provider: z.enum(['openai', 'openai-compatible', 'ollama', 'google-genai', 'fallback']),
    baseUrl: z.string(),
    apiKey: z.string(),
    chatModel: z.string(),
    embeddingModel: z.string(),
    isConfigured: z.boolean(),
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
  const ai = loadAiProviderConfig();

  // Build the full config object
  const rawConfig = {
    dataFile: path.resolve(
      process.cwd(),
      process.env.TRAPMAP_DATA_FILE ?? '.data/skill-shareer.json',
    ),
    databaseUrl: process.env.TRAPMAP_DATABASE_URL ?? null,
    host: process.env.HOST ?? '127.0.0.1',
    port: process.env.PORT ?? 4000,
    systemAdminKey: process.env.TRAPMAP_SYSTEM_ADMIN_KEY ?? null,
    userOpsLog,
    ragLog,
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

/**
 * Load configuration for test environments with relaxed validation.
 * Provides sensible defaults for testing without requiring env vars.
 */
export function loadTestConfig(): ServerConfig {
  const userOpsLog: UserOpsLogConfig = {
    enabled: false,
    logDir: '.tmp/logs/user-ops',
    maxFileSizeBytes: 10 * 1024 * 1024,
    maxBackupFiles: 5,
  };

  const ragLog: RagLogConfig = {
    enabled: false,
    logDir: '.tmp/logs/rag',
    maxFileSizeBytes: 10 * 1024 * 1024,
    maxBackupFiles: 5,
  };

  const ai: AiProviderConfig = {
    provider: 'fallback',
    baseUrl: '',
    apiKey: '',
    chatModel: '',
    embeddingModel: '',
    isConfigured: false,
  };

  return {
    dataFile: '.tmp/test-data/skill-shareer.json',
    databaseUrl: null,
    host: '127.0.0.1',
    port: 4000,
    systemAdminKey: null,
    userOpsLog,
    ragLog,
    ai,
  };
}

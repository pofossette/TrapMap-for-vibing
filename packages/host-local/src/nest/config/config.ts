import { createHash } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';

import { resolveDeploymentProfileCompatibility, resolveRuntimeDeployment } from '@trapmap/backend-core';

import { loadAiProviderConfig } from './ai-provider-config.js';
import { GraphDbConfigSchema, loadGraphDbConfig } from './graph-db-config.js';
import { loadRagLogConfig } from './rag-log.js';
import { loadUserOpsLogConfig } from './user-ops-log.js';

const HostSchema = z.string().min(1).default('127.0.0.1');
const PortSchema = z.coerce.number().int().min(1).max(65535).default(4000);

const UserOpsLogSchema = z.object({
  enabled: z.boolean().default(false),
  logDir: z.string().min(1).default('logs/user-ops'),
  maxFileSizeBytes: z.number().int().positive().default(10 * 1024 * 1024),
  maxBackupFiles: z.number().int().min(0).max(100).default(5),
});

const RagLogSchema = z.object({
  enabled: z.boolean().default(false),
  logDir: z.string().min(1).default('logs/rag'),
  maxFileSizeBytes: z.number().int().positive().default(10 * 1024 * 1024),
  maxBackupFiles: z.number().int().min(0).max(100).default(5),
});

const CorsOriginsSchema = z.array(z.string()).default(['*']);
const RateLimitMaxSchema = z.coerce.number().int().min(0).default(0);
const SessionTransportSchema = z.enum(['bearer-header', 'cookie']).default('bearer-header');
const RuntimeConfigSchema = z.object({
  requestIdHeader: z.string().min(1).default('x-request-id'),
  traceHeaderName: z.string().min(1).default('traceparent'),
});
const RabbitMqTaskTransportSchema = z.object({
  url: z.string().min(1),
  exchange: z.string().min(1).default('trapmap.tasks'),
  queue: z.string().min(1).default('trapmap.default'),
  prefetch: z.coerce.number().int().min(1).max(100).default(1),
});
const AsyncTaskTransportSchema = z
  .object({
    provider: z.enum(['postgres', 'rabbitmq']).default('postgres'),
    rabbitmq: RabbitMqTaskTransportSchema.nullable().default(null),
  })
  .superRefine((value, ctx) => {
    if (value.provider === 'rabbitmq' && value.rabbitmq === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rabbitmq'],
        message: 'RabbitMQ config is required when TRAPMAP_TASK_TRANSPORT=rabbitmq',
      });
    }
  });

const DeploymentSchema = z.object({
  profile: z.enum(['local-agent', 'team-monolith', 'distributed']).nullable().default(null),
  preset: z
    .enum(['monolith', 'api', 'candidate-worker', 'governance-worker', 'outbox-worker'])
    .default('monolith'),
  compatibility: z.object({
    profile: z.enum(['local-agent', 'team-monolith', 'distributed']),
    source: z.enum(['explicit', 'inferred']),
    requiresGateway: z.literal(true),
    requiresAsyncOwnership: z.boolean(),
    allowsSingleProcess: z.boolean(),
    requiresPostgres: z.boolean(),
    minimumPreset: z.enum([
      'monolith',
      'api',
      'candidate-worker',
      'governance-worker',
      'outbox-worker',
    ]),
  }),
  resolved: z.object({
    deploymentProfile: z.enum(['local-agent', 'team-monolith', 'distributed']),
    profileSource: z.enum(['explicit', 'inferred']),
    preset: z.enum(['monolith', 'api', 'candidate-worker', 'governance-worker', 'outbox-worker']),
    runtimeMode: z.enum(['api', 'task-worker', 'outbox-worker', 'combined']),
    serviceUnit: z.enum(['full-platform', 'candidate-ingestion', 'knowledge-governance']),
    capabilities: z.object({
      routeSurface: z.enum(['minimal-agent', 'gateway-core', 'worker-status']),
      asyncOwnershipExpectation: z.enum(['local-owned', 'split-owned', 'remote-expected']),
      storagePosture: z.enum(['json-store-ok', 'postgres-required']),
      authTeamExpectation: z.enum(['single-user', 'team-auth']),
      exposesGateway: z.boolean(),
      exposesFullHttpApi: z.boolean(),
      supportsLocalSingleUserMode: z.boolean(),
      supportsJsonStore: z.boolean(),
      requiresPostgres: z.boolean(),
      requiresGateway: z.literal(true),
      requiresAsyncOwnership: z.boolean(),
      allowsSingleProcess: z.boolean(),
      ownsCandidateTaskWork: z.boolean(),
      ownsSharedJobTaskWork: z.boolean(),
      ownsOutboxWork: z.boolean(),
      supportsReviewGovernance: z.boolean(),
      supportsTeamAuth: z.boolean(),
      supportsDistributedRouting: z.boolean(),
    }),
  }),
});

export interface HostLocalConfig {
  dataFile: string;
  databaseUrl: string | null;
  host: string;
  port: number;
  systemAdminKey: string | null;
  corsAllowedOrigins: string[];
  rateLimitMaxPerMinute: number;
  sessionTransport: 'bearer-header' | 'cookie';
  runtime: {
    requestIdHeader: string;
    traceHeaderName: string;
  };
  deployment: z.infer<typeof DeploymentSchema>;
  asyncTaskTransport: z.infer<typeof AsyncTaskTransportSchema>;
  userOpsLog: z.infer<typeof UserOpsLogSchema>;
  ragLog: z.infer<typeof RagLogSchema>;
  graphDb: z.infer<typeof GraphDbConfigSchema>;
  ai: ReturnType<typeof loadAiProviderConfig>;
}

function normalizeOptionalEnvValue(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function loadConfig(): HostLocalConfig {
  const userOpsLog = loadUserOpsLogConfig();
  const ragLog = loadRagLogConfig();
  const graphDb = loadGraphDbConfig();
  const ai = loadAiProviderConfig();

  const corsOriginRaw = process.env.CORS_ORIGINS?.trim();
  const corsOrigins =
    corsOriginRaw !== undefined
      ? corsOriginRaw
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
      : undefined;

  const deploymentProfile = normalizeOptionalEnvValue(process.env.TRAPMAP_DEPLOYMENT_PROFILE) as
    | 'local-agent'
    | 'team-monolith'
    | 'distributed'
    | undefined;
  const deploymentPreset = normalizeOptionalEnvValue(process.env.TRAPMAP_DEPLOYMENT_PRESET) as
    | 'monolith'
    | 'api'
    | 'candidate-worker'
    | 'governance-worker'
    | 'outbox-worker'
    | undefined;
  const deploymentCompatibilityInput =
    deploymentProfile === undefined
      ? { preset: deploymentPreset }
      : { profile: deploymentProfile, preset: deploymentPreset };

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
        (process.env.TRAPMAP_TRACE_HEADER_NAME?.trim().toLowerCase() || undefined) ?? 'traceparent',
    },
    deployment: {
      profile: deploymentProfile ?? null,
      preset: deploymentPreset,
      compatibility: resolveDeploymentProfileCompatibility(deploymentCompatibilityInput),
      resolved: resolveRuntimeDeployment(deploymentCompatibilityInput),
    },
    asyncTaskTransport: {
      provider: process.env.TRAPMAP_TASK_TRANSPORT,
      rabbitmq: process.env.TRAPMAP_RABBITMQ_URL
        ? {
            url: process.env.TRAPMAP_RABBITMQ_URL,
            exchange: process.env.TRAPMAP_RABBITMQ_TASK_EXCHANGE,
            queue: process.env.TRAPMAP_RABBITMQ_TASK_QUEUE,
            prefetch: process.env.TRAPMAP_RABBITMQ_PREFETCH,
          }
        : null,
    },
    userOpsLog,
    ragLog,
    graphDb,
    ai,
  };

  const result = z
    .object({
      dataFile: z.string().min(1),
      databaseUrl: z.string().url().nullable(),
      host: HostSchema,
      port: PortSchema,
      systemAdminKey: z.string().nullable(),
      corsAllowedOrigins: CorsOriginsSchema,
      rateLimitMaxPerMinute: RateLimitMaxSchema,
      sessionTransport: SessionTransportSchema,
      runtime: RuntimeConfigSchema,
      deployment: DeploymentSchema,
      asyncTaskTransport: AsyncTaskTransportSchema,
      userOpsLog: UserOpsLogSchema,
      ragLog: RagLogSchema,
      graphDb: GraphDbConfigSchema,
      ai: z.any(),
    })
    .safeParse(rawConfig);

  if (!result.success) {
    const errors = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n  ');
    throw new Error(`Configuration validation failed:\n  ${errors}`);
  }

  return result.data as HostLocalConfig;
}

export function buildConfigFingerprint(config: HostLocalConfig): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        deploymentProfile: config.deployment.resolved.deploymentProfile,
        runtimeMode: config.deployment.resolved.runtimeMode,
        serviceUnit: config.deployment.resolved.serviceUnit,
        routeSurface: config.deployment.resolved.capabilities.routeSurface,
        asyncOwnershipExpectation: config.deployment.resolved.capabilities.asyncOwnershipExpectation,
        storagePosture: config.deployment.resolved.capabilities.storagePosture,
        authTeamExpectation: config.deployment.resolved.capabilities.authTeamExpectation,
        taskTransportProvider: config.asyncTaskTransport.provider,
        eventTransportProvider: 'postgres',
        graphEnabled: config.graphDb.enabled,
        graphProvider: config.graphDb.provider,
        aiProvider: config.ai.provider,
        sessionTransport: config.sessionTransport,
      }),
    )
    .digest('hex')
    .slice(0, 16);
}

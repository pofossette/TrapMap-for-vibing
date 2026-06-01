import { z } from 'zod';

import type { GraphQueryMode, GraphQueryRuntimeState } from './backend.js';

export const GraphDbConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    provider: z.enum(['neo4j']).default('neo4j'),
    uri: z.string().url().nullable().default(null),
    username: z.string().min(1).nullable().default(null),
    password: z.string().min(1).nullable().default(null),
    database: z.string().min(1).default('neo4j'),
    failOpen: z.boolean().default(true),
    syncOnWrite: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    if (!value.enabled) {
      return;
    }

    if (value.uri === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'uri is required when graph DB is enabled',
        path: ['uri'],
      });
    }

    if (value.username === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'username is required when graph DB is enabled',
        path: ['username'],
      });
    }

    if (value.password === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'password is required when graph DB is enabled',
        path: ['password'],
      });
    }
  });

export type GraphDbConfig = z.infer<typeof GraphDbConfigSchema>;

function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }

  return value === 'true';
}

export function loadGraphDbConfig(): GraphDbConfig {
  const result = GraphDbConfigSchema.safeParse({
    enabled: parseBooleanEnv(process.env.TRAPMAP_GRAPH_DB_ENABLED, false),
    provider: process.env.TRAPMAP_GRAPH_DB_PROVIDER,
    uri: process.env.TRAPMAP_GRAPH_DB_URI ?? null,
    username: process.env.TRAPMAP_GRAPH_DB_USERNAME ?? null,
    password: process.env.TRAPMAP_GRAPH_DB_PASSWORD ?? null,
    database: process.env.TRAPMAP_GRAPH_DB_DATABASE,
    failOpen: parseBooleanEnv(process.env.TRAPMAP_GRAPH_DB_FAIL_OPEN, true),
    syncOnWrite: parseBooleanEnv(process.env.TRAPMAP_GRAPH_DB_SYNC_ON_WRITE, true),
  });

  if (!result.success) {
    const errors = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n  ');
    throw new Error(`Graph DB configuration validation failed:\n  ${errors}`);
  }

  return result.data;
}

export function resolveGraphQueryMode(
  config: GraphDbConfig,
  options: { fallbackActive?: boolean } = {},
): GraphQueryMode {
  if (!config.enabled) {
    return 'disabled';
  }

  return options.fallbackActive === true ? 'enabled-fallback' : 'enabled-primary';
}

export function createGraphQueryRuntimeState(
  config: GraphDbConfig,
  options: { fallbackActive?: boolean; detail?: string } = {},
): GraphQueryRuntimeState {
  const mode = resolveGraphQueryMode(config, options);

  return {
    mode,
    backendKind: mode === 'disabled' ? 'memory' : config.provider,
    failOpen: config.failOpen,
    ...(options.detail ? { detail: options.detail } : {}),
  };
}

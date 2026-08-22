import type { z } from 'zod';

import type { McpConfig } from '../config.js';

/**
 * Role model (full matrix lands in Task B5 — permissions.ts).
 * Ordered from least to most privileged.
 */
export type Role = 'viewer' | 'contributor' | 'reviewer' | 'operator';

/** Minimal audit surface (replaced by structured audit logger in Task B6). */
export interface AuditLogger {
  info(line: string): void;
  error(line: string): void;
}

export interface ToolContext {
  config: McpConfig;
  logger: AuditLogger;
  /** Injectable fetch for tests; defaults to globalThis.fetch. */
  fetchImpl?: typeof fetch;
}

/**
 * A TrapMap MCP tool definition.
 *
 * `inputSchema` is a Zod **raw shape** (the MCP SDK expects a shape for
 * protocol-level JSON schema); handlers receive values already validated
 * with `.strict()` semantics — unknown keys are rejected before the handler
 * runs, so write tools cannot smuggle e.g. `lifecycle_state` or `actorId`.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodRawShape;
  requiredRole: Role;
  handler(input: Record<string, unknown>, ctx: ToolContext): Promise<unknown>;
}

export function defineTool(def: ToolDefinition): ToolDefinition {
  return def;
}

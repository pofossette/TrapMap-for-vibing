import { randomUUID } from 'node:crypto';

import type { AuditLogger } from './tools/shared.js';

interface AuditRecord {
  ts: string;
  tool?: string;
  correlationId: string;
  durationMs?: number;
  outcome: 'ok' | 'error';
}

/**
 * Task B6: structured audit logging for MCP tool calls.
 *
 * One JSON line per event on **stderr** (stdout belongs to the stdio
 * transport). Records carry identifiers/timing/outcome only — never tool
 * arguments, file contents, or credentials.
 */
export function createAuditLogger(
  write: (line: string) => void = (line) => process.stderr.write(`${line}\n`),
): AuditLogger {
  function toolSpan(tool: string): { ok: () => void; fail: () => void } {
    const startedAt = Date.now();
    const correlationId = randomUUID();
    const emit = (outcome: 'ok' | 'error'): void =>
      write(
        JSON.stringify({
          ts: new Date().toISOString(),
          tool,
          correlationId,
          durationMs: Date.now() - startedAt,
          outcome,
        } satisfies AuditRecord),
      );
    return { ok: () => emit('ok'), fail: () => emit('error') };
  }
  return { toolSpan };
}

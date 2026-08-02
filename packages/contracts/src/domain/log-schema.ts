import { z } from 'zod';

/**
 * Unified structured log entry schema.
 *
 * Both hosts (server / host-local) must emit log entries that conform
 * to this shape.  The schema is intentionally minimal — only the
 * canonical fields are required; extra passthrough fields are allowed.
 *
 * Loki labels are restricted to low-cardinality fields only:
 * `service`, `environment`, `level`.  High-cardinality values such as
 * `requestId`, `traceId`, and `context` MUST appear as structured
 * fields inside the log line, never as Loki labels.
 */
export const logEntrySchema = z
  .object({
    timestamp: z.string().datetime(),
    level: z.enum(['debug', 'info', 'warn', 'error']),
    service: z.string(),
    environment: z.string(),
    traceId: z.string().optional(),
    requestId: z.string().optional(),
    operationId: z.string().optional(),
    causationId: z.string().optional(),
    ownerSurface: z.string().optional(),
    context: z.string().optional(),
    message: z.string(),
  })
  .passthrough();

export type LogEntry = z.infer<typeof logEntrySchema>;

const SENSITIVE_LOG_KEY_PATTERN =
  /authorization|access[-_]?token|session[-_]?token|password|secret|cookie|session|prompt|content[-_]?body|raw[-_]?content|knowledge[-_]?body|request[-_]?body/i;

function redactValue(key: string, value: unknown): unknown {
  if (key && SENSITIVE_LOG_KEY_PATTERN.test(key)) {
    return '[REDACTED]';
  }
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (item && typeof item === 'object') {
        return redactLogContext(item as Record<string, unknown>);
      }
      return item;
    });
  }
  if (value && typeof value === 'object') {
    return redactLogContext(value as Record<string, unknown>);
  }
  return value;
}

export function redactLogContext(context: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => [key, redactValue(key, value)]),
  );
}

/**
 * Low-cardinality Loki label keys.  Only these fields may be used as
 * Loki labels; all other fields go inside the log line body.
 */
export const LOKI_LOW_CARDINALITY_LABELS = [
  'service',
  'environment',
  'level',
] as const satisfies ReadonlyArray<keyof LogEntry>;

/**
 * Build a Loki-safe label set from a log entry.  Only low-cardinality
 * fields are extracted; everything else is silently dropped.
 */
export function buildLokiLabels(entry: LogEntry): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const key of LOKI_LOW_CARDINALITY_LABELS) {
    const value = entry[key];
    if (value !== undefined) {
      labels[key] = value;
    }
  }
  return labels;
}

/**
 * Format a log entry for human-readable stdout when Loki is
 * unavailable.  The format is: `[LEVEL] message {json-context}`.
 */
export function formatLogForStdout(entry: LogEntry): string {
  return JSON.stringify(redactLogContext(entry));
}

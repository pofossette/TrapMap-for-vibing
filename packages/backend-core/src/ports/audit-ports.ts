/**
 * Audit and audit-specific metrics port interfaces.
 *
 * These ports define the contract for cross-cutting concerns that
 * all bounded-context modules may use: audit logging and metrics collection.
 */

// ---------------------------------------------------------------------------
// Audit log port
// ---------------------------------------------------------------------------

export interface AuditLogEntry {
  action: string;
  actorId: string;
  entityId?: string;
  teamId?: string;
  metadata?: Record<string, unknown>;
  timestamp?: string;
  eventVersion?: number;
  sourceService?: string;
  requestId?: string;
  traceId?: string;
  operationId?: string;
  causationId?: string;
  outcome?: 'success' | 'rejected' | 'failed';
}

export interface AuditLogPort {
  /**
   * Record an audit event.
   */
  record(entry: AuditLogEntry): Promise<void>;

  /**
   * Query audit events.
   */
  query(filter: {
    action?: string[];
    actorId?: string;
    entityId?: string;
    teamId?: string;
    requestId?: string;
    traceId?: string;
    operationId?: string;
    causationId?: string;
    from?: string;
    to?: string;
    limit?: number;
  }): Promise<{ items: AuditLogEntry[]; total: number }>;
}

// ---------------------------------------------------------------------------
// Audit metrics port
// ---------------------------------------------------------------------------

/**
 * Audit/write-path specific metrics hooks used by legacy backend-core tests.
 *
 * General telemetry metrics belong to `telemetry-ports.ts`.
 */
export interface AuditMetricsPort {
  /**
   * Increment a counter.
   */
  incrementCounter(name: string, labels?: Record<string, string>): void;

  /**
   * Record a duration observation (e.g. request latency).
   */
  recordDuration(name: string, durationMs: number, labels?: Record<string, string>): void;

  /**
   * Record a gauge value.
   */
  recordGauge(name: string, value: number, labels?: Record<string, string>): void;
}

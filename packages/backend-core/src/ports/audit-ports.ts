/**
 * Audit and metrics port interfaces.
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
    from?: string;
    to?: string;
    limit?: number;
  }): Promise<{ items: AuditLogEntry[]; total: number }>;
}

// ---------------------------------------------------------------------------
// Metrics port
// ---------------------------------------------------------------------------

/**
 * A host-agnostic metrics port. Implementations may wire to Prometheus,
 * OpenTelemetry, StatsD, or simple in-memory counters.
 */
export interface MetricsPort {
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

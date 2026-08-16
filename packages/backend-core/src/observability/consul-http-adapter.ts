import type {
  DiscoveredService,
  DiscoveryPort,
  ServiceRegistration,
} from '../ports/discovery-ports.js';

/**
 * Framework-agnostic Consul adapter implementing {@link DiscoveryPort}.
 *
 * Uses native fetch to call the Consul HTTP API — no `consul` npm dependency
 * needed. This is the single Consul plugin consumed by both host-local
 * (Nest lifecycle adapter) and host-distributed (Fastify gateway).
 *
 * Fail-open: every method catches errors and returns safe defaults so hosts
 * can still serve traffic when Consul is unavailable.
 */

// ---------------------------------------------------------------------------
// Consul HTTP API response shapes (minimal)
// ---------------------------------------------------------------------------

interface ConsulHealthServiceEntry {
  Service: {
    ID: string;
    Service: string;
    Address: string;
    Port: number;
    Meta?: Record<string, string>;
  };
  Node: {
    Address: string;
  };
}

// ---------------------------------------------------------------------------
// Adapter options
// ---------------------------------------------------------------------------

export interface ConsulHttpAdapterOptions {
  /** Consul HTTP API address (default http://localhost:8500). */
  consulAddress?: string;
  /** Request timeout in ms for Consul calls (default 3 000). */
  timeoutMs?: number;
  /**
   * When `true`, operational methods re-throw the underlying error after
   * logging instead of returning safe defaults. Distributed gateway adapters
   * use the fail-open default; lifecycle adapters that need to detect
   * unreachability so they can set degraded state enable this.
   */
  throwOnError?: boolean;
  /** Optional logger; defaults to console. */
  logger?: {
    warn: (msg: string) => void;
    debug: (msg: string) => void;
    log: (msg: string) => void;
  };
}

// ---------------------------------------------------------------------------
// Shared Consul HTTP DiscoveryPort implementation
// ---------------------------------------------------------------------------

export class ConsulHttpAdapter implements DiscoveryPort {
  private readonly consulAddress: string;
  private readonly timeoutMs: number;
  private readonly throwOnError: boolean;
  private readonly logger: NonNullable<ConsulHttpAdapterOptions['logger']>;

  constructor(options?: ConsulHttpAdapterOptions) {
    this.consulAddress = options?.consulAddress ?? 'http://localhost:8500';
    this.timeoutMs = options?.timeoutMs ?? 3_000;
    this.throwOnError = options?.throwOnError ?? false;
    this.logger = options?.logger ?? console;
  }

  // ─── DiscoveryPort ────────────────────────────────────────────────────

  async register(registration: ServiceRegistration): Promise<void> {
    try {
      const response = await this.put('/v1/agent/service/register', {
        ID: registration.id,
        Name: registration.name,
        Address: registration.address,
        Port: registration.port,
        Check: registration.check
          ? {
              HTTP: registration.check.http,
              Interval: registration.check.interval,
              Timeout: registration.check.timeout,
            }
          : undefined,
        Meta: registration.meta,
      });

      if (!response.ok) {
        this.logger.warn(`ConsulHttpAdapter: register failed (HTTP ${response.status})`);
      } else {
        this.logger.log(`ConsulHttpAdapter: registered ${registration.id} (${registration.name})`);
      }
    } catch (err) {
      this.logger.warn(
        `ConsulHttpAdapter: register error — ${err instanceof Error ? err.message : String(err)}`,
      );
      if (this.throwOnError) throw err;
    }
  }

  async deregister(serviceId: string): Promise<void> {
    try {
      const response = await this.put(
        `/v1/agent/service/deregister/${encodeURIComponent(serviceId)}`,
      );

      if (!response.ok) {
        this.logger.warn(`ConsulHttpAdapter: deregister failed (HTTP ${response.status})`);
      } else {
        this.logger.log(`ConsulHttpAdapter: deregistered ${serviceId}`);
      }
    } catch (err) {
      this.logger.warn(
        `ConsulHttpAdapter: deregister error — ${err instanceof Error ? err.message : String(err)}`,
      );
      if (this.throwOnError) throw err;
    }
  }

  async discover(serviceName: string): Promise<DiscoveredService[]> {
    try {
      const url = `${this.consulAddress}/v1/health/service/${encodeURIComponent(serviceName)}?passing=true`;
      const response = await this.fetch(url);

      if (!response.ok) {
        this.logger.warn(
          `ConsulHttpAdapter: discover(${serviceName}) returned HTTP ${response.status}`,
        );
        return [];
      }

      const entries = (await response.json()) as ConsulHealthServiceEntry[];
      return entries.map((entry): DiscoveredService => {
        const svc: DiscoveredService = {
          id: entry.Service.ID,
          address: entry.Service.Address || entry.Node.Address,
          port: entry.Service.Port,
        };
        if (entry.Service.Meta) {
          svc.meta = entry.Service.Meta;
        }
        return svc;
      });
    } catch (err) {
      this.logger.warn(
        `ConsulHttpAdapter: discover(${serviceName}) error — ${err instanceof Error ? err.message : String(err)}`,
      );
      if (this.throwOnError) throw err;
      return [];
    }
  }

  async getKV(key: string): Promise<string | undefined> {
    try {
      const url = `${this.consulAddress}/v1/kv/${encodeURIComponent(key)}?raw`;
      const response = await this.fetch(url);

      if (response.status === 404) return undefined;
      if (!response.ok) {
        this.logger.warn(`ConsulHttpAdapter: getKV(${key}) returned HTTP ${response.status}`);
        return undefined;
      }

      return await response.text();
    } catch (err) {
      this.logger.warn(
        `ConsulHttpAdapter: getKV(${key}) error — ${err instanceof Error ? err.message : String(err)}`,
      );
      if (this.throwOnError) throw err;
      return undefined;
    }
  }

  async setKV(key: string, value: string): Promise<void> {
    try {
      const url = `${this.consulAddress}/v1/kv/${encodeURIComponent(key)}`;
      const response = await this.fetch(url, {
        method: 'PUT',
        body: value,
      });

      if (!response.ok) {
        this.logger.warn(`ConsulHttpAdapter: setKV(${key}) returned HTTP ${response.status}`);
      }
    } catch (err) {
      this.logger.warn(
        `ConsulHttpAdapter: setKV(${key}) error — ${err instanceof Error ? err.message : String(err)}`,
      );
      if (this.throwOnError) throw err;
    }
  }

  // ─── Connectivity probe ───────────────────────────────────────────────

  /**
   * Probe Consul reachability by listing healthy services under the `consul`
   * service name. Returns `true` when the HTTP call succeeds (including when
   * no `consul` services are registered yet), `false` when the connection
   * fails. Unlike `discover`, this does not swallow the error into a safe
   * `[]` because framework adapters need to distinguish `unreachable` from
   * `no healthy instances`.
   */
  async isReachable(): Promise<boolean> {
    try {
      const response = await this.fetch(
        `${this.consulAddress}/v1/health/service/consul?passing=true`,
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  // ─── Internal helpers ─────────────────────────────────────────────────

  private fetch(url: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    return globalThis
      .fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(init?.headers ?? {}),
        },
      })
      .finally(() => clearTimeout(timer));
  }

  private put(path: string, body?: unknown): Promise<Response> {
    const url = `${this.consulAddress}${path}`;
    const init: RequestInit = {
      method: 'PUT',
    };
    if (body) {
      init.body = JSON.stringify(body);
    }
    return this.fetch(url, init);
  }
}

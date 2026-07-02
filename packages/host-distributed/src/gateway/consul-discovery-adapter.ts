/**
 * Framework-free Consul adapter implementing DiscoveryPort.
 *
 * Designed for the Fastify-based host-distributed gateway.  Uses native
 * fetch to call the Consul HTTP API — no `consul` npm dependency needed.
 *
 * Fail-open: every method catches errors and returns safe defaults so the
 * gateway can still serve traffic when Consul is unavailable.
 */

import type { DiscoveredService, DiscoveryPort, ServiceRegistration } from '@trapmap/backend-core';

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

export interface ConsulDiscoveryAdapterOptions {
  /** Consul HTTP API address (default http://localhost:8500). */
  consulAddress?: string;
  /** Request timeout in ms for Consul calls (default 3 000). */
  timeoutMs?: number;
  /** Optional logger; defaults to console. */
  logger?: {
    warn: (msg: string) => void;
    debug: (msg: string) => void;
    log: (msg: string) => void;
  };
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class ConsulDiscoveryAdapter implements DiscoveryPort {
  private readonly consulAddress: string;
  private readonly timeoutMs: number;
  private readonly logger: NonNullable<ConsulDiscoveryAdapterOptions['logger']>;

  constructor(options?: ConsulDiscoveryAdapterOptions) {
    this.consulAddress = options?.consulAddress ?? 'http://localhost:8500';
    this.timeoutMs = options?.timeoutMs ?? 3_000;
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
        this.logger.warn(`ConsulDiscoveryAdapter: register failed (HTTP ${response.status})`);
      } else {
        this.logger.log(
          `ConsulDiscoveryAdapter: registered ${registration.id} (${registration.name})`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `ConsulDiscoveryAdapter: register error — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async deregister(serviceId: string): Promise<void> {
    try {
      const response = await this.put(
        `/v1/agent/service/deregister/${encodeURIComponent(serviceId)}`,
      );

      if (!response.ok) {
        this.logger.warn(`ConsulDiscoveryAdapter: deregister failed (HTTP ${response.status})`);
      } else {
        this.logger.log(`ConsulDiscoveryAdapter: deregistered ${serviceId}`);
      }
    } catch (err) {
      this.logger.warn(
        `ConsulDiscoveryAdapter: deregister error — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async discover(serviceName: string): Promise<DiscoveredService[]> {
    try {
      const url = `${this.consulAddress}/v1/health/service/${encodeURIComponent(serviceName)}?passing=true`;
      const response = await this.fetch(url);

      if (!response.ok) {
        this.logger.warn(
          `ConsulDiscoveryAdapter: discover(${serviceName}) returned HTTP ${response.status}`,
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
        `ConsulDiscoveryAdapter: discover(${serviceName}) error — ${err instanceof Error ? err.message : String(err)}`,
      );
      return [];
    }
  }

  async getKV(key: string): Promise<string | undefined> {
    try {
      const url = `${this.consulAddress}/v1/kv/${encodeURIComponent(key)}?raw`;
      const response = await this.fetch(url);

      if (response.status === 404) return undefined;
      if (!response.ok) {
        this.logger.warn(`ConsulDiscoveryAdapter: getKV(${key}) returned HTTP ${response.status}`);
        return undefined;
      }

      return await response.text();
    } catch (err) {
      this.logger.warn(
        `ConsulDiscoveryAdapter: getKV(${key}) error — ${err instanceof Error ? err.message : String(err)}`,
      );
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
        this.logger.warn(`ConsulDiscoveryAdapter: setKV(${key}) returned HTTP ${response.status}`);
      }
    } catch (err) {
      this.logger.warn(
        `ConsulDiscoveryAdapter: setKV(${key}) error — ${err instanceof Error ? err.message : String(err)}`,
      );
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

import type { DiscoveredService, DiscoveryPort } from '../ports/discovery-ports.js';

/**
 * Dynamic service discovery with local caching and round-robin load balancing.
 *
 * This is a framework-free utility that wraps any DiscoveryPort
 * with a TTL-based cache and simple load balancing.
 */
export class DynamicDiscovery {
  private cache = new Map<string, { services: DiscoveredService[]; expiresAt: number }>();
  private roundRobinCounters = new Map<string, number>();
  private cacheTTL: number;

  constructor(
    private discoveryPort: DiscoveryPort,
    options?: { cacheTTLMs?: number },
  ) {
    this.cacheTTL = options?.cacheTTLMs ?? 30_000;
  }

  async getServiceAddress(serviceName: string): Promise<DiscoveredService> {
    const now = Date.now();
    const cached = this.cache.get(serviceName);

    let services: DiscoveredService[];

    if (cached && cached.expiresAt > now) {
      services = cached.services;
    } else {
      services = await this.discoveryPort.discover(serviceName);
      if (services.length === 0) {
        throw new Error(`No healthy instances of "${serviceName}" found`);
      }
      this.cache.set(serviceName, {
        services,
        expiresAt: now + this.cacheTTL,
      });
    }

    return this.roundRobin(serviceName, services);
  }

  invalidateCache(serviceName?: string): void {
    if (serviceName) {
      this.cache.delete(serviceName);
      this.roundRobinCounters.delete(serviceName);
    } else {
      this.cache.clear();
      this.roundRobinCounters.clear();
    }
  }

  private roundRobin(serviceName: string, services: DiscoveredService[]): DiscoveredService {
    const counter = (this.roundRobinCounters.get(serviceName) ?? 0) + 1;
    this.roundRobinCounters.set(serviceName, counter);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- modulo over non-empty array is always in bounds
    return services[counter % services.length]!;
  }
}

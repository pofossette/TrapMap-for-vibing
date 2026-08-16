/**
 * Dynamic service URL resolver for the host-distributed gateway.
 *
 * Resolution order:
 *   1. Dynamic discovery via DiscoveryPort (when available and healthy)
 *   2. Static fallback from InternalServiceUrls (env-var based defaults)
 *
 * Fail-open: if discovery throws, the resolver always falls through
 * to the static URL so the gateway can still serve traffic.
 */

import type { DynamicDiscovery } from '@trapmap/backend-core';
import type { InternalServiceUrls } from '@trapmap/host-distributed/config/index.js';

/**
 * Mapping from logical service names (as used by DiscoveryPort) to
 * the corresponding key in InternalServiceUrls.
 */
const SERVICE_NAME_TO_URL_KEY: Record<string, keyof InternalServiceUrls> = {
  'identity-access': 'identityAccess',
  'knowledge-read': 'knowledgeRead',
  'knowledge-write': 'knowledgeWrite',
  'candidate-ingestion': 'candidateIngestion',
  'governance-review': 'governanceReview',
  'job-runtime': 'jobRuntime',
  'cron-scheduler': 'cronScheduler',
};

export interface DiscoveryResolverOptions {
  /** Dynamic discovery backend (optional). When absent, only static URLs are used. */
  discovery?: DynamicDiscovery;
  /** Static service URLs used as fallback (and as source when discovery is absent). */
  staticUrls: InternalServiceUrls;
  /** Optional logger; defaults to console. */
  logger?: { warn: (msg: string) => void; debug: (msg: string) => void };
}

export class DiscoveryResolver {
  private readonly discovery: DynamicDiscovery | undefined;
  private readonly staticUrls: InternalServiceUrls;
  private readonly logger: { warn: (msg: string) => void; debug: (msg: string) => void };

  constructor(options: DiscoveryResolverOptions) {
    this.discovery = options.discovery;
    this.staticUrls = options.staticUrls;
    this.logger = options.logger ?? console;
  }

  /**
   * Resolve the base URL for a named service.
   *
   * Returns `http://host:port` (no trailing path).
   */
  async resolveServiceUrl(serviceName: string): Promise<string> {
    const urlKey = SERVICE_NAME_TO_URL_KEY[serviceName];

    if (!urlKey) {
      // Unknown service name — return static gateway URL as last resort
      this.logger.warn(
        `DiscoveryResolver: unknown service "${serviceName}", using gateway static URL`,
      );
      return this.staticUrls.gateway;
    }

    if (this.discovery) {
      try {
        const instance = await this.discovery.getServiceAddress(serviceName);
        const resolved = `http://${instance.address}:${instance.port}`;
        this.logger.debug(
          `DiscoveryResolver: resolved "${serviceName}" via discovery -> ${resolved}`,
        );
        return resolved;
      } catch (err) {
        this.logger.warn(
          `DiscoveryResolver: discovery failed for "${serviceName}" (${err instanceof Error ? err.message : String(err)}), falling back to static URL`,
        );
      }
    }

    return this.staticUrls[urlKey];
  }
}

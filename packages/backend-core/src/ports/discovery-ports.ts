/**
 * Service discovery port interfaces.
 *
 * These are host-agnostic abstractions. Concrete implementations
 * (Consul, static config, mock) are provided by host assemblies.
 */

export interface DiscoveredService {
  id: string;
  address: string;
  port: number;
  meta?: Record<string, string>;
}

export interface ServiceRegistration {
  id: string;
  name: string;
  address: string;
  port: number;
  check?: {
    http: string;
    interval: string;
    timeout: string;
  };
  meta?: Record<string, string>;
}

/**
 * Port interface for service discovery backends.
 */
export interface DiscoveryPort {
  /** Register the current service instance. */
  register(registration: ServiceRegistration): Promise<void>;

  /** Deregister the current service instance. */
  deregister(serviceId: string): Promise<void>;

  /** Discover healthy instances of a named service. */
  discover(serviceName: string): Promise<DiscoveredService[]>;

  /** Read a value from the KV store. */
  getKV(key: string): Promise<string | undefined>;

  /** Write a value to the KV store. */
  setKV(key: string, value: string): Promise<void>;
}

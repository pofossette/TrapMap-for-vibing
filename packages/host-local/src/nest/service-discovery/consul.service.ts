import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import {
  ConsulHttpAdapter,
  type DiscoveredService,
  type DiscoveryPort,
  type HealthCheck,
  type HealthCheckResult,
  type ServiceRegistration,
} from '@trapmap/backend-core';
import type { LifecycleManagerService } from '../lifecycle/lifecycle-manager.service.js';

/**
 * NestJS adapter for the shared Consul HTTP plugin (design D5 single-plugin
 * convergence). The framework-agnostic {@link ConsulHttpAdapter} lives in
 * @trapmap/backend-core; this service provides the Nest lifecycle wiring,
 * config binding, health-check registration and default registration.
 *
 * Runtime semantics preserved: graceful degradation when Consul is disabled or
 * unreachable, health-check registration, and default service registration
 * when CONSUL_AUTO_REGISTER=true.
 */
@Injectable()
export class ConsulService implements DiscoveryPort, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ConsulService.name);

  private backend: ConsulHttpAdapter | null = null;
  private serviceId = '';
  private registered = false;

  /** Tracks whether Consul is currently reachable. */
  private consulAvailable = false;

  /** Cached value of consulEnabled config flag. */
  private consulEnabled = false;

  constructor(
    private readonly config: ConfigService,
    private readonly lifecycleManager: LifecycleManagerService,
  ) {}

  // ─── NestJS lifecycle ────────────────────────────────────────────────

  async onModuleInit() {
    this.consulEnabled = this.config.get<string>('CONSUL_ENABLED', 'false') === 'true';

    if (!this.consulEnabled) {
      this.logger.log('Consul is disabled (CONSUL_ENABLED=false). Skipping initialization.');
      this.registerHealthCheck();
      this.consulAvailable = false;
      return;
    }

    const host = this.config.get<string>('CONSUL_HOST', 'localhost');
    const port = this.config.get<number>('CONSUL_PORT', 8500);
    const address = `http://${host}:${port}`;

    // throwOnError so runtime failures propagate and can flip to degraded mode.
    this.backend = new ConsulHttpAdapter({ consulAddress: address, throwOnError: true });

    // Validate connectivity.
    if (await this.backend.isReachable()) {
      this.consulAvailable = true;
      this.logger.log(`Consul client connected: ${host}:${port}`);
    } else {
      this.consulAvailable = false;
      this.logger.warn(
        `Consul is unavailable at ${host}:${port}. Application entering degraded mode. Service discovery and registration are disabled until Consul recovers.`,
      );
    }

    // Always register the health check, even if Consul is down right now.
    this.registerHealthCheck();

    // Attempt default registration only when Consul is reachable.
    if (this.consulAvailable) {
      const shouldRegister = this.config.get<string>('CONSUL_AUTO_REGISTER', 'true');
      if (shouldRegister === 'true') {
        await this.registerDefault();
      }
    }
  }

  async onModuleDestroy() {
    if (this.registered && this.consulAvailable && this.backend) {
      await this.deregister(this.serviceId);
    }
  }

  // ─── DiscoveryPort ───────────────────────────────────────────────────

  async register(registration: ServiceRegistration): Promise<void> {
    if (!this.ensureAvailable('register') || !this.backend) return;

    try {
      await this.backend.register(registration);
      this.serviceId = registration.id;
      this.registered = true;
      this.logger.log(`Service registered: ${registration.id} (${registration.name})`);
    } catch (err) {
      this.consulAvailable = false;
      this.logger.warn(
        `Failed to register service ${registration.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async deregister(serviceId: string): Promise<void> {
    if (!this.ensureAvailable('deregister') || !this.backend) return;

    try {
      await this.backend.deregister(serviceId);
      this.registered = false;
      this.logger.log(`Service deregistered: ${serviceId}`);
    } catch (err) {
      this.logger.warn(
        `Failed to deregister service ${serviceId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async discover(serviceName: string): Promise<DiscoveredService[]> {
    if (!this.ensureAvailable('discover') || !this.backend) return [];

    try {
      return await this.backend.discover(serviceName);
    } catch (err) {
      this.consulAvailable = false;
      this.logger.warn(
        `discover(${serviceName}) failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return [];
    }
  }

  async getKV(key: string): Promise<string | undefined> {
    if (!this.ensureAvailable('getKV') || !this.backend) return undefined;

    try {
      return await this.backend.getKV(key);
    } catch (err) {
      this.consulAvailable = false;
      this.logger.warn(`getKV(${key}) failed: ${err instanceof Error ? err.message : String(err)}`);
      return undefined;
    }
  }

  async setKV(key: string, value: string): Promise<void> {
    if (!this.ensureAvailable('setKV') || !this.backend) return;

    try {
      await this.backend.setKV(key, value);
    } catch (err) {
      this.consulAvailable = false;
      this.logger.warn(`setKV(${key}) failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Returns whether Consul is currently reachable. */
  isAvailable(): boolean {
    return this.consulAvailable;
  }

  // ─── Internal helpers ────────────────────────────────────────────────

  /**
   * Guard method: returns `true` if Consul is available, `false` and
   * logs a warning if it is not.
   */
  private ensureAvailable(operation: string): boolean {
    if (!this.consulAvailable) {
      this.logger.warn(`Consul unavailable — ${operation} is a no-op in degraded mode.`);
      return false;
    }
    return true;
  }

  private async registerDefault() {
    const serviceName = this.config.get<string>('SERVICE_NAME', 'trapmap');
    const serviceHost = this.config.get<string>('SERVICE_HOST', 'localhost');
    const servicePort = this.config.get<number>('PORT', 4000);
    const instanceId = this.config.get<string>('INSTANCE_ID', process.pid?.toString() ?? '0');
    const version = this.config.get<string>('npm_package_version', '0.1.0');
    const env = this.config.get<string>('NODE_ENV', 'development');

    this.serviceId = `trapmap-${serviceName}-${instanceId}`;

    await this.register({
      id: this.serviceId,
      name: serviceName,
      address: serviceHost,
      port: servicePort,
      check: {
        http: `http://${serviceHost}:${servicePort}/health`,
        interval: '10s',
        timeout: '5s',
      },
      meta: {
        version,
        environment: env,
      },
    });
  }

  private registerHealthCheck() {
    const check: HealthCheck = {
      name: 'consul',
      check: async (): Promise<HealthCheckResult> => {
        if (!this.consulEnabled) {
          return {
            name: 'consul',
            status: 'healthy',
            message: 'Consul integration disabled',
          };
        }

        if (!this.consulAvailable || !this.backend) {
          return {
            name: 'consul',
            status: 'unhealthy',
            message: 'Consul is not reachable',
          };
        }

        try {
          if (await this.backend.isReachable()) {
            return { name: 'consul', status: 'healthy' };
          }
          this.consulAvailable = false;
          return {
            name: 'consul',
            status: 'unhealthy',
            message: 'Consul connectivity check failed',
          };
        } catch {
          this.consulAvailable = false;
          return {
            name: 'consul',
            status: 'unhealthy',
            message: 'Consul connectivity check failed',
          };
        }
      },
    };

    this.lifecycleManager.registerHealthCheck(check);
    this.logger.debug('Registered Consul health check with LifecycleManager');
  }
}

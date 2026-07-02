import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Consul from 'consul';
import type {
  DiscoveryPort,
  DiscoveredService,
  ServiceRegistration,
} from '@trapmap/backend-core';

@Injectable()
export class ConsulService implements DiscoveryPort, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ConsulService.name);
  private consul!: Consul.Consul;
  private serviceId = '';
  private registered = false;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const host = this.config.get<string>('CONSUL_HOST', 'localhost');
    const port = this.config.get<number>('CONSUL_PORT', 8500);

    this.consul = new Consul({ host, port });
    this.logger.log(`Consul client initialized: ${host}:${port}`);

    const shouldRegister = this.config.get<string>('CONSUL_AUTO_REGISTER', 'true');
    if (shouldRegister === 'true') {
      await this.registerDefault();
    }
  }

  async onModuleDestroy() {
    if (this.registered) {
      await this.deregister(this.serviceId);
    }
  }

  async register(registration: ServiceRegistration): Promise<void> {
    await this.consul.agent.service.register({
      id: registration.id,
      name: registration.name,
      address: registration.address,
      port: registration.port,
      check: registration.check
        ? {
            http: registration.check.http,
            interval: registration.check.interval,
            timeout: registration.check.timeout,
          }
        : undefined,
      meta: registration.meta,
    });
    this.serviceId = registration.id;
    this.registered = true;
    this.logger.log(`Service registered: ${registration.id} (${registration.name})`);
  }

  async deregister(serviceId: string): Promise<void> {
    try {
      await this.consul.agent.service.deregister(serviceId);
      this.registered = false;
      this.logger.log(`Service deregistered: ${serviceId}`);
    } catch (err) {
      this.logger.warn(`Failed to deregister service ${serviceId}: ${err}`);
    }
  }

  async discover(serviceName: string): Promise<DiscoveredService[]> {
    const results: any[] = await this.consul.health.service(serviceName, { passing: true });
    return results.map((s: any) => ({
      id: s.Service.ID,
      address: s.Service.Address || s.Node.Address,
      port: s.Service.Port,
      meta: s.Service.Meta,
    }));
  }

  async getKV(key: string): Promise<string | undefined> {
    const result = await this.consul.kv.get(key);
    return result?.Value;
  }

  async setKV(key: string, value: string): Promise<void> {
    await this.consul.kv.set(key, value);
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
}

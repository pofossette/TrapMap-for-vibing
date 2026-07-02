import { Module } from '@nestjs/common';
import { ConsulService } from './consul.service.js';

/**
 * Consul service discovery module.
 *
 * Provides ConsulService (implements DiscoveryPort) for service
 * registration, discovery, health checks, and KV store.
 *
 * In local-agent profile, set CONSUL_AUTO_REGISTER=false or
 * simply don't import this module.
 */
@Module({
  providers: [ConsulService],
  exports: [ConsulService],
})
export class ConsulModule {}

import { Module } from '@nestjs/common';
import { LifecycleModule } from '../lifecycle/lifecycle.module.js';
import { ConsulService } from './consul.service.js';

/**
 * Consul service discovery module.
 *
 * Provides ConsulService (implements DiscoveryPort) with graceful
 * degradation — the application starts and continues serving even
 * if Consul is unavailable.
 *
 * Imports LifecycleModule so ConsulService can register its health
 * check with the LifecycleManager.
 *
 * In local-agent profile, set CONSUL_ENABLED=false or simply don't
 * import this module.
 */
@Module({
  imports: [LifecycleModule],
  providers: [ConsulService],
  exports: [ConsulService],
})
export class ConsulModule {}

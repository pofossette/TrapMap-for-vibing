import { Module, Global } from '@nestjs/common';
import { LifecycleManagerService } from './lifecycle-manager.service.js';

/**
 * Lifecycle management module.
 *
 * Provides the {@link LifecycleManagerService} which implements both
 * {@link LifecycleManager} and {@link HealthCheckRegistrar}.
 *
 * Marked as @Global so other modules can inject it without explicit imports.
 */
@Global()
@Module({
  providers: [LifecycleManagerService],
  exports: [LifecycleManagerService],
})
export class LifecycleModule {}

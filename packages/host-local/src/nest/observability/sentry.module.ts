import { Global, Module } from '@nestjs/common';
import { SentryService } from './sentry.service.js';

/**
 * Sentry module for host-local.
 *
 * Provides the SentryService which is an optional error-intelligence adapter.
 * Marked as @Global so other modules can inject it without explicit imports.
 */
@Global()
@Module({
  providers: [SentryService],
  exports: [SentryService],
})
export class SentryModule {}

import { Module, Global } from '@nestjs/common';
import { LangfuseService } from './langfuse.service.js';

/**
 * Langfuse module for host-local.
 *
 * Provides the LangfuseService which is an optional LLM observation sink.
 * Marked as @Global so other modules can inject it without explicit imports.
 */
@Global()
@Module({
  providers: [LangfuseService],
  exports: [LangfuseService],
})
export class LangfuseModule {}

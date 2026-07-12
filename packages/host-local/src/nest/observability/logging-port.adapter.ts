import { Injectable, Logger } from '@nestjs/common';
import type { LoggingPort } from '@trapmap/backend-core';
import { redactLogContext } from '@trapmap/contracts';

/**
 * NestJS adapter that implements the shared {@link LoggingPort}
 * by wrapping the NestJS built-in {@link Logger}.
 */
@Injectable()
export class LoggingPortAdapter implements LoggingPort {
  private readonly logger: Logger;

  constructor(
    context?: string,
    private readonly inheritedContext: Record<string, unknown> = {},
  ) {
    this.logger = new Logger(context ?? 'TrapMap');
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.logger.log(this.formatMessage(message, context));
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.logger.warn(this.formatMessage(message, context));
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.logger.error(this.formatMessage(message, context));
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.logger.debug(this.formatMessage(message, context));
  }

  /**
   * Create a child logger that includes additional context in every message.
   * Returns a new {@link LoggingPortAdapter} instance with a derived context prefix.
   */
  child(context: Record<string, unknown>): LoggingPort {
    const childContext = context['name'] ?? context['context'] ?? context['module'];
    const contextStr = typeof childContext === 'string' ? childContext : JSON.stringify(context);
    return new LoggingPortAdapter(
      contextStr,
      redactLogContext({ ...this.inheritedContext, ...context }),
    );
  }

  private formatMessage(
    message: string,
    context?: Record<string, unknown>,
  ): string {
    const mergedContext = redactLogContext({ ...this.inheritedContext, ...(context ?? {}) });
    if (Object.keys(mergedContext).length === 0) {
      return message;
    }
    return `${message} ${JSON.stringify(mergedContext)}`;
  }
}

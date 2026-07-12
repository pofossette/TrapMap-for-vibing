/**
 * LoggingPort adapter that wraps Fastify's pino-based logger.
 *
 * Pino uses the signature `logger[level](obj?, msg?)` where the first
 * argument is a merge object and the second is the message string.
 * The LoggingPort interface uses the reverse order
 * `(message, context?)`, so this adapter translates between them.
 */

import type { LoggingPort } from './telemetry-ports.js';
import { redactLogContext } from '@trapmap/contracts';

/**
 * Minimal interface matching the subset of FastifyBaseLogger / pino
 * that we actually use.  Accepting a narrow type avoids coupling the
 * adapter to the full Fastify type surface.
 */
export interface PinoLikeLogger {
  info(obj: Record<string, unknown>, msg?: string): void;
  info(msg: string): void;
  warn(obj: Record<string, unknown>, msg?: string): void;
  warn(msg: string): void;
  error(obj: Record<string, unknown>, msg?: string): void;
  error(msg: string): void;
  debug(obj: Record<string, unknown>, msg?: string): void;
  debug(msg: string): void;
  child(bindings: Record<string, unknown>): PinoLikeLogger;
}

export function createLoggingPortAdapter(
  logger: PinoLikeLogger,
  inheritedContext: Record<string, unknown> = {},
): LoggingPort {
  const emit = (
    level: 'info' | 'warn' | 'error' | 'debug',
    message: string,
    context?: Record<string, unknown>,
  ): void => {
    const mergedContext = redactLogContext({ ...inheritedContext, ...(context ?? {}) });
    if (Object.keys(mergedContext).length > 0) {
      logger[level](mergedContext, message);
    } else {
      logger[level](message);
    }
  };

  return {
    info(message: string, context?: Record<string, unknown>): void {
      emit('info', message, context);
    },

    warn(message: string, context?: Record<string, unknown>): void {
      emit('warn', message, context);
    },

    error(message: string, context?: Record<string, unknown>): void {
      emit('error', message, context);
    },

    debug(message: string, context?: Record<string, unknown>): void {
      emit('debug', message, context);
    },

    child(context: Record<string, unknown>): LoggingPort {
      const mergedContext = redactLogContext({ ...inheritedContext, ...context });
      return createLoggingPortAdapter(logger.child(mergedContext), mergedContext);
    },
  };
}

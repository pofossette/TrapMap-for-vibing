/**
 * LoggingPort adapter that wraps Fastify's pino-based logger.
 *
 * Pino uses the signature `logger[level](obj?, msg?)` where the first
 * argument is a merge object and the second is the message string.
 * The LoggingPort interface uses the reverse order
 * `(message, context?)`, so this adapter translates between them.
 */

import type { LoggingPort } from '@trapmap/backend-core';

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

export function createLoggingPortAdapter(logger: PinoLikeLogger): LoggingPort {
  return {
    info(message: string, context?: Record<string, unknown>): void {
      if (context && Object.keys(context).length > 0) {
        logger.info(context, message);
      } else {
        logger.info(message);
      }
    },

    warn(message: string, context?: Record<string, unknown>): void {
      if (context && Object.keys(context).length > 0) {
        logger.warn(context, message);
      } else {
        logger.warn(message);
      }
    },

    error(message: string, context?: Record<string, unknown>): void {
      if (context && Object.keys(context).length > 0) {
        logger.error(context, message);
      } else {
        logger.error(message);
      }
    },

    debug(message: string, context?: Record<string, unknown>): void {
      if (context && Object.keys(context).length > 0) {
        logger.debug(context, message);
      } else {
        logger.debug(message);
      }
    },

    child(context: Record<string, unknown>): LoggingPort {
      return createLoggingPortAdapter(logger.child(context));
    },
  };
}

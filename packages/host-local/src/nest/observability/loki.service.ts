import { Injectable, Logger, type LoggerService, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Structured logging service with optional Loki transport.
 *
 * In local-agent profile, logs to console only.
 * In team-monolith / distributed, adds Loki transport when LOKI_HOST is set.
 *
 * Implements NestJS LoggerService interface for drop-in replacement.
 */
@Injectable()
export class LokiService implements LoggerService, OnModuleInit {
  private readonly context = 'TrapMap';
  private winstonLogger: any = null;
  private readonly fallbackLogger = new Logger(this.context);

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const lokiHost = this.config.get<string>('LOKI_HOST', '');
    if (!lokiHost) {
      this.fallbackLogger.log('Loki logging disabled (no LOKI_HOST configured)');
      return;
    }

    try {
      const winston = await import('winston');
      const { LokiTransport } = await import('winston-loki');

      const serviceName = this.config.get<string>('SERVICE_NAME', 'trapmap');
      const env = this.config.get<string>('NODE_ENV', 'development');

      this.winstonLogger = winston.createLogger({
        level: this.config.get<string>('LOG_LEVEL', 'info'),
        defaultMeta: { service: serviceName, environment: env },
        transports: [
          new LokiTransport({
            host: lokiHost,
            labels: { job: serviceName, environment: env },
            json: true,
            replaceTimestamp: true,
          }),
          new winston.transports.Console({
            format: winston.format.combine(
              winston.format.timestamp(),
              winston.format.json(),
            ),
          }),
        ],
      });

      this.fallbackLogger.log(`Loki logging initialized: ${lokiHost}`);
    } catch (err) {
      this.fallbackLogger.warn(`Failed to initialize Loki transport: ${err}`);
    }
  }

  log(message: string, context?: string) {
    if (this.winstonLogger) {
      this.winstonLogger.info(message, { context });
    } else {
      this.fallbackLogger.log(message, context);
    }
  }

  error(message: string, trace?: string, context?: string) {
    if (this.winstonLogger) {
      this.winstonLogger.error(message, { trace, context });
    } else {
      this.fallbackLogger.error(message, trace, context);
    }
  }

  warn(message: string, context?: string) {
    if (this.winstonLogger) {
      this.winstonLogger.warn(message, { context });
    } else {
      this.fallbackLogger.warn(message, context);
    }
  }

  debug(message: string, context?: string) {
    if (this.winstonLogger) {
      this.winstonLogger.debug(message, { context });
    } else {
      this.fallbackLogger.debug?.(message, context);
    }
  }

  verbose(message: string, context?: string) {
    if (this.winstonLogger) {
      this.winstonLogger.verbose(message, { context });
    } else {
      this.fallbackLogger.verbose?.(message, context);
    }
  }
}

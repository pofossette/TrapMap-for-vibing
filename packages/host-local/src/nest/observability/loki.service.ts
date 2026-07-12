import { Injectable, Logger, type LoggerService, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  type LogEntry,
  buildLokiLabels,
  formatLogForStdout,
  redactLogContext,
} from '@trapmap/contracts';

/**
 * Structured logging service with optional Loki transport.
 *
 * In local-agent profile, logs to console only.
 * In team-monolith / distributed, adds Loki transport when LOKI_HOST is set.
 *
 * Implements NestJS LoggerService interface for drop-in replacement.
 *
 * Graceful degradation: if Loki is not enabled, unavailable, or
 * connection fails at any point, all log operations fall through to
 * stdout.  Loki is never a hard dependency.
 *
 * Loki labels are restricted to low-cardinality fields only:
 * `service`, `environment`, `level`.  High-cardinality correlation
 * keys (requestId, traceId, etc.) appear inside the log line body.
 */
@Injectable()
export class LokiService implements LoggerService, OnModuleInit {
  private readonly context = 'TrapMap';
  private winstonLogger: any = null;
  private readonly fallbackLogger = new Logger(this.context);
  private readonly serviceName: string;
  private readonly environment: string;

  constructor(private readonly config: ConfigService) {
    this.serviceName = this.config.get<string>('SERVICE_NAME', 'trapmap');
    this.environment = this.config.get<string>('NODE_ENV', 'development');
  }

  async onModuleInit() {
    const lokiHost = this.config.get<string>('LOKI_HOST', '');
    if (!lokiHost) {
      this.fallbackLogger.log(
        formatLogForStdout(this.buildEntry('info', 'Loki logging disabled (no LOKI_HOST configured)')),
      );
      return;
    }

    try {
      const winston = await import('winston');
      const LokiTransport = (await import('winston-loki')).default;

      this.winstonLogger = winston.createLogger({
        level: this.config.get<string>('LOG_LEVEL', 'info'),
        defaultMeta: { service: this.serviceName, environment: this.environment },
        transports: [
          new LokiTransport({
            host: lokiHost,
            labels: {
              job: this.serviceName,
              service: this.serviceName,
              environment: this.environment,
            },
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

      this.fallbackLogger.log(
        formatLogForStdout(this.buildEntry('info', `Loki logging initialized: ${lokiHost}`)),
      );
    } catch (err) {
      this.fallbackLogger.warn(
        formatLogForStdout(this.buildEntry('warn', `Failed to initialize Loki transport: ${err}`)),
      );
    }
  }

  log(message: string, context?: string) {
    this.emit('info', message, context);
  }

  error(message: string, trace?: string, context?: string) {
    this.emit('error', message, context, trace);
  }

  warn(message: string, context?: string) {
    this.emit('warn', message, context);
  }

  debug(message: string, context?: string) {
    this.emit('debug', message, context);
  }

  verbose(message: string, context?: string) {
    // NestJS verbose maps to debug in the unified schema
    this.emit('debug', message, context);
  }

  // ── internals ──────────────────────────────────────────────────

  private emit(
    level: LogEntry['level'],
    message: string,
    context?: string,
    trace?: string,
  ): void {
    const entry = this.buildEntry(level, message, context, trace);

    if (this.winstonLogger) {
      try {
        const labels = buildLokiLabels(entry);
        const meta: Record<string, unknown> = {
          ...labels,
          ...redactLogContext(entry),
        };
        this.winstonLogger.log(level, message, meta);
        return;
      } catch {
        // Loki write failed — fall through to stdout
      }
    }

    // stdout fallback (always works)
    this.fallbackToStdout(level, message, context, trace);
  }

  private buildEntry(
    level: LogEntry['level'],
    message: string,
    context?: string,
    trace?: string,
  ): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      service: this.serviceName,
      environment: this.environment,
      message,
    };
    if (context) entry.context = context;
    if (trace) entry.traceId = trace;
    return entry;
  }

  private fallbackToStdout(
    level: LogEntry['level'],
    message: string,
    context?: string,
    trace?: string,
  ): void {
    const entry = this.buildEntry(level, message, context, trace);
    const formatted = formatLogForStdout(entry);
    switch (level) {
      case 'error':
        this.fallbackLogger.error(formatted);
        break;
      case 'warn':
        this.fallbackLogger.warn(formatted);
        break;
      case 'debug':
        this.fallbackLogger.debug?.(formatted);
        break;
      default:
        this.fallbackLogger.log(formatted);
    }
  }
}

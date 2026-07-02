import { describe, expect, it } from 'vitest';

import {
  LOKI_LOW_CARDINALITY_LABELS,
  type LogEntry,
  buildLokiLabels,
  formatLogForStdout,
  logEntrySchema,
} from './log-schema.js';

describe('log schema', () => {
  describe('logEntrySchema', () => {
    it('accepts a minimal valid entry', () => {
      const result = logEntrySchema.parse({
        timestamp: '2026-07-02T10:00:00.000Z',
        level: 'info',
        service: 'trapmap',
        environment: 'production',
        message: 'Request completed',
      });
      expect(result.timestamp).toBe('2026-07-02T10:00:00.000Z');
      expect(result.level).toBe('info');
      expect(result.service).toBe('trapmap');
      expect(result.environment).toBe('production');
      expect(result.message).toBe('Request completed');
    });

    it('accepts all optional fields', () => {
      const result = logEntrySchema.parse({
        timestamp: '2026-07-02T10:00:00.000Z',
        level: 'error',
        service: 'trapmap',
        environment: 'staging',
        traceId: 'abc123',
        requestId: 'req-456',
        context: 'GET /v1/traps',
        message: 'Something failed',
      });
      expect(result.traceId).toBe('abc123');
      expect(result.requestId).toBe('req-456');
      expect(result.context).toBe('GET /v1/traps');
    });

    it('accepts all four log levels', () => {
      for (const level of ['debug', 'info', 'warn', 'error'] as const) {
        const result = logEntrySchema.parse({
          timestamp: '2026-07-02T10:00:00.000Z',
          level,
          service: 'trapmap',
          environment: 'development',
          message: `Level ${level} test`,
        });
        expect(result.level).toBe(level);
      }
    });

    it('allows passthrough fields', () => {
      const result = logEntrySchema.parse({
        timestamp: '2026-07-02T10:00:00.000Z',
        level: 'info',
        service: 'trapmap',
        environment: 'production',
        message: 'With extra',
        statusCode: 200,
        latencyMs: 42,
        method: 'GET',
        route: '/v1/traps',
      });
      expect((result as any).statusCode).toBe(200);
      expect((result as any).latencyMs).toBe(42);
    });

    it('rejects an entry missing required fields', () => {
      expect(() =>
        logEntrySchema.parse({
          timestamp: '2026-07-02T10:00:00.000Z',
          level: 'info',
          message: 'Incomplete',
        }),
      ).toThrow();
    });

    it('rejects an invalid level', () => {
      expect(() =>
        logEntrySchema.parse({
          timestamp: '2026-07-02T10:00:00.000Z',
          level: 'critical',
          service: 'trapmap',
          environment: 'production',
          message: 'Bad level',
        }),
      ).toThrow();
    });

    it('rejects an invalid timestamp format', () => {
      expect(() =>
        logEntrySchema.parse({
          timestamp: 'not-a-datetime',
          level: 'info',
          service: 'trapmap',
          environment: 'production',
          message: 'Bad timestamp',
        }),
      ).toThrow();
    });
  });

  describe('LOKI_LOW_CARDINALITY_LABELS', () => {
    it('contains only service, environment, level', () => {
      expect(LOKI_LOW_CARDINALITY_LABELS).toEqual(['service', 'environment', 'level']);
    });
  });

  describe('buildLokiLabels', () => {
    it('extracts only low-cardinality fields', () => {
      const entry: LogEntry = {
        timestamp: '2026-07-02T10:00:00.000Z',
        level: 'warn',
        service: 'trapmap',
        environment: 'staging',
        traceId: 'abc123',
        requestId: 'req-456',
        context: 'GET /v1/traps',
        message: 'Slow query',
      };
      const labels = buildLokiLabels(entry);
      expect(labels).toEqual({
        service: 'trapmap',
        environment: 'staging',
        level: 'warn',
      });
    });

    it('does not include traceId, requestId, or context', () => {
      const entry: LogEntry = {
        timestamp: '2026-07-02T10:00:00.000Z',
        level: 'info',
        service: 'trapmap',
        environment: 'production',
        traceId: 'abc',
        requestId: 'def',
        context: 'ghi',
        message: 'test',
      };
      const labels = buildLokiLabels(entry);
      expect(labels).not.toHaveProperty('traceId');
      expect(labels).not.toHaveProperty('requestId');
      expect(labels).not.toHaveProperty('context');
    });
  });

  describe('formatLogForStdout', () => {
    it('formats a minimal entry without extra fields', () => {
      const entry: LogEntry = {
        timestamp: '2026-07-02T10:00:00.000Z',
        level: 'info',
        service: 'trapmap',
        environment: 'production',
        message: 'Server started',
      };
      const output = formatLogForStdout(entry);
      expect(output).toBe('[INFO ] Server started');
    });

    it('includes extra passthrough fields as JSON', () => {
      const entry: LogEntry = {
        timestamp: '2026-07-02T10:00:00.000Z',
        level: 'error',
        service: 'trapmap',
        environment: 'production',
        traceId: 'abc',
        message: 'Request failed',
        statusCode: 500,
      };
      const output = formatLogForStdout(entry);
      expect(output).toContain('[ERROR]');
      expect(output).toContain('Request failed');
      expect(output).toContain('"traceId":"abc"');
      expect(output).toContain('"statusCode":500');
    });

    it('pads the level to 5 characters for alignment', () => {
      const warnEntry: LogEntry = {
        timestamp: '2026-07-02T10:00:00.000Z',
        level: 'warn',
        service: 'trapmap',
        environment: 'production',
        message: 'warn test',
      };
      const output = formatLogForStdout(warnEntry);
      expect(output).toBe('[WARN ] warn test');
    });
  });
});
